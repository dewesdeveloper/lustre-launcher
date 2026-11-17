// achievements.cjs — открытые достижения игр из репаков. Steam в репаке заменён эмулятором,
// и эмулятор сам записывает открытые достижения в файл. Здесь: найти эти файлы по appid игры
// Steam (и в папке самой игры), прочитать список открытых и следить за ним, пока идёт игра.
//
// Пути и форматы сверены с открытыми лаунчерами (Hydra, Achievement Watcher):
//   goldberg  — Goldberg / GSE / EMPRESS: achievements.json { "ИМЯ": { earned, earned_time } }
//   default   — CODEX / RUNE / RLE: [ИМЯ] Achieved=1 UnlockTime=…
//   onlinefix — OnlineFix: [ИМЯ] achieved=true timestamp=… (или Achieved=true TimeUnlocked=…)
//   skidrow   — SKIDROW: [Achievements] ИМЯ=1@…@время
//   rld       — RLD! / DODI: [ИМЯ] State=<hex uint32 LE> Time=<hex uint32 LE>
//   3dm       — 3DMGAME: [State] ИМЯ=0101, [Time] ИМЯ=<hex uint32 LE>
//   tenoke    — TENOKE: SteamData/user_stats.ini, [ACHIEVEMENTS] "ИМЯ" = {unlocked = true, time = …}
//   cream     — CreamAPI: [ИМЯ] achieved=true unlocktime=…
//   razor     — Razor1911: строки «ИМЯ 1 время»
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const POLL_MS = 4000
const MAX_FILE_BYTES = 4 * 1024 * 1024
const GAME_DIR_DEPTH = 8 // папки игр на Unreal глубокие (Engine/Binaries/ThirdParty/…)
const GAME_DIR_MAX_DIRS = 3000

function bases() {
  const home = os.homedir()
  const env = process.env
  const appData = env.APPDATA || path.join(home, 'AppData', 'Roaming')
  const localAppData = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const pub = path.join(env.PUBLIC || 'C:\\Users\\Public', 'Documents')
  let documents = path.join(home, 'Documents')
  try { documents = require('electron').app.getPath('documents') } catch { /* вне Electron (тесты) */ }
  return { appData, localAppData, pub, documents, programData: env.PROGRAMDATA || 'C:\\ProgramData' }
}

/** Известные места файлов достижений для appid: [{ file, kind }] (существование не проверяется) */
function knownFiles(appId) {
  const { appData, localAppData, pub, documents, programData } = bases()
  const id = String(appId)
  const f = (kind, ...parts) => ({ file: path.join(...parts), kind })
  return [
    f('goldberg', appData, 'GSE Saves', id, 'achievements.json'),
    f('goldberg', appData, 'Goldberg SteamEmu Saves', id, 'achievements.json'),
    f('goldberg', appData, 'EMPRESS', 'remote', id, 'achievements.json'),
    f('goldberg', pub, 'EMPRESS', id, 'remote', id, 'achievements.json'),
    f('default', pub, 'Steam', 'CODEX', id, 'achievements.ini'),
    f('default', appData, 'Steam', 'CODEX', id, 'achievements.ini'),
    f('default', pub, 'Steam', 'RUNE', id, 'achievements.ini'),
    f('default', appData, 'RLE', id, 'achievements.ini'),
    f('default', appData, 'RLE', id, 'Achievements.ini'),
    f('onlinefix', pub, 'OnlineFix', id, 'Stats', 'Achievements.ini'),
    f('onlinefix', pub, 'OnlineFix', id, 'Achievements.ini'),
    f('skidrow', documents, 'SKIDROW', id, 'SteamEmu', 'UserStats', 'achiev.ini'),
    f('skidrow', documents, 'Player', id, 'SteamEmu', 'UserStats', 'achiev.ini'),
    f('skidrow', localAppData, 'SKIDROW', id, 'SteamEmu', 'UserStats', 'achiev.ini'),
    f('rld', programData, 'RLD!', id, 'achievements.ini'),
    f('rld', programData, 'Steam', 'Player', id, 'stats', 'achievements.ini'),
    f('rld', programData, 'Steam', 'RLD!', id, 'stats', 'achievements.ini'),
    f('rld', programData, 'Steam', 'dodi', id, 'stats', 'achievements.ini'),
    f('cream', appData, 'CreamAPI', id, 'stats', 'CreamAPI.Achievements.cfg'),
    f('razor', appData, '.1911', id, 'achievement'),
  ]
}

/**
 * Файлы в папке игры (неглубокий обход):
 *   SteamData/user_stats.ini        — TENOKE
 *   3DMGAME/<профиль>/stats/achievements.ini — 3DM
 *   <appid>/achievements.json|ini   — Goldberg с local_save, CODEX-подобные рядом с игрой
 */
function filesInGameDir(gameDir, appId) {
  const out = []
  if (!gameDir) return out
  const id = String(appId)
  const stack = [{ dir: gameDir, depth: 0 }]
  let visited = 0
  while (stack.length && visited < GAME_DIR_MAX_DIRS) {
    const { dir, depth } = stack.pop()
    visited++
    let items
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const it of items) {
      if (!it.isDirectory()) continue
      const full = path.join(dir, it.name)
      const lower = it.name.toLowerCase()
      if (lower === 'steamdata') {
        out.push({ file: path.join(full, 'user_stats.ini'), kind: 'tenoke' })
      } else if (lower === '3dmgame') {
        let profiles = []
        try { profiles = fs.readdirSync(full, { withFileTypes: true }).filter((p) => p.isDirectory()) } catch { /* нет доступа */ }
        for (const p of profiles) out.push({ file: path.join(full, p.name, 'stats', 'achievements.ini'), kind: '3dm' })
      } else if (it.name === id) {
        out.push({ file: path.join(full, 'achievements.json'), kind: 'goldberg' })
        out.push({ file: path.join(full, 'achievements.ini'), kind: 'default' })
        out.push({ file: path.join(full, 'Stats', 'Achievements.ini'), kind: 'onlinefix' })
      } else if (depth < GAME_DIR_DEPTH) {
        stack.push({ dir: full, depth: depth + 1 })
      }
    }
  }
  return out
}

// ---------- разбор ----------

const truthy = (v) => v === true || v === 1 || /^(1|true|yes)$/i.test(String(v ?? '').trim())

/** Время в секундах: секунды, миллисекунды или (у OnlineFix) микросекунды */
function toUnix(v) {
  const n = Number(String(v ?? '').trim())
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n > 1e14) return Math.floor(n / 1e6)
  if (n > 1e11) return Math.floor(n / 1000)
  return Math.floor(n)
}

/** hex-строка little-endian uint32 («01000000» → 1) */
function hexLE32(v) {
  const hex = String(v ?? '').trim().replace(/[^0-9a-f]/gi, '')
  if (hex.length < 2) return 0
  const buf = Buffer.from(hex.padEnd(8, '0').slice(0, 8), 'hex')
  return buf.length >= 4 ? buf.readUInt32LE(0) : 0
}

function iniParse(text) {
  const out = {}
  let cur = ''
  for (const raw of text.replace(/^\uFEFF/, '').split(/[\r\n]+/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    if (line.startsWith('[') && line.endsWith(']')) { cur = line.slice(1, -1).trim(); out[cur] ??= {}; continue }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    out[cur] ??= {}
    out[cur][line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

/** Значение ключа без учёта регистра */
const pick = (obj, ...keys) => {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) {
    const hit = Object.keys(obj).find((x) => x.toLowerCase() === k.toLowerCase())
    if (hit !== undefined) return obj[hit]
  }
  return undefined
}

const PARSERS = {
  goldberg(text) {
    const out = new Map()
    let data
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { return out }
    const take = (name, v) => {
      if (!name || !v || typeof v !== 'object') return
      if (truthy(v.earned) || truthy(v.achieved) || truthy(v.unlocked)) out.set(String(name), toUnix(v.earned_time ?? v.unlock_time ?? v.time ?? 0))
    }
    if (Array.isArray(data)) for (const v of data) take(v?.name || v?.apiname, v)
    else if (data && typeof data === 'object') for (const [k, v] of Object.entries(data)) take(k, v)
    return out
  },
  default(text) {
    const out = new Map()
    for (const [name, kv] of Object.entries(iniParse(text))) {
      if (/^steamachievements$/i.test(name)) {
        // CODEX: список «00000=ИМЯ» — имена открытых (время — в разделах самих достижений)
        for (const [k, v] of Object.entries(kv)) if (/^\d+$/.test(k) && v && !out.has(v)) out.set(v, 0)
        continue
      }
      if (truthy(pick(kv, 'Achieved'))) out.set(name, toUnix(pick(kv, 'UnlockTime')))
    }
    return out
  },
  onlinefix(text) {
    const out = new Map()
    for (const [name, kv] of Object.entries(iniParse(text))) {
      if (truthy(pick(kv, 'achieved'))) out.set(name, toUnix(pick(kv, 'timestamp', 'TimeUnlocked', 'UnlockTime')))
    }
    return out
  },
  skidrow(text) {
    const out = new Map()
    const sec = pick(iniParse(text), 'Achievements') || {}
    for (const [name, v] of Object.entries(sec)) {
      const parts = String(v).split('@')
      if (parts[0].trim() === '1') out.set(name, toUnix(parts[parts.length - 1]))
    }
    return out
  },
  rld(text) {
    const out = new Map()
    for (const [name, kv] of Object.entries(iniParse(text))) {
      if (/^steam$/i.test(name)) continue
      const state = pick(kv, 'State')
      if (state != null && hexLE32(state) === 1) out.set(name, hexLE32(pick(kv, 'Time')))
    }
    return out
  },
  '3dm'(text) {
    const out = new Map()
    const ini = iniParse(text)
    const state = pick(ini, 'State') || {}
    const time = pick(ini, 'Time') || {}
    for (const [name, v] of Object.entries(state)) if (String(v).trim() === '0101') out.set(name, hexLE32(time[name]))
    return out
  },
  tenoke(text) {
    const out = new Map()
    const sec = pick(iniParse(text), 'ACHIEVEMENTS') || {}
    for (const [rawName, v] of Object.entries(sec)) {
      const s = String(v)
      if (!/\bunlocked\s*=\s*true\b/i.test(s)) continue
      const t = /(?:^|[{,\s])time\s*=\s*(\d+)/i.exec(s)
      out.set(rawName.replace(/"/g, '').trim(), t ? toUnix(t[1]) : 0)
    }
    return out
  },
  cream(text) {
    const out = new Map()
    for (const [name, kv] of Object.entries(iniParse(text))) if (truthy(pick(kv, 'achieved'))) out.set(name, toUnix(pick(kv, 'unlocktime')))
    return out
  },
  razor(text) {
    const out = new Map()
    for (const line of text.split(/[\r\n]+/)) {
      const [name, unlocked, time] = line.trim().split(/\s+/)
      if (name && unlocked === '1') out.set(name, toUnix(time))
    }
    return out
  },
}

function parseFile({ file, kind }) {
  let st
  try { st = fs.statSync(file) } catch { return null }
  if (!st.isFile() || st.size > MAX_FILE_BYTES) return null
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return null }
  try { return (PARSERS[kind] || PARSERS.default)(text) } catch { return null }
}

// ---------- поиск, чтение, слежение ----------

/** Файлы достижений игры, которые есть на диске: [{ file, kind }] */
function findFiles(appId, gameDir) {
  if (!appId && !gameDir) return []
  const seen = new Set()
  const out = []
  for (const f of [...(appId ? knownFiles(appId) : []), ...filesInGameDir(gameDir, appId)]) {
    const key = path.normalize(f.file).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    try { if (fs.statSync(f.file).isFile()) out.push(f) } catch { /* нет файла */ }
  }
  return out
}

/** Открытые достижения: { files, unlocked: [{ name, unlocked_at }] } (самое раннее время из всех файлов) */
function read(appId, gameDir, files) {
  const list = files || findFiles(appId, gameDir)
  const all = new Map()
  for (const f of list) {
    const m = parseFile(f)
    if (!m) continue
    for (const [name, at] of m) {
      if (!name) continue
      const prev = all.get(name)
      if (prev === undefined || (at && (!prev || at < prev))) all.set(name, at)
    }
  }
  return { files: list.map((f) => f.file), unlocked: [...all].map(([name, unlocked_at]) => ({ name, unlocked_at })) }
}

/**
 * Следить за достижениями во время игры. onNew([{name, unlocked_at}]) — открыты новые.
 * Файлы ищутся заново раз в минуту: эмулятор создаёт файл при первом достижении.
 * Возвращает функцию остановки.
 */
function watch(appId, gameDir, onNew) {
  let files = findFiles(appId, gameDir)
  const known = new Set(read(appId, gameDir, files).unlocked.map((u) => u.name))
  let mtimes = new Map(files.map((f) => [f.file, mtimeOf(f.file)]))
  let ticks = 0
  const timer = setInterval(() => {
    ticks++
    if (ticks % Math.round(60000 / POLL_MS) === 0) files = findFiles(appId, gameDir)
    let changed = false
    for (const f of files) {
      const m = mtimeOf(f.file)
      if (m !== mtimes.get(f.file)) { changed = true; mtimes.set(f.file, m) }
    }
    if (!changed) return
    const fresh = read(appId, gameDir, files).unlocked.filter((u) => !known.has(u.name))
    if (fresh.length === 0) return
    for (const u of fresh) known.add(u.name)
    try { onNew(fresh) } catch (err) { console.warn('[Achievements]', err?.message || err) }
  }, POLL_MS)
  return () => { clearInterval(timer); mtimes = new Map() }
}

function mtimeOf(f) {
  try { return fs.statSync(f).mtimeMs } catch { return 0 }
}

module.exports = { findFiles, read, watch, PARSERS, hexLE32 }
