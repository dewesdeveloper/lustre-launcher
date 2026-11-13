import { app, BrowserWindow, ipcMain, net, Tray, Menu, nativeImage, shell, dialog, globalShortcut, screen, session, desktopCapturer, Notification, safeStorage } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import crypto from 'node:crypto'
import { exec } from 'node:child_process'
import electronUpdater from 'electron-updater'
import qbSetup from './qbSetup.cjs'
import qbManaged from './qbManaged.cjs'
import selfUpdate from './selfUpdate.cjs'

const { autoUpdater } = electronUpdater

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// --- Безопасность окон и IPC ---
// У окон лаунчера есть preload (window.electron): установка, запуск и удаление игр,
// загрузка файлов. Раньше обычная ссылка (например, в описании игры) уводила само окно
// на чужой сайт вместе с preload — и сайт мог скачать и запустить файл. Теперь:
//   - окно может показывать только страницы самого лаунчера (dist/ или dev-сервер),
//     внешние ссылки открываются в системном браузере;
//   - новые окна через window.open/target=_blank не создаются (внешнее — в браузер);
//   - IPC принимается только от страниц лаунчера.
const DIST_DIR = path.normalize(path.join(__dirname, '../dist')).toLowerCase()
function isAppUrl(raw) {
  if (typeof raw !== 'string' || !raw) return false
  const dev = process.env.VITE_DEV_SERVER_URL
  if (dev && raw.startsWith(dev)) return true
  try {
    const u = new URL(raw)
    if (u.protocol !== 'file:') return false
    return path.normalize(fileURLToPath(u)).toLowerCase().startsWith(DIST_DIR)
  } catch {
    return false
  }
}
const openExternalSafe = (url) => {
  if (/^https?:\/\//i.test(String(url || ''))) shell.openExternal(url).catch(() => {})
}
// Окна, которым можно ходить по чужим сайтам (вход через OAuth, без preload)
const externalContents = new WeakSet()
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (e, url) => {
    // окно входа через OAuth (без preload) ходит по сайтам провайдера — ему можно
    if (externalContents.has(contents)) return
    if (!isAppUrl(url)) {
      e.preventDefault()
      openExternalSafe(url)
    }
  })
  contents.on('will-attach-webview', (e) => e.preventDefault())
})
function trustedSender(e) {
  return isAppUrl(e?.senderFrame?.url || '')
}
{
  const handle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, fn) => handle(channel, (e, ...args) => {
    if (!trustedSender(e)) throw new Error('untrusted IPC sender')
    return fn(e, ...args)
  })
  const on = ipcMain.on.bind(ipcMain)
  ipcMain.on = (channel, fn) => on(channel, (e, ...args) => {
    if (!trustedSender(e)) return undefined
    return fn(e, ...args)
  })
}
// --- Защищённое хранилище (токены доверенных устройств) ---
// Значения шифруются системой (DPAPI в Windows): файл не расшифровать под другим
// пользователем или на другом компьютере. Раньше токены лежали в localStorage,
// «зашифрованные» ключом, который был зашит прямо в код лаунчера.
const SECURE_STORE_FILE = () => path.join(app.getPath('userData'), 'secure-store.json')
function readSecureStore() {
  try { return JSON.parse(fs.readFileSync(SECURE_STORE_FILE(), 'utf8')) || {} } catch { return {} }
}
function writeSecureStore(data) {
  try { fs.writeFileSync(SECURE_STORE_FILE(), JSON.stringify(data), { encoding: 'utf8', mode: 0o600 }) } catch (e) { console.error('[secure-store] write:', e) }
}
function sealValue(text) {
  if (safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(text).toString('base64')
  return 'raw:' + Buffer.from(text, 'utf8').toString('base64')
}
function openValue(sealed) {
  if (typeof sealed !== 'string') return null
  try {
    if (sealed.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(sealed.slice(4), 'base64'))
    if (sealed.startsWith('raw:')) return Buffer.from(sealed.slice(4), 'base64').toString('utf8')
  } catch { /* повреждено или чужой пользователь Windows */ }
  return null
}
const SECURE_KEY_RE = /^[\w.-]{1,64}$/
ipcMain.on('secure-store:get', (e, key) => {
  if (!SECURE_KEY_RE.test(String(key))) { e.returnValue = null; return }
  e.returnValue = openValue(readSecureStore()[key])
})
ipcMain.on('secure-store:set', (e, key, value) => {
  if (!SECURE_KEY_RE.test(String(key)) || typeof value !== 'string' || value.length > 100000) { e.returnValue = false; return }
  const data = readSecureStore()
  data[key] = sealValue(value)
  writeSecureStore(data)
  e.returnValue = true
})
ipcMain.on('secure-store:remove', (e, key) => {
  const data = readSecureStore()
  delete data[String(key)]
  writeSecureStore(data)
  e.returnValue = true
})

// .exe, выбранные пользователем в диалоге «Указать exe» (set-game-exe принимает только их
// или файлы внутри папки игры — не произвольный путь от рендерера)
const pickedExePaths = new Set()
app.setAppUserModelId('com.lustrehub.lustre-frontend')
app.setName('Lustre')

// Иконка приложения: многослойный .ico (16–256 px) — иначе панель задач Windows
// может показывать дефолтную иконку electron. Запасной вариант — 512px PNG.
const APP_ICON = (() => {
  const ico = path.join(__dirname, '../build/icon.ico')
  const png = path.join(__dirname, '../build/icon.png')
  return fs.existsSync(ico) ? ico : png
})()

// --- Папка данных лаунчера: %APPDATA%\LustreHub ---
// Без этой строки Electron берёт name из package.json (lustre-frontend).
// Фиксируем читаемое имя и один раз переносим старые данные (реестр игр,
// localStorage с сессией, кэши) — перенос идёт до первого getPath('userData'),
// поэтому Chromium и installer.cjs увидят уже новую папку.
const USER_DATA_DIR = path.join(app.getPath('appData'), 'LustreHub')
const LEGACY_USER_DATA_DIR = path.join(app.getPath('appData'), 'lustre-frontend')
app.setPath('userData', USER_DATA_DIR)
try {
  if (!fs.existsSync(USER_DATA_DIR) && fs.existsSync(LEGACY_USER_DATA_DIR)) {
    fs.renameSync(LEGACY_USER_DATA_DIR, USER_DATA_DIR)
    console.log('[Main] папка данных перенесена:', LEGACY_USER_DATA_DIR, '->', USER_DATA_DIR)
  }
} catch (err) {
  // Например, старый лаунчер ещё запущен и держит папку — работаем в старой
  // папке до следующего старта, данные не теряем.
  console.error('[Main] не удалось перенести папку данных:', err)
  if (fs.existsSync(LEGACY_USER_DATA_DIR)) app.setPath('userData', LEGACY_USER_DATA_DIR)
}

// не даём необработанным исключениям ронять main-процесс
process.on('uncaughtException', (err) => {
  console.error('[Main] uncaught exception:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[Main] unhandled rejection:', err)
})

// --- Deep links (lustre://) ---
// Пример: lustre://game/123 — открыть игру в лаунчере
function deepLinkToRoute(rawUrl) {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'lustre:') return null
    const host = u.hostname.toLowerCase()
    const segments = u.pathname.split('/').filter(Boolean)
    const gameId = u.searchParams.get('game') || segments[0]
    if (host === 'game' || host === 'games' || host === 'install') {
      return gameId ? `/games/${gameId}` : '/store'
    }
    if (!host) return '/' + segments.join('/') + u.search
    return `/${host}${u.pathname}${u.search}`
  } catch {
    return null
  }
}

function extractDeepLink(argv) {
  if (!Array.isArray(argv)) return null
  return argv.find((a) => typeof a === 'string' && a.startsWith('lustre://')) || null
}

let pendingRoute = null

// Открыть маршрут в главном окне (из трея, других окон и deep-link)
function navigateInMain(route) {
  if (!route || typeof route !== 'string') return
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.send('navigate', route))
    } else {
      mainWindow.webContents.send('navigate', route)
    }
    return
  }
  pendingRoute = route
  createWindow()
  mainWindow?.webContents.once('did-finish-load', () => {
    if (pendingRoute && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('navigate', pendingRoute)
      pendingRoute = null
    }
  })
}

function handleDeepLink(url) {
  const route = deepLinkToRoute(url)
  if (route) navigateInMain(route)
}

// Одно окно приложения: вторая ссылка/запуск передаётся в текущий процесс
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const url = extractDeepLink(argv)
    if (url) handleDeepLink(url)
    else if (!argv.includes('--hidden') && mainWindow && !mainWindow.isDestroyed()) {
      // повторный запуск из меню «Пуск» — показываем уже открытое окно
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// macOS: ссылки приходят событием
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

let mainWindow = null, friendsWindow = null, settingsWindow = null, overlayWindow = null, accountPickerWindow = null, chatWindow = null, oauthWindow = null, tray = null, isQuitting = false

// Порт веб-интерфейса qBittorrent — машинная настройка (app-paths.json).
// Лаунчер подключается к Web API по нему; после смены порта в настройках
// адрес пересчитывается автоматически (qbUrl вызывается на каждый запрос).
const DEFAULT_QB_WEB_PORT = 9091
function qbUrl() {
  if (qbIsManaged()) return `http://127.0.0.1:${loadAppPaths().qbManagedPort || qbManaged.DEFAULT_MANAGED_PORT}`
  const n = Number(loadAppPaths().qbWebPort)
  const port = Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_QB_WEB_PORT
  return `http://localhost:${port}`
}

// Режим: встроенный qBittorrent (ставится с лаунчером) или свой, уже настроенный пользователем.
function qbIsManaged() {
  return loadAppPaths().qbMode !== 'external' && !!qbManaged.findManagedExe()
}
const qbProfileDir = () => path.join(app.getPath('userData'), 'qbittorrent')
// Папка загрузок по умолчанию — в данных лаунчера: из временной папки Windows
// очистка диска могла удалить ещё не установленные игры.
const QB_SAVE_PATH = path.join(app.getPath('userData'), 'downloads').replace(/\\/g, '/')
fs.mkdirSync(QB_SAVE_PATH, { recursive: true })
// Прежняя папка: торренты в клиенте пользователя могут продолжать лежать там
const LEGACY_QB_SAVE_PATH = path.join(os.tmpdir(), 'LustreHub', 'downloads').replace(/\\/g, '/')

// --- qBittorrent Web API ---
let qbCookie = null

// Учётные данные Web UI: по умолчанию admin/adminadmin (дефолт qBittorrent).
// Сохранённые пользователем — в app-paths.json, пароль шифруется safeStorage
// (DPAPI Windows), в открытом виде на диске не лежит.
const QB_DEFAULT_CREDS = { user: 'admin', pass: 'adminadmin' }

function decryptQbPass(stored) {
  if (!stored.startsWith('enc:')) return stored
  try { return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64')) } catch { return '' }
}

function encryptQbPass(pass) {
  try {
    if (pass && safeStorage.isEncryptionAvailable()) return 'enc:' + safeStorage.encryptString(pass).toString('base64')
  } catch { /* без шифрования оставляем как есть — пароль localhost-сервиса */ }
  return pass
}

// Пароль встроенного qBittorrent создаётся один раз и пользователю не нужен
function managedQbPass() {
  const saved = decryptQbPass(String(loadAppPaths().qbManagedPass || ''))
  if (saved) return saved
  const pass = qbManaged.generatePassword()
  saveAppPaths({ qbManagedPass: encryptQbPass(pass) })
  return pass
}

function qbCreds() {
  return qbIsManaged() ? { user: qbManaged.MANAGED_USER, pass: managedQbPass() } : qbExternalCreds()
}

function qbExternalCreds() {
  let p = {}
  try { p = loadAppPaths() } catch { p = {} }
  const pass = decryptQbPass(String(p.qbWebPass || ''))
  return {
    user: String(p.qbWebUser || QB_DEFAULT_CREDS.user) || QB_DEFAULT_CREDS.user,
    pass: pass || QB_DEFAULT_CREDS.pass,
  }
}

function saveQbCreds(user, pass) {
  saveAppPaths({ qbWebUser: String(user || QB_DEFAULT_CREDS.user), qbWebPass: encryptQbPass(String(pass || '')) })
}

// Логин на конкретном порту; возвращает cookie либо null (без проброса ошибок)
async function qbLoginTo(port, user, pass, host = 'localhost') {
  return new Promise((resolve) => {
    const data = `username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`
    const req = http.request(`http://${host}:${port}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) },
      timeout: 3000,
    }, (res) => {
      const cookies = res.headers['set-cookie']
      res.resume()
      resolve(cookies && cookies[0] ? cookies[0].split(';')[0] : null)
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.write(data)
    req.end()
  })
}

async function qbLogin() {
  const { user, pass } = qbCreds()
  const cookie = await qbLoginTo(Number(qbUrl().split(':').pop()), user, pass, qbIsManaged() ? '127.0.0.1' : 'localhost')
  if (!cookie) return false
  qbCookie = cookie
  return true
}

function qbRaw(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (qbCookie) headers['Cookie'] = qbCookie

    let bodyStr = ''
    if (body) bodyStr = Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr)

    const req = http.request(`${qbUrl()}${path}`, { method, headers, timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        let parsed = data
        try { parsed = JSON.parse(data) } catch { /* текстовый ответ */ }
        resolve({ status: res.statusCode, data: parsed })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

// Сессия могла истечь, а опрос статуса идёт постоянно. Пробуем войти не чаще раза в 30 с:
// qBittorrent блокирует адрес после нескольких неудачных попыток подряд.
let qbLastRelogin = 0
async function qbRelogin() {
  if (Date.now() - qbLastRelogin < 30000) return false
  qbLastRelogin = Date.now()
  return qbLogin()
}

async function qbRequest(path, method = 'GET', body = null) {
  let res = await qbRaw(path, method, body)
  if (res.status === 403 && await qbRelogin()) res = await qbRaw(path, method, body)
  return res.data
}

// В Web API 2.11 (qBittorrent 5) pause/resume заменены на stop/start, старые адреса отвечают 404
async function qbPostAny(paths, body) {
  for (const p of paths) {
    const res = await qbRaw(p, 'POST', body)
    if (res.status !== 404) return res
  }
}

let qbManagedStarting = null
function ensureManagedQb() {
  if (!qbManagedStarting) {
    qbManagedStarting = startManagedQb().finally(() => { qbManagedStarting = null })
  }
  return qbManagedStarting
}

async function startManagedQb() {
  // Мог остаться от прошлого запуска лаунчера
  if (await qbLogin()) return true
  if (qbManaged.isManagedRunning()) {
    qbManaged.killManaged()
    await new Promise((r) => setTimeout(r, 800))
  }
  const profile = qbProfileDir()
  const port = await qbManaged.pickPort(loadAppPaths().qbManagedPort)
  qbManaged.writeManagedConfig(profile, { port, pass: managedQbPass() })
  saveAppPaths({ qbManagedPort: port })
  qbManaged.startManaged(qbManaged.findManagedExe(), profile)

  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
    if (await qbLogin()) return true
  }
  return false
}

// Ответ 403 тоже приходит текстом, поэтому проверяем статус, а не тип ответа
async function ensureQb() {
  try {
    const res = await qbRaw('/api/v2/app/version')
    if (res.status === 200) return true
  } catch {}
  return qbIsManaged() ? ensureManagedQb() : qbLogin()
}

async function qbAddTorrent(magnet, savePath, opts = {}) {
  const ok = await ensureQb()
  if (!ok) {
    return { error: qbIsManaged()
      ? 'Не удалось запустить встроенный qBittorrent. Перезапустите лаунчер и попробуйте снова.'
      : 'Нет подключения к qBittorrent. Откройте Настройки → Хранилище и нажмите «Подключить» или «Настроить автоматически».' }
  }

  return new Promise((resolve) => {
    const boundary = '----LustreHub' + Date.now()
    const fields = {
      urls: magnet,
      savepath: savePath || QB_SAVE_PATH,
      paused: opts.paused ? 'true' : 'false',
      root_folder: opts.rootFolder === false ? 'false' : 'true',
    }
    if (opts.tags) fields.tags = opts.tags

    let body = ''
    for (const [key, val] of Object.entries(fields)) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`
    }
    body += `--${boundary}--\r\n`

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(body),
    }
    if (qbCookie) headers['Cookie'] = qbCookie

    const req = http.request(`${qbUrl()}/api/v2/torrents/add`, { method: 'POST', headers, timeout: 10000 }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', async () => {
        if (data === 'Ok.') return resolve({ ok: true })
        // Повторное добавление qBittorrent отвергает, хотя торрент у него уже есть
        const h = magnetHash(magnet)
        const list = await qbRequest('/api/v2/torrents/info').catch(() => [])
        if (h && Array.isArray(list) && list.some((t) => String(t.hash || '').toLowerCase() === h)) {
          return resolve({ ok: true, existing: true, hash: h })
        }
        resolve({ error: 'qBittorrent не принял торрент. Проверьте папку загрузок и повторите.' })
      })
    })
    req.on('error', (e) => resolve({ error: e.message }))
    req.write(body)
    req.end()
  })
}

const QB_SEARCH_NOTICE_MS = 2 * 60 * 1000
const qbSearchingSince = new Map() // hash -> с какого момента торренту не у кого качать

const qbNormPath = (p) => String(p || '').replace(/\\/g, '/').toLowerCase()
const qbTags = (t) => String(t.tags || '').split(',').map((x) => x.trim())
const qbIsLauncherTorrent = (t) => !qbTags(t).includes('lustre-probe')
const qbHasLauncherTag = (t) => qbTags(t).some((x) => x === 'lustre' || x.startsWith('lustre-game-'))
const qbInLauncherFolder = (t) => [QB_SAVE_PATH, LEGACY_QB_SAVE_PATH, downloadDirOrDefault(), ...legacyDirs('legacyDownloadDirs')].some((d) => qbNormPath(t.save_path).startsWith(qbNormPath(d)))

// Один раз после обновления лаунчера: кто уже качал игры через свой qBittorrent, остаётся на нём,
// иначе его загрузки пропали бы из лаунчера. Все остальные переходят на встроенный.
async function qbDecideMode() {
  if (loadAppPaths().qbMode) return
  let mode = 'managed'
  try {
    const port = Number(loadAppPaths().qbWebPort) || DEFAULT_QB_WEB_PORT
    const list = await qbReadExternalTorrents(port)
    if (list.some((t) => qbIsLauncherTorrent(t) && (qbInLauncherFolder(t) || qbHasLauncherTag(t)))) mode = 'external'
  } catch { /* клиент пользователя не запущен — значит, ему не на чем продолжать */ }
  saveAppPaths({ qbMode: mode })
}

async function qbReadExternalTorrents(port) {
  const read = (cookie) => new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/api/v2/torrents/info`, { headers: cookie ? { Cookie: cookie } : {}, timeout: 3000 }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null)
        try { resolve(JSON.parse(data)) } catch { resolve(null) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
  const open = await read()
  if (open) return open
  const { user, pass } = qbExternalCreds()
  const cookie = await qbLoginTo(port, user, pass)
  return (cookie && await read(cookie)) || []
}

async function qbGetTorrents() {
  try {
    const torrents = await qbRequest('/api/v2/torrents/info')
    if (!Array.isArray(torrents)) return []
    // Показываем только торренты, добавленные лаунчером (по тегу или по папке загрузок),
    // а не все записи пользователя из qBittorrent. Проверочные (probe) не показываем.
    const managed = qbIsManaged()
    const own = torrents.filter((t) => qbIsLauncherTorrent(t) && (managed || qbInLauncherFolder(t) || qbHasLauncherTag(t)))
    const now = Date.now()
    for (const hash of qbSearchingSince.keys()) if (!own.some((t) => t.hash === hash)) qbSearchingSince.delete(hash)
    return own.map(t => {
      const searching = qbManaged.torrentSearching(t)
      if (!searching) qbSearchingSince.delete(t.hash)
      else if (!qbSearchingSince.has(t.hash)) qbSearchingSince.set(t.hash, now)
      return {
      id: t.hash,
      gameTitle: t.name,
      progress: t.progress,
      downloadSpeed: t.dlspeed,
      uploadSpeed: t.upspeed,
      downloaded: t.downloaded,
      totalSize: t.size,
      numPeers: t.num_seeds,
      status: qbManaged.torrentStatus(t.state, t.progress),
      error: qbManaged.torrentError(t.state),
      searching,
      searchingLong: searching && now - qbSearchingSince.get(t.hash) > QB_SEARCH_NOTICE_MS,
      path: t.save_path,
      eta: t.eta,
      ratio: t.ratio,
      }
    })
  } catch { return [] }
}

async function qbPauseTorrent(hash) { await qbPostAny(['/api/v2/torrents/stop', '/api/v2/torrents/pause'], { hashes: hash }) }
async function qbResumeTorrent(hash) { await qbPostAny(['/api/v2/torrents/start', '/api/v2/torrents/resume'], { hashes: hash }) }
// Окно «Удалить загрузку» обещает стереть файлы: раньше они всегда оставались на диске
async function qbDeleteTorrent(hash, deleteFiles = false) { await qbRequest('/api/v2/torrents/delete', 'POST', { hashes: hash, deleteFiles: deleteFiles ? 'true' : 'false' }) }

// Извлекаем btih-хэш из magnet (hex или base32 -> hex)
function magnetHash(magnet) {
  const m = /xt=urn:btih:([a-zA-Z0-9]+)/i.exec(magnet || '')
  if (!m) return ''
  let h = m[1]
  // base32 (32 символа) -> hex (40 символов)
  if (h.length === 32 && /^[A-Z2-7a-z]+$/.test(h)) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let bits = ''
    for (const ch of h.toUpperCase()) {
      const idx = alphabet.indexOf(ch)
      if (idx === -1) return h.toLowerCase()
      bits += idx.toString(2).padStart(5, '0')
    }
    let hex = ''
    for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
    if (hex.length === 40) return hex
  }
  return h.toLowerCase()
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

// qbTorrentsByMagnet — сопоставляет торренты qBittorrent с magnet-ссылками.
// Матчим по btih-хэшу (надёжнее, чем по полю magnet_uri, которое qB часто не хранит).
function qbTorrentsByMagnet(torrents, magnets) {
  const map = {}
  for (const magnet of magnets) {
    const h = magnetHash(magnet)
    if (!h) continue
    const t = torrents.find(x => String(x.hash || '').toLowerCase() === h || x.magnet_uri === magnet)
    if (t) map[magnet] = t
  }
  return map
}

// qbPeersForMagnets — для каждого magnet возвращает число сидов и пиров.
// Уже добавленные торренты читаем как есть; новые добавляем временно (тег
// lustre-probe), несколько раз анонсируем трекеры и ждём появления пиров.
async function qbPeersForMagnets(magnets) {
  const result = {}
  const unique = [...new Set((magnets || []).filter(Boolean))]
  if (unique.length === 0) return result

  if (!(await ensureQb())) return result

  let existing = []
  try { existing = await qbRequest('/api/v2/torrents/info') } catch { existing = [] }
  if (!Array.isArray(existing)) existing = []

  const known = qbTorrentsByMagnet(existing, unique)

  // Какие magnet ещё не добавлены — их нужно временно добавить для анонса
  const toProbe = unique.filter(m => !known[m])
  const addedHashes = []
  for (const magnet of toProbe) {
    const res = await qbAddTorrent(magnet, QB_SAVE_PATH, { tags: 'lustre-probe', paused: false })
    if (!res.error && !res.existing) { // свой существующий торрент удалять после проверки нельзя
      const h = magnetHash(magnet)
      if (h) addedHashes.push(h)
    }
  }

  // Даём трекерам ответить: анонсируем принудительно несколько раз
  const waited = addedHashes.length > 0
  if (waited) {
    for (let i = 0; i < 3; i++) {
      await qbRequest('/api/v2/torrents/reannounce', 'POST', { hashes: addedHashes.join('|') }).catch(() => {})
      await delay(3000)
    }
  }

  // Считываем итоговые значения (и по уже добавленным, и по пробным)
  let list = []
  try { list = await qbRequest('/api/v2/torrents/info') } catch { list = [] }
  if (!Array.isArray(list)) list = []

  // Как в qBittorrent: "подключено (всего)".
  // num_seeds/num_complete — сиды, num_leechs/num_incomplete — пиры.
  const norm = (t, known) => {
    if (!t) return { seeds: 0, totalSeeds: 0, leechers: 0, totalLeechers: 0, known: false }
    const totalSeeds = t.num_complete ?? (t.num_seeds || 0)
    const totalLeechers = t.num_incomplete ?? (t.num_leechs || 0)
    return {
      seeds: t.num_seeds || 0,
      totalSeeds: totalSeeds || 0,
      leechers: t.num_leechs || 0,
      totalLeechers: totalLeechers || 0,
      connected: t.num_seeds != null,
      known: !!known,
    }
  }

  for (const magnet of unique) {
    let t = known[magnet]
    if (!t) {
      const h = magnetHash(magnet)
      t = list.find(x => (h && String(x.hash || '').toLowerCase() === h) || x.magnet_uri === magnet)
    }
    result[magnet] = norm(t, !!known[magnet])
  }

  // Удаляем только пробные торренты
  if (addedHashes.length > 0) {
    await qbRequest('/api/v2/torrents/delete', 'POST', { hashes: addedHashes.join('|'), deleteFiles: 'false' }).catch(() => {})
  }

  return result
}

// --- Порт веб-интерфейса qBittorrent (настройки лаунчера) ---
// Лаунчер подключается к Web API по адресу из app-paths.json (qbWebPort).
// Поле в настройках меняет ИМЕННО порт веб-интерфейса («Веб-интерфейс» в qB),
// а не торрент-слуш-порт («Соединение») — их путать нельзя: равные порты рушат
// веб-сервер qB (вчерашняя история: listen=9091 перебил Web UI на 9091).
async function qbGetWebPort() {
  const out = {
    port: qbUrl().split(':').pop(),   // сохранённый порт лаунчера
    connected: false,
    webPort: null,     // фактический порт веб-интерфейса, как его видит qB
    listenPort: null,  // торрент-слуш-порт («Соединение») — только справка
  }
  try {
    const ok = await ensureQb()
    if (!ok) return out
    const pref = await qbRequest('/api/v2/app/preferences')
    if (pref && typeof pref === 'object') {
      out.connected = true
      out.webPort = Number(pref.web_ui_port) || null
      out.listenPort = Number(pref.listen_port) || null
    }
  } catch { /* qB недоступен — покажем только сохранённый порт */ }
  return out
}

async function qbSetWebPort(port) {
  const n = Number(port)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    return { error: 'Порт должен быть целым числом от 1 до 65535' }
  }
  const ok = await ensureQb()
  if (!ok) return { error: 'qBittorrent недоступен. Запустите его с включённым Web UI.' }

  const pref = await qbRequest('/api/v2/app/preferences')
  if (!pref || typeof pref !== 'object') return { error: 'Не удалось прочитать настройки qBittorrent' }

  if (Number(pref.listen_port) === n) {
    return { error: `Порт ${n} занят торрент-слуш-портом qB (Настройки → Соединение). Веб-интерфейс должен быть на другом порту.` }
  }
  if (Number(pref.web_ui_port) === n && String(qbUrl()).endsWith(`:${n}`)) {
    return { port: n, listenPort: Number(pref.listen_port) || null, connected: true }
  }

  // Меняем порт веб-интерфейса: qB перезапускает свой веб-сервер на лету
  await qbRequest('/api/v2/app/setPreferences', 'POST', { json: JSON.stringify({ web_ui_port: n }) }).catch(() => {})
  qbCookie = null                 // сессия старого порта больше не действительна
  saveAppPaths({ qbWebPort: n })  // лаунчер запоминает новый адрес (qbUrl читает его)

  // Ждём ребинда и переподключаемся уже на новом порту
  let reconnected = false
  const deadline = Date.now() + 6000
  while (!reconnected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700))
    reconnected = await ensureQb().catch(() => false)
  }
  if (!reconnected) {
    return { error: `Настройки отправлены, но лаунчер не смог подключиться к localhost:${n}. Проверьте, что порт свободен.` }
  }
  const after = await qbRequest('/api/v2/app/preferences').catch(() => null)
  if (!after || typeof after !== 'object' || Number(after.web_ui_port) !== n) {
    return { error: `qBittorrent не применил порт (веб-интерфейс остался на ${after && after.web_ui_port})` }
  }
  return { port: n, listenPort: Number(after.listen_port) || null, connected: true }
}

ipcMain.handle('qb-webport-get', async () => qbGetWebPort())
ipcMain.handle('qb-webport-set', async (e, port) => qbSetWebPort(port))

// --- Подключение и автонастройка Web UI из лаунчера ---
// Чтобы пользователю не пришлось лезть в qBittorrent руками: пробуем сохранённый
// порт и типовые (9091 — наш дефолт, 8080 — дефолт свежего qB), при неудаче —
// полная автонастройка (остановить qB → включить Web UI и порт в ini → запустить).
async function qbConnect() {
  const configured = Number(qbUrl().split(':').pop())
  const candidates = [...new Set([configured, 9091, 8080].filter((p) => Number.isInteger(p) && p > 0 && p < 65536))]
  const { user, pass } = qbCreds()
  for (const port of candidates) {
    const cookie = await qbLoginTo(port, user, pass)
    if (!cookie) continue
    qbCookie = cookie
    if (port !== configured) saveAppPaths({ qbWebPort: port })
    const pref = await qbRequest('/api/v2/app/preferences').catch(() => null)
    return {
      connected: true,
      port,
      webPort: pref && typeof pref === 'object' ? Number(pref.web_ui_port) || null : null,
      listenPort: pref && typeof pref === 'object' ? Number(pref.listen_port) || null : null,
    }
  }
  return { connected: false, port: configured, webPort: null, listenPort: null }
}

async function qbAutoSetup(port) {
  const target = Number(port) || 9091
  const exe = qbSetup.findQbExe()
  if (!exe) return { error: 'Qbittorrent не установлен на этом компьютере.', notInstalled: true }

  const ini = qbSetup.findQbIni()
  const iniPath = ini.existing || ini.fallback
  if (!iniPath) return { error: 'Не удалось найти конфиг qBittorrent (qBittorrent.ini).' }

  // qB переписывает ini при выходе — правим только после полной остановки
  const stopped = await qbSetup.stopQb()
  if (!stopped) return { error: 'Не удалось остановить qBittorrent — закройте его и повторите.' }

  try {
    qbSetup.patchWebUiIni(iniPath, target, { enabled: true })
  } catch (err) {
    qbSetup.startQb(exe) // не оставляем пользователя без клиента
    return { error: `Не удалось изменить конфиг qBittorrent: ${err.message}` }
  }

  qbSetup.startQb(exe)

  const { user, pass } = qbCreds()
  const deadline = Date.now() + 25000
  let cookie = null
  while (!cookie && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800))
    cookie = await qbLoginTo(target, user, pass)
  }
  if (!cookie) {
    return { error: `Qbittorrent запущен, но веб-интерфейс на порту ${target} не ответил за 25 с. Возможно, его блокирует брандмауэр.` }
  }
  qbCookie = cookie
  saveAppPaths({ qbWebPort: target })
  const pref = await qbRequest('/api/v2/app/preferences').catch(() => null)
  return {
    connected: true,
    port: target,
    webPort: pref && typeof pref === 'object' ? Number(pref.web_ui_port) || null : null,
    listenPort: pref && typeof pref === 'object' ? Number(pref.listen_port) || null : null,
  }
}

// Встроенный или свой qBittorrent (настройки → Хранилище)
ipcMain.handle('qb-mode-get', async () => {
  const managed = qbIsManaged()
  const out = { mode: managed ? 'managed' : 'external', available: !!qbManaged.findManagedExe(), running: false, version: null, listenPort: null }
  if (!managed) return out
  // настройки не запускают qBittorrent: он стартует при первой загрузке
  const res = await qbRaw('/api/v2/app/version').catch(() => null)
  if (res?.status !== 200) return out
  const pref = await qbRequest('/api/v2/app/preferences').catch(() => null)
  return { ...out, running: true, version: res.data, listenPort: pref && typeof pref === 'object' ? Number(pref.listen_port) || null : null }
})
ipcMain.handle('qb-mode-set', async (e, mode) => {
  if (qbIsManaged() && mode === 'external') await stopManagedQb()
  saveAppPaths({ qbMode: mode === 'external' ? 'external' : 'managed' })
  qbCookie = null
  lastQbList = []
  return { mode: qbIsManaged() ? 'managed' : 'external' }
})
ipcMain.handle('qb-webconnect', async () => {
  try { return await qbConnect() } catch (err) { return { connected: false, error: err.message } }
})
ipcMain.handle('qb-autosetup', async (e, port) => {
  try { return await qbAutoSetup(port) } catch (err) { return { error: err.message } }
})
ipcMain.handle('qb-webcreds-get', async () => {
  let p = {}
  try { p = loadAppPaths() } catch { p = {} }
  const { user } = qbCreds()
  return { user, hasPassword: !!String(p.qbWebPass || '') }
})
ipcMain.handle('qb-webcreds-set', async (e, creds) => {
  const user = String((creds && creds.user) || '').trim() || QB_DEFAULT_CREDS.user
  const pass = String((creds && creds.pass) || '')
  saveQbCreds(user, pass)
  qbCookie = null
  try { return await qbConnect() } catch (err) { return { connected: false, error: err.message } }
})

// Register torrent handlers
ipcMain.handle('torrent-add', async (event, { magnetURI, gameId, gameTitle }) => {
  console.log('[Torrent] add:', gameTitle)
  // каталожный id кладём в тег торрента — при установке он станет catalogId
  // для учёта наигранного времени
  const catalogId = Number(gameId) || 0
  const result = await qbAddTorrent(magnetURI, downloadDirOrDefault(), { tags: catalogId > 0 ? `lustre,lustre-game-${catalogId}` : 'lustre' })
  // Ошибка (например, qBittorrent не подключён) уходит в рендерер —
  // GameActions показывает её диалогом, без молчаливого перехода в пустые «Загрузки»
  if (result.error) return result
  if (result.existing) await qbResumeTorrent(result.hash).catch(() => {}) // запрошен заново — значит, нужен
  startStatusPolling()
  return { id: magnetURI, info: { gameTitle } }
})
ipcMain.handle('torrent-pause', async (e, id) => {
  if (httpDownloads.has(id)) { httpPause(id); return }
  await qbPauseTorrent(id)
})
ipcMain.handle('torrent-resume', async (e, id) => {
  if (httpDownloads.has(id)) { httpResume(id); return }
  await qbResumeTorrent(id)
})
ipcMain.handle('torrent-remove', async (e, { id, deleteFiles }) => {
  if (httpDownloads.has(id)) { httpRemove(id, deleteFiles); return }
  await qbDeleteTorrent(id, deleteFiles === true)
})
ipcMain.handle('torrent-list', async () => [...httpList(), ...(await qbGetTorrents())])
ipcMain.handle('torrent-peers', async (e, magnets) => qbPeersForMagnets(magnets))
ipcMain.handle('http-download-start', async (e, opts) => httpDownloadStart(opts || {}))
ipcMain.on('http-relink', (e, { id, url } = {}) => httpRelink(id, url))

let statusInterval = null
let lastQbList = []

// Объединённый список загрузок: HTTP (Direct/Pixeldrain) + торренты qBittorrent
async function broadcastDownloads() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('torrent-updates', [...httpList(), ...lastQbList])
  maybeInstallUpdate() // если ждалось обновление — ставим, когда качать больше нечего
}

function startStatusPolling() {
  if (statusInterval) return
  statusInterval = setInterval(async () => {
    try {
      lastQbList = await qbGetTorrents()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('torrent-updates', [...httpList(), ...lastQbList])
      }
    } catch {}
  }, 2000)
}

// ============================================================
// HTTP-загрузки (Direct / Pixeldrain) — собственный менеджер
// ============================================================
const HTTP_DIR = path.join(QB_SAVE_PATH, 'http').replace(/\\/g, '/')
fs.mkdirSync(HTTP_DIR, { recursive: true })

// Эффективная папка скачиваний: выбранная пользователем (см. Хранилище в
// настройках) или папка по умолчанию. Торренты и HTTP-загрузки используют
// одну и ту же папку, если пользователь задал свою.
function downloadDirOrDefault() {
  return folderOnDrive('downloadDrive') || QB_SAVE_PATH
}
function httpDirOrDefault() {
  const onDrive = folderOnDrive('downloadDrive')
  return onDrive ? path.join(onDrive, 'http') : HTTP_DIR
}

const httpDownloads = new Map() // id -> запись загрузки
const httpHandles = new Map()   // id -> { req, aborted }
let activeInstalls = 0          // сколько установок идёт прямо сейчас (guard обновлений)

// Pixeldrain: /u/{id} -> прямой поток api/file/{id}
function resolveSourceUrl(url, kind) {
  if (!url) return ''
  if (kind === 'pixeldrain' || /pixeldrain\.com/i.test(url)) {
    const m = /pixeldrain\.com\/(?:u|l)\/([\w-]+)/i.exec(url)
    if (m) return `https://pixeldrain.com/api/file/${m[1]}?download`
  }
  return url
}

function pickFilename(url, headers) {
  const cd = headers && headers['content-disposition']
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
    if (m && m[1]) { try { return decodeURIComponent(m[1]) } catch { return m[1] } }
  }
  try {
    const base = decodeURIComponent(path.basename(new URL(url).pathname))
    if (base && base !== '/') return base
  } catch {}
  return 'download.bin'
}

// Магические байты архивов. Нужно, когда хостинг отдаёт файл без расширения
// в URL и без понятного Content-Type (у itch.io CDN это application/octet-stream),
// но содержимое — настоящий архив (проверено на Factorial Omega: 50 4B 03 04).
function archiveExtFromMagic(buf) {
  if (!buf || buf.length < 4) return ''
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return '.zip' // PK.. 
  if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) return '.rar' // Rar!
  if (buf.length >= 6 && buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc && buf[3] === 0xaf && buf[4] === 0x27 && buf[5] === 0x1c) return '.7z'
  if (buf[0] === 0x1f && buf[1] === 0x8b) return '.gz'
  return ''
}

// Дописать расширение скачанному файлу, если оно неизвестно (по магическим байтам).
function ensureArchiveExtension(rec) {
  try {
    if (!rec || !rec.filePath || !fs.existsSync(rec.filePath)) return
    if (rec.fileName && path.extname(rec.fileName)) return
    const fd = fs.openSync(rec.filePath, 'r')
    const head = Buffer.alloc(16)
    let n = 0
    try { n = fs.readSync(fd, head, 0, 16, 0) } finally { fs.closeSync(fd) }
    const ext = archiveExtFromMagic(head.subarray(0, n))
    if (!ext) return
    const next = rec.filePath + ext
    fs.renameSync(rec.filePath, next)
    rec.filePath = next
    rec.fileName = `${rec.fileName || 'download'}${ext}`
  } catch { /* ignore */ }
}

function httpList() {
  return [...httpDownloads.values()].map(d => ({
    id: d.id,
    gameId: d.gameId,
    gameTitle: d.gameTitle,
    magnetURI: d.url,
    progress: d.totalSize > 0 ? Math.min(1, d.downloaded / d.totalSize) : 0,
    downloadSpeed: d.downloadSpeed,
    uploadSpeed: 0,
    downloaded: d.downloaded,
    totalSize: d.totalSize,
    numPeers: 0,
    status: d.status,
    error: d.error || undefined,
    waiting: !!d.waiting,
    path: d.filePath || '',
    files: [],
    addedAt: d.addedAt,
    eta: d.eta || 0,
    kind: d.kind,
    source: 'http',
  }))
}

// Повторы после обрыва: пока сети нет, ждём сколько потребуется и попытки не считаем
const HTTP_RETRY_DELAYS = [2000, 5000, 10000, 20000, 30000]
const HTTP_RETRY_OFFLINE_DELAY = 5000
const HTTP_RETRY_MAX = 40
// Ссылка CDN могла протухнуть за время обрыва — такие ответы лечатся новой ссылкой
const HTTP_LINK_EXPIRED = [401, 403, 404, 410]
const HTTP_RELINK_MAX = 3

// Докачиваем от реального размера файла: счётчик полученных байт включает и те,
// что не успели записаться на диск в момент обрыва
function httpFileSize(rec) {
  try { return rec.filePath ? fs.statSync(rec.filePath).size : 0 } catch { return 0 }
}

function httpFail(id, message) {
  const rec = httpDownloads.get(id)
  if (!rec) return
  rec.status = 'error'
  rec.error = message
  rec.waiting = false
  rec.downloadSpeed = 0
  rec.eta = 0
  httpHandles.delete(id)
  broadcastDownloads()
}

function httpRetryLater(id, reason) {
  const rec = httpDownloads.get(id)
  httpHandles.delete(id)
  if (!rec || rec.status !== 'downloading') return
  const online = net.isOnline()
  if (online) rec.retries = (rec.retries || 0) + 1
  if ((rec.retries || 0) > HTTP_RETRY_MAX) {
    httpFail(id, reason || 'Не удалось возобновить загрузку')
    return
  }
  rec.waiting = true
  rec.downloadSpeed = 0
  rec.eta = 0
  clearTimeout(rec.retryTimer)
  const delay = online
    ? HTTP_RETRY_DELAYS[Math.min(rec.retries - 1, HTTP_RETRY_DELAYS.length - 1)]
    : HTTP_RETRY_OFFLINE_DELAY
  rec.retryTimer = setTimeout(() => {
    rec.retryTimer = null
    if (httpDownloads.get(id) === rec && rec.status === 'downloading') startHttpRequest(id)
  }, delay)
  broadcastDownloads()
}

// Просим у главного окна свежую ссылку (её выдаёт бэкенд по странице игры на itch.io)
function httpRequestRelink(id, rec) {
  if (!rec.refreshFrom || (rec.relinks || 0) >= HTTP_RELINK_MAX || !mainWindow || mainWindow.isDestroyed()) return false
  rec.relinks = (rec.relinks || 0) + 1
  rec.waiting = true
  rec.downloadSpeed = 0
  httpHandles.delete(id)
  mainWindow.webContents.send('http-link-expired', { id, page: rec.refreshFrom, filename: rec.hintName })
  broadcastDownloads()
  return true
}

function startHttpRequest(id) {
  const rec = httpDownloads.get(id)
  if (!rec || httpHandles.has(id)) return
  const url = rec.url
  const offset = httpFileSize(rec)
  rec.status = 'downloading'
  rec.error = null
  const headers = { 'User-Agent': 'LustreLauncher/1.0' }
  if (offset > 0) headers['Range'] = `bytes=${offset}-`

  const handle = { req: null, aborted: false }
  httpHandles.set(id, handle)

  const make = (u, redirects) => {
    const lib = u.startsWith('https:') ? https : http
    const req = lib.get(u, { headers, timeout: 30000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 6) {
        res.resume()
        return make(new URL(res.headers.location, u).toString(), redirects + 1)
      }
      if (res.statusCode === 416) {
        // Файл уже скачан целиком (обрыв пришёлся на самый конец) или на сервере он сменился
        res.resume()
        const m = /bytes \*\/(\d+)/.exec(res.headers['content-range'] || '')
        httpHandles.delete(id)
        if (m && Number(m[1]) === offset) {
          rec.totalSize = offset
          rec.downloaded = offset
          ensureArchiveExtension(rec)
          rec.status = 'completed'
          rec.waiting = false
          broadcastDownloads()
        } else {
          fs.promises.rm(rec.filePath, { force: true }).catch(() => {}).then(() => startHttpRequest(id))
        }
        return
      }
      if (res.statusCode === 429 || res.statusCode >= 500) {
        res.resume()
        httpRetryLater(id, `HTTP ${res.statusCode}`)
        return
      }
      if (res.statusCode >= 400) {
        res.resume()
        if (HTTP_LINK_EXPIRED.includes(res.statusCode) && httpRequestRelink(id, rec)) return
        httpFail(id, `HTTP ${res.statusCode}`)
        return
      }
      const partial = res.statusCode === 206
      // Сервер вернул не тот кусок — дописывать нельзя, файл будет битым. Качаем заново
      const range = /bytes (\d+)-/.exec(res.headers['content-range'] || '')
      if (partial && range && Number(range[1]) !== offset) {
        res.destroy()
        handle.aborted = true
        httpHandles.delete(id)
        fs.promises.rm(rec.filePath, { force: true }).catch(() => {}).then(() => startHttpRequest(id))
        return
      }
      // CDN itch.io отдаёт настоящее имя файла с расширением
      // (Content-Disposition: attachment; filename="factorial-omega-win-64.zip"),
      // а имя из резолва иногда приходит без расширения ("PC(Windows) - …").
      // Тогда берём CDN-имя — иначе файл ляжет без .zip и установщик его не распознает.
      const cdName = pickFilename(u, res.headers)
      if (!rec.fileName) rec.fileName = cdName
      else if (!path.extname(rec.fileName) && path.extname(cdName)) rec.fileName = cdName
      if (!rec.filePath) {
        const base = httpDirOrDefault()
        try { fs.mkdirSync(base, { recursive: true }) } catch {}
        const safe = `${id.replace(/[^a-z0-9]/gi, '_')}_${rec.fileName.replace(/[\\/:*?"<>|]/g, '_')}`
        rec.filePath = path.join(base, safe)
      }
      const len = parseInt(res.headers['content-length'] || '0', 10)
      rec.totalSize = (partial ? offset : 0) + (len || 0)
      rec.downloaded = partial ? offset : 0
      rec.lastBytes = rec.downloaded
      rec.lastTime = Date.now()
      rec.waiting = false

      const out = fs.createWriteStream(rec.filePath, { flags: partial && offset > 0 ? 'a' : 'w' })
      // Продолжать можно только когда файл закрыт: иначе размер на диске ещё неокончательный
      rec.writer = new Promise((resolve) => out.once('close', resolve))
      let interrupted = false
      out.on('error', (err) => {
        interrupted = true
        handle.aborted = true
        req.destroy()
        httpFail(id, err.message)
      })

      res.on('data', (chunk) => {
        rec.downloaded += chunk.length
        rec.retries = 0
        rec.relinks = 0
        const now = Date.now()
        if (now - rec.lastTime >= 700) {
          rec.downloadSpeed = Math.round(((rec.downloaded - rec.lastBytes) * 1000) / (now - rec.lastTime))
          rec.lastBytes = rec.downloaded
          rec.lastTime = now
          rec.eta = rec.downloadSpeed > 0 ? Math.round((rec.totalSize - rec.downloaded) / rec.downloadSpeed) : 0
          broadcastDownloads()
        }
      })
      // Обрыв посреди файла: req.on('error') тут уже не срабатывает, а pipe не закрывает
      // файл сам — без этого загрузка навсегда зависала в статусе «Загрузка»
      res.on('error', () => {})
      res.on('close', () => {
        if (res.complete || interrupted) return
        interrupted = true
        res.unpipe(out)
        out.end()
        if (handle.aborted) return
        rec.writer.then(() => httpRetryLater(id, 'Соединение потеряно'))
      })
      res.pipe(out)
      out.on('finish', () => {
        if (handle.aborted || interrupted) return
        rec.downloadSpeed = 0
        rec.eta = 0
        if (rec.totalSize > 0 && rec.downloaded < rec.totalSize) {
          rec.writer.then(() => httpRetryLater(id, 'Соединение потеряно')) // докачиваем остаток
          return
        }
        // Если имя файла осталось без расширения — определяем архив по магическим
        // байтам (CDN itch отдаёт octet-stream без расширения в URL).
        ensureArchiveExtension(rec)
        rec.status = 'completed'
        rec.waiting = false
        httpHandles.delete(id)
        broadcastDownloads()
      })
    })
    handle.req = req
    req.on('error', (err) => {
      if (handle.aborted) return
      // Нет сети, DNS, таймаут до ответа — соединение вернётся, тогда и продолжим
      if (req.res) return
      httpRetryLater(id, err.message)
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
  }

  make(url, 0)
}

function httpDownloadStart({ url, kind, gameId, gameTitle, filename, refreshFrom }) {
  const resolved = resolveSourceUrl(url, kind)
  if (!resolved) return { error: 'Пустая ссылка' }
  const id = 'http:' + crypto.createHash('md5').update(resolved).digest('hex').slice(0, 16)
  if (httpDownloads.has(id)) return { id, existing: true }
  const rec = {
    id, gameId, gameTitle: gameTitle || resolved, url: resolved, kind: kind || 'direct',
    // Имя файла подсказываем сами: у itch.io прямые ссылки вида /upload2/game/1576684/13619666
    // без расширения, и без подсказки установщик не распознает архив.
    fileName: String(filename || '').replace(/[\\/:*?"<>|]/g, '_'), filePath: '',
    hintName: String(filename || ''), refreshFrom: String(refreshFrom || ''),
    downloaded: 0, totalSize: 0, downloadSpeed: 0, eta: 0,
    status: 'downloading', error: null, addedAt: Date.now(), lastBytes: 0, lastTime: Date.now(),
  }
  httpDownloads.set(id, rec)
  startHttpRequest(id)
  broadcastDownloads()
  return { id }
}

function httpPause(id) {
  const rec = httpDownloads.get(id)
  if (!rec) return
  rec.status = 'paused'
  rec.downloadSpeed = 0
  rec.waiting = false
  clearTimeout(rec.retryTimer)
  const h = httpHandles.get(id)
  if (h) { h.aborted = true; if (h.req) h.req.destroy() }
  httpHandles.delete(id)
  broadcastDownloads()
}

function httpResume(id) {
  const rec = httpDownloads.get(id)
  if (!rec) return
  rec.status = 'downloading'
  rec.error = null
  rec.retries = 0
  clearTimeout(rec.retryTimer)
  Promise.resolve(rec.writer).then(() => {
    if (httpDownloads.get(id) === rec && rec.status === 'downloading') startHttpRequest(id)
  })
  broadcastDownloads()
}

// Ответ главного окна на http-link-expired: новая ссылка или пусто, если получить не удалось
function httpRelink(id, url) {
  const rec = httpDownloads.get(id)
  if (!rec || rec.status !== 'downloading') return
  if (!url) {
    httpFail(id, 'Ссылка на файл устарела. Удалите загрузку и начните заново')
    return
  }
  rec.url = String(url)
  startHttpRequest(id)
}

function httpRemove(id, deleteFiles) {
  const rec = httpDownloads.get(id)
  if (!rec) return
  clearTimeout(rec.retryTimer)
  const h = httpHandles.get(id)
  if (h) { h.aborted = true; if (h.req) h.req.destroy() }
  httpHandles.delete(id)
  httpDownloads.delete(id)
  if (deleteFiles !== false && rec.filePath) fs.promises.rm(rec.filePath, { force: true }).catch(() => {})
  broadcastDownloads()
}

// --- GAME INSTALLATION ---
import installerModule from './installer.cjs'
import playtime from './process-watcher.cjs'
import translator from './translator/index.cjs'
const {
  detectInstall, extractArchive, hoistGameRoot, findInstallerIn, isProtectedPath, isInside, samePath,
  freeSpace, pathSize, sameVolume, formatSize, rankGameExecutable, findGameRootFromExe,
  sanitizeName, uniqueDest, moveFolder, getGamesDir, loadRegistry, registerGame,
  removeGameEntry, launchInstalledGame, launchInstaller, waitProcessExit, unblockFolder,
  extractNestedArchives, detectInstallerType, runInstallerSilently,
  createDesktopShortcut, loadAppPaths, saveAppPaths, getBundled7z,
  systemDrive, normalizeDrive, listDrives, folderOnDrive, migrateCustomPaths, legacyDirs,
} = installerModule

// Папки загрузок: их саму целиком лаунчер не удаляет никогда
const protectedDownloadDirs = () => [
  QB_SAVE_PATH, LEGACY_QB_SAVE_PATH, HTTP_DIR, downloadDirOrDefault(), httpDirOrDefault(), getGamesDir(),
  ...legacyDirs('legacyDownloadDirs'), ...legacyDirs('legacyInstallDirs'),
]

// Удаляет то, что лаунчер сам скачал или распаковал; защищённые папки пропускает
async function removeLauncherFiles(target) {
  if (!target || isProtectedPath(target, protectedDownloadDirs())) return false
  await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {})
  return true
}

// Убирает загрузку после установки: торрент вместе с файлами или запись прямой загрузки
function dropDownload(gameId, contentPath) {
  if (!httpDownloads.has(gameId)) qbRequest('/api/v2/torrents/delete', 'POST', { hashes: gameId, deleteFiles: 'true' }).catch(() => {})
  httpDownloads.delete(gameId)
  return removeLauncherFiles(contentPath)
}

// Раздача без корневой папки: content_path совпадает с папкой загрузок, и в ней лежат чужие файлы.
// Переносим файлы этой раздачи в отдельную папку, чтобы установка не задела остальное.
async function stageRootlessTorrent(t) {
  const files = await qbRequest(`/api/v2/torrents/files?hash=${t.hash}`)
  if (!Array.isArray(files) || files.length === 0) return null
  const staging = uniqueDest(path.join(t.save_path, `.lustre-install-${t.hash.slice(0, 8)}`))
  for (const f of files) {
    const src = path.join(t.save_path, f.name)
    const dst = path.join(staging, f.name)
    await fs.promises.mkdir(path.dirname(dst), { recursive: true })
    await fs.promises.rename(src, dst).catch(async () => {
      await fs.promises.cp(src, dst)
      await fs.promises.rm(src, { force: true }).catch(() => {})
    })
  }
  return staging
}

// Хватит ли места: распаковка требует как минимум объёма архива, перенос на другой диск — объёма папки
async function checkFreeSpace(source, targetDir, factor) {
  const need = Math.round((await pathSize(source)) * factor)
  const free = freeSpace(targetDir)
  if (free === null || need === 0 || free >= need) return null
  return `Недостаточно места на диске ${path.parse(path.resolve(targetDir)).root}: нужно примерно ${formatSize(need)}, свободно ${formatSize(free)}. Освободите место или выберите другую папку установки в Настройках → Хранилище.`
}

const installingIds = new Set()

function sendInstallProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install-progress', payload)
  }
}

// Установка игры. Вынесена в отдельную функцию, чтобы обёртка могла
// отслеживать занятость лаунчера (нельзя предлагать перезапуск под обновление,
// пока идёт установка).
async function installGameImpl(gameId) {
  let contentPath
  let baseNameHint
  // id игры в каталоге Lustre — нужен, чтобы засчитывать наигранное время:
  // в реестре installed хранится id скачивания, поэтому catalogId сохраняем отдельно.
  let catalogId = 0

  const hd = httpDownloads.get(gameId)
  if (hd) {
    // Прямая загрузка (Direct / Pixeldrain)
    if (hd.status !== 'completed') return { error: 'Загрузка ещё не завершена' }
    contentPath = hd.filePath
    baseNameHint = hd.gameTitle
    catalogId = Number(hd.gameId) || 0
    if (!contentPath || !fs.existsSync(contentPath)) return { error: 'Файл загрузки не найден' }
  } else {
    let torrents
    try { torrents = await qbRequest('/api/v2/torrents/info') } catch { return { error: 'qBittorrent недоступен' } }
    const t = Array.isArray(torrents) ? torrents.find(x => x.hash === gameId) : null
    if (!t) return { error: 'Загрузка не найдена' }
    if (t.progress < 1) return { error: 'Загрузка ещё не завершена' }

    // Приостанавливаем сидирование, чтобы qb отпустил файлы (иначе EPERM при переносе)
    await qbPauseTorrent(gameId).catch(() => {})
    await new Promise(r => setTimeout(r, 800))

    contentPath = t.content_path
    if (contentPath && t.save_path && samePath(contentPath, t.save_path)) {
      contentPath = await stageRootlessTorrent(t).catch(() => null)
      if (!contentPath) return { error: 'Не удалось отделить файлы раздачи от остальных загрузок' }
    }
    baseNameHint = t.name
    // каталожный id добавляется тегом при загрузке (см. torrent-add)
    const tagMatch = /lustre-game-(\d+)/.exec(String(t.tags || ''))
    if (tagMatch) catalogId = Number(tagMatch[1]) || 0
    if (!contentPath || !fs.existsSync(contentPath)) return { error: 'Файлы загрузки не найдены: ' + (contentPath || '?') }
  }

  // Снимаем метку блокировки Windows (Mark of the Web) со всех файлов
  await unblockFolder(contentPath)

  const det = detectInstall(contentPath)
  if (!det) return { error: 'Не удалось определить содержимое загрузки' }

  const baseName = sanitizeName(baseNameHint || gameId)
  const gamesDir = getGamesDir()

  // Финализация: находим exe (ранжирование как в Hydra), корень игры — на верхний уровень, регистрируем
  const finalizeInstall = async (dest, kind) => {
    let exePath = rankGameExecutable(dest, baseName)
    if (exePath) {
      const root = findGameRootFromExe(exePath)
      if (root && hoistGameRoot(dest, root)) exePath = rankGameExecutable(dest, baseName)
    }
    const entry = {
      id: gameId,
      catalogId,
      name: baseName,
      installPath: dest,
      // папку создал лаунчер: при удалении игры её можно стереть целиком
      managed: true,
      exePath,
      kind,
      installedAt: Date.now(),
      playtimeMs: 0,
    }
    registerGame(entry)
    sendInstallProgress({ gameId, phase: 'done', percent: 100 })
    // Убираем торрент/запись загрузки и временные файлы
    await dropDownload(gameId, contentPath)
    return entry
  }

  // Тихая установка: известный тип установщика ставим без мастера прямо в папку игр лаунчера,
  // поэтому exe находится сам. Возвращает null, если нужно перейти к обычной установке с мастером.
  const installSilently = async (installerPath, sourcePath) => {
    const type = detectInstallerType(installerPath)
    if (!type) return null
    let source = sourcePath
    let installer = installerPath
    // Установщик распакован в папку игр под именем игры: освобождаем это имя для самой игры
    if (samePath(path.dirname(source), gamesDir) && isInside(installer, source)) {
      const moved = uniqueDest(path.join(gamesDir, `.setup-${baseName}`))
      try {
        await fs.promises.rename(source, moved)
        installer = path.join(moved, path.relative(source, installer))
        source = moved
      } catch { /* папка занята: поставим игру рядом под другим именем */ }
    }
    // Установщики репаков распаковывают сжатые данные: места нужно заметно больше их размера
    const noSpace = await checkFreeSpace(source, gamesDir, 2)
    if (noSpace) return { error: noSpace }
    const target = uniqueDest(path.join(gamesDir, baseName))

    sendInstallProgress({ gameId, phase: 'install', percent: -1, silent: true })
    // Прогресса установщик не сообщает: показываем, сколько уже записано в папку игры
    const sizeTimer = setInterval(async () => {
      const bytes = await pathSize(target)
      sendInstallProgress({ gameId, phase: 'install', percent: -1, silent: true, bytes })
    }, 3000)
    let res
    try {
      res = await runInstallerSilently(installer, type, target)
    } finally {
      clearInterval(sizeTimer)
    }
    if (res.cancelled) {
      sendInstallProgress({ gameId, phase: 'idle', percent: -1 })
      return { error: 'Установка отменена: установщику нужны права администратора' }
    }
    if (!res.ok) {
      console.warn('[Install] тихая установка не удалась, переходим к мастеру:', res.error || `код ${res.code}`)
      if (isInside(target, gamesDir)) await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {})
      return { fallback: installer, source }
    }

    const exePath = rankGameExecutable(target, baseName)
    registerGame({
      id: gameId, catalogId, name: baseName, installPath: target,
      // папку указал лаунчер: при удалении игры её можно стереть целиком
      managed: true,
      exePath, kind: 'installer', silent: true,
      // пока exe не найден, установочные файлы держим: вдруг пользователь захочет переустановить
      ...(exePath ? {} : { sourcePath: source }),
      installedAt: Date.now(), playtimeMs: 0,
    })
    if (exePath) await dropDownload(gameId, source)
    sendInstallProgress({ gameId, phase: exePath ? 'done' : 'idle', percent: exePath ? 100 : -1 })
    return exePath
      ? { ok: true, kind: 'installer', installPath: target, exePath }
      : { ok: true, kind: 'installer', installPath: target, message: `Игра установлена в «${target}», но файл запуска не найден. Укажите exe на странице игры.` }
  }

  // Установщик: запускаем и ждём, пока пользователь укажет exe. Файлы загрузки не трогаем до этого:
  // установщики Inno Setup (почти все репаки) сразу передают работу своей копии во временной папке,
  // и раньше лаунчер стирал файлы, пока установка ещё читала их.
  const runInstallerFrom = async (installerPathIn, sourcePathIn) => {
    let installerPath = installerPathIn
    let sourcePath = sourcePathIn
    if (loadAppPaths().autoInstallSetups !== false) {
      const silent = await installSilently(installerPath, sourcePath)
      if (silent && !silent.fallback) return silent
      // не получилось без мастера — запускаем как обычно
      if (silent?.fallback) { installerPath = silent.fallback; sourcePath = silent.source }
    }
    const launchRes = await launchInstaller(installerPath)
    if (launchRes?.error) return { error: 'Не удалось запустить установщик: ' + launchRes.error }
    registerGame({
      id: gameId, catalogId, name: baseName, installPath: '', exePath: null, kind: 'installer',
      sourcePath, installedAt: Date.now(), playtimeMs: 0,
    })
    sendInstallProgress({ gameId, phase: 'installer', percent: -1 })
    waitProcessExit(launchRes.pid).then(() => {
      const entry = loadRegistry().find(g => g.id === gameId)
      if (entry && !entry.exePath) sendInstallProgress({ gameId, phase: 'idle', percent: -1 })
    })
    return { ok: true, kind: 'installer', message: 'Установщик запущен — установите игру и укажите exe на странице игры' }
  }

  let dest

  if (det.kind === 'installer') return runInstallerFrom(det.installerPath, contentPath)

  // Архивы — создаём папку игры и распаковываем туда (с перебором паролей репаков)
  if (det.kind === 'archive') {
    const noSpace = await checkFreeSpace(det.archivePath, gamesDir, 1)
    if (noSpace) return { error: noSpace }
    dest = uniqueDest(path.join(gamesDir, baseName))
    sendInstallProgress({ gameId, phase: 'install', percent: 0 })
    try {
      await extractArchive(det.archivePath, dest, (pct) => sendInstallProgress({ gameId, phase: 'install', percent: pct }))
    } catch (err) {
      // не оставляем полураспакованную папку
      await fs.promises.rm(dest, { recursive: true, force: true }).catch(() => {})
      return { error: 'Ошибка распаковки: ' + (err.message || err) }
    }
    sendInstallProgress({ gameId, phase: 'install', percent: -1 })
    // Внутри был ещё архив (или несколько слоёв): распаковываем, пока не появится игра
    try {
      await extractNestedArchives(dest, baseName, {
        onProgress: (pct) => sendInstallProgress({ gameId, phase: 'install', percent: pct }),
        beforeExtract: async (inner) => {
          const noSpace = await checkFreeSpace(inner.first.path, dest, 1)
          if (noSpace) throw new Error(noSpace)
          sendInstallProgress({ gameId, phase: 'install', percent: 0 })
        },
      })
    } catch (err) {
      await fs.promises.rm(dest, { recursive: true, force: true }).catch(() => {})
      return { error: 'Ошибка распаковки вложенного архива: ' + (err.message || err) }
    }
    sendInstallProgress({ gameId, phase: 'install', percent: -1 })
    // В архиве оказался установщик, а не готовая игра: запускаем его из распакованной папки
    if (!rankGameExecutable(dest, baseName)) {
      const installer = findInstallerIn(dest)
      if (installer) {
        await dropDownload(gameId, contentPath)
        return runInstallerFrom(installer, dest)
      }
    }
    const entry = await finalizeInstall(dest, 'archive')
    return { ok: true, kind: 'archive', installPath: dest, exePath: entry.exePath }
  }

  // Готовая папка с игрой (или одиночный файл-торрент) — в папку установленных игр
  if (!sameVolume(contentPath, gamesDir)) {
    const noSpace = await checkFreeSpace(contentPath, gamesDir, 1)
    if (noSpace) return { error: noSpace }
  }
  sendInstallProgress({ gameId, phase: 'install', percent: -1 })
  if (det.singleFile) {
    // одиночный exe: создаём папку с именем торрента и переносим только сам файл
    dest = uniqueDest(path.join(gamesDir, baseName))
    await fs.promises.mkdir(dest, { recursive: true })
    const target = path.join(dest, path.basename(det.singleFile))
    try {
      await fs.promises.rename(det.singleFile, target)
    } catch {
      await fs.promises.cp(det.singleFile, target)
      await fs.promises.rm(det.singleFile, { force: true }).catch(() => {})
    }
  } else {
    dest = await moveFolder(det.gameFolder, gamesDir, baseName)
  }
  const entry = await finalizeInstall(dest, 'portable')
  return { ok: true, kind: 'portable', installPath: dest, exePath: entry.exePath }
}

ipcMain.handle('install-game', async (e, gameId) => {
  // Повторный клик, пока идёт установка, запускал вторую параллельную
  if (installingIds.has(gameId)) return { error: 'Игра уже устанавливается' }
  installingIds.add(gameId)
  activeInstalls++
  try {
    return await installGameImpl(gameId)
  } catch (err) {
    console.error('[Install]', err)
    return { error: 'Установка прервалась: ' + (err?.message || err) }
  } finally {
    installingIds.delete(gameId)
    activeInstalls--
    maybeInstallUpdate() // установка закончилась — можно ставить обновление
  }
})

// Нативные уведомления Windows (системные тосты, как в Steam).
// Клик по тосту — фокус главного окна + событие в рендерер (navigate и т.п.)
ipcMain.handle('notify-show', (e, opts) => {
  try {
    const title = String(opts?.title || 'Lustre').slice(0, 120)
    const body = String(opts?.body || '').slice(0, 500)
    // Во время игры — уведомление в оверлее (системные тосты Windows глушит в полноэкранных играх)
    if (showGameToast({ kind: 'notify', title, body })) return true
    if (!Notification.isSupported()) return false
    let icon
    try {
      icon = nativeImage.createFromPath(APP_ICON)
      if (icon.isEmpty()) icon = undefined
    } catch { icon = undefined }
    const n = new Notification({ title, body, icon, silent: !!opts?.silent })
    n.on('click', () => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('notify-click', opts?.payload ?? null)
        }
      } catch { /* ignore */ }
    })
    n.show()
    return true
  } catch {
    return false
  }
})

ipcMain.handle('installed-games', () => loadRegistry())
ipcMain.handle('launch-game', async (e, id) => {
  const entry = loadRegistry().find(g => g.id === id)
  if (entry?.installPath) await unblockFolder(entry.installPath)
  const res = await launchInstalledGame(entry)
  if (res?.ok && entry) {
    registerGame({ ...entry, lastPlayedAt: Date.now() })
    // Учёт времени игры: process-watcher растит playtimeMs, пока процесс жив
    playtime.track({ ...entry, lastPlayedAt: Date.now() }, () => {
      // игра закрылась — сообщим рендереру (сброс статуса «Играет в …» + отчёт сессии)
      try { mainWindow?.webContents.send('game-state', { running: false, name: entry.name, id: entry.id, catalogId: entry.catalogId || 0 }) } catch {}
      onGameExited(entry)
    })
    // запущена — статус «Играет в …» для друзей + начало отсчёта сессии
    try { mainWindow?.webContents.send('game-state', { running: true, name: entry.name, id: entry.id, catalogId: entry.catalogId || 0 }) } catch {}
    onGameStarted(entry)
  }
  return res
})
// ==========================================================

// Диалог выбора exe игры (как «Расположение» в Hydra)
ipcMain.handle('pick-exe', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите исполняемый файл игры',
    properties: ['openFile'],
    filters: [
      { name: 'Приложения', extensions: ['exe'] },
      { name: 'Все файлы', extensions: ['*'] },
    ],
  })
  if (res.canceled || !res.filePaths?.length) return null
  pickedExePaths.add(path.normalize(res.filePaths[0]).toLowerCase())
  return res.filePaths[0]
})

// Привязать выбранный exe к установленной игре
ipcMain.handle('set-game-exe', (e, id, exePath) => {
  const list = loadRegistry()
  const entry = list.find(g => g.id === id)
  if (!entry) return { error: 'Игра не найдена в реестре' }
  if (!exePath || !fs.existsSync(exePath) || !/\.exe$/i.test(exePath)) {
    return { error: 'Некорректный путь к exe' }
  }
  const normExe = path.normalize(exePath).toLowerCase()
  const insideGame = entry.installPath && normExe.startsWith(path.normalize(entry.installPath).toLowerCase() + path.sep)
  if (!pickedExePaths.has(normExe) && !insideGame) {
    return { error: 'Выберите exe через диалог «Указать файл игры»' }
  }
  entry.exePath = exePath
  // Игра стоит там, куда её поставил установщик: эту папку лаунчер не создавал и не удаляет
  if (!entry.installPath || (entry.kind === 'installer' && !entry.managed)) entry.installPath = path.dirname(exePath)
  // Установка закончена — установочные файлы больше не нужны, если игра не встала прямо в них
  const source = entry.sourcePath
  if (source && !isInside(exePath, source)) {
    delete entry.sourcePath
    dropDownload(id, source).catch(() => {})
  }
  registerGame(entry)
  // Установка завершена вручную — карточка загрузки помечается как выполненная
  sendInstallProgress({ gameId: id, phase: 'done', percent: 100 })
  return { ok: true, entry }
})
ipcMain.handle('create-shortcut', (e, id) => {
  const entry = loadRegistry().find(g => g.id === id)
  if (!entry?.exePath) return { error: 'Игра не установлена' }
  return createDesktopShortcut(entry.name, entry.exePath)
})
// Можно ли стереть папку игры. Раньше удалялась любая installPath: для игры со своим установщиком
// это папка выбранного exe — например, Рабочий стол целиком.
function canDeleteInstallPath(entry) {
  if (!entry?.installPath || isProtectedPath(entry.installPath, protectedDownloadDirs())) return false
  if (entry.managed) return true
  // старые записи без пометки: только папки внутри папки игр лаунчера (в том числе прежней)
  return entry.kind !== 'installer' &&
    [getGamesDir(), ...legacyDirs('legacyInstallDirs')].some((dir) => isInside(entry.installPath, dir))
}

ipcMain.handle('uninstall-game', async (e, id) => {
  const entry = loadRegistry().find(g => g.id === id)
  const removable = canDeleteInstallPath(entry)
  if (removable) await fs.promises.rm(entry.installPath, { recursive: true, force: true }).catch(() => {})
  // Установщик так и не закончили: убираем установочные файлы
  if (entry?.sourcePath) await dropDownload(id, entry.sourcePath)
  removeGameEntry(id)
  // Файлы игры, поставленной своим установщиком, остаются: удалять их нужно её деинсталлятором
  return removable || !entry?.installPath ? { ok: true } : { ok: true, keptFiles: true, path: entry.installPath }
})
ipcMain.handle('reveal-game', (e, id) => {
  const entry = loadRegistry().find(g => g.id === id)
  if (entry?.installPath) shell.showItemInFolder(entry.installPath)
  return { ok: true }
})

// --- АВТОПЕРЕВОД ИГР (офлайн, Bergamot): Ren'Py, RPG Maker MV/MZ — см. electron/translator ---
const translatorDataDir = () => path.join(app.getPath('userData'), 'translator')
const gameInstallPath = (id) => loadRegistry().find(g => g.id === id)?.installPath || null

ipcMain.handle('translator:status', (_e, id) => {
  try { return translator.status(gameInstallPath(id)) } catch (err) { return { supported: false, error: String(err?.message || err) } }
})
ipcMain.handle('translator:run', async (e, id) => {
  const installPath = gameInstallPath(id)
  if (!installPath) return { error: 'Игра не установлена' }
  const send = (p) => { try { if (!e.sender.isDestroyed()) e.sender.send('translator-progress', { id, ...p }) } catch {} }
  try {
    const stats = await translator.translate({ installPath, dataDir: translatorDataDir(), onProgress: send })
    return { ok: true, stats }
  } catch (err) {
    const error = String(err?.message || err)
    send({ phase: 'error', error })
    return { error }
  }
})
ipcMain.handle('translator:cancel', () => translator.cancel())
ipcMain.handle('translator:revert', async (_e, id) => {
  const installPath = gameInstallPath(id)
  if (!installPath) return { error: 'Игра не установлена' }
  try { return await translator.revert(installPath) } catch (err) { return { error: String(err?.message || err) } }
})

// --- ХРАНИЛИЩЕ: диски + размеры папок игр ---
async function dirSize(dir) {
  let total = 0
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try { entries = await fs.promises.readdir(cur, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(cur, e.name)
      try {
        if (e.isDirectory()) stack.push(p)
        else if (e.isFile()) total += (await fs.promises.stat(p)).size
      } catch { /* пропускаем недоступные файлы */ }
    }
  }
  return total
}

// Реальные данные о дисках (statfs, без обхода файлов) — быстрая сводка
// «ПАМЯТЬ» в библиотеке. storage-scan для сравнения обходит все игры.
ipcMain.handle('disk-space', () => ({ drives: listDrives(), gamesDir: getGamesDir() }))

let storageCache = { at: 0, data: null }

ipcMain.handle('storage-scan', async (e, force = false) => {
  if (!force && storageCache.data && Date.now() - storageCache.at < 60000) return storageCache.data

  const drives = listDrives()

  const games = []
  for (const g of loadRegistry()) {
    let size = 0
    if (g.installPath && fs.existsSync(g.installPath)) size = await dirSize(g.installPath)
    games.push({
      id: g.id,
      name: g.name,
      installPath: g.installPath || '',
      exePath: g.exePath || null,
      kind: g.kind || '',
      size,
      lastPlayedAt: g.lastPlayedAt || null,
      installedAt: g.installedAt || null,
      playtimeMs: g.playtimeMs || 0,
    })
  }

  const downloadsPath = downloadDirOrDefault()
  const downloadsSize = fs.existsSync(downloadsPath) ? await dirSize(downloadsPath) : 0

  const data = {
    drives,
    games,
    gamesDir: getGamesDir(),
    downloadsPath,
    downloadsSize,
    scannedAt: Date.now(),
  }
  storageCache = { at: Date.now(), data }
  return data
})

// --- Диски скачивания и установки (машинные настройки, см. Настройки → Хранилище) ---
// Папку пользователь не выбирает: только диск, папки на нём задаёт лаунчер.
function pathsView(extra = {}) {
  const p = loadAppPaths()
  return {
    askDownloadDir: p.askDownloadDir !== false,
    askInstallDir: p.askInstallDir !== false,
    launchAtLogin: p.launchAtLogin === true,
    autoInstallSetups: p.autoInstallSetups !== false,
    systemDrive: systemDrive(),
    downloadDrive: normalizeDrive(p.downloadDrive) || systemDrive(),
    installDrive: normalizeDrive(p.installDrive) || systemDrive(),
    drives: listDrives(),
    downloadPath: downloadDirOrDefault(),
    installPath: getGamesDir(),
    ...extra,
  }
}

const PATH_FLAGS = ['askDownloadDir', 'askInstallDir', 'autoInstallSetups']

ipcMain.handle('paths:get', () => pathsView())

ipcMain.handle('paths:set', (e, patch) => {
  const input = patch && typeof patch === 'object' ? patch : {}
  const next = {}
  for (const key of PATH_FLAGS) if (typeof input[key] === 'boolean') next[key] = input[key]
  for (const key of ['downloadDrive', 'installDrive']) {
    if (!(key in input)) continue
    const drive = normalizeDrive(input[key])
    if (!drive || !listDrives().some((d) => d.root === drive)) return pathsView({ error: 'Этот диск сейчас недоступен' })
    // на системном диске — папки по умолчанию в данных лаунчера
    const value = drive === systemDrive() ? '' : drive
    if (value) {
      try {
        fs.mkdirSync(path.join(drive, 'Lustre', key === 'downloadDrive' ? 'Downloads' : 'Games'), { recursive: true })
      } catch {
        return pathsView({ error: `Нет доступа к диску ${drive.slice(0, 2)}: лаунчер не может создать на нём свою папку` })
      }
    }
    next[key] = value
  }
  saveAppPaths(next)
  storageCache = { at: 0, data: null } // другой диск — пересчитаем сводку хранилища
  return pathsView()
})

// --- Автозапуск лаунчера вместе с Windows (HKCU Run, --hidden) ---
// getLoginItemSettings на Windows сравнивает запись с process.execPath и в
// некоторых сборках возвращает false даже при наличии ключа, поэтому читаем
// HKCU\...\Run напрямую.
function readLaunchAtLogin() {
  return new Promise((resolve) => {
    if (!app.isPackaged) { resolve(loadAppPaths().launchAtLogin === true); return }
    try {
      exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"', { windowsHide: true }, (err, stdout) => {
        if (err || !stdout) { resolve(false); return }
        const exe = process.execPath.toLowerCase()
        const line = String(stdout).split(/\r?\n/).find((l) => l.toLowerCase().includes(exe))
        resolve(!!line && line.includes('--hidden'))
      })
    } catch { resolve(false) }
  })
}

ipcMain.handle('login-item:get', () => readLaunchAtLogin())

ipcMain.handle('login-item:set', async (_e, enabled) => {
  const on = !!enabled
  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: on,
        path: process.execPath,
        args: ['--hidden'],
        name: 'Lustre',
      })
    }
    saveAppPaths({ launchAtLogin: on })
  } catch (err) { console.error('[Main] setLoginItemSettings error:', err) }
  return await readLaunchAtLogin()
})

// --- Автообновления (GitHub Releases; publish настроен в package.json) ---
// Обновление обязательное. При запуске лаунчер сначала сверяется с релизами: если вышла новая
// версия, вместо главного окна открывается окно обновления (#/update) с прогрессом загрузки и
// списком изменений релиза. Закрыть, отложить или отменить его нельзя — после загрузки лаунчер
// сам перезапускается в новую версию. Если GitHub не ответил (офлайн, таймаут) — пускаем в
// лаунчер, а обновление подхватит фоновая проверка. Работает только в собранной версии.
const UPDATE_CHECK_TIMEOUT_MS = 10_000 // столько главное окно ждёт ответа GitHub при запуске
const UPDATE_INSTALL_DELAY_MS = 5_000  // отсчёт «Перезапуск через N с» перед установкой
const UPDATE_RETRY_MS = 30_000         // автоповтор загрузки после ошибки
const UPDATE_BUSY_POLL_MS = 15_000     // пока качаются/ставятся игры — ждём и проверяем снова

let updateGate = false        // запуск: главное окно ждёт результата проверки
let updatePhase = 'idle'      // idle | checking | downloading | installing
let updateManualCheck = false // проверка из трея — сообщить, если обновлений нет
let updateDownloaded = null   // { version } — скачано, ждёт установки
let updateWindow = null
let updateGateTimer = null, updateRetryTimer = null, updateBusyTimer = null, updateInstallTimer = null
let lastUpdateState = { status: 'idle', version: null, notes: '', percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, installAt: 0, error: '' }
let lastProgressSentAt = 0

function sendUpdateState(patch) {
  lastUpdateState = { ...lastUpdateState, ...patch }
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('update-state', lastUpdateState)
  }
}

// Описание релиза с GitHub приходит HTML'ем — в окно отдаём чистый текст (без разметки и ссылок)
function releaseNotesToText(notes) {
  const parts = Array.isArray(notes) ? notes.map((n) => n?.note || '') : [notes || '']
  return parts.join('\n\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*(p|div|h[1-6]|ul|ol|li)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n+(?=• )/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function openUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.show()
    updateWindow.focus()
    return updateWindow
  }
  updateWindow = new BrowserWindow({
    width: 560, height: 560, minWidth: 560, minHeight: 560,
    frame: false, resizable: false, maximizable: false, minimizable: true,
    show: false, backgroundColor: '#050407', icon: APP_ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  if (process.env.VITE_DEV_SERVER_URL) updateWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/update`)
  else updateWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/update' })
  updateWindow.once('ready-to-show', () => { updateWindow?.show() })
  // Alt+F4 и «закрыть» с панели задач не прерывают обновление; выход из трея — можно
  updateWindow.on('close', (e) => { if (!isQuitting) e.preventDefault() })
  updateWindow.on('closed', () => { updateWindow = null })
  return updateWindow
}

function closeUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.destroy()
}

// Проверка при запуске завершилась без обновления — открываем лаунчер
function releaseUpdateGate() {
  clearTimeout(updateGateTimer)
  updateGateTimer = null
  if (!updateGate) return
  updateGate = false
  closeUpdateWindow()
  if (mainWindow && !mainWindow.isDestroyed() && !process.argv.includes('--hidden')) {
    mainWindow.show()
    mainWindow.focus()
  }
}

function startUpdateCheck({ manual = false } = {}) {
  if (!app.isPackaged || updatePhase !== 'idle') return
  updatePhase = 'checking'
  updateManualCheck = manual
  autoUpdater.checkForUpdates().catch(() => {}) // ошибка придёт в 'error'
}

// Повтор после ошибки: установка уже скачанного или загрузка заново
function retryUpdate() {
  clearTimeout(updateRetryTimer)
  updateRetryTimer = null
  if (updateDownloaded) { maybeInstallUpdate(); return }
  sendUpdateState({ status: 'downloading', error: '', percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })
  updatePhase = 'idle'
  startUpdateCheck() // autoDownload: найденная версия сразу докачивается
}

// IPC окна обновления: только состояние и повтор после ошибки — отложить/отменить нельзя
ipcMain.handle('update:get-state', () => lastUpdateState)
ipcMain.handle('update:retry', () => {
  if (lastUpdateState.status === 'error') retryUpdate()
  return lastUpdateState
})

function launcherBusy() {
  for (const rec of httpDownloads.values()) {
    if (rec.status === 'downloading') return true
  }
  return activeInstalls > 0
}

// Установка — как только не качаются и не ставятся игры (прерванная распаковка ломает игру)
function maybeInstallUpdate() {
  if (!updateDownloaded || updateInstallTimer) return
  clearTimeout(updateBusyTimer)
  updateBusyTimer = null
  if (launcherBusy()) {
    if (lastUpdateState.status !== 'waiting') {
      sendUpdateState({ status: 'waiting', version: updateDownloaded.version, percent: 100 })
      openUpdateWindow()
    }
    updateBusyTimer = setTimeout(maybeInstallUpdate, UPDATE_BUSY_POLL_MS)
    return
  }
  updatePhase = 'installing'
  sendUpdateState({ status: 'ready', version: updateDownloaded.version, percent: 100, error: '', installAt: Date.now() + UPDATE_INSTALL_DELAY_MS })
  openUpdateWindow()
  updateInstallTimer = setTimeout(() => { void installDownloadedUpdate() }, UPDATE_INSTALL_DELAY_MS)
}

// Итог самообновления: при сбое следующие обновления идут обычным установщиком (с запросом прав)
const selfUpdateStatusFile = () => path.join(app.getPath('userData'), 'self-update-status.txt')
const selfUpdateLogFile = () => path.join(app.getPath('userData'), 'self-update.log')

function checkSelfUpdateResult() {
  const status = selfUpdate.readApplyStatus(selfUpdateStatusFile())
  if (!status) return
  try { fs.rmSync(selfUpdateStatusFile(), { force: true }) } catch { /* ignore */ }
  if (status.startsWith('failed')) {
    console.error('[Update] самообновление не удалось:', status)
    saveAppPaths({ selfUpdateBroken: true })
  }
}

async function installDownloadedUpdate() {
  isQuitting = true // close-хэндлеры прячут окна в трей — разрешаем выход
  const installDir = path.dirname(process.execPath)
  const exeName = path.basename(process.execPath)
  const sevenZip = getBundled7z()
  // Как у Steam: лаунчер стоит в Program Files (x86), а папка открыта на запись — кладём новую версию
  // сами, без установщика и окна запроса прав администратора
  if (updateDownloaded.file && sevenZip && !loadAppPaths().selfUpdateBroken && selfUpdate.canSelfUpdate(installDir)) {
    try {
      const staging = path.join(selfUpdate.defaultWorkDir(), `v${updateDownloaded.version}`)
      await selfUpdate.extractAppPayload(updateDownloaded.file, staging, sevenZip, exeName)
      selfUpdate.spawnApplyHelper({
        staging, installDir, pid: process.pid, exeName,
        statusFile: selfUpdateStatusFile(), logFile: selfUpdateLogFile(),
      })
      app.quit()
      return
    } catch (err) {
      console.error('[Update] самообновление не подготовилось, ставим установщиком:', err?.message || err)
    }
  }
  autoUpdater.quitAndInstall(true, true) // тихая установка + автозапуск новой версии
}

// Сборка для персонала (с закрытым модулем админки) обновляется из своего канала:
// scripts/release.cjs кладёт её рядом с публичной как staff.yml, публичная читает latest.yml
function buildFlavor() {
  try {
    return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')).lustreFlavor || 'public'
  } catch {
    return 'public'
  }
}

function initAutoUpdates() {
  if (!app.isPackaged) return
  checkSelfUpdateResult()
  if (buildFlavor() === 'staff') {
    autoUpdater.channel = 'staff'
    autoUpdater.allowDowngrade = false // установка channel включает его, откат версии не нужен
  }
  autoUpdater.autoDownload = true          // найденная версия качается сразу
  autoUpdater.autoInstallOnAppQuit = false // ставим сами, после отсчёта в окне обновления

  autoUpdater.on('error', (err) => {
    const message = err?.message || String(err)
    console.error('[Update] ошибка:', message)
    const phase = updatePhase
    if (phase === 'checking' || phase === 'idle') {
      // не достучались до релизов — не держим пользователя перед лаунчером
      updatePhase = 'idle'
      updateManualCheck = false
      releaseUpdateGate()
      return
    }
    if (phase === 'installing') {
      isQuitting = false
      clearTimeout(updateInstallTimer)
      updateInstallTimer = null
    }
    updatePhase = 'downloading'
    sendUpdateState({ status: 'error', error: message })
    openUpdateWindow()
    clearTimeout(updateRetryTimer)
    updateRetryTimer = setTimeout(retryUpdate, UPDATE_RETRY_MS)
  })
  autoUpdater.on('update-not-available', () => {
    updatePhase = 'idle'
    releaseUpdateGate()
    closeUpdateWindow() // релиз мог пропасть, пока шёл повтор
    if (updateManualCheck) {
      updateManualCheck = false
      try {
        if (Notification.isSupported()) {
          new Notification({ title: 'Обновление Lustre', body: 'У вас последняя версия', icon: APP_ICON }).show()
        }
      } catch { /* ignore */ }
    }
  })
  autoUpdater.on('update-available', (info) => {
    clearTimeout(updateGateTimer) // при запуске лаунчер не откроется до перезапуска в новую версию
    updateGateTimer = null
    updateManualCheck = false
    updatePhase = 'downloading'
    sendUpdateState({
      status: 'downloading', version: info.version, notes: releaseNotesToText(info.releaseNotes),
      percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, error: '',
    })
    openUpdateWindow()
  })
  autoUpdater.on('download-progress', (progress) => {
    const now = Date.now()
    if (now - lastProgressSentAt < 200 && progress.percent < 100) return // троттлинг ~5/сек
    lastProgressSentAt = now
    sendUpdateState({
      status: 'downloading',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = { version: info.version, file: info.downloadedFile }
    maybeInstallUpdate()
  })

  // Проверка при запуске — сразу; главное окно ждёт её не дольше UPDATE_CHECK_TIMEOUT_MS.
  // Дальше — раз в 4 часа (найденная версия так же обязательна).
  updateGate = true
  if (!process.argv.includes('--hidden')) {
    sendUpdateState({ status: 'checking' })
    openUpdateWindow()
  }
  updateGateTimer = setTimeout(releaseUpdateGate, UPDATE_CHECK_TIMEOUT_MS)
  startUpdateCheck()
  setInterval(() => startUpdateCheck(), 4 * 60 * 60_000)
}

// --- TRAY ---
function buildTrayMenu(games = []) {
  tray.setContextMenu(Menu.buildFromTemplate([
    ...games.slice(0, 5).map(g => ({ label: g.title, click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('navigate', `/games/${g.id}`) } } })),
    { type: 'separator' },
    { label: 'Магазин', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('navigate', '/store') } } },
    { label: 'Библиотека', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('navigate', '/library') } } },
    { label: 'Сообщество', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('navigate', '/community') } } },
    { type: 'separator' },
    { label: 'Друзья', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('navigate', '/friends') } } },
    { label: 'Игровой оверлей', click: () => toggleGameOverlay() },
    { label: 'Настройки', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('navigate', '/settings') } } },
    { label: 'Проверить обновления', click: () => {
      if (updatePhase === 'idle') startUpdateCheck({ manual: true })
      else openUpdateWindow() // обновление уже идёт — показываем его
    } },
    { type: 'separator' },
    { label: 'Выход из LustreHub', click: () => { isQuitting = true; app.quit() } }
  ]))
}
function createTray() {
  let icon; try {
    icon = nativeImage.createFromPath(path.join(__dirname, '../build/tray.png'))
    if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, '../build/icon.png'))
    if (icon.isEmpty()) throw 0
    icon = icon.resize({ width: 16, height: 16 })
  } catch { icon = nativeImage.createEmpty() }
  tray = new Tray(icon); tray.setToolTip('LustreHub'); buildTrayMenu()
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
}

// --- WINDOWS ---
function createWindow() {
  const startHidden = process.argv.includes('--hidden')
  mainWindow = new BrowserWindow({ width: 1280, height: 800, minWidth: 720, minHeight: 520, frame: false, titleBarStyle: 'hidden', resizable: true, thickFrame: true, maximizable: true, backgroundColor: '#050407', icon: APP_ICON, show: !startHidden && !updateGate, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  if (process.env.VITE_DEV_SERVER_URL) { mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL); mainWindow.webContents.openDevTools({ mode: 'detach' }) }
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  mainWindow.on('close', (e) => { if (!isQuitting) { e.preventDefault(); mainWindow.hide() } })
  // Пока при запуске идёт проверка или обязательное обновление — вместо лаунчера окно обновления
  // (трей, повторный запуск, deep link — все пути открытия проходят через show)
  mainWindow.on('show', () => {
    if (!updateGate) return
    mainWindow.hide()
    openUpdateWindow()
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

// «Назад» в настройках: отдельное окно закрываем; false — настройки открыты в главном окне (трей)
ipcMain.handle('close-settings-window', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (!w || w !== settingsWindow) return false
  w.close()
  return true
})
ipcMain.on('open-settings-window', () => {
  if (settingsWindow) { settingsWindow.focus(); return }
  settingsWindow = new BrowserWindow({ width: 900, height: 650, minWidth: 750, minHeight: 550, frame: false, titleBarStyle: 'hidden', title: 'Настройки', backgroundColor: '#050407', icon: APP_ICON, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  if (process.env.VITE_DEV_SERVER_URL) settingsWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/settings`)
  else settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/settings' })
  settingsWindow.on('closed', () => { settingsWindow = null })
})

// Открыть маршрут в главном окне (из окон настроек/друзей и т.п.)
ipcMain.on('open-in-main', (_e, route) => navigateInMain(route))

ipcMain.on('window-minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window-maximize', () => { const w = BrowserWindow.getFocusedWindow(); if (w?.isMaximized()) w.unmaximize(); else w?.maximize() })
ipcMain.on('window-close', () => { const w = BrowserWindow.getFocusedWindow(); if (w === mainWindow) w.hide(); else w?.close() })
// Полное завершение лаунчера (кнопка «Выход»): закрываем всё, трей не держит процесс
ipcMain.on('quit-app', () => { isQuitting = true; app.quit() })

ipcMain.handle('toggle-overlay', () => { const w = BrowserWindow.getFocusedWindow()||mainWindow; if(!w)return false; const on=w.isAlwaysOnTop(); if(on){w.setAlwaysOnTop(false);w.setOpacity(1);w.setSize(1280,800);w.center()}else{w.setAlwaysOnTop(true,'screen-saver');w.setOpacity(0.92);w.setSize(400,600);w.setPosition(20,20)}; return !on })
ipcMain.handle('set-always-on-top', (e, f) => { const w=BrowserWindow.fromWebContents(e.sender); if(w)w.setAlwaysOnTop(f,'screen-saver') })

// --- ИГРОВОЙ ОВЕРЛЕЙ (как в Steam) ---
// Полноэкранная затемнённая подложка поверх игры с панелями (друзья и чаты, игра,
// заметки, скриншоты) и игровые уведомления в углу экрана. Горячие клавиши
// регистрируются только на время игры: вне игры Shift+Tab/F12 у других программ не
// отбираются. Ограничение: окно поверх игры видно в оконном и «полноэкранном оконном»
// режимах; в эксклюзивном полноэкранном DirectX нужен перехват рендера (как у Steam).
const OVERLAY_HOTKEYS = ['Shift+Tab', 'CommandOrControl+Shift+Space', 'Alt+`', 'F10']
const SCREENSHOT_HOTKEYS = ['F12', 'CommandOrControl+F12', 'off']
const OVERLAY_DEFAULTS = { enabled: true, hotkey: 'Shift+Tab', screenshotHotkey: 'F12', notifications: true }
const TOAST_W = 400, TOAST_H = 460
let overlayPrefs = null
let currentGame = null // { id, name, catalogId, startedAt, playtimeMs }
let overlayToastWindow = null
const boundOverlayKeys = { overlay: null, screenshot: null }

const overlayPrefsFile = () => path.join(app.getPath('userData'), 'overlay-settings.json')

function loadOverlayPrefs() {
  if (overlayPrefs) return overlayPrefs
  let saved = {}
  try { saved = JSON.parse(fs.readFileSync(overlayPrefsFile(), 'utf8')) || {} } catch { /* первый запуск */ }
  overlayPrefs = { ...OVERLAY_DEFAULTS, ...saved }
  if (!OVERLAY_HOTKEYS.includes(overlayPrefs.hotkey)) overlayPrefs.hotkey = OVERLAY_DEFAULTS.hotkey
  if (!SCREENSHOT_HOTKEYS.includes(overlayPrefs.screenshotHotkey)) overlayPrefs.screenshotHotkey = OVERLAY_DEFAULTS.screenshotHotkey
  return overlayPrefs
}

function saveOverlayPrefs(patch) {
  const next = { ...loadOverlayPrefs() }
  if (typeof patch?.enabled === 'boolean') next.enabled = patch.enabled
  if (typeof patch?.notifications === 'boolean') next.notifications = patch.notifications
  if (OVERLAY_HOTKEYS.includes(patch?.hotkey)) next.hotkey = patch.hotkey
  if (SCREENSHOT_HOTKEYS.includes(patch?.screenshotHotkey)) next.screenshotHotkey = patch.screenshotHotkey
  overlayPrefs = next
  try { fs.writeFileSync(overlayPrefsFile(), JSON.stringify(next), 'utf8') } catch (e) { console.error('[Overlay] save prefs:', e) }
  syncOverlayHotkeys()
  sendOverlayState()
  return next
}

const hotkeyLabel = (accel) => String(accel || '').replace('CommandOrControl', 'Ctrl')

// Экран игры — тот, где курсор (игра обычно на нём), иначе основной
function gameDisplay() {
  try { return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) } catch { return screen.getPrimaryDisplay() }
}

function bindHotkey(slot, accel, handler) {
  if (boundOverlayKeys[slot] === accel) return
  if (boundOverlayKeys[slot]) { try { globalShortcut.unregister(boundOverlayKeys[slot]) } catch { /* ignore */ } }
  boundOverlayKeys[slot] = null
  if (!accel) return
  try {
    if (globalShortcut.register(accel, handler)) boundOverlayKeys[slot] = accel
    else console.error('[Overlay] hotkey busy:', accel)
  } catch (e) { console.error('[Overlay] hotkey:', e) }
}

function syncOverlayHotkeys() {
  const prefs = loadOverlayPrefs()
  const inGame = !!currentGame && prefs.enabled
  bindHotkey('overlay', inGame ? prefs.hotkey : null, () => toggleGameOverlay())
  const shot = prefs.screenshotHotkey !== 'off' ? prefs.screenshotHotkey : null
  bindHotkey('screenshot', inGame ? shot : null, () => {
    void captureGameScreenshot().then((r) => {
      if (r?.ok && !(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())) {
        showGameToast({ kind: 'screenshot', title: 'Скриншот сохранён', body: r.file, thumb: r.thumb })
      }
    })
  })
}

function overlayState() {
  const prefs = loadOverlayPrefs()
  return {
    game: currentGame,
    prefs,
    hotkeyLabel: hotkeyLabel(prefs.hotkey),
    screenshotLabel: prefs.screenshotHotkey === 'off' ? '' : hotkeyLabel(prefs.screenshotHotkey),
  }
}

function sendOverlayState() {
  const state = overlayState()
  for (const w of [overlayWindow, overlayToastWindow]) {
    if (w && !w.isDestroyed()) w.webContents.send('overlay-state', state)
  }
}

function loadOverlayRoute(win, hash) {
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${hash}`)
  else win.loadFile(path.join(__dirname, '../dist/index.html'), { hash })
}

function createOverlayWindow() {
  const { bounds } = gameDisplay()
  overlayWindow = new BrowserWindow({
    ...bounds, frame: false, transparent: true, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    show: false, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  loadOverlayRoute(overlayWindow, '/overlay')
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.webContents.on('did-finish-load', sendOverlayState)
  overlayWindow.on('closed', () => { overlayWindow = null })
}

function showGameOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
  overlayWindow.setBounds(gameDisplay().bounds)
  const reveal = () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    sendOverlayState()
    overlayWindow.show()
    overlayWindow.focus()
    overlayWindow.webContents.send('overlay-open')
  }
  if (overlayWindow.webContents.isLoading()) overlayWindow.webContents.once('did-finish-load', reveal)
  else reveal()
}

function hideGameOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) overlayWindow.hide()
}

function toggleGameOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) { hideGameOverlay(); return false }
  showGameOverlay()
  return true
}

// Тосты: не забирают фокус у игры и пропускают клики насквозь; окно показывается,
// только пока есть уведомления (постоянное окно поверх игры мешало бы ей).
function ensureToastWindow() {
  if (overlayToastWindow && !overlayToastWindow.isDestroyed()) return overlayToastWindow
  overlayToastWindow = new BrowserWindow({
    width: TOAST_W, height: TOAST_H, frame: false, transparent: true, resizable: false, movable: false,
    focusable: false, skipTaskbar: true, show: false, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  overlayToastWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayToastWindow.setIgnoreMouseEvents(true)
  loadOverlayRoute(overlayToastWindow, '/overlay-toasts')
  overlayToastWindow.webContents.on('did-finish-load', sendOverlayState)
  overlayToastWindow.on('closed', () => { overlayToastWindow = null })
  return overlayToastWindow
}

/** Игровое уведомление. false — игра не запущена или уведомления в игре выключены. */
function showGameToast(toast) {
  if (!currentGame || !loadOverlayPrefs().notifications) return false
  const w = ensureToastWindow()
  const { bounds } = gameDisplay()
  w.setBounds({ x: bounds.x + bounds.width - TOAST_W - 24, y: bounds.y + bounds.height - TOAST_H - 24, width: TOAST_W, height: TOAST_H })
  const deliver = () => {
    if (!overlayToastWindow || overlayToastWindow.isDestroyed()) return
    overlayToastWindow.webContents.send('overlay-toast', { id: Date.now() + Math.random(), ...toast })
    if (!overlayToastWindow.isVisible()) overlayToastWindow.showInactive()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', deliver)
  else deliver()
  return true
}

function screenshotsRoot() { return path.join(app.getPath('pictures'), 'Lustre') }
function screenshotsDir(gameName) {
  const safe = String(gameName || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 80)
  return safe ? path.join(screenshotsRoot(), safe) : screenshotsRoot()
}

async function captureGameScreenshot() {
  const display = gameDisplay()
  const wasVisible = !!(overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible())
  if (wasVisible) overlayWindow.hide()
  await new Promise((r) => setTimeout(r, 250)) // кадр без оверлея
  try {
    const scale = display.scaleFactor || 1
    const size = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
    const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0]
    if (!src || src.thumbnail.isEmpty()) return { error: 'Не удалось снять экран' }
    const dir = screenshotsDir(currentGame?.name)
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const file = path.join(dir, `${stamp}.png`)
    fs.writeFileSync(file, src.thumbnail.toPNG())
    return { ok: true, file, thumb: src.thumbnail.resize({ width: 320 }).toDataURL() }
  } catch (e) {
    console.error('[Overlay] screenshot:', e)
    return { error: 'Не удалось сохранить скриншот' }
  } finally {
    if (wasVisible && overlayWindow && !overlayWindow.isDestroyed()) { overlayWindow.show(); overlayWindow.focus() }
  }
}

function listGameScreenshots(limit = 12) {
  const dir = screenshotsDir(currentGame?.name)
  try {
    return fs.readdirSync(dir)
      .filter((f) => /\.png$/i.test(f))
      .map((f) => ({ f, at: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .map(({ f, at }) => {
        const file = path.join(dir, f)
        let thumb = ''
        try { thumb = nativeImage.createFromPath(file).resize({ width: 320 }).toDataURL() } catch { /* битый файл */ }
        return { name: f, file, at, thumb }
      })
  } catch { return [] }
}

// Путь из рендерера открываем, только если он внутри папки скриншотов Lustre
function insideScreenshots(p) {
  const root = path.normalize(screenshotsRoot()).toLowerCase() + path.sep
  return typeof p === 'string' && path.normalize(p).toLowerCase().startsWith(root)
}

function onGameStarted(entry) {
  currentGame = { id: entry.id, name: entry.name, catalogId: entry.catalogId || 0, startedAt: Date.now(), playtimeMs: entry.playtimeMs || 0 }
  syncOverlayHotkeys()
  const prefs = loadOverlayPrefs()
  if (!prefs.enabled) return
  // Окно оверлея готовим заранее — горячая клавиша открывает его сразу, без загрузки
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
  sendOverlayState()
  setTimeout(() => {
    if (currentGame?.id === entry.id) {
      showGameToast({ kind: 'hint', title: entry.name, body: `${hotkeyLabel(prefs.hotkey)} — оверлей Lustre` })
    }
  }, 5000)
}

function onGameExited(entry) {
  if (!currentGame || currentGame.id !== entry.id) return
  currentGame = null
  syncOverlayHotkeys()
  hideGameOverlay()
  if (overlayToastWindow && !overlayToastWindow.isDestroyed()) overlayToastWindow.hide()
  sendOverlayState()
}

ipcMain.handle('toggle-game-overlay', () => toggleGameOverlay())
ipcMain.on('hide-game-overlay', () => hideGameOverlay())
ipcMain.handle('overlay-get-state', () => overlayState())
ipcMain.handle('overlay-set-prefs', (_e, patch) => saveOverlayPrefs(patch))
ipcMain.handle('overlay-screenshot', () => captureGameScreenshot())
ipcMain.handle('overlay-list-screenshots', () => listGameScreenshots())
ipcMain.on('overlay-open-screenshot', (_e, p) => { if (insideScreenshots(p)) void shell.openPath(p) })
ipcMain.on('overlay-open-screenshots-folder', () => {
  const dir = screenshotsDir(currentGame?.name)
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  void shell.openPath(dir)
})
ipcMain.on('overlay-toasts-empty', () => {
  if (overlayToastWindow && !overlayToastWindow.isDestroyed()) overlayToastWindow.hide()
})
// Открыть раздел лаунчера из оверлея (страница игры, друзья…)
ipcMain.on('overlay-open-in-launcher', (_e, route) => {
  if (typeof route !== 'string' || !/^\/[a-z0-9/_-]*$/i.test(route)) return
  hideGameOverlay()
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('navigate', route)
})

ipcMain.on('open-friends-window', () => {
  if (friendsWindow) {
    if (friendsWindow.isMinimized()) friendsWindow.restore() // свёрнутое окно иначе так и осталось бы в панели задач
    friendsWindow.focus()
    return
  }
  friendsWindow = new BrowserWindow({ width: 350, height: 700, minWidth: 300, frame: false, titleBarStyle: 'hidden', title: 'Друзья и чат', backgroundColor: '#050407', icon: APP_ICON, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } })
  if (process.env.VITE_DEV_SERVER_URL) friendsWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/friends-window`)
  else friendsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/friends-window' })
  friendsWindow.on('closed', () => { friendsWindow = null })
})

// --- Окно чата ---
function openChatWindow(targetUserId) {
  if (chatWindow) {
    chatWindow.focus()
    if (targetUserId) chatWindow.webContents.send('chat-window-target', targetUserId)
    return
  }
  chatWindow = new BrowserWindow({
    // Окно сообщений в стиле Telegram Desktop: список чатов + лента (+ панель группы)
    width: 1100, height: 720, minWidth: 760, minHeight: 520,
    frame: false, backgroundColor: '#050407', show: false,
    icon: APP_ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  const hash = targetUserId ? `/chat-window?user=${targetUserId}` : '/chat-window'
  if (process.env.VITE_DEV_SERVER_URL) chatWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#${hash}`)
  else chatWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash })
  chatWindow.once('ready-to-show', () => chatWindow.show())
  chatWindow.on('closed', () => { chatWindow = null })
}

ipcMain.on('open-chat-window', (e, targetUserId) => openChatWindow(targetUserId))

// --- Групповые чаты теперь внутри окна сообщений (/chat-window) ---

// --- OAuth: основной путь — системный браузер (polling), fallback — окно Electron ---
ipcMain.handle('open-external', async (_e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
  try {
    await shell.openExternal(url)
    return true
  } catch (e) {
    console.error('[Main] openExternal error:', e)
    return false
  }
})

// --- OAuth в отдельном окне (аварийный fallback) ---
ipcMain.on('oauth-open', (e, payload) => {
  const url = payload?.url
  const returnUrl = payload?.returnUrl || ''
  if (!url) return
  const opener = BrowserWindow.fromWebContents(e.sender) || mainWindow
  if (oauthWindow && !oauthWindow.isDestroyed()) { oauthWindow.focus(); return }

  oauthWindow = new BrowserWindow({
    width: 520, height: 720, autoHideMenuBar: true, backgroundColor: '#0b0b0f', icon: APP_ICON,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  const finish = () => {
    try {
      if (oauthWindow && !oauthWindow.isDestroyed()) oauthWindow.close()
      opener?.webContents.send('oauth-done')
    } catch { /* ignore */ }
  }
  const base = (returnUrl || '').split('#')[0]
  const check = (_e, navUrl) => {
    if (base && typeof navUrl === 'string' && navUrl.startsWith(base)) finish()
  }
  externalContents.add(oauthWindow.webContents)
  oauthWindow.webContents.on('will-redirect', check)
  oauthWindow.webContents.on('did-navigate', check)
  oauthWindow.on('closed', () => { oauthWindow = null })
  oauthWindow.loadURL(url)
})

// Групповой звонок из другого окна обрабатывает главное окно
ipcMain.on('start-group-call', (_e, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('start-group-call', payload)
})

// Звонок, инициированный из другого окна (например, из окна чата) — обрабатывает главное окно
ipcMain.on('start-call', (_e, peer) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('start-call', peer)
})

// Показать главное окно (например, при входящем звонке)
ipcMain.on('show-main-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
})

// Масштаб интерфейса (как зум браузера): корректно учитывает vh/vw, в отличие от CSS zoom
ipcMain.handle('set-zoom-factor', (e, factor) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (!w) return false
  const f = Math.min(1.5, Math.max(0.8, Number(factor) || 1))
  try { w.webContents.setZoomFactor(f) } catch { return false }
  return true
})

// --- Сведения об устройстве (для привязки доверенных устройств) ---
function getDeviceInfo() {
  let id = ''
  try {
    const file = path.join(app.getPath('userData'), 'device-id')
    if (fs.existsSync(file)) id = fs.readFileSync(file, 'utf8').trim()
    if (!id) {
      id = crypto.randomUUID()
      fs.writeFileSync(file, id, 'utf8')
    }
  } catch (e) {
    console.error('[Main] device id error:', e)
  }
  const platform = `${os.type()} ${os.release()}`
  const name = os.hostname() || platform
  return { id, name, platform }
}

ipcMain.handle('get-device-info', () => getDeviceInfo())

// --- Окно «Кто играет?» (выбор аккаунта как в Steam) ---
function openAccountPicker(hideMain = false) {
  if (hideMain && mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
  if (accountPickerWindow) { accountPickerWindow.show(); accountPickerWindow.focus(); return }
  accountPickerWindow = new BrowserWindow({
    width: 560, height: 440, frame: false, resizable: false, minimizable: false,
    maximizable: false, fullscreenable: false, show: false, backgroundColor: '#0b0812',
    icon: APP_ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  })
  if (process.env.VITE_DEV_SERVER_URL) accountPickerWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/account-picker`)
  else accountPickerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/account-picker' })
  accountPickerWindow.once('ready-to-show', () => accountPickerWindow.show())
  accountPickerWindow.on('closed', () => {
    accountPickerWindow = null
    // Если главное окно было скрыто и пикер закрыли без выбора — возвращаем его
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show()
  })
}

ipcMain.handle('open-account-picker', (e, hideMain) => openAccountPicker(!!hideMain))
ipcMain.on('close-account-picker', (e, payload) => {
  if (accountPickerWindow) { accountPickerWindow.close(); accountPickerWindow = null }
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (payload?.action === 'switched') {
    // Авто-вход выполнен в окне пикера (куки уже новые) — показываем и перезагружаем
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.reload()
  } else if (payload?.action === 'switch') {
    // Пароля нет: разлогин и редирект, пока окно скрыто — показываем уже на форме входа
    mainWindow.webContents.send('force-logout', payload.username || '')
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus() }
    }, 500)
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
})

// --- Демонстрация экрана ---
// Источник, выбранный пользователем в своём пикере (renderer). null — ничего не выбрано.
let pendingShareSourceId = null

// Список источников: экраны + окна, с миниатюрами и иконками приложений.
ipcMain.handle('desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : '',
      appIcon: s.appIcon ? s.appIcon.toDataURL() : '',
      isScreen: s.id.startsWith('screen:'),
    }))
  } catch (e) {
    console.error('[Main] desktopCapturer error:', e)
    return []
  }
})

// Renderer сообщает, какой источник выбран (перед getDisplayMedia).
ipcMain.on('set-share-source', (_e, sourceId) => { pendingShareSourceId = sourceId || null })

// Весь системный звук включает голоса участников, которые воспроизводит сам лаунчер:
// они уходили в демонстрацию и слышались дважды. Поэтому захватываем всё, кроме процессов
// лаунчера (запущенные из него игры при этом слышно). Режим есть с Windows 10 2004.
function shareAudioDevice() {
  if (process.platform !== 'win32') return 'loopback'
  return Number(os.release().split('.')[2]) >= 19041 ? 'loopbackWithoutChrome' : 'loopback'
}

// Отдаём выбранный источник в getDisplayMedia вместо системного диалога.
function installDisplayMediaHandler(ses) {
  try {
    if (typeof ses.setDisplayMediaRequestHandler !== 'function') return
    ses.setDisplayMediaRequestHandler((request, callback) => {
      const id = pendingShareSourceId
      pendingShareSourceId = null
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        const src = sources.find((s) => s.id === id) || sources[0]
        if (!src) { callback({}); return }
        if (!request.audioRequested) { callback({ video: src }); return }
        callback({ video: src, audio: shareAudioDevice() })
      }).catch(() => callback({}))
    })
  } catch (e) { console.error('[Main] setDisplayMediaRequestHandler error:', e) }
}

// --- APP ---
app.whenReady().then(() => {
  // Свои папки скачивания и установки больше не выбираются: переводим их на выбор диска
  try { migrateCustomPaths() } catch (err) { console.error('[Main] перенос настроек путей:', err) }
  // Локальный сервер перевода для Unity-игр (XUnity.AutoTranslator шлёт сюда тексты во время игры).
  // Слушает только 127.0.0.1; модель поднимается при первом запросе.
  translator.startServer(translatorDataDir()).catch((err) => console.error('[Translator] сервер перевода:', err?.message || err))
  // Разрешаем доступ к микрофону/камере (иначе getUserMedia падает и звонок сразу сбрасывается)
  try {
    // fullscreen — плеер трейлеров и ролики YouTube: без него кнопка «во весь экран» молча не срабатывала
    const allow = new Set(['fullscreen', 'media', 'audioCapture', 'videoCapture', 'display-capture', 'mediaKeySystem', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'])
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allow.has(permission)))
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allow.has(permission))
  } catch (e) { console.error('[Main] permission handler error:', e) }

  installDisplayMediaHandler(session.defaultSession)

  // Регистрируем протокол lustre:// (deep-link на установку/страницу игры)
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('lustre', process.execPath, [path.resolve(process.argv[1])])
    } else {
      app.setAsDefaultProtocolClient('lustre')
    }
  } catch (e) { console.error('[Main] protocol register error:', e) }

  createTray()
  // Синхронизируем запись автозапуска с сохранённой настройкой (exe мог обновиться/переместиться)
  try {
    if (app.isPackaged) {
      app.setLoginItemSettings({
        openAtLogin: loadAppPaths().launchAtLogin === true,
        path: process.execPath,
        args: ['--hidden'],
        name: 'Lustre',
      })
    }
  } catch (e) { console.error('[Main] login item sync error:', e) }
  // Проверка обновлений (GitHub Releases) — до главного окна: при новой версии лаунчер
  // открывается сразу с окна обязательного обновления
  initAutoUpdates()
  createWindow()
  qbDecideMode().catch(() => {}).finally(() => {
    startStatusPolling()
    // Незавершённые торренты продолжают качаться сами, без захода в «Загрузки»
    if (qbIsManaged() && qbManaged.hasTorrents(qbProfileDir())) ensureManagedQb().catch(() => {})
  })

  // Запуск приложения по ссылке lustre://
  const initialDeepLink = extractDeepLink(process.argv)
  if (initialDeepLink) handleDeepLink(initialDeepLink)
  // Горячие клавиши оверлея регистрируются только на время игры (syncOverlayHotkeys):
  // постоянный глобальный перехват отбирал сочетание у всех остальных программ.
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

// --- Рация (push-to-talk) вне окна лаунчера ---
// globalShortcut видит только нажатие, без отпускания, поэтому клавишу слушает uiohook.
// Хук запущен, только пока рация включена, и в окна уходит лишь нажатие/отпускание
// выбранной клавиши — остальной ввод не передаётся никуда.
let pttHook = null
let pttTarget = null // { key } | { mouse }
let pttDown = false

// KeyboardEvent.code → имя клавиши uiohook
const PTT_KEY_ALIASES = {
  ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', AltLeft: 'Alt', AltRight: 'AltRight',
  ShiftLeft: 'Shift', ShiftRight: 'ShiftRight', MetaLeft: 'Meta', MetaRight: 'MetaRight',
}
const PTT_MOUSE = { Mouse3: 3, Mouse4: 4, Mouse5: 5 }

function pttEmit(down) {
  if (pttDown === down) return
  pttDown = down
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('ptt', down)
  }
}

async function loadPttHook() {
  if (pttHook) return pttHook
  try {
    const mod = await import('uiohook-napi')
    const api = mod.uIOhook ? mod : mod.default
    const hook = api.uIOhook
    const match = (e, kind) => pttTarget && (kind === 'key' ? pttTarget.key === e.keycode : pttTarget.mouse === e.button)
    hook.on('keydown', (e) => { if (match(e, 'key')) pttEmit(true) })
    hook.on('keyup', (e) => { if (match(e, 'key')) pttEmit(false) })
    hook.on('mousedown', (e) => { if (match(e, 'mouse')) pttEmit(true) })
    hook.on('mouseup', (e) => { if (match(e, 'mouse')) pttEmit(false) })
    pttHook = { hook, keys: api.UiohookKey, running: false }
  } catch (e) {
    console.error('[PTT] uiohook unavailable:', e?.message || e)
    pttHook = null
  }
  return pttHook
}

ipcMain.handle('ptt-set-key', async (_e, code) => {
  pttEmit(false)
  if (!code || typeof code !== 'string') {
    pttTarget = null
    if (pttHook?.running) { try { pttHook.hook.stop() } catch { /* ignore */ } pttHook.running = false }
    return false
  }
  const h = await loadPttHook()
  if (!h) return false
  if (PTT_MOUSE[code]) pttTarget = { mouse: PTT_MOUSE[code] }
  else {
    const name = PTT_KEY_ALIASES[code] || code.replace(/^Key/, '').replace(/^Digit/, '')
    const keycode = h.keys[name]
    if (keycode == null) { pttTarget = null; return false }
    pttTarget = { key: keycode }
  }
  if (!h.running) {
    try { h.hook.start(); h.running = true } catch (e) { console.error('[PTT] hook start failed:', e); return false }
  }
  return true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  translator.stopServer().catch(() => {})
  if (pttHook?.running) { try { pttHook.hook.stop() } catch { /* ignore */ } }
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// Просим встроенный qBittorrent закрыться самому, чтобы он сохранил состояние торрентов
async function stopManagedQb() {
  const res = await qbRaw('/api/v2/app/shutdown', 'POST').catch(() => null)
  if (res?.status === 403 && await qbLogin()) await qbRaw('/api/v2/app/shutdown', 'POST').catch(() => {})
}

let qbStopRequested = false
app.on('before-quit', (e) => {
  if (statusInterval) clearInterval(statusInterval)
  if (qbStopRequested || !qbIsManaged() || !qbCookie) return
  e.preventDefault()
  qbStopRequested = true
  const done = () => app.quit()
  Promise.race([stopManagedQb(), new Promise((r) => setTimeout(r, 1500))]).then(done, done)
})
