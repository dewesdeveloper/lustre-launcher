// crackApply.cjs — поиск кряков в скачанной раздаче и установка выбранного поверх игры.
//
// Сценовые релизы и часть репаков кладут кряк отдельно от установщика: папки RUNE\, FLT\,
// CODEX\, Crack\ в образе или архивы «Crack [RUNE].rar». Тихая установка ставит только игру,
// и без кряка она открывает Steam. Здесь: найти такие кряки и скопировать файлы кряка туда,
// где в игре лежат их оригиналы (steam_api64.dll, exe). Заменённые оригиналы сохраняются
// в <папка игры>\.lustre-original — кряк можно откатить.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')

const SEARCH_DEPTH = 4
const GAME_INDEX_DEPTH = 8
const MAX_ENTRIES = 30000
const MAX_ARCHIVE_BYTES = 400 * 1024 * 1024
const BACKUP_DIR = '.lustre-original'

const GROUPS = ['RUNE', 'FLT', 'CODEX', 'TENOKE', 'EMPRESS', 'SKIDROW', 'PLAZA', 'RELOADED', 'RAZOR1911', 'HOODLUM', 'CPY', 'DARKSiDERS', 'DOGE', 'ElAmigos', 'Goldberg', 'OnlineFix', '0xdeadc0de', 'P2P']
const GROUP_RE = new RegExp(`(^|[^a-z0-9])(${GROUPS.join('|')})([^a-z0-9]|$)`, 'i')
// папка кряка: «Crack», «Cracks», «RUNE», «Crack [FLT]», «Crack only», «Goldberg emu»…
const CRACK_DIR_RE = new RegExp(`crack|^(${GROUPS.join('|')})$|steam.?emu|^fix$|^update.*crack`, 'i')
const CRACK_ARCHIVE_RE = new RegExp(`(crack|${GROUPS.join('|')}).*\\.(rar|zip|7z)$`, 'i')
// файлы кряка, по которым видно, что в папке именно кряк
const PAYLOAD_RE = /^(steam_api(64)?\.dll|steam_emu\.ini|steam_api(64)?\.ini|steamclient(64)?\.dll|onlinefix(64)?\.(dll|ini)|cream_api\.ini|.*\.cdx|(rune|codex|flt|tenoke|empress)\.ini)$/i
// не копировать: описания релиза, ссылки, картинки
const SKIP_RE = /\.(nfo|diz|url|sfv|md5|jpg|jpeg|png|gif|bmp|lnk)$|^(readme|read me|install|_install|инструкция|how to).*\.txt$|^file_id\.diz$/i


function walk(root, maxDepth, onEntry) {
  const stack = [{ dir: root, depth: 0 }]
  let seen = 0
  while (stack.length && seen < MAX_ENTRIES) {
    const cur = stack.pop()
    let items
    try { items = fs.readdirSync(cur.dir, { withFileTypes: true }) } catch { continue }
    for (const it of items) {
      seen++
      const full = path.join(cur.dir, it.name)
      if (onEntry(full, it, cur.depth) === false) continue
      if (it.isDirectory() && cur.depth < maxDepth) stack.push({ dir: full, depth: cur.depth + 1 })
    }
  }
}

/** Все файлы папки (рекурсивно) */
function listFiles(dir) {
  const out = []
  walk(dir, 12, (full, it) => { if (it.isFile()) out.push(full) })
  return out
}

/** Название группы кряка: по имени папки/архива, по файлам внутри или по .nfo */
function detectLabel(target, files) {
  const own = GROUP_RE.exec(path.basename(target))
  if (own) return own[2].toUpperCase() === 'DARKSIDERS' ? 'DARKSiDERS' : own[2].toUpperCase()
  for (const f of files) {
    const m = /^(rune|codex|flt|tenoke|empress)\.ini$/i.exec(path.basename(f))
    if (m) return m[1].toUpperCase()
    if (/onlinefix/i.test(path.basename(f))) return 'OnlineFix'
  }
  for (const f of files.filter((x) => /\.nfo$/i.test(x)).slice(0, 2)) {
    try {
      const m = GROUP_RE.exec(fs.readFileSync(f, 'latin1').slice(0, 20000))
      if (m) return m[2].toUpperCase()
    } catch { /* нет доступа */ }
  }
  return path.basename(target)
}

/**
 * Найти кряки в папках раздачи. roots — где искать (папка загрузки, распакованный образ,
 * сама игра). Возвращает [{ id, label, path, kind: 'dir' | 'archive', root }].
 */
function findCracks(roots) {
  const found = []
  const seen = new Set()
  for (const root of roots.filter(Boolean)) {
    let st
    try { st = fs.statSync(root) } catch { continue }
    if (st.isFile()) {
      // загрузка — один архив: смотрим соседние файлы
      if (CRACK_ARCHIVE_RE.test(path.basename(root)) && st.size < MAX_ARCHIVE_BYTES) add({ path: root, kind: 'archive', root: path.dirname(root) })
      continue
    }
    walk(root, SEARCH_DEPTH, (full, it) => {
      if (it.isDirectory()) {
        if (it.name === BACKUP_DIR) return false
        if (!CRACK_DIR_RE.test(it.name)) return true
        const files = listFiles(full)
        if (files.some((f) => PAYLOAD_RE.test(path.basename(f)))) {
          add({ path: full, kind: 'dir', root, files })
          return false // внутрь найденного кряка не спускаемся
        }
        return true
      }
      if (it.isFile() && CRACK_ARCHIVE_RE.test(it.name)) {
        try { if (fs.statSync(full).size < MAX_ARCHIVE_BYTES) add({ path: full, kind: 'archive', root }) } catch { /* ignore */ }
      }
      return true
    })
  }
  function add(c) {
    const key = path.normalize(c.path).toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    const label = detectLabel(c.path, c.files || [])
    found.push({ id: key, label, path: c.path, kind: c.kind, root: c.root })
  }
  // RUNE — первым: с ним в лаунчере работают достижения
  return found.sort((a, b) => Number(/^rune$/i.test(b.label)) - Number(/^rune$/i.test(a.label)))
}

function run7z(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => (code === 0 || code === 1 ? resolve() : reject(new Error(`7-Zip: код ${code} ${err.trim().slice(0, 160)}`))))
  })
}

/** Индекс файлов игры: имя (в нижнем регистре) → пути */
function indexGame(gameDir) {
  const idx = new Map()
  walk(gameDir, GAME_INDEX_DEPTH, (full, it) => {
    if (it.isDirectory()) return it.name !== BACKUP_DIR
    if (!it.isFile()) return true
    const k = it.name.toLowerCase()
    if (!idx.has(k)) idx.set(k, [])
    idx.get(k).push(full)
    return true
  })
  return idx
}

/** Из нескольких одноимённых файлов игры — тот, чей путь сильнее похож на путь в кряке */
function bestMatch(candidates, crackRel) {
  if (candidates.length === 1) return candidates[0]
  const want = crackRel.toLowerCase().split(/[\\/]/).reverse()
  let best = candidates[0]
  let bestScore = -1
  for (const c of candidates) {
    const parts = c.toLowerCase().split(/[\\/]/).reverse()
    let score = 0
    while (score < want.length && parts[score] === want[score]) score++
    if (score > bestScore) { best = c; bestScore = score }
  }
  return best
}

/**
 * Поставить кряк поверх игры. Оригиналы заменённых файлов — в <игра>\.lustre-original.
 * Итог: { ok, label, copied } или { error }.
 */
async function apply(crack, gameDir, sevenZip) {
  let srcDir = crack.path
  let temp = ''
  try {
    if (crack.kind === 'archive') {
      if (!sevenZip) return { error: 'Встроенный 7-Zip не найден' }
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lustre-crack-'))
      await run7z(sevenZip, ['x', '-y', '-plustre', '-o' + temp, crack.path])
      srcDir = temp
    }
    const files = listFiles(srcDir).filter((f) => !SKIP_RE.test(path.basename(f)))
    if (files.length === 0) return { error: 'В кряке нет файлов' }
    const idx = indexGame(gameDir)

    // Опорный файл: steam_api*.dll (или exe), который есть и в кряке, и в игре. Папка кряка
    // с ним совмещается с папкой игры, где лежит оригинал, — остальные файлы кладутся рядом.
    const keyOrder = (f) => (/^steam_api(64)?\.dll$/i.test(path.basename(f)) ? 0 : /\.exe$/i.test(f) ? 1 : 2)
    const keys = files.filter((f) => idx.has(path.basename(f).toLowerCase())).sort((a, b) => keyOrder(a) - keyOrder(b))
    let crackAnchor
    let gameAnchor
    if (keys.length) {
      const k = keys[0]
      const match = bestMatch(idx.get(path.basename(k).toLowerCase()), path.relative(srcDir, k))
      crackAnchor = path.dirname(k)
      gameAnchor = path.dirname(match)
    } else {
      // одноимённых файлов нет: кряк повторяет структуру папки игры от корня
      const top = new Set(fs.readdirSync(gameDir).map((n) => n.toLowerCase()))
      const crackTop = fs.readdirSync(srcDir)
      if (!crackTop.some((n) => top.has(n.toLowerCase()))) return { error: 'Не удалось понять, куда класть файлы кряка' }
      crackAnchor = srcDir
      gameAnchor = gameDir
    }

    const backupRoot = path.join(gameDir, BACKUP_DIR, new Date().toISOString().replace(/[:.]/g, '-'))
    let copied = 0
    for (const f of files) {
      const rel = path.relative(crackAnchor, f)
      let dest
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        dest = path.join(gameAnchor, rel)
      } else {
        // файл выше опорной папки: кладём к одноимённому файлу игры, а если такого нет — в корень игры
        const same = idx.get(path.basename(f).toLowerCase())
        dest = same ? bestMatch(same, path.relative(srcDir, f)) : path.join(gameDir, path.relative(srcDir, f))
      }
      if (!path.resolve(dest).toLowerCase().startsWith(path.resolve(gameDir).toLowerCase() + path.sep)) continue // за пределы игры — нельзя
      if (fs.existsSync(dest)) {
        const backup = path.join(backupRoot, path.relative(gameDir, dest))
        fs.mkdirSync(path.dirname(backup), { recursive: true })
        fs.copyFileSync(dest, backup)
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(f, dest)
      copied++
    }
    return { ok: true, label: crack.label, copied }
  } catch (err) {
    return { error: String(err?.message || err) }
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true })
  }
}

module.exports = { findCracks, apply }
