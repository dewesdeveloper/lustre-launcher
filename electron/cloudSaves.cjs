// cloudSaves.cjs — облачные сохранения игр: найти папку сохранений, упаковать её в zip,
// загрузить по временной ссылке сервера, скачать и восстановить. Перед восстановлением
// текущие сохранения всегда упаковываются в локальную копию (userData/cloud-save-backups).
// Решения «когда синхронизировать» принимает рендерер: у него токен и статус подписки.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const https = require('node:https')
const http = require('node:http')
const { spawn } = require('node:child_process')

const MAX_SCAN_FILES = 20000
const KEEP_LOCAL_BACKUPS = 3

// ---------- пути ----------

function knownDirs(app) {
  const home = os.homedir()
  const env = process.env
  const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming')
  const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  let documents
  try { documents = app.getPath('documents') } catch { documents = path.join(home, 'Documents') }
  return {
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    LOCALLOW: path.join(path.dirname(localAppData), 'LocalLow'),
    DOCUMENTS: documents,
    SAVEDGAMES: path.join(home, 'Saved Games'),
    USERPROFILE: home,
    PUBLIC: env.PUBLIC || 'C:\\Users\\Public',
    PROGRAMDATA: env.PROGRAMDATA || 'C:\\ProgramData',
  }
}

// Где эмуляторы Steam из репаков хранят сохранения ({appid} — id игры в Steam)
const EMULATOR_PATHS = [
  '%APPDATA%/Goldberg SteamEmu Saves/{appid}',
  '%APPDATA%/GSE Saves/{appid}',
  '%PUBLIC%/Documents/Steam/CODEX/{appid}',
  '%PUBLIC%/Documents/Steam/RUNE/{appid}',
  '%APPDATA%/Steam/CODEX/{appid}',
  '%APPDATA%/EMPRESS/{appid}',
  '%PUBLIC%/Documents/EMPRESS/{appid}',
  '%PUBLIC%/Documents/OnlineFix/{appid}',
  '%LOCALAPPDATA%/SKIDROW/{appid}',
  '%PROGRAMDATA%/Steam/{appid}',
]

/** Подставить %VAR%, {game_dir}, {appid}; null — если нужной подстановки нет */
function expandPattern(pattern, vars, ctx) {
  let p = String(pattern || '').trim()
  if (!p) return null
  if (p.includes('{game_dir}')) {
    if (!ctx.gameDir) return null
    p = p.split('{game_dir}').join(ctx.gameDir)
  }
  if (p.includes('{appid}')) {
    if (!ctx.appId) return null
    p = p.split('{appid}').join(String(ctx.appId))
  }
  p = p.replace(/%([A-Z_]+)%/gi, (m, name) => vars[name.toUpperCase()] ?? m)
  if (/%[A-Z_]+%/i.test(p)) return null // неизвестная переменная
  return path.normalize(p.replace(/\//g, path.sep))
}

/** Раскрыть «*» в сегментах пути (например, папка с id пользователя Steam) */
function globDirs(p) {
  const parts = p.split(path.sep)
  let current = [parts[0] + path.sep]
  for (const seg of parts.slice(1)) {
    if (!seg) continue
    const next = []
    for (const base of current) {
      if (seg.includes('*')) {
        const re = new RegExp('^' + seg.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i')
        let entries = []
        try { entries = fs.readdirSync(base, { withFileTypes: true }) } catch { continue }
        for (const e of entries) if (e.isDirectory() && re.test(e.name)) next.push(path.join(base, e.name))
      } else {
        next.push(path.join(base, seg))
      }
    }
    current = next
    if (current.length === 0) break
  }
  return current.filter((d) => { try { return fs.statSync(d).isDirectory() } catch { return false } })
}

/** Обойти папку: число файлов, объём, время последнего изменения */
function scanDir(dir) {
  let files = 0
  let size = 0
  let newest = 0
  const stack = [dir]
  while (stack.length && files < MAX_SCAN_FILES) {
    const d = stack.pop()
    let entries = []
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) { stack.push(full); continue }
      if (!e.isFile()) continue
      try {
        const st = fs.statSync(full)
        files++
        size += st.size
        if (st.mtimeMs > newest) newest = st.mtimeMs
      } catch { /* файл исчез во время обхода */ }
    }
  }
  return { files, size, newest: Math.round(newest) }
}

const fingerprintOf = (s) => `${s.files}:${s.size}:${s.newest}`

/** Общая статистика нескольких папок */
function scanDirs(dirs) {
  const total = { files: 0, size: 0, newest: 0 }
  for (const d of dirs) {
    const s = scanDir(d)
    total.files += s.files
    total.size += s.size
    if (s.newest > total.newest) total.newest = s.newest
  }
  return total
}

// ---------- поиск по названию ----------

/** Название без регистра, пробелов и знаков: «Hollow Knight: Silksong» → «hollowknightsilksong» */
const norm = (s) => String(s || '').toLowerCase().replace(/[™®©]/g, '').replace(/[^\p{L}\p{N}]+/gu, '')

/** Варианты названия: целиком и без подзаголовка/издания («Game: Remastered», «Game - GOTY») */
function titleKeys(title) {
  const keys = new Set()
  const t = String(title || '')
  keys.add(norm(t))
  const cut = t.split(/\s[-–—]\s|:/)[0]
  keys.add(norm(cut))
  keys.add(norm(t.replace(/\b(definitive|deluxe|complete|ultimate|goty|game of the year|enhanced|remastered|anniversary|gold)\b.*$/i, '')))
  return [...keys].filter((k) => k.length >= 3)
}

// Папки, которые точно не сохранения (кэши движков, лаунчеры, системное)
const GUESS_SKIP = new Set(['microsoft', 'packages', 'temp', 'google', 'nvidia', 'nvidiacorporation', 'amd', 'intel', 'steam', 'unity', 'unrealengine', 'epicgameslauncher', 'crashdumps', 'd3dscache', 'programs', 'mygames', 'lustrehub', 'electron'])

function subdirs(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) } catch { return [] }
}

/** Unreal хранит сохранения в <Game>/Saved/SaveGames — берём её, а не весь кэш игры */
function narrowGuess(dir) {
  for (const sub of [['Saved', 'SaveGames'], ['Saved', 'SaveGame'], ['Saves'], ['SaveGames'], ['Save']]) {
    const p = path.join(dir, ...sub)
    try { if (fs.statSync(p).isDirectory() && scanDir(p).files > 0) return p } catch { /* нет такой */ }
  }
  return dir
}

/**
 * Угадать папки сохранений по названию игры и разработчика: ищем в AppData\Local, Roaming,
 * LocalLow, «Документах», My Games и Saved Games папку с названием игры — прямо в корне
 * или внутри папки разработчика («LocalLow/Team Cherry/Hollow Knight»).
 */
function guessDirs(vars, title, developer) {
  const keys = titleKeys(title)
  if (keys.length === 0) return []
  const devKeys = String(developer || '').split(/[,;/]/).map(norm).filter((k) => k.length >= 3)
  const roots = [vars.LOCALAPPDATA, vars.APPDATA, vars.LOCALLOW, vars.DOCUMENTS, path.join(vars.DOCUMENTS, 'My Games'), vars.SAVEDGAMES]
  const found = []
  for (const root of roots) {
    for (const name of subdirs(root)) {
      const n = norm(name)
      if (GUESS_SKIP.has(n)) continue
      if (keys.includes(n)) { found.push(path.join(root, name)); continue }
      if (devKeys.includes(n)) {
        for (const child of subdirs(path.join(root, name))) {
          if (keys.includes(norm(child))) found.push(path.join(root, name, child))
        }
      }
    }
  }
  return found.map(narrowGuess)
}

/**
 * Игры на Unreal Engine: проект определяется по файлам игры (<Проект>/Binaries/Win64/<Проект>-Win64-Shipping.exe
 * или <Проект>.exe рядом с папкой Engine), сохранения — в %LOCALAPPDATA%\<Проект>\Saved\SaveGames.
 */
function unrealSaveDirs(vars, gameDir) {
  if (!gameDir) return []
  const projects = new Set()
  for (const name of subdirs(gameDir)) {
    // папка проекта: в ней Binaries/Win64 с *-Shipping.exe
    const bin = path.join(gameDir, name, 'Binaries', 'Win64')
    try {
      if (fs.readdirSync(bin).some((n) => /-Win64-Shipping\.exe$/i.test(n))) projects.add(name)
    } catch { /* не проект */ }
  }
  const out = []
  for (const p of projects) {
    const saved = path.join(vars.LOCALAPPDATA, p, 'Saved')
    for (const d of [path.join(saved, 'SaveGames'), saved]) {
      try { if (fs.statSync(d).isDirectory()) { out.push(d); break } } catch { /* нет папки */ }
    }
  }
  return out
}

/** Объединить несколько папок в один вариант (например, AppData\Local + AppData\Roaming) */
function combine(list, source) {
  const withFiles = list.filter((c) => c.files > 0)
  if (withFiles.length === 0) return null
  const dirs = withFiles.map((c) => c.dir)
  const s = scanDirs(dirs)
  return { dir: dirs[0], dirs, source, ...s, fingerprint: fingerprintOf(s) }
}

/**
 * Найти сохранения игры. Порядок: папка пользователя → все пути из каталога (их может быть
 * несколько: Local + Roaming) → папки эмуляторов репаков → угадывание по названию.
 * best.dirs — все папки, которые попадут в один архив.
 */
function locate(app, { patterns = [], gameDir = '', appId = '', override = '', title = '', developer = '' }) {
  const vars = knownDirs(app)
  const ctx = { gameDir, appId }
  const candidates = []
  const seen = new Set()
  const add = (dir, source) => {
    const key = path.normalize(dir).toLowerCase()
    if (seen.has(key)) return
    // вложенная в уже найденную (или содержащая её) папка — не дублируем файлы в архиве
    for (const c of candidates) {
      const k = c.dir.toLowerCase()
      if (key.startsWith(k + path.sep) || k.startsWith(key + path.sep)) return
    }
    seen.add(key)
    const s = scanDir(dir)
    candidates.push({ dir: path.normalize(dir), dirs: [path.normalize(dir)], source, ...s, fingerprint: fingerprintOf(s) })
  }
  if (override) {
    try { if (fs.statSync(override).isDirectory()) add(override, 'user') } catch { /* папку удалили */ }
  }
  const userPick = candidates.find((c) => c.source === 'user')
  if (userPick) return { best: userPick, candidates }

  for (const p of patterns) {
    const exp = expandPattern(p, vars, ctx)
    if (exp) for (const d of globDirs(exp)) add(d, 'catalog')
  }
  const catalog = combine(candidates.filter((c) => c.source === 'catalog'), 'catalog')
  if (catalog) return { best: catalog, candidates }

  if (appId) {
    for (const p of EMULATOR_PATHS) {
      const exp = expandPattern(p, vars, ctx)
      if (exp) for (const d of globDirs(exp)) add(d, 'emulator')
    }
  }
  const emulator = candidates.filter((c) => c.source === 'emulator' && c.files > 0).sort((a, b) => b.newest - a.newest)[0]
  if (emulator) return { best: emulator, candidates }

  // путей нет (или они пусты) — игра на Unreal Engine: папка проекта из файлов игры
  for (const d of unrealSaveDirs(vars, gameDir)) add(d, 'guess')
  // и угадываем по названию
  if (title) for (const d of guessDirs(vars, title, developer)) add(d, 'guess')
  const guess = combine(candidates.filter((c) => c.source === 'guess'), 'guess')
  return { best: guess, candidates }
}

/** Путь в переносимом виде: %LOCALAPPDATA%/Game, {game_dir}/Saves — чтобы на другом ПК лёг на место */
function contractPath(dir, vars, gameDir) {
  const full = path.normalize(dir)
  const bases = Object.entries(vars).map(([k, v]) => [`%${k}%`, v])
  if (gameDir) bases.push(['{game_dir}', gameDir])
  bases.sort((a, b) => b[1].length - a[1].length) // LOCALLOW раньше USERPROFILE
  for (const [token, base] of bases) {
    const b = path.normalize(base)
    if (full.toLowerCase() === b.toLowerCase()) return token
    if (full.toLowerCase().startsWith(b.toLowerCase() + path.sep)) return token + '/' + full.slice(b.length + 1).split(path.sep).join('/')
  }
  return full.split(path.sep).join('/')
}

// ---------- архивы ----------

function run7z(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => { err += d.toString(); if (err.length > 4000) err = err.slice(-2000) })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 || code === 1 ? resolve() : reject(new Error(`7-Zip: код ${code} ${err.trim().slice(0, 200)}`))))
  })
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })
}

// Архив с несколькими папками: внутри манифест и по zip на каждую папку (r0.zip, r1.zip…).
// Архив одной папки — обычный zip её содержимого (как в первых версиях).
const MANIFEST = '__lustre_cloud_saves.json'

const tempDir = (app) => {
  const d = path.join(app.getPath('temp'), 'lustre-cloud-saves')
  fs.mkdirSync(d, { recursive: true })
  return d
}
const toDirs = (dirs) => (Array.isArray(dirs) ? dirs : [dirs]).filter(Boolean).map((d) => path.normalize(d))

/** Упаковать папки сохранений во временный zip */
async function pack(app, sevenZip, dirsIn, gameDir = '') {
  if (!sevenZip) throw new Error('Встроенный 7-Zip не найден — переустановите лаунчер')
  const dirs = toDirs(dirsIn).filter((d) => scanDir(d).files > 0)
  if (dirs.length === 0) throw new Error('В папке сохранений нет файлов')
  const stats = scanDirs(dirs)
  const stamp = `${Date.now()}-${process.pid}`
  const zip = path.join(tempDir(app), `save-${stamp}.zip`)
  if (dirs.length === 1) {
    await run7z(sevenZip, ['a', '-tzip', '-mx=5', '-y', zip, '*'], dirs[0])
  } else {
    const work = path.join(tempDir(app), `pack-${stamp}`)
    fs.mkdirSync(work, { recursive: true })
    try {
      const vars = knownDirs(app)
      const roots = []
      for (let i = 0; i < dirs.length; i++) {
        await run7z(sevenZip, ['a', '-tzip', '-mx=5', '-y', path.join(work, `r${i}.zip`), '*'], dirs[i])
        roots.push({ file: `r${i}.zip`, path: contractPath(dirs[i], vars, gameDir) })
      }
      fs.writeFileSync(path.join(work, MANIFEST), JSON.stringify({ version: 1, roots }, null, 1))
      await run7z(sevenZip, ['a', '-tzip', '-mx=0', '-y', zip, '*'], work) // внутри уже сжато
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  }
  const size = fs.statSync(zip).size
  return { zip, size, sha256: await sha256File(zip), files: stats.files, fingerprint: fingerprintOf(stats), savedAt: new Date(stats.newest || Date.now()).toISOString() }
}

/** Упаковать текущие файлы папки в локальную копию (храним несколько последних на игру) */
async function backupDir(app, sevenZip, dir, safe, stamp, suffix) {
  if (scanDir(dir).files === 0) return ''
  const bdir = path.join(app.getPath('userData'), 'cloud-save-backups')
  fs.mkdirSync(bdir, { recursive: true })
  const file = path.join(bdir, `${safe}-${stamp}${suffix}.zip`)
  await run7z(sevenZip, ['a', '-tzip', '-mx=3', '-y', file, '*'], dir)
  return file
}

function pruneBackups(app, safe) {
  const bdir = path.join(app.getPath('userData'), 'cloud-save-backups')
  let names = []
  try { names = fs.readdirSync(bdir).filter((n) => n.startsWith(safe + '-')) } catch { return }
  // одна копия = все файлы с одной меткой времени (по файлу на папку)
  const stampOf = (n) => n.slice(safe.length + 1).replace(/(-r\d+)?\.zip$/, '')
  const keep = new Set([...new Set(names.map(stampOf))].sort().reverse().slice(0, KEEP_LOCAL_BACKUPS))
  for (const n of names) if (!keep.has(stampOf(n))) { try { fs.rmSync(path.join(bdir, n)) } catch { /* занято */ } }
}

/**
 * Распаковать архив по местам. Текущие файлы каждой папки сначала уходят в локальную копию.
 * dirs — папки, найденные на этом ПК: для архива одной папки берётся первая; для архива
 * нескольких — путь из манифеста (%LOCALAPPDATA%/…), а если его не раскрыть — папка по номеру.
 */
async function restore(app, sevenZip, zip, dirsIn, label, gameDir = '') {
  if (!sevenZip) throw new Error('Встроенный 7-Zip не найден — переустановите лаунчер')
  const local = toDirs(dirsIn)
  const safe = String(label || 'game').replace(/[^\w.-]+/g, '_').slice(0, 60)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const work = path.join(tempDir(app), `restore-${Date.now()}-${process.pid}`)
  fs.mkdirSync(work, { recursive: true })
  const backups = []
  const targets = []
  try {
    await run7z(sevenZip, ['x', '-y', '-o' + work, zip], work)
    let manifest = null
    try { manifest = JSON.parse(fs.readFileSync(path.join(work, MANIFEST), 'utf8')) } catch { /* обычный архив */ }
    if (manifest && Array.isArray(manifest.roots)) {
      const vars = knownDirs(app)
      for (let i = 0; i < manifest.roots.length; i++) {
        const r = manifest.roots[i]
        const inner = path.join(work, path.basename(String(r.file || '')))
        if (!fs.existsSync(inner)) continue
        let dir = expandPattern(r.path, vars, { gameDir, appId: '' })
        if (!dir || !path.isAbsolute(dir)) dir = local[i] || null
        if (!dir) continue
        fs.mkdirSync(dir, { recursive: true })
        const b = await backupDir(app, sevenZip, dir, safe, stamp, `-r${i}`)
        if (b) backups.push(b)
        await run7z(sevenZip, ['x', '-y', '-o' + dir, inner], dir)
        targets.push(dir)
      }
      if (targets.length === 0) throw new Error('Не удалось определить, куда восстановить сохранения — укажите папку вручную')
    } else {
      const dir = local[0]
      if (!dir) throw new Error('Папка сохранений не найдена — укажите её вручную')
      fs.mkdirSync(dir, { recursive: true })
      const b = await backupDir(app, sevenZip, dir, safe, stamp, '')
      if (b) backups.push(b)
      await run7z(sevenZip, ['x', '-y', '-o' + dir, zip], dir)
      targets.push(dir)
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
    pruneBackups(app, safe)
  }
  const s = scanDirs(targets)
  return { backup: backups[0] || '', backups, dirs: targets, fingerprint: fingerprintOf(s), files: s.files }
}

// ---------- передача ----------

function requestStream(method, url, { file, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.request(u, { method, headers, timeout: 120000 }, (res) => resolve(res))
    req.on('timeout', () => req.destroy(new Error('Нет ответа от хранилища')))
    req.on('error', reject)
    if (file) fs.createReadStream(file).on('error', reject).pipe(req)
    else req.end()
  })
}

/** Загрузить архив по ссылке сервера (PUT, размер и тип — как при выдаче ссылки) */
async function upload(url, file, contentType) {
  const size = fs.statSync(file).size
  const res = await requestStream('PUT', url, { file, headers: { 'Content-Type': contentType || 'application/zip', 'Content-Length': size } })
  let body = ''
  res.on('data', (d) => { if (body.length < 2000) body += d })
  await new Promise((r) => res.on('end', r))
  if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`Хранилище ответило ${res.statusCode}`)
  return true
}

/** Скачать архив по ссылке во временный файл */
async function download(app, url) {
  const res = await requestStream('GET', url)
  if (res.statusCode !== 200) { res.resume(); throw new Error(`Хранилище ответило ${res.statusCode}`) }
  const tmpDir = path.join(app.getPath('temp'), 'lustre-cloud-saves')
  fs.mkdirSync(tmpDir, { recursive: true })
  const file = path.join(tmpDir, `restore-${Date.now()}.zip`)
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file)
    res.pipe(out)
    out.on('finish', resolve)
    out.on('error', reject)
    res.on('error', reject)
  })
  return file
}

function removeTemp(file) {
  try { if (file && file.includes('lustre-cloud-saves')) fs.rmSync(file, { force: true }) } catch { /* ignore */ }
}

module.exports = { locate, pack, restore, upload, download, removeTemp, scanDir, fingerprintOf, expandPattern, contractPath, guessDirs, knownDirs }
