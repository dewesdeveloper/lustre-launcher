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
import hosts from './hosts.cjs'
import defender from './defender.cjs'
import torrentScrape from './torrentScrape.cjs'
import cloudSaves from './cloudSaves.cjs'
import uninstallEntry from './uninstallEntry.cjs'
import achievements from './achievements.cjs'
import crackCheck from './crackCheck.cjs'
import crackApply from './crackApply.cjs'
import { File as MegaFile } from 'megajs'

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
// Пример: lustre://game/123 — открыть игру в лаунчере.
// Ссылку может прислать кто угодно (сайт, сообщение), поэтому открываются только разделы из
// списка ниже: админка, настройки и служебные окна по внешней ссылке недоступны.
const DEEP_LINK_SECTIONS = new Set([
  'games', 'store', 'library', 'community', 'profile', 'friends', 'news', 'subscriptions',
  'payment', 'shop', 'cosmetics', 'support', 'legal', 'privacy', 'subscriber-agreement', 'downloads', 'activity',
])

function deepLinkToRoute(rawUrl) {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'lustre:') return null
    const host = u.hostname.toLowerCase()
    const segments = u.pathname.split('/').filter(Boolean)
    const gameId = u.searchParams.get('game') || segments[0]
    if (host === 'game' || host === 'games' || host === 'install') {
      return gameId && /^\d+$/.test(gameId) ? `/games/${gameId}` : '/store'
    }
    const route = host ? `/${host}${u.pathname}${u.search}` : '/' + segments.join('/') + u.search
    const first = route.split(/[/?#]/)[1] || ''
    // обходы вида «..», «//» и обратные слэши — не наши ссылки
    if (!DEEP_LINK_SECTIONS.has(first) || /\.\.|\/\/|\\/.test(route)) return '/'
    return route
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
// На время установки раздачи ставятся на паузу: торрент читал с того же диска 6–9 МБ/с, и на
// дешёвых SSD (после заполнения кэша запись падает до десятков МБ/с) установщик почти вставал.
// Учитываются вложенные установки; после последней возобновляем только то, что ставили на паузу мы.
const SEEDING_STATES = new Set(['uploading', 'stalledUP', 'forcedUP', 'queuedUP'])
let seedingPauseDepth = 0
let seedingPausedByInstall = []
async function pauseSeedingForInstall() {
  seedingPauseDepth++
  if (seedingPauseDepth > 1) return
  try {
    const list = await qbRequest('/api/v2/torrents/info')
    const hashes = (Array.isArray(list) ? list : []).filter((t) => SEEDING_STATES.has(t.state)).map((t) => t.hash)
    if (hashes.length) {
      await qbPauseTorrent(hashes.join('|'))
      seedingPausedByInstall = hashes
      console.log('[Install] раздачи на паузе на время установки:', hashes.length)
    }
  } catch { /* торрент-клиент не запущен — раздавать нечего */ }
}
async function resumeSeedingAfterInstall() {
  seedingPauseDepth = Math.max(0, seedingPauseDepth - 1)
  if (seedingPauseDepth > 0 || !seedingPausedByInstall.length) return
  const hashes = seedingPausedByInstall
  seedingPausedByInstall = []
  // удалённые за время установки (её же загрузка) торрент-клиент просто пропустит
  await qbResumeTorrent(hashes.join('|')).catch(() => {})
}

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

// torrentHealthForMagnets — сиды и пиры для окна выбора источника.
// Цифры раздачи — прямым запросом scrape к трекерам (torrentScrape.cjs): в qBittorrent
// ничего не добавляется. Раньше раздача временно добавлялась в qB, и за ~9 секунд трекеры
// часто не успевали ответить — показывался «0», хотя раздача живая.
// Если раздача уже качается в qB, добавляем живые цифры подключённых сидов и пиров.
async function torrentHealthForMagnets(magnets) {
  const unique = [...new Set((magnets || []).filter(Boolean))].slice(0, 20)
  if (unique.length === 0) return {}
  const result = await torrentScrape.scrapeMagnets(unique).catch(() => ({}))
  if (qbCookie) { // qB уже запущен лаунчером — не поднимаем его ради проверки
    try {
      const list = await qbRequest('/api/v2/torrents/info')
      const known = Array.isArray(list) ? qbTorrentsByMagnet(list, unique) : {}
      for (const [magnet, t] of Object.entries(known)) {
        if (!result[magnet]) result[magnet] = { hash: magnetHash(magnet), seeds: 0, peers: 0, trackers: 0 }
        result[magnet].connected = { seeds: t.num_seeds || 0, peers: t.num_leechs || 0 }
      }
    } catch { /* qB недоступен — только данные трекеров */ }
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
// Название игры из каталога для скачиваний (ключ — хеш раздачи): имя раздачи бывает любым
// («stardew_valley_78674»), а при установке нужно показывать настоящее название
const downloadTitlesFile = () => path.join(app.getPath('userData'), 'download-titles.json')
function loadDownloadTitles() {
  try { return JSON.parse(fs.readFileSync(downloadTitlesFile(), 'utf8')) || {} } catch { return {} }
}
function rememberDownloadTitle(hash, title) {
  const key = String(hash || '').toLowerCase()
  const value = String(title || '').trim().slice(0, 200)
  if (!/^[0-9a-f]{40}$/.test(key) || !value) return
  const all = loadDownloadTitles()
  all[key] = value
  // храним последние 300 записей
  const keys = Object.keys(all)
  for (const k of keys.slice(0, Math.max(0, keys.length - 300))) delete all[k]
  try { fs.writeFileSync(downloadTitlesFile(), JSON.stringify(all)) } catch { /* не критично */ }
}

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
  rememberDownloadTitle(result.hash || magnetHash(magnetURI), gameTitle)
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
ipcMain.handle('torrent-health', async (e, magnets) => torrentHealthForMagnets(magnets))
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

// Опрос qBittorrent. Раньше — каждые 2 секунды всегда, даже без загрузок и со свёрнутым окном:
// qBittorrent собирал список, лаунчер пересылал его в окно, и окно перерисовывалось.
// Теперь частота зависит от обстановки, а одинаковый список повторно не отправляется.
let lastSentDownloads = ''
function statusPollDelay() {
  const visible = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()
  const active = lastQbList.some((t) => t.status === 'downloading' || t.status === 'moving') ||
    httpList().some((d) => d.status === 'downloading')
  if (!visible) return 15000
  return active ? 2000 : 6000
}

let statusTick = null
// окно развернули из трея или свёрнутого состояния — обновить список сразу, не дожидаясь 15 секунд
function kickStatusPolling() {
  if (!statusInterval || !statusTick) return
  clearTimeout(statusInterval)
  statusInterval = setTimeout(statusTick, 200)
}

function startStatusPolling() {
  if (statusInterval) return
  const tick = statusTick = async () => {
    try {
      lastQbList = await qbGetTorrents()
      if (mainWindow && !mainWindow.isDestroyed()) {
        const list = [...httpList(), ...lastQbList]
        const json = JSON.stringify(list)
        if (json !== lastSentDownloads) {
          lastSentDownloads = json
          mainWindow.webContents.send('torrent-updates', list)
        }
      }
    } catch {}
    statusInterval = setTimeout(tick, statusPollDelay())
  }
  statusInterval = setTimeout(tick, 2000)
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

// Ссылка для скачивания: Pixeldrain — прямой поток API (папка — zip), остальное как есть.
// MEGA, MediaFire и сервисы без API разбираются отдельно (electron/hosts.cjs).
function resolveSourceUrl(url, kind) {
  if (!url) return ''
  if (hosts.hostKind(url, kind) === 'pixeldrain') return hosts.pixeldrainUrl(url)
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
  if (rec.engine === 'mega') return startMegaRequest(id)
  if (rec.engine === 'browser') return
  // MediaFire: сначала берём ссылку на файл со страницы
  if (rec.needsResolve && rec.pageUrl) {
    const pending = { req: { destroy() {} }, aborted: false }
    httpHandles.set(id, pending)
    rec.status = 'downloading'
    rec.waiting = true
    broadcastDownloads()
    hosts.resolveMediafire(rec.pageUrl).then((direct) => {
      if (pending.aborted || httpDownloads.get(id) !== rec) return
      httpHandles.delete(id)
      rec.url = direct
      rec.needsResolve = false
      startHttpRequest(id)
    }, (err) => {
      if (pending.aborted) return
      httpHandles.delete(id)
      if (net.isOnline()) httpFail(id, err.message)
      else httpRetryLater(id, err.message)
    })
    return
  }
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
        // ссылка MediaFire устарела — берём новую со страницы файла
        if (HTTP_LINK_EXPIRED.includes(res.statusCode) && rec.pageUrl && (rec.relinks || 0) < HTTP_RELINK_MAX) {
          rec.relinks = (rec.relinks || 0) + 1
          rec.needsResolve = true
          httpHandles.delete(id)
          startHttpRequest(id)
          return
        }
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

function httpDownloadStart({ url, kind, gameId, gameTitle, filename, refreshFrom, sourceKey }) {
  // Gofile, Mixdrop и другие без открытого API — пользователь качает сам во встроенном окне
  const via = hosts.hostKind(url, kind)
  if (via === 'browser') return openHostBrowser({ url, gameId, gameTitle })
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
    // engine: http — обычный HTTP, mega — через API MEGA с расшифровкой
    engine: via === 'mega' ? 'mega' : 'http',
    // MediaFire: ссылка на файл берётся со страницы и устаревает — помним страницу
    pageUrl: via === 'mediafire' ? resolved : '',
    needsResolve: via === 'mediafire',
    // источник в каталоге (url:<ссылка>) — по нему копятся результаты проверок антивирусом
    sourceKey: typeof sourceKey === 'string' ? sourceKey.slice(0, 300) : '',
  }
  httpDownloads.set(id, rec)
  startHttpRequest(id)
  broadcastDownloads()
  return { id }
}

function httpPause(id) {
  const rec = httpDownloads.get(id)
  if (!rec) return
  if (rec.engine === 'browser') {
    try { rec.item?.pause() } catch { /* загрузка уже закончилась */ }
    rec.status = 'paused'
    rec.downloadSpeed = 0
    broadcastDownloads()
    return
  }
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
  if (rec.engine === 'browser') {
    if (rec.item?.canResume()) {
      rec.item.resume()
      rec.status = 'downloading'
      rec.error = null
    } else {
      httpFail(id, 'Продолжить не получится — удалите загрузку и скачайте заново')
    }
    broadcastDownloads()
    return
  }
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
  if (rec.engine === 'browser' && rec.item && rec.item.getState() === 'progressing') {
    try { rec.item.cancel() } catch { /* уже отменена */ }
  }
  clearTimeout(rec.retryTimer)
  const h = httpHandles.get(id)
  if (h) { h.aborted = true; if (h.req) h.req.destroy() }
  httpHandles.delete(id)
  httpDownloads.delete(id)
  if (deleteFiles !== false && rec.filePath) fs.promises.rm(rec.filePath, { force: true }).catch(() => {})
  broadcastDownloads()
}

// --- MEGA: файл качается через API и расшифровывается на лету (megajs) ---

function megaError(err) {
  const msg = String(err?.message || err || '')
  if (/EOVERQUOTA|quota|bandwidth|509/i.test(msg)) return 'MEGA: исчерпан бесплатный лимит трафика. Попробуйте позже или скачайте через сайт MEGA'
  if (/ENOENT|-9\b|not found/i.test(msg)) return 'Файл на MEGA удалён или ссылка неверная'
  if (/key|decrypt|-14\b/i.test(msg)) return 'В ссылке MEGA нет ключа (часть после #) или он неверный'
  return `MEGA: ${msg || 'ошибка загрузки'}`
}

function httpTargetPath(id, fileName) {
  const base = httpDirOrDefault()
  try { fs.mkdirSync(base, { recursive: true }) } catch {}
  return path.join(base, `${id.replace(/[^a-z0-9]/gi, '_')}_${String(fileName).replace(/[\\/:*?"<>|]/g, '_')}`)
}

function trackProgress(rec) {
  const now = Date.now()
  if (now - rec.lastTime < 700) return
  rec.downloadSpeed = Math.round(((rec.downloaded - rec.lastBytes) * 1000) / (now - rec.lastTime))
  rec.lastBytes = rec.downloaded
  rec.lastTime = now
  rec.eta = rec.downloadSpeed > 0 ? Math.round((rec.totalSize - rec.downloaded) / rec.downloadSpeed) : 0
  broadcastDownloads()
}

async function startMegaRequest(id) {
  const rec = httpDownloads.get(id)
  if (!rec || httpHandles.has(id)) return
  const handle = { req: { destroy() {} }, aborted: false }
  httpHandles.set(id, handle)
  rec.status = 'downloading'
  rec.error = null
  rec.waiting = true
  broadcastDownloads()

  let file
  try {
    file = MegaFile.fromURL(rec.url)
    await file.loadAttributes()
    if (file.directory) {
      const files = (file.children || []).filter((f) => !f.directory)
      if (files.length !== 1) throw new Error('ссылка ведёт на папку с несколькими файлами — нужна ссылка на сам файл')
      file = files[0]
    }
  } catch (err) {
    httpHandles.delete(id)
    if (handle.aborted) return
    if (!net.isOnline()) return httpRetryLater(id, 'Нет сети')
    return httpFail(id, megaError(err))
  }
  if (handle.aborted) return

  if (!rec.fileName) rec.fileName = file.name || 'download.bin'
  if (!rec.filePath) rec.filePath = httpTargetPath(id, rec.fileName)
  let offset = httpFileSize(rec)
  if (offset > file.size) offset = 0
  rec.totalSize = file.size
  rec.downloaded = offset
  rec.lastBytes = offset
  rec.lastTime = Date.now()
  rec.waiting = false

  const stream = file.download({ start: offset, maxConnections: 4 })
  handle.req = { destroy: () => stream.destroy() }
  const out = fs.createWriteStream(rec.filePath, { flags: offset > 0 ? 'a' : 'w' })
  rec.writer = new Promise((resolve) => out.once('close', resolve))
  let failed = false
  out.on('error', (err) => {
    failed = true
    handle.aborted = true
    stream.destroy()
    httpFail(id, err.message)
  })
  stream.on('data', (chunk) => {
    rec.downloaded += chunk.length
    rec.retries = 0
    trackProgress(rec)
  })
  stream.on('error', (err) => {
    if (handle.aborted || failed) return
    failed = true
    stream.unpipe(out)
    out.end()
    httpHandles.delete(id)
    const message = megaError(err)
    rec.writer.then(() => (/лимит|удалён|ключа/.test(message) ? httpFail(id, message) : httpRetryLater(id, message)))
  })
  stream.pipe(out)
  out.on('finish', () => {
    if (handle.aborted || failed) return
    rec.downloadSpeed = 0
    rec.eta = 0
    httpHandles.delete(id)
    if (rec.downloaded < rec.totalSize) {
      rec.writer.then(() => httpRetryLater(id, 'Соединение потеряно'))
      return
    }
    ensureArchiveExtension(rec)
    rec.status = 'completed'
    rec.waiting = false
    broadcastDownloads()
  })
}

// --- Встроенное окно для сервисов без открытого API (Gofile, Mixdrop и др.) ---
// Пользователь сам нажимает «Скачать» на странице сервиса (капчи, ожидание — как в браузере),
// а лаунчер перехватывает файл и дальше ставит игру как обычную загрузку.
// Окно без preload и в отдельной сессии: у страниц сервиса нет доступа к лаунчеру.

const FILEHOST_PARTITION = 'persist:lustre-filehosts'

function baseDomain(host) {
  return String(host || '').split('.').slice(-2).join('.')
}

function openHostBrowser({ url, gameId, gameTitle }) {
  if (!/^https?:\/\//i.test(String(url || ''))) return { error: 'Некорректная ссылка' }
  const site = baseDomain(hosts.hostOf(url))
  const label = hosts.hostLabel(url)
  const win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 720, minHeight: 520,
    title: `Скачивание «${gameTitle || 'игры'}» с ${label}`,
    autoHideMenuBar: true, backgroundColor: '#ffffff', icon: APP_ICON,
    webPreferences: { partition: FILEHOST_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  win.setMenu(null)
  externalContents.add(win.webContents)
  // рекламные всплывающие окна не открываем; переход внутри того же сервиса — в этом окне
  win.webContents.setWindowOpenHandler(({ url: next }) => {
    if (baseDomain(hosts.hostOf(next)) === site) win.loadURL(next)
    return { action: 'deny' }
  })
  win.webContents.on('page-title-updated', (e) => e.preventDefault())

  const ses = session.fromPartition(FILEHOST_PARTITION)
  let captured = false
  const onWillDownload = (_e, item, contents) => {
    if (contents !== win.webContents || captured) return
    captured = true
    const id = 'http:' + crypto.createHash('md5').update(`${item.getURL()}|${Date.now()}`).digest('hex').slice(0, 16)
    const fileName = item.getFilename() || 'download.bin'
    const rec = {
      id, gameId, gameTitle: gameTitle || fileName, url: item.getURL(), kind: 'browser', engine: 'browser',
      fileName, filePath: httpTargetPath(id, fileName), hintName: fileName, refreshFrom: '',
      downloaded: 0, totalSize: item.getTotalBytes(), downloadSpeed: 0, eta: 0,
      status: 'downloading', error: null, addedAt: Date.now(), lastBytes: 0, lastTime: Date.now(), item,
    }
    item.setSavePath(rec.filePath)
    item.on('updated', (_ev, state) => {
      rec.totalSize = item.getTotalBytes()
      rec.downloaded = item.getReceivedBytes()
      rec.waiting = state === 'interrupted'
      if (state === 'interrupted') rec.downloadSpeed = 0
      trackProgress(rec)
    })
    item.once('done', (_ev, state) => {
      rec.item = null
      if (!win.isDestroyed()) win.destroy()
      if (!httpDownloads.has(id)) return // загрузку удалили
      if (state === 'completed') {
        rec.downloaded = rec.totalSize = item.getReceivedBytes()
        ensureArchiveExtension(rec)
        rec.status = 'completed'
        rec.waiting = false
        rec.downloadSpeed = 0
        broadcastDownloads()
      } else {
        httpFail(id, state === 'cancelled' ? 'Загрузка отменена' : 'Загрузка прервалась — скачайте заново')
      }
    })
    httpDownloads.set(id, rec)
    broadcastDownloads()
    // окно больше не нужно; скрываем, а не закрываем, пока файл качается
    win.hide()
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus() }
  }
  ses.on('will-download', onWillDownload)
  win.on('closed', () => ses.removeListener('will-download', onWillDownload))
  win.loadURL(url, { userAgent: hosts.BROWSER_UA })
  return { browser: true, host: label }
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
  extractNestedArchives, detectInstallerType, runInstallerSilently, ISO_FILE_RE, mountIso, dismountIso,
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

// Образы дисков, подключённые для установки: id загрузки → путь к .iso.
// Отключаются, когда установочные файлы больше не нужны (dropDownload).
const mountedIsos = new Map()

async function releaseMountedIso(gameId) {
  const iso = mountedIsos.get(gameId)
  if (!iso) return
  mountedIsos.delete(gameId)
  await dismountIso(iso)
}

// Убирает загрузку после установки: торрент вместе с файлами или запись прямой загрузки
async function dropDownload(gameId, contentPath) {
  await releaseMountedIso(gameId)
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
// Идущие установки: последнее состояние каждой. Страницы загрузок и игры спрашивают его при
// открытии (install-status) — раньше после перехода между страницами состояние терялось,
// и кнопка «Установить» снова становилась доступной, хотя установщик ещё работал.
const installStatus = new Map()

function sendInstallProgress(payload) {
  const id = payload?.gameId
  if (id) {
    const merged = { ...(installStatus.get(id) || {}), ...payload }
    if (payload.phase === 'idle' || payload.phase === 'done') installStatus.delete(id)
    else installStatus.set(id, merged)
    payload = merged // catalogId из ранних событий доходит и до поздних
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install-progress', payload)
  }
}

ipcMain.handle('install-status', () => [...installStatus.values()])

// Установка игры. Вынесена в отдельную функцию, чтобы обёртка могла
// отслеживать занятость лаунчера (нельзя предлагать перезапуск под обновление,
// пока идёт установка).
async function installGameImpl(gameId, opts = {}) {
  let contentPath
  // источник для отчёта о проверке: хеш раздачи или ссылка из каталога
  let sourceKey = ''
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
    sourceKey = hd.sourceKey || ''
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
    if (/^[0-9a-f]{40}$/i.test(t.hash || '')) sourceKey = `btih:${t.hash.toLowerCase()}`
    if (!contentPath || !fs.existsSync(contentPath)) return { error: 'Файлы загрузки не найдены: ' + (contentPath || '?') }
  }

  // Проверка Защитником Windows до распаковки. Итог (без самих файлов) уходит в каталог,
  // чтобы другие игроки видели его до скачивания. Найдена угроза — установка останавливается,
  // а продолжить игрок может сам (opts.skipScan).
  // установка началась: запоминаем, к какой игре каталога она относится
  installStatus.set(gameId, { ...(installStatus.get(gameId) || {}), gameId, catalogId, phase: 'install', percent: -1 })

  if (!opts.skipScan) {
    sendInstallProgress({ gameId, catalogId, phase: 'scan', percent: -1 })
    const [scan, sha256] = await Promise.all([defender.scanPath(contentPath), defender.sha256File(contentPath)])
    if ((scan.status === 'clean' || scan.status === 'threat') && catalogId > 0 && sourceKey) {
      try {
        mainWindow?.webContents.send('scan-result', {
          gameId: catalogId, sourceKey, sha256, verdict: scan.status, threats: scan.threats, engine: scan.engine,
        })
      } catch { /* окно закрыто */ }
    }
    if (scan.status === 'threat') {
      sendInstallProgress({ gameId, catalogId, phase: 'idle', percent: -1 })
      const names = scan.threats.length ? scan.threats.join(', ') : 'угроза'
      return { error: `Защитник Windows нашёл: ${names}. Установка остановлена.`, threat: true, threats: scan.threats }
    }
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
    // Распакованная игра намного меньше скачанного — значит, распаковали не то (например, кряк
    // рядом с готовой игрой). Скачанные файлы тогда не удаляем: их можно установить заново.
    let keepDownload = false
    // кряк отдельно в раздаче (папка Crack\ рядом с игрой) — ставим; несколько — спросим игрока
    const crack = exePath ? await resolveCrack(dest, [dest, contentPath]) : null
    if (crack?.status === 'choose') keepDownload = true
    if (kind === 'archive') {
      const [installedBytes, downloadedBytes] = await Promise.all([pathSize(dest), pathSize(contentPath)])
      keepDownload = keepDownload || (downloadedBytes > 0 && installedBytes < downloadedBytes * 0.5)
      if (keepDownload) console.warn(`[Install] распаковано ${installedBytes} из ${downloadedBytes} байт — загрузку не удаляю`)
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
      ...(keepDownload ? { sourcePath: contentPath } : {}),
      ...crackFields(crack),
    }
    registerGame(entry)
    // catalogId — id игры в каталоге (для статистики установок), gameId — id скачивания
    sendInstallProgress({ gameId, catalogId, phase: 'done', percent: 100 })
    // Убираем торрент/запись загрузки и временные файлы
    if (!keepDownload) await dropDownload(gameId, contentPath)
    return { ...entry, keptDownload: keepDownload }
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
    // Мастер репака мог предлагать «Crack version / Steam version»: без мастера ставится вариант
    // по умолчанию, и иногда это версия для Steam — игра откроет магазин Steam. Проверяем и,
    // если кряка нет, оставляем установщик: игрок переустановит с мастером без нового скачивания.
    // Кряк лежит в раздаче отдельно (папка RUNE\, FLT\, Crack\…) — ставим сами; несколько — спросим.
    const crack = exePath ? await resolveCrack(target, [source, contentPath]) : null
    const crackMissing = crack?.status === 'steam-only'
    const crackOptions = crack?.status === 'choose' ? crack.options : null
    if (crackMissing) console.warn('[Install] после тихой установки нет кряка (оригинальный Steam API):', baseName)
    const keepSetup = !exePath || crackMissing || !!crackOptions
    registerGame({
      id: gameId, catalogId, name: baseName, installPath: target,
      // папку указал лаунчер: при удалении игры её можно стереть целиком
      managed: true,
      exePath, kind: 'installer', silent: true,
      // пока exe не найден или кряк не применён, установочные файлы держим: для переустановки
      ...(keepSetup ? { sourcePath: source, setupPath: installer } : {}),
      ...crackFields(crack),
      installedAt: Date.now(), playtimeMs: 0,
    })
    if (!keepSetup) await dropDownload(gameId, source)
    sendInstallProgress({ gameId, phase: exePath ? 'done' : 'idle', percent: exePath ? 100 : -1 })
    return exePath
      ? { ok: true, kind: 'installer', installPath: target, exePath, ...crackFields(crack) }
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
    // Мастеру подставляем папку игр лаунчера: там лаунчер сам найдёт игру после установки
    const expectedDir = uniqueDest(path.join(gamesDir, baseName))
    const wizardType = detectInstallerType(installerPath)
    const dirArgs = wizardType === 'inno' ? [`/DIR="${expectedDir}"`] : wizardType === 'nsis' ? [`/D=${expectedDir}`] : []
    const launchRes = await launchInstaller(installerPath, dirArgs)
    if (launchRes?.error) return { error: 'Не удалось запустить установщик: ' + launchRes.error }
    registerGame({
      id: gameId, catalogId, name: baseName, installPath: '', exePath: null, kind: 'installer',
      sourcePath, expectedDir, installedAt: Date.now(), playtimeMs: 0,
    })
    watchWizardInstall(gameId)
    sendInstallProgress({ gameId, phase: 'installer', percent: -1 })
    waitProcessExit(launchRes.pid).then(() => {
      const entry = loadRegistry().find(g => g.id === gameId)
      if (entry && !entry.exePath) sendInstallProgress({ gameId, phase: 'idle', percent: -1 })
    })
    return { ok: true, kind: 'installer', wizard: true, message: 'Установщик запущен — установите игру и укажите exe на странице игры' }
  }

  // Образ диска подключается виртуальным диском: когда 7-Zip не смог его распаковать или
  // установщик не справился с распакованной копией (старые игры требуют «настоящий» диск).
  // Пока идёт установка мастером, образ остаётся подключённым — его отключит dropDownload,
  // когда пользователь укажет exe или удалит игру.
  const installFromIso = async (isoPath) => {
    sendInstallProgress({ gameId, phase: 'install', percent: -1 })
    let drive
    try {
      drive = await mountIso(isoPath)
    } catch (err) {
      sendInstallProgress({ gameId, phase: 'idle', percent: -1 })
      return { error: 'Не удалось подключить образ диска: ' + (err.message || err) }
    }
    mountedIsos.set(gameId, isoPath)

    const installer = findInstallerIn(drive)
    if (installer) {
      // установочные файлы — сама загрузка (образ): её уберёт dropDownload после установки
      const res = await runInstallerFrom(installer, contentPath)
      if (!res?.wizard) await releaseMountedIso(gameId)
      return res
    }

    // Установщика нет, но на диске готовая игра — копируем её в папку игр
    if (rankGameExecutable(drive, baseName)) {
      const noSpace = await checkFreeSpace(isoPath, gamesDir, 1)
      if (noSpace) { await releaseMountedIso(gameId); return { error: noSpace } }
      const target = uniqueDest(path.join(gamesDir, baseName))
      try {
        await fs.promises.cp(drive, target, { recursive: true })
      } catch (err) {
        await releaseMountedIso(gameId)
        await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {})
        return { error: 'Не удалось скопировать игру с образа: ' + (err.message || err) }
      }
      await releaseMountedIso(gameId)
      await unblockFolder(target)
      const entry = await finalizeInstall(target, 'archive')
      return { ok: true, kind: 'archive', installPath: target, exePath: entry.exePath }
    }

    await releaseMountedIso(gameId)
    sendInstallProgress({ gameId, phase: 'idle', percent: -1 })
    return { error: 'В образе диска не найдены ни установщик, ни файл игры' }
  }

  let dest

  if (det.kind === 'installer') return runInstallerFrom(det.installerPath, contentPath)

  // Архивы — создаём папку игры и распаковываем туда (с перебором паролей репаков)
  if (det.kind === 'archive') {
    const noSpace = await checkFreeSpace(det.archivePath, gamesDir, 1)
    if (noSpace) return { error: noSpace }
    dest = uniqueDest(path.join(gamesDir, baseName))
    sendInstallProgress({ gameId, phase: 'install', percent: 0 })
    const isIso = ISO_FILE_RE.test(det.archivePath)
    try {
      await extractArchive(det.archivePath, dest, (pct) => sendInstallProgress({ gameId, phase: 'install', percent: pct }))
    } catch (err) {
      // не оставляем полураспакованную папку
      await fs.promises.rm(dest, { recursive: true, force: true }).catch(() => {})
      if (isIso) {
        console.warn('[Install] образ не распаковался, подключаю его:', err.message || err)
        return installFromIso(det.archivePath)
      }
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
      if (installer && isIso) {
        // образ пока не удаляем: он понадобится, если тихая установка не получится
        const silent = loadAppPaths().autoInstallSetups !== false ? await installSilently(installer, dest) : null
        if (silent && !silent.fallback) {
          if (silent.ok) await dropDownload(gameId, contentPath)
          return silent
        }
        await fs.promises.rm(silent?.source || dest, { recursive: true, force: true }).catch(() => {})
        return installFromIso(det.archivePath)
      }
      if (installer) {
        await dropDownload(gameId, contentPath)
        return runInstallerFrom(installer, dest)
      }
      // в образе нет ни игры, ни установщика (например, нестандартная структура) — подключаем
      if (isIso) {
        await fs.promises.rm(dest, { recursive: true, force: true }).catch(() => {})
        return installFromIso(det.archivePath)
      }
    }
    const entry = await finalizeInstall(dest, 'archive')
    return {
      ok: true, kind: 'archive', installPath: dest, exePath: entry.exePath,
      ...(entry.keptDownload ? { message: `Распакованная игра намного меньше скачанных файлов — возможно, установка неполная. Скачанные файлы сохранены: ${contentPath}` } : {}),
    }
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

// Установки по одной: распаковщики репаков (CLS-srep, 7-Zip, unarc) занимают по 2–4 ГБ памяти,
// и две установки сразу могли съесть всю оперативную память. Следующая ждёт окончания текущей.
let installQueue = Promise.resolve()

ipcMain.handle('install-game', async (e, gameId, opts) => {
  // Повторный клик, пока идёт установка, запускал вторую параллельную
  if (installingIds.has(gameId)) return { error: 'Игра уже устанавливается' }
  installingIds.add(gameId)
  activeInstalls++
  // название из каталога (прямая загрузка или запомненное для торрента) — до установки:
  // после неё запись загрузки удаляется
  const catalogTitle = httpDownloads.get(gameId)?.gameTitle || loadDownloadTitles()[String(gameId).toLowerCase()] || ''
  const waitFor = installQueue
  let release = () => {}
  installQueue = new Promise((r) => { release = r })
  try {
    if (activeInstalls > 1) sendInstallProgress({ gameId, phase: 'install', percent: -1, queued: true })
    await waitFor
    // очередь дошла: снимаем пометку «в очереди» — иначе она оставалась в состоянии установки
    // (sendInstallProgress сливает события) и карточка до конца писала «ждёт другую установку»
    if (installStatus.get(gameId)?.queued) sendInstallProgress({ gameId, phase: 'install', percent: -1, queued: false })
    await pauseSeedingForInstall()
    let res
    try {
      res = await installGameImpl(gameId, { skipScan: opts?.skipScan === true })
    } finally {
      await resumeSeedingAfterInstall()
    }
    if (catalogTitle) {
      const entry = loadRegistry().find((g) => g.id === gameId)
      if (entry && entry.title !== catalogTitle) registerGame({ ...entry, title: catalogTitle })
    }
    return res
  } catch (err) {
    console.error('[Install]', err)
    return { error: 'Установка прервалась: ' + (err?.message || err) }
  } finally {
    installingIds.delete(gameId)
    // установка с мастером (phase 'installer') продолжается вне лаунчера — её состояние оставляем
    if (installStatus.get(gameId)?.phase !== 'installer') installStatus.delete(gameId)
    activeInstalls--
    release() // следующая установка из очереди
    maybeInstallUpdate() // установка закончилась — можно ставить обновление
  }
})

// Уведомления лаунчера. По умолчанию — свои всплывашки в правом нижнем углу экрана (как в Steam);
// в настройках можно вернуть системные уведомления Windows.
// Клик по уведомлению — фокус главного окна + событие в рендерер (navigate и т.п.)
const TOAST_KINDS = new Set(['notify', 'message', 'group', 'friend', 'game', 'call', 'achievement'])
ipcMain.handle('notify-show', (e, opts) => {
  try {
    const title = String(opts?.title || 'Lustre').slice(0, 120)
    const body = String(opts?.body || '').slice(0, 500)
    const kind = TOAST_KINDS.has(opts?.kind) ? opts.kind : 'notify'
    const avatar = typeof opts?.icon === 'string' && /^(https?:|data:image\/)/i.test(opts.icon) ? opts.icon.slice(0, 2048) : ''
    const toast = { kind, title, body, icon: avatar, payload: opts?.payload ?? null }
    if (opts?.style !== 'windows') return showLauncherToast(toast)
    // Во время игры — уведомление в оверлее (системные тосты Windows глушит в полноэкранных играх)
    if (showGameToast(toast)) return true
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

// Игра, поставленная мастером репака, в папку, которую предложил лаунчер (expectedDir; у старых
// записей — папка игр + имя игры). Раньше лаунчер ждал, пока игрок сам укажет exe, хотя игра уже
// лежала там, куда он её направил. Установка считается законченной, когда есть exe игры и
// деинсталлятор (Inno Setup пишет unins000.exe в самом конце) или папка не менялась 2 минуты.
function wizardInstallDir(entry) {
  const dirs = [entry.expectedDir, path.join(getGamesDir(), sanitizeName(entry.name) || '')].filter(Boolean)
  const taken = new Set(loadRegistry().filter((g) => g.id !== entry.id && g.installPath).map((g) => path.resolve(g.installPath).toLowerCase()))
  for (const dir of dirs) {
    if (!fs.existsSync(dir) || taken.has(path.resolve(dir).toLowerCase())) continue
    // в этой папке лежат сами установочные файлы (раздачу приняли за игру) — это не установка
    if (entry.sourcePath && (samePath(dir, entry.sourcePath) || isInside(entry.sourcePath, dir))) continue
    if (entry.setupPath && isInside(entry.setupPath, dir)) continue
    const exePath = rankGameExecutable(dir, entry.name)
    if (!exePath) continue
    let finished = false
    try {
      finished = fs.readdirSync(dir).some((n) => /^unins\d*\.exe$/i.test(n)) ||
        Date.now() - fs.statSync(dir).mtimeMs > 2 * 60 * 1000
    } catch { /* папку удаляют */ }
    if (finished) return { dir, exePath }
  }
  return null
}

function adoptWizardInstalls(onlyId) {
  let changed = false
  for (const entry of loadRegistry()) {
    if (onlyId && entry.id !== onlyId) continue
    if (entry.kind !== 'installer' || entry.exePath || entry.installPath) continue
    const found = wizardInstallDir(entry)
    if (!found) continue
    console.log('[Install] игра из мастера найдена:', found.exePath)
    const { expectedDir: _d, ...rest } = entry
    const next = { ...rest, installPath: found.dir, exePath: found.exePath, managed: true }
    // установка закончена — установочные файлы больше не нужны (как при ручном выборе exe)
    if (next.sourcePath && !isInside(found.exePath, next.sourcePath)) {
      dropDownload(entry.id, next.sourcePath).catch(() => {})
      delete next.sourcePath
      delete next.setupPath
    }
    registerGame(next)
    sendInstallProgress({ gameId: entry.id, catalogId: entry.catalogId || 0, phase: 'done', percent: 100 })
    changed = true
  }
  return changed
}

// Пока открыт мастер (и некоторое время после: Inno передаёт работу копии во временной папке
// и сам установщик завершается сразу), проверяем предложенную папку
function watchWizardInstall(id) {
  const started = Date.now()
  const timer = setInterval(() => {
    const entry = loadRegistry().find((g) => g.id === id)
    if (!entry || entry.exePath || Date.now() - started > 3 * 60 * 60 * 1000) { clearInterval(timer); return }
    // найдено — sendInstallProgress('done') внутри обновит карточку игры
    if (adoptWizardInstalls(id)) clearInterval(timer)
  }, 15000)
}

// Название из каталога для уже установленных игр (рендерер знает его по catalogId из библиотеки)
ipcMain.handle('set-game-title', (e, id, title) => {
  const value = String(title || '').trim().slice(0, 200)
  const entry = loadRegistry().find((g) => g.id === id)
  if (!entry || !value || entry.title === value) return false
  registerGame({ ...entry, title: value })
  return true
})

ipcMain.handle('installed-games', () => {
  adoptWizardInstalls()
  return loadRegistry()
})
ipcMain.handle('launch-game', async (e, id) => {
  let entry = loadRegistry().find(g => g.id === id)
  if (entry?.installPath) await unblockFolder(entry.installPath)
  // Файл запуска пропал (чаще всего — антивирус убрал в карантин лаунчер сетевого фикса):
  // ищем exe игры заново, чтобы кнопка «Играть» не ломалась навсегда
  // Записан не exe игры, а утилита или установщик (старые версии ставили репак FitGirl как готовую
  // игру с файлом запуска MD5/QuickSFV.EXE) — тоже ищем заново
  const badExe = !entry?.exePath || !fs.existsSync(entry.exePath) || !installerModule.isGameExe(entry.exePath)
  if (entry?.installPath && badExe && fs.existsSync(entry.installPath)) {
    const found = rankGameExecutable(entry.installPath, entry.name)
    if (found) {
      console.warn('[Launch] файл запуска не подходит, выбран заново:', entry.exePath, '→', found)
      entry = { ...entry, exePath: found }
      registerGame(entry)
    } else if (entry.exePath && fs.existsSync(entry.exePath)) {
      return { error: 'Игра установлена не до конца: в её папке нет файла игры, только установочные файлы. Удалите игру и установите заново.' }
    }
  }
  // Защитник Windows убрал в карантин файлы из папки игры (чаще всего кряк steam_api.dll):
  // игра упадёт с системной ошибкой «не обнаружила steam_api.dll» — объясняем заранее
  if (entry?.installPath) {
    const removed = await defenderRemovals(entry.installPath)
    if (removed.length) return { defenderRemoved: removed, gameName: installerModule.gameDisplayName(entry) }
  }
  const res = await launchInstalledGame(entry)
  if (res?.ok && entry) startGameSession(entry)
  return res
})

ipcMain.handle('open-defender-history', async () => {
  try { await shell.openExternal('windowsdefender://threathistory/'); return true } catch {}
  try { await shell.openExternal('windowsdefender://threat/'); return true } catch { return false }
})

/**
 * Файлы из папки игры, которые Защитник Windows обнаружил и которых на месте больше нет
 * (карантин или удаление). Журнал читается без прав администратора; ответ — за 1–2 секунды.
 */
async function defenderRemovals(dir) {
  const root = path.resolve(dir).toLowerCase()
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  const out = await runPs([
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$names = @{}; Get-MpThreat -ErrorAction SilentlyContinue | ForEach-Object { $names[[string]$_.ThreatID] = $_.ThreatName }',
    `$root = ${q(root)}`,
    '$res = @(); Get-MpThreatDetection -ErrorAction SilentlyContinue | ForEach-Object { $d = $_; foreach ($r in $d.Resources) {',
    '  $f = $r -replace "^[a-z]+:_", ""',
    '  if ($f.ToLower().StartsWith($root + "\\") -and -not (Test-Path -LiteralPath $f)) {',
    '    $res += [pscustomobject]@{ file = $f; threat = $names[[string]$d.ThreatID]; at = $d.InitialDetectionTime.ToString("o") } } } }',
    '$res | Sort-Object file -Unique | ConvertTo-Json -Compress',
  ].join('\n'), 8000)
  if (!out) return []
  try {
    const list = JSON.parse(out)
    return (Array.isArray(list) ? list : [list])
      .filter((x) => x?.file)
      .map((x) => ({ file: path.relative(dir, x.file) || x.file, threat: x.threat || '', at: x.at || '' }))
  } catch { return [] }
}

// Игра запущена (кнопкой «Играть» или в обход лаунчера): учёт времени, статус «Играет в …», события
function startGameSession(entry) {
  if (!entry || playtime.isTracked(entry.id)) return
  registerGame({ ...entry, lastPlayedAt: Date.now() })
  // Учёт времени игры: process-watcher растит playtimeMs, пока процесс жив
  const stopAchievements = watchAchievements(entry)
  playtime.track({ ...entry, lastPlayedAt: Date.now() }, () => {
    stopAchievements()
    // игра закрылась — сообщим рендереру (сброс статуса «Играет в …» + отчёт сессии)
    try { mainWindow?.webContents.send('game-state', { running: false, name: installerModule.gameDisplayName(entry), id: entry.id, catalogId: entry.catalogId || 0 }) } catch {}
    onGameExited(entry)
  })
  // запущена — статус «Играет в …» для друзей + начало отсчёта сессии
  try { mainWindow?.webContents.send('game-state', { running: true, name: installerModule.gameDisplayName(entry), id: entry.id, catalogId: entry.catalogId || 0 }) } catch {}
  onGameStarted(entry)
}

// Игры, запущенные в обход лаунчера (ярлык на рабочем столе, exe из папки): раз в 30 секунд
// смотрим список процессов и, если там exe установленной игры, считаем время и статус «В игре»
// так же, как после кнопки «Играть».
const EXTERNAL_GAME_SCAN_MS = 30_000
let externalScanBusy = false
async function scanExternalGameLaunches() {
  if (externalScanBusy) return
  const games = loadRegistry().filter((g) => g.exePath && !playtime.isTracked(g.id))
  if (games.length === 0) return
  externalScanBusy = true
  try {
    // дешёвая проверка по именам exe (tasklist); PowerShell с путями — только если exe игры запущен
    const names = await playtime.listProcessNames()
    if (names && !games.some((g) => names.has(path.basename(String(g.exePath)).toLowerCase()))) return
    const procs = await playtime.listProcesses()
    for (const g of games) {
      if (procs.some((p) => playtime.isGameProcess(p, g))) {
        console.log('[Playtime] игра запущена не из лаунчера:', g.name)
        startGameSession(g)
      }
    }
  } catch { /* список процессов недоступен — попробуем в следующий раз */ } finally {
    externalScanBusy = false
  }
}
// ==========================================================

// --- Достижения Steam из файлов эмулятора в репаке (см. electron/achievements.cjs) ---
// appid игры Steam знает рендерер (ссылка на магазин в каталоге): страница игры сообщает его,
// и он запоминается в записи установленной игры — чтобы следить за достижениями во время игры.
function watchAchievements(entry) {
  const cur = loadRegistry().find((g) => g.id === entry.id) || entry
  const appId = Number(cur.steamAppId) || 0
  if (!appId) return () => {}
  const catalogId = Number(cur.catalogId) || 0
  return achievements.watch(appId, cur.installPath || '', (unlocked) => {
    try { mainWindow?.webContents.send('achievements-unlocked', { id: entry.id, catalogId, appId, name: cur.name, unlocked }) } catch { /* окно закрыто */ }
  })
}
ipcMain.handle('achievements-read', (e, { id, appId } = {}) => {
  const entry = id != null ? loadRegistry().find((g) => g.id === id) : null
  const app_ = Number(appId) || Number(entry?.steamAppId) || 0
  if (!app_) return { files: [], unlocked: [] }
  try { return achievements.read(app_, entry?.installPath || '') } catch (err) { return { files: [], unlocked: [], error: String(err?.message || err) } }
})
ipcMain.handle('achievements-bind', (e, { id, appId, catalogId } = {}) => {
  const entry = loadRegistry().find((g) => g.id === id)
  const app_ = Number(appId) || 0
  const cat = Number(entry?.catalogId) || Number(catalogId) || 0
  if (!entry || !app_ || (Number(entry.steamAppId) === app_ && Number(entry.catalogId) === cat)) return false
  registerGame({ ...entry, steamAppId: app_, catalogId: cat })
  return true
})

/**
 * Кряк после установки: есть — ничего не делаем; нет, но в раздаче лежит ровно один кряк —
 * ставим его; кряков несколько — даём выбрать игроку (status 'choose'); нет нигде — 'steam-only'.
 */
async function resolveCrack(target, roots) {
  const check = await crackCheck.check(target).catch(() => ({ status: 'unknown' }))
  if (check.status !== 'steam-only') return { status: check.status }
  const options = crackApply.findCracks(roots)
  if (options.length === 1) {
    const res = await crackApply.apply(options[0], target, getBundled7z())
    if (res.ok) {
      console.log('[Crack] установлен автоматически:', options[0].label, '→', target)
      return { status: 'applied', label: res.label }
    }
    console.warn('[Crack] не удалось поставить', options[0].label + ':', res.error)
    return { status: 'steam-only', applyError: res.error }
  }
  if (options.length > 1) return { status: 'choose', options: options.map(({ id, label, path: p, kind }) => ({ id, label, path: p, kind })) }
  return { status: 'steam-only' }
}

/** Поля записи игры и ответа установки по итогу resolveCrack */
function crackFields(crack) {
  if (!crack) return {}
  return {
    ...(crack.status !== 'unknown' ? { crackChecked: CRACK_CHECK_VERSION } : {}),
    ...(crack.status === 'steam-only' ? { crackMissing: true } : {}),
    ...(crack.status === 'choose' ? { crackOptions: crack.options } : {}),
    ...(crack.status === 'applied' ? { crackApplied: crack.label } : {}),
  }
}

// Версия проверки кряка: при изменении правил проверки — увеличить, и игры перепроверятся
// (2 — проверка видит steam_api64.dll в глубоких папках игр на Unreal)
const CRACK_CHECK_VERSION = 2

// Разовая проверка кряка у игр, установленных тихо раньше (до появления проверки после установки)
async function checkInstalledCracks() {
  // игры, добавленные игроком со своего диска (kind external), часто куплены — кряк у них не ищем
  for (const g of loadRegistry().filter((x) => x.exePath && x.installPath && x.kind !== 'external' && x.crackChecked !== CRACK_CHECK_VERSION && !x.crackApplied)) {
    const res = await crackCheck.check(g.installPath).catch(() => ({ status: 'unknown' }))
    if (res.status === 'unknown') continue
    const cur = loadRegistry().find((x) => x.id === g.id)
    if (!cur) continue
    registerGame({ ...cur, crackChecked: CRACK_CHECK_VERSION, ...(res.status === 'steam-only' && !cur.crackDismissed ? { crackMissing: true } : {}) })
    if (res.status === 'steam-only') console.warn('[CrackCheck] без кряка:', g.name)
  }
}

// --- Облачные сохранения (логика «когда и что синхронизировать» — в рендерере, src/api/cloudSaves.ts) ---
ipcMain.handle('cloud-saves-locate', (e, opts) => cloudSaves.locate(app, opts || {}))
ipcMain.handle('cloud-saves-pack', async (e, args) => {
  // args: путь папки (старый вызов) или { dirs, gameDir }
  const { dirs, gameDir } = typeof args === 'string' ? { dirs: [args], gameDir: '' } : (args || {})
  try { return { ok: true, ...(await cloudSaves.pack(app, getBundled7z(), dirs || [], gameDir || '')) } } catch (err) { return { error: err.message || String(err) } }
})
ipcMain.handle('cloud-saves-upload', async (e, { url, file, contentType }) => {
  try { await cloudSaves.upload(url, file, contentType); return { ok: true } } catch (err) { return { error: err.message || String(err) } } finally { cloudSaves.removeTemp(file) }
})
ipcMain.handle('cloud-saves-remove-temp', (e, file) => { cloudSaves.removeTemp(file); return true })
ipcMain.handle('cloud-saves-restore', async (e, { url, dir, dirs, label, gameDir }) => {
  let file = ''
  try {
    file = await cloudSaves.download(app, url)
    return { ok: true, ...(await cloudSaves.restore(app, getBundled7z(), file, dirs?.length ? dirs : [dir], label, gameDir || '')) }
  } catch (err) {
    return { error: err.message || String(err) }
  } finally {
    cloudSaves.removeTemp(file)
  }
})
ipcMain.handle('cloud-saves-pick-dir', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { title: 'Папка сохранений игры', properties: ['openDirectory'] })
  return res.canceled || !res.filePaths?.length ? null : res.filePaths[0]
})
ipcMain.handle('cloud-saves-open-dir', (e, dir) => (dir ? shell.openPath(dir) : null))

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

// Игра, которая уже стоит на компьютере (поставлена без лаунчера): игрок указывает её exe, и она
// попадает в библиотеку как установленная. Папку лаунчер не создавал — и никогда её не удаляет
// (kind 'external', managed: false): «Удалить» убирает только запись.
ipcMain.handle('add-local-game', (e, { catalogId, exePath, title } = {}) => {
  if (!exePath || !fs.existsSync(exePath) || !/\.exe$/i.test(exePath)) return { error: 'Выберите exe игры' }
  const normExe = path.normalize(exePath).toLowerCase()
  if (!pickedExePaths.has(normExe)) return { error: 'Выберите exe через окно выбора файла' }
  if (installerModule.isInstallerStub(exePath)) {
    return { error: 'Это установщик, а не сама игра. Установите игру и укажите exe из папки, куда она установлена.' }
  }
  const list = loadRegistry()
  const cid = Number(catalogId) || 0
  if (cid && list.some((g) => Number(g.catalogId) === cid && g.exePath)) {
    return { error: 'Эта игра уже есть среди установленных' }
  }
  if (list.some((g) => g.exePath && path.normalize(g.exePath).toLowerCase() === normExe)) {
    return { error: 'Этот exe уже привязан к другой игре в библиотеке' }
  }
  const installPath = findGameRootFromExe(exePath) || path.dirname(exePath)
  const entry = {
    id: 'local:' + crypto.createHash('md5').update(normExe).digest('hex').slice(0, 16),
    catalogId: cid,
    name: String(title || '').trim() || path.basename(installPath),
    ...(title ? { title: String(title).trim().slice(0, 200) } : {}),
    installPath,
    exePath,
    kind: 'external',
    managed: false,
    installedAt: Date.now(),
    playtimeMs: 0,
  }
  registerGame(entry)
  sendInstallProgress({ gameId: entry.id, catalogId: cid, phase: 'done', percent: 100 })
  return { ok: true, entry }
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
    delete entry.setupPath
    dropDownload(id, source).catch(() => {})
  }
  registerGame(entry)
  // Установка завершена вручную — карточка загрузки помечается как выполненная
  sendInstallProgress({ gameId: id, catalogId: entry.catalogId, phase: 'done', percent: 100 })
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
  // игра, добавленная игроком со своего диска: её файлы лаунчер не трогает никогда
  if (entry.kind === 'external') return false
  if (entry.managed) return true
  // старые записи без пометки: только папки внутри папки игр лаунчера (в том числе прежней)
  return entry.kind !== 'installer' &&
    [getGamesDir(), ...legacyDirs('legacyInstallDirs')].some((dir) => isInside(entry.installPath, dir))
}

// После тихой установки не нашлось кряка (см. electron/crackCheck.cjs): переустановить игру
// с мастером репака, где игрок сам выберет «Crack version». Установщик сохранён в setupPath.
ipcMain.handle('install-reinstall-wizard', async (e, id) => {
  const entry = loadRegistry().find((g) => g.id === id)
  if (!entry?.setupPath || !fs.existsSync(entry.setupPath)) {
    return { error: 'Установщик не сохранился — удалите игру и скачайте её заново' }
  }
  // убираем тихую установку: деинсталлятор репака (и запись в «Установленных приложениях») и папку
  if (entry.installPath && canDeleteInstallPath(entry) && fs.existsSync(entry.installPath)) {
    try { await uninstallEntry.removeUninstallEntries(entry.installPath) } catch (err) { console.warn('[Reinstall]', err?.message || err) }
    await fs.promises.rm(entry.installPath, { recursive: true, force: true }).catch(() => {})
  }
  // В мастере подставляем папку игр лаунчера: там лаунчер найдёт игру сам и при удалении сотрёт её
  // целиком (репаки по умолчанию предлагают Program Files или папку Steam)
  const suggestedDir = uniqueDest(path.join(getGamesDir(), sanitizeName(entry.name) || 'Game'))
  const type = detectInstallerType(entry.setupPath)
  const dirArgs = type === 'inno' ? [`/DIR="${suggestedDir}"`] : type === 'nsis' ? [`/D=${suggestedDir}`] : []
  const launchRes = await launchInstaller(entry.setupPath, dirArgs)
  if (launchRes?.error) return { error: 'Не удалось запустить установщик: ' + launchRes.error }
  const { crackMissing: _c, silent: _s, managed: _m, crackOptions: _o, ...rest } = entry
  registerGame({ ...rest, installPath: '', exePath: null, kind: 'installer', expectedDir: suggestedDir })
  watchWizardInstall(id)
  sendInstallProgress({ gameId: id, catalogId: entry.catalogId || 0, phase: 'installer', percent: -1 })
  waitProcessExit(launchRes.pid).then(() => {
    const cur = loadRegistry().find((g) => g.id === id)
    if (cur && !cur.exePath) sendInstallProgress({ gameId: id, catalogId: entry.catalogId || 0, phase: 'idle', percent: -1 })
  })
  return { ok: true, suggestedDir, gamesDir: getGamesDir() }
})
// Установка из сохранённого установщика: игра в библиотеке, но вместо неё лежит установщик
// (раздачу приняли за готовую игру — exe оказался установщиком Inno Setup с «игровым» именем).
// Ставим тихо в папку игр, как обычный репак; не получилось — открываем мастер.
ipcMain.handle('install-from-setup', async (e, id) => {
  const entry = loadRegistry().find((g) => g.id === id)
  if (!entry?.setupPath || !fs.existsSync(entry.setupPath)) {
    return { error: 'Установщик не сохранился — удалите игру и скачайте её заново' }
  }
  if (installingIds.has(id)) return { error: 'Установка уже идёт' }
  installingIds.add(id)
  const catalogId = entry.catalogId || 0
  const gamesDir = getGamesDir()
  const name = sanitizeName(entry.title || entry.name) || 'Game'
  const source = entry.sourcePath || path.dirname(entry.setupPath)
  try {
    const type = detectInstallerType(entry.setupPath)
    if (type) {
      const noSpace = await checkFreeSpace(source, gamesDir, 2)
      if (noSpace) return { error: noSpace }
      const target = uniqueDest(path.join(gamesDir, name))
      sendInstallProgress({ gameId: id, catalogId, phase: 'install', percent: -1, silent: true })
      const sizeTimer = setInterval(async () => {
        sendInstallProgress({ gameId: id, catalogId, phase: 'install', percent: -1, silent: true, bytes: await pathSize(target) })
      }, 3000)
      let res
      await pauseSeedingForInstall()
      try { res = await runInstallerSilently(entry.setupPath, type, target) } finally {
        clearInterval(sizeTimer)
        await resumeSeedingAfterInstall()
      }
      if (res.cancelled) {
        sendInstallProgress({ gameId: id, catalogId, phase: 'idle', percent: -1 })
        return { error: 'Установка отменена: установщику нужны права администратора' }
      }
      if (res.ok) {
        const exePath = rankGameExecutable(target, name)
        const crack = exePath ? await resolveCrack(target, [source]) : null
        const keepSetup = !exePath || crack?.status === 'steam-only' || crack?.status === 'choose'
        const { setupPath: _s, sourcePath: _p, crackMissing: _c, crackOptions: _o, crackChecked: _k, needsSetup: _n, ...rest } = entry
        registerGame({
          ...rest, installPath: target, managed: true, exePath, kind: 'installer', silent: true,
          ...(keepSetup ? { sourcePath: source, setupPath: entry.setupPath } : {}),
          ...crackFields(crack),
        })
        if (!keepSetup) await dropDownload(id, source)
        sendInstallProgress({ gameId: id, catalogId, phase: exePath ? 'done' : 'idle', percent: exePath ? 100 : -1 })
        return exePath ? { ok: true, exePath } : { ok: true, message: `Игра установлена в «${target}», но файл запуска не найден. Укажите exe на странице игры.` }
      }
      console.warn('[Install] тихая установка из установщика не удалась, открываем мастер:', res.error || `код ${res.code}`)
      if (isInside(target, gamesDir)) await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {})
    }
    // мастер установщика: папку игр подставляем, лаунчер найдёт игру сам
    const suggestedDir = uniqueDest(path.join(gamesDir, name))
    const dirArgs = type === 'inno' ? [`/DIR="${suggestedDir}"`] : type === 'nsis' ? [`/D=${suggestedDir}`] : []
    const launchRes = await launchInstaller(entry.setupPath, dirArgs)
    if (launchRes?.error) {
      sendInstallProgress({ gameId: id, catalogId, phase: 'idle', percent: -1 })
      return { error: 'Не удалось запустить установщик: ' + launchRes.error }
    }
    registerGame({ ...entry, installPath: '', exePath: null, kind: 'installer', expectedDir: suggestedDir })
    watchWizardInstall(id)
    sendInstallProgress({ gameId: id, catalogId, phase: 'installer', percent: -1 })
    waitProcessExit(launchRes.pid).then(() => {
      const cur = loadRegistry().find((g) => g.id === id)
      if (cur && !cur.exePath) sendInstallProgress({ gameId: id, catalogId, phase: 'idle', percent: -1 })
    })
    return { ok: true, wizard: true, suggestedDir }
  } finally {
    installingIds.delete(id)
  }
})

// Игра «установлена» как портативная, а её exe — установщик (Inno Setup / NSIS с игровым именем):
// превращаем запись в «нужно установить», файлы установщика не трогаем
function fixInstallerMistakenForGame() {
  for (const g of loadRegistry()) {
    // portable — исходная ошибка; needsSetup с exe — запись, которую 0.1.21 вернул поиском после мастера
    const mistaken = (g.kind === 'portable' && !g.setupPath) || (g.needsSetup && g.exePath && samePath(g.exePath, g.setupPath || ''))
    if (!mistaken || !g.exePath) continue
    if (!fs.existsSync(g.exePath) || !installerModule.isInstallerStub(g.exePath)) continue
    console.warn('[Install] вместо игры записан установщик, нужна установка:', g.name)
    const { crackChecked: _k, crackMissing: _c, crackOptions: _o, ...rest } = g
    registerGame({
      ...rest, kind: 'installer', exePath: null, installPath: '',
      setupPath: g.exePath, sourcePath: g.sourcePath || g.installPath || path.dirname(g.exePath), needsSetup: true,
    })
  }
}

// Игрок выбрал один из нескольких кряков, найденных в раздаче
ipcMain.handle('install-apply-crack', async (e, id, optionId) => {
  const entry = loadRegistry().find((g) => g.id === id)
  const option = entry?.crackOptions?.find((o) => o.id === optionId)
  if (!entry || !option) return { error: 'Кряк не найден — скачайте игру заново' }
  if (!fs.existsSync(option.path)) return { error: 'Файлы кряка уже удалены — скачайте игру заново' }
  const res = await crackApply.apply(option, entry.installPath, getBundled7z())
  if (!res.ok) return { error: 'Не удалось поставить кряк: ' + res.error }
  const { crackOptions: _o, crackMissing: _m, sourcePath, setupPath: _s, ...rest } = entry
  registerGame({ ...rest, crackApplied: res.label, crackChecked: CRACK_CHECK_VERSION })
  // установка завершена — скачанные файлы больше не нужны
  if (sourcePath) await dropDownload(id, sourcePath)
  return { ok: true, label: res.label }
})

// Игрок решил оставить установку как есть: установочные файлы больше не нужны
ipcMain.handle('install-crack-dismiss', async (e, id) => {
  const entry = loadRegistry().find((g) => g.id === id)
  if (!entry) return false
  if (entry.sourcePath) await dropDownload(id, entry.sourcePath)
  const { sourcePath: _p, setupPath: _s, crackMissing: _c, crackOptions: _o, ...rest } = entry
  registerGame({ ...rest, crackDismissed: true })
  return true
})

ipcMain.handle('uninstall-game', async (e, id) => {
  const entry = loadRegistry().find(g => g.id === id)
  const removable = canDeleteInstallPath(entry)
  // Игра, поставленная своим установщиком, записана в «Установленные приложения» Windows:
  // запускаем её деинсталлятор и убираем запись, иначе там остаётся игра без файлов
  let uninstallLeft = 0
  if (removable && fs.existsSync(entry.installPath)) {
    try {
      const res = await uninstallEntry.removeUninstallEntries(entry.installPath)
      uninstallLeft = res.cancelled ? 1 : (res.left || 0)
    } catch (err) {
      console.warn('[Uninstall] запись Windows не убрана:', err?.message || err)
    }
  }
  if (removable) await fs.promises.rm(entry.installPath, { recursive: true, force: true }).catch(() => {})
  // Установщик так и не закончили: убираем установочные файлы
  if (entry?.sourcePath) await dropDownload(id, entry.sourcePath)
  removeGameEntry(id)
  // Файлы игры, поставленной своим установщиком, остаются: удалять их нужно её деинсталлятором
  if (uninstallLeft > 0) return { ok: true, uninstallEntryLeft: true }
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
    storageSetupDone: p.storageSetupDone === true,
    systemDrive: systemDrive(),
    downloadDrive: normalizeDrive(p.downloadDrive) || systemDrive(),
    installDrive: normalizeDrive(p.installDrive) || systemDrive(),
    drives: listDrives(),
    downloadPath: downloadDirOrDefault(),
    installPath: getGamesDir(),
    ...extra,
  }
}

const PATH_FLAGS = ['askDownloadDir', 'askInstallDir', 'autoInstallSetups', 'storageSetupDone']

// Окно «Где хранить игры» — только новым игрокам. У кого уже есть установленные игры, загрузки
// или выбранный диск, выбор считается сделанным: место хранения у них менять не нужно.
function markStorageSetupForExistingUsers() {
  const p = loadAppPaths()
  if (p.storageSetupDone) return
  const hasGames = loadRegistry().length > 0
  const hasDrive = !!normalizeDrive(p.installDrive) || !!normalizeDrive(p.downloadDrive)
  let hasDownloads = false
  try { hasDownloads = fs.readdirSync(downloadDirOrDefault()).length > 0 } catch { /* папки ещё нет */ }
  if (hasGames || hasDrive || hasDownloads) saveAppPaths({ storageSetupDone: true })
}

ipcMain.handle('paths:get', () => pathsView())

// Папка лаунчера на диске: создать и проверить, что в неё можно писать (папка могла остаться
// от другой установки Windows и быть доступной только для чтения)
function tryDriveFolder(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.lustre-write-${process.pid}`)
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
    return null
  } catch (err) {
    return err?.code || 'UNKNOWN'
  }
}

function runPs(script, timeout = 15000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout }, (err, stdout) => {
      resolve(err ? '' : String(stdout || '').trim())
    })
  })
}

// Создать папку с правами администратора и выдать текущему пользователю право на изменение
// (окно запроса прав Windows покажет сама система)
async function fixDriveFolderAccess(drive, dir) {
  const root = path.join(drive, 'Lustre')
  const user = `${process.env.USERDOMAIN || ''}\\${process.env.USERNAME || ''}`.replace(/^\\/, '')
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  const inner = [
    `New-Item -ItemType Directory -Force -Path ${q(dir)} | Out-Null`,
    `icacls ${q(root)} /grant ${q(`${user}:(OI)(CI)M`)} /T /C | Out-Null`,
  ].join('; ')
  const encoded = Buffer.from(inner, 'utf16le').toString('base64')
  const outer = `try { Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encoded}'; 'OK' } catch { 'CANCEL' }`
  return (await runPs(outer, 120000)) === 'OK'
}

/** Понятная причина, почему лаунчер не может писать на диск */
async function driveErrorText(drive, code) {
  const d = drive.slice(0, 2)
  if (code === 'EROFS') return `Диск ${d} доступен только для чтения (CD/DVD, подключённый образ или флешка с защитой от записи). Выберите другой диск.`
  if (code === 'ENOSPC') return `На диске ${d} нет свободного места.`
  if (code === 'EPERM' || code === 'EACCES') {
    const cfa = await runPs('(Get-MpPreference).EnableControlledFolderAccess')
    if (cfa === '1') {
      return `Защитник Windows не даёт лаунчеру писать на диск ${d}: включён «Контролируемый доступ к папкам». ` +
        'Откройте «Безопасность Windows» → «Защита от вирусов и угроз» → «Управление защитой от программ-шантажистов» → ' +
        '«Разрешить работу приложения через контролируемый доступ к папкам» и добавьте Lustre.'
    }
    return `Windows не разрешает создавать папки на диске ${d} (нет прав на запись — часто так бывает с диском от другой установки Windows). ` +
      `Создайте папку ${d}\\Lustre вручную и в её свойствах на вкладке «Безопасность» дайте своей учётной записи право «Изменение», либо выберите другой диск.`
  }
  return `Нет доступа к диску ${d}: лаунчер не может создать на нём свою папку (${code}).`
}

ipcMain.handle('paths:set', async (e, patch) => {
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
      const dir = path.join(drive, 'Lustre', key === 'downloadDrive' ? 'Downloads' : 'Games')
      let code = tryDriveFolder(dir)
      // нет прав — предлагаем исправить с правами администратора и пробуем ещё раз
      if (code === 'EPERM' || code === 'EACCES') {
        const win = BrowserWindow.fromWebContents(e.sender) || mainWindow
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          title: 'Нет доступа к диску',
          message: `Windows не разрешает лаунчеру создать папку на диске ${drive.slice(0, 2)}`,
          detail: `Лаунчер может создать папку ${path.join(drive, 'Lustre')} с правами администратора и разрешить вашей учётной записи записывать в неё. Windows попросит подтверждение.`,
          buttons: ['Исправить', 'Отмена'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        })
        if (response === 0 && await fixDriveFolderAccess(drive, dir)) code = tryDriveFolder(dir)
      }
      if (code) return pathsView({ error: await driveErrorText(drive, code) })
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
    // Частичная загрузка следующего обновления (blockmap) берёт неизменённые блоки из копии
    // текущего установщика в кэше (…-updater/installer.exe). Её обновляет только NSIS-установщик,
    // а самообновление его не запускает: в кэше оставался установщик старой версии, блоки не
    // сходились — и каждое обновление качалось целиком (~150 МБ вместо нескольких).
    try {
      const cacheDir = path.dirname(path.dirname(updateDownloaded.file)) // …-updater/pending/<файл> → …-updater
      if (path.basename(path.dirname(updateDownloaded.file)) === 'pending') {
        fs.copyFileSync(updateDownloaded.file, path.join(cacheDir, 'installer.exe'))
      }
    } catch (err) {
      console.warn('[Update] не удалось обновить кэш установщика для частичных обновлений:', err?.message || err)
    }
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

// Обновления идут с зеркала на нашем сервере (app-update.yml, provider generic);
// запасной путь — релизы на GitHub того же канала
let updateUsingGithub = false
function githubUpdateFeed() {
  return buildFlavor() === 'staff'
    ? { provider: 'github', owner: 'DewesDeveloper', repo: 'LustreHub-releases', channel: 'staff' }
    : { provider: 'github', owner: 'dewesdeveloper', repo: 'lustre-launcher' }
}

// После самообновления установщик текущей версии остаётся в …-updater/pending, а кэш для
// частичных обновлений (installer.exe) — от старой версии. Кладём текущий установщик в кэш,
// чтобы следующее обновление скачивало только изменившиеся блоки.
function syncUpdaterInstallerCache() {
  try {
    const cacheDir = path.join(process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local'), 'lustre-frontend-updater')
    const pending = path.join(cacheDir, 'pending')
    const info = JSON.parse(fs.readFileSync(path.join(pending, 'update-info.json'), 'utf8'))
    const file = path.join(pending, path.basename(String(info?.fileName || '')))
    if (!info?.fileName || !fs.existsSync(file)) return
    if (!String(info.fileName).includes(app.getVersion())) return // не установленная версия — не трогаем
    const cached = path.join(cacheDir, 'installer.exe')
    const st = fs.statSync(file)
    const cst = fs.existsSync(cached) ? fs.statSync(cached) : null
    if (!cst || cst.size !== st.size) {
      // переносим, а не копируем: установщик уже установленной версии в pending больше не нужен,
      // а держать две одинаковые копии по ~150 МБ незачем
      try { fs.renameSync(file, cached) } catch { fs.copyFileSync(file, cached) }
      console.log('[Update] кэш установщика для частичных обновлений обновлён до', app.getVersion())
    }
    // установленная версия больше не «ожидает установки»: убираем её из pending
    fs.rmSync(file, { force: true })
    fs.rmSync(path.join(pending, 'update-info.json'), { force: true })
  } catch { /* кэша нет или формат другой — обновление просто скачается целиком */ }
}

function initAutoUpdates() {
  if (!app.isPackaged) return
  checkSelfUpdateResult()
  syncUpdaterInstallerCache()
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
    // Зеркало на нашем сервере не ответило или оборвало загрузку — один раз пробуем GitHub
    if (!updateUsingGithub && (phase === 'checking' || phase === 'idle' || phase === 'downloading')) {
      updateUsingGithub = true
      console.warn('[Update] зеркало недоступно — переключаюсь на GitHub')
      autoUpdater.setFeedURL(githubUpdateFeed())
      autoUpdater.checkForUpdates().catch(() => {})
      return
    }
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
  // из трея или свёрнутого окна — список загрузок обновляется сразу (в фоне опрос реже)
  mainWindow.on('show', kickStatusPolling)
  mainWindow.on('restore', kickStatusPolling)
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
  // клики проходят насквозь; forward — чтобы окно видело наведение на карточку (тогда ловим клики)
  overlayToastWindow.setIgnoreMouseEvents(true, { forward: true })
  loadOverlayRoute(overlayToastWindow, '/overlay-toasts')
  overlayToastWindow.webContents.on('did-finish-load', sendOverlayState)
  overlayToastWindow.on('closed', () => { overlayToastWindow = null })
  return overlayToastWindow
}

/** Игровое уведомление. false — игра не запущена или уведомления в игре выключены. */
function showGameToast(toast) {
  if (!currentGame || !loadOverlayPrefs().notifications) return false
  const { bounds } = gameDisplay()
  deliverToast({ x: bounds.x + bounds.width - TOAST_W - 24, y: bounds.y + bounds.height - TOAST_H - 24 }, toast)
  return true
}

/** Уведомление лаунчера в правом нижнем углу (над панелью задач); в игре — в игровом оверлее */
function showLauncherToast(toast) {
  if (currentGame) return showGameToast(toast)
  let area
  try { area = screen.getPrimaryDisplay().workArea } catch { return false }
  deliverToast({ x: area.x + area.width - TOAST_W - 12, y: area.y + area.height - TOAST_H - 12 }, toast)
  return true
}

function deliverToast(pos, toast) {
  clearTimeout(toastIdleTimer)
  const w = ensureToastWindow()
  w.setBounds({ ...pos, width: TOAST_W, height: TOAST_H })
  const deliver = () => {
    if (!overlayToastWindow || overlayToastWindow.isDestroyed()) return
    overlayToastWindow.webContents.send('overlay-toast', { id: Date.now() + Math.random(), ...toast })
    if (!overlayToastWindow.isVisible()) overlayToastWindow.showInactive()
  }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', deliver)
  else deliver()
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
  currentGame = { id: entry.id, name: installerModule.gameDisplayName(entry), catalogId: entry.catalogId || 0, startedAt: Date.now(), playtimeMs: entry.playtimeMs || 0 }
  syncOverlayHotkeys()
  const prefs = loadOverlayPrefs()
  if (!prefs.enabled) return
  // Окно оверлея готовим заранее — горячая клавиша открывает его сразу, без загрузки
  if (!overlayWindow || overlayWindow.isDestroyed()) createOverlayWindow()
  sendOverlayState()
  setTimeout(() => {
    if (currentGame?.id === entry.id) {
      showGameToast({ kind: 'hint', title: currentGame.name, body: `${hotkeyLabel(prefs.hotkey)} — оверлей Lustre` })
    }
  }, 5000)
}

function onGameExited(entry) {
  if (!currentGame || currentGame.id !== entry.id) return
  currentGame = null
  syncOverlayHotkeys()
  hideGameOverlay()
  if (overlayToastWindow && !overlayToastWindow.isDestroyed()) { overlayToastWindow.hide(); scheduleToastWindowClose() }
  sendOverlayState()
  // окно оверлея нужно только во время игры: через минуту после выхода освобождаем память
  setTimeout(() => {
    if (currentGame || !overlayWindow || overlayWindow.isDestroyed() || overlayWindow.isVisible()) return
    overlayWindow.destroy()
    overlayWindow = null
  }, 60_000)
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
// Скрытое окно уведомлений держало ~200 МБ памяти до выхода из лаунчера: уведомлений нет
// и игра не идёт — через минуту закрываем его (следующее уведомление создаст окно заново)
let toastIdleTimer = null
function scheduleToastWindowClose() {
  clearTimeout(toastIdleTimer)
  toastIdleTimer = setTimeout(() => {
    if (currentGame || !overlayToastWindow || overlayToastWindow.isDestroyed() || overlayToastWindow.isVisible()) return
    overlayToastWindow.destroy()
    overlayToastWindow = null
  }, 60_000)
}

ipcMain.on('overlay-toasts-empty', () => {
  if (overlayToastWindow && !overlayToastWindow.isDestroyed()) {
    overlayToastWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayToastWindow.hide()
    scheduleToastWindowClose()
  }
})
// Курсор над карточкой уведомления: на рабочем столе ловим клики, в игре — всегда насквозь
ipcMain.on('overlay-toasts-hover', (_e, hover) => {
  if (!overlayToastWindow || overlayToastWindow.isDestroyed()) return
  overlayToastWindow.setIgnoreMouseEvents(!(hover && !currentGame), { forward: true })
})
// Клик по уведомлению на рабочем столе — открыть лаунчер на нужном разделе
ipcMain.on('overlay-toast-click', (_e, payload) => {
  if (currentGame || !mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.webContents.send('notify-click', payload ?? null)
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
  return { id, name, platform, version: app.getVersion() }
}

ipcMain.handle('get-device-info', () => getDeviceInfo())
// Состояние аппаратного ускорения: на слабой графике лаунчер предлагает упрощённый режим
ipcMain.handle('gpu-status', async () => {
  let feature = {}
  try { feature = app.getGPUFeatureStatus() } catch { /* GPU-процесс ещё не готов */ }
  let gpu = null
  try {
    const info = await app.getGPUInfo('basic')
    const list = Array.isArray(info?.gpuDevice) ? info.gpuDevice : []
    gpu = list.find((d) => d.active) || list[0] || null
  } catch { /* нет данных о видеокарте */ }
  return { feature, vendorId: gpu?.vendorId, deviceId: gpu?.deviceId, driver: gpu?.driverVersion }
})

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
  // игры, запущенные ярлыком или из папки, тоже учитываются (scanExternalGameLaunches)
  setTimeout(() => { void scanExternalGameLaunches() }, 15_000)
  setInterval(() => { void scanExternalGameLaunches() }, EXTERNAL_GAME_SCAN_MS)
  try { markStorageSetupForExistingUsers() } catch (err) { console.warn('[Storage]', err?.message || err) }
  // игры, поставленные тихо до появления проверки кряка, проверяем один раз
  setTimeout(() => { void checkInstalledCracks() }, 20_000)
  try { fixInstallerMistakenForGame() } catch (err) { console.warn('[Install]', err?.message || err) }
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
  if (statusInterval) clearTimeout(statusInterval)
  if (qbStopRequested || !qbIsManaged() || !qbCookie) return
  e.preventDefault()
  qbStopRequested = true
  const done = () => app.quit()
  Promise.race([stopManagedQb(), new Promise((r) => setTimeout(r, 1500))]).then(done, done)
})
