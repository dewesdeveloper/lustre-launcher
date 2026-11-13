// Ren'Py: извлечение текста из скомпилированных скриптов (.rpyc, в том числе внутри .rpa)
// и установка перевода без пересборки игры.
//
// Перевод ставится «поверх»: в game/ кладутся два файла —
//   zz_lustre_ru.rpy  — хук: config.say_menu_text_filter (реплики и меню) +
//                       config.replace_text (тексты интерфейса) + замена шрифтов без кириллицы;
//   lustre_ru.json    — словарь «оригинал → перевод».
// Оригинальные файлы игры не меняются; откат = удалить эти файлы (и скомпилированный .rpyc хука).
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { loads, PyObject } = require('./pickle.cjs')
const { hasCyrillic } = require('./fontcheck.cjs')

const HOOK = 'zz_lustre_ru.rpy'
const DATA = 'lustre_ru.json'

// --- поиск игры ---

function findGameDir(root) {
  const cands = [root]
  try {
    for (const d of fs.readdirSync(root, { withFileTypes: true })) if (d.isDirectory()) cands.push(path.join(root, d.name))
  } catch { /* нет доступа */ }
  for (const dir of cands) {
    const game = path.join(dir, 'game')
    if (!fs.existsSync(game)) continue
    if (fs.existsSync(path.join(dir, 'renpy')) || fs.existsSync(path.join(dir, 'lib'))) return game
    try {
      if (fs.readdirSync(game).some(f => /\.(rpa|rpyc)$/i.test(f))) return game
    } catch { /* пропускаем */ }
  }
  return null
}

function detect(root) {
  const gameDir = findGameDir(root)
  if (!gameDir) return null
  // Готовый русский перевод от авторов (game/tl/russian) — он лучше машинного
  const native = ['russian', 'ru', 'Russian'].some(l => fs.existsSync(path.join(gameDir, 'tl', l)))
  return { engine: 'renpy', gameDir, nativeRussian: native }
}

// --- архивы .rpa ---

// Индекс архива: { 'script.rpyc': [{ offset, length, prefix }] }
function readRpaIndex(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const head = Buffer.alloc(256)
    fs.readSync(fd, head, 0, 256, 0)
    const line = head.toString('latin1').split('\n')[0]
    const parts = line.split(' ')
    let offset, key = 0n
    if (parts[0] === 'RPA-3.0' || parts[0] === 'RPA-3.2') {
      offset = parseInt(parts[1], 16)
      // 3.2: ключ разбит на несколько чисел — XOR всех
      for (const k of parts.slice(2)) if (k.trim()) key ^= BigInt('0x' + k.trim())
    } else if (parts[0] === 'RPA-2.0') {
      offset = parseInt(parts[1], 16)
    } else {
      return null // нестандартный формат (защищённые архивы) — не трогаем
    }
    const size = fs.fstatSync(fd).size
    const buf = Buffer.alloc(size - offset)
    fs.readSync(fd, buf, 0, buf.length, offset)
    const index = loads(zlib.inflateSync(buf))
    const out = {}
    const entries = index instanceof Map ? index.entries() : Object.entries(index)
    for (const [name, list] of entries) {
      out[String(name).replace(/\\/g, '/')] = (list || []).map((e) => ({
        offset: Number(BigInt(e[0]) ^ key),
        length: Number(BigInt(e[1]) ^ key),
        prefix: e[2] ? Buffer.from(typeof e[2] === 'string' ? Buffer.from(e[2], 'latin1') : e[2]) : null,
      }))
    }
    return out
  } finally {
    fs.closeSync(fd)
  }
}

function readRpaFile(file, entry) {
  const fd = fs.openSync(file, 'r')
  try {
    const parts = []
    for (const { offset, length, prefix } of entry) {
      const plen = prefix ? prefix.length : 0
      const buf = Buffer.alloc(length - plen)
      fs.readSync(fd, buf, 0, buf.length, offset)
      if (prefix) parts.push(prefix)
      parts.push(buf)
    }
    return Buffer.concat(parts)
  } finally {
    fs.closeSync(fd)
  }
}

// Все файлы игры: свободные в game/ и упакованные в .rpa. Возвращает { rel → () => Buffer }
function listFiles(gameDir) {
  const files = new Map()
  const archives = []
  const walk = (dir) => {
    let items
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const d of items) {
      const p = path.join(dir, d.name)
      if (d.isDirectory()) { if (!/^(saves|cache|__pycache__)$/i.test(d.name)) walk(p) }
      else if (/\.rpa$/i.test(d.name)) archives.push(p)
      else files.set(path.relative(gameDir, p).replace(/\\/g, '/'), () => fs.readFileSync(p))
    }
  }
  walk(gameDir)
  const broken = []
  for (const a of archives) {
    let index = null
    try { index = readRpaIndex(a) } catch { /* битый архив */ }
    if (!index) { broken.push(path.basename(a)); continue }
    for (const [name, entry] of Object.entries(index)) {
      // свободный файл имеет приоритет над архивным, как в самом Ren'Py
      if (!files.has(name)) files.set(name, () => readRpaFile(a, entry))
    }
  }
  return { files, broken }
}

// --- скрипты .rpyc ---

function readRpyc(buf) {
  let data
  if (buf.toString('latin1', 0, 10) === 'RENPY RPC2') {
    let pos = 10
    for (;;) {
      const slot = buf.readUInt32LE(pos)
      const start = buf.readUInt32LE(pos + 4)
      const len = buf.readUInt32LE(pos + 8)
      pos += 12
      if (slot === 0) break
      if (slot === 1) { data = buf.subarray(start, start + len); break }
    }
  } else {
    data = buf
  }
  if (!data) return null
  const tree = loads(zlib.inflateSync(data))
  // (data, stmts)
  return Array.isArray(tree) ? tree[1] : tree
}

const cls = (o) => (o instanceof PyObject ? o.__class__ : '')
const str = (v) => (typeof v === 'string' ? v : (v instanceof PyObject && typeof v.__args__?.[0] === 'string' ? v.__args__[0] : null))

// Строковый литерал Python из исходника выражения: "Start", _("Start"), u'It\'s'
function pyLiteral(src) {
  if (typeof src !== 'string') src = str(src)
  if (!src) return null
  const m = src.match(/^\s*(?:_|__)?\(?\s*[uU]?([rR]?)("""|'''|"|')([\s\S]*?)\2\s*\)?\s*$/)
  if (!m) return null
  const raw = m[1]
  const body = m[3]
  if (raw) return body
  return body.replace(/\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|(.))/g, (s, x, u, c) =>
    x ? String.fromCharCode(parseInt(x, 16)) : u ? String.fromCharCode(parseInt(u, 16))
      : ({ n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' }[c] ?? s))
}

// Похоже ли на текст для игрока, а не на имя файла/идентификатор
function looksLikeText(s) {
  if (!s || s.length < 2) return false
  if (/\.(png|jpe?g|webp|ogg|mp3|wav|opus|ttf|otf|rpy|webm|mp4)$/i.test(s)) return false
  if (/^[a-z0-9_./#-]+$/.test(s)) return false // gui/button, #fff, var_name
  return /[A-Za-z]{2,}/.test(s)
}

// Обход AST: реплики (Say), варианты меню (Menu) и тексты экранов (SL2).
function collect(stmts, out) {
  const seen = new Set()
  const visit = (v) => {
    if (v == null || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    if (Array.isArray(v)) { for (const x of v) visit(x); return }
    if (v instanceof Map) { for (const x of v.values()) visit(x); return }
    if (!(v instanceof PyObject) && v.constructor !== Object) return
    const c = cls(v)
    // Перевод игры на другой язык (translate <lang> …) — пропускаем, нужен только оригинал
    if (/\.Translate$/.test(c) && v.language != null) return
    if (/\.TranslateString$/.test(c)) return
    if (/\.(Say|TranslateSay)$/.test(c)) {
      const what = str(v.what)
      if (what) out.push({ text: what, kind: 'say', who: str(v.who) || '' })
    } else if (/\.Menu$/.test(c) && Array.isArray(v.items)) {
      for (const it of v.items) {
        const label = Array.isArray(it) ? str(it[0]) : null
        if (label) out.push({ text: label, kind: 'menu' })
      }
    } else if (/\.SLDisplayable$/.test(c)) {
      const style = str(v.style) || ''
      if (/^(text|textbutton|label|button_text|tooltip)$/.test(style) || /text/.test(style)) {
        const lit = pyLiteral(v.positional?.[0])
        if (looksLikeText(lit)) out.push({ text: lit, kind: 'ui' })
      }
    }
    for (const k of Object.keys(v)) if (k !== '__class__') visit(v[k])
  }
  visit(stmts)
}

function extract(ctx) {
  const { files, broken } = listFiles(ctx.gameDir)
  const segments = []
  const errors = []
  let scripts = 0
  for (const [rel, read] of files) {
    if (!/\.rpyc$/i.test(rel) || /^tl\//i.test(rel) || /^renpy\//i.test(rel)) continue
    if (rel.toLowerCase() === HOOK.replace(/\.rpy$/, '.rpyc')) continue
    try {
      const stmts = readRpyc(read())
      if (stmts) { collect(stmts, segments); scripts++ }
    } catch (e) {
      errors.push(`${rel}: ${e.message}`)
    }
  }
  // Шрифты без кириллицы: подменим на встроенный DejaVuSans
  const badFonts = []
  for (const [rel, read] of files) {
    if (!/\.(ttf|otf|ttc)$/i.test(rel)) continue
    try { if (hasCyrillic(read()) === false) badFonts.push(rel) } catch { /* пропускаем */ }
  }
  return { segments, scripts, errors, broken, badFonts }
}

// --- установка / откат ---

const hookSource = () => `# Lustre: машинный перевод на русский (офлайн, Bergamot).
# Оригинальные файлы игры не изменены. Чтобы вернуть оригинал, удалите
# ${HOOK}, ${HOOK}c и ${DATA} из папки game (или нажмите «Откатить перевод» в Lustre).

init 999 python:
    def _lustre_load():
        import json
        try:
            f = renpy.file("${DATA}")
            try:
                return json.loads(f.read().decode("utf-8"))
            finally:
                f.close()
        except Exception:
            return {}

    _lustre_data = _lustre_load()

    def _lustre_make_say(table, prev):
        def f(s):
            s = table.get(s, s)
            if prev is not None:
                s = prev(s)
            return s
        return f

    def _lustre_make_ui(table, prev):
        def f(s):
            t = table.get(s)
            if t is None:
                k = s.strip()
                t = table.get(k)
                if t is not None:
                    t = s.replace(k, t)
            if t is not None:
                s = t
            if prev is not None:
                s = prev(s)
            return s
        return f

    if _lustre_data:
        config.say_menu_text_filter = _lustre_make_say(_lustre_data.get("say", {}), config.say_menu_text_filter)
        config.replace_text = _lustre_make_ui(_lustre_data.get("ui", {}), getattr(config, "replace_text", None))
        for _lustre_font in _lustre_data.get("fonts", []):
            for _lustre_b in (False, True):
                for _lustre_i in (False, True):
                    config.font_replacement_map[(_lustre_font, _lustre_b, _lustre_i)] = ("DejaVuSans.ttf", _lustre_b, _lustre_i)
        _lustre_font = _lustre_b = _lustre_i = None
`

async function apply(ctx, { say, ui, fonts }) {
  await fs.promises.writeFile(path.join(ctx.gameDir, DATA), JSON.stringify({ lang: 'ru', say, ui, fonts }), 'utf8')
  await fs.promises.writeFile(path.join(ctx.gameDir, HOOK), hookSource(), 'utf8')
  // старый скомпилированный хук пересоберётся из нового .rpy
  await fs.promises.rm(path.join(ctx.gameDir, HOOK + 'c'), { force: true })
}

async function revert(ctx) {
  for (const f of [HOOK, HOOK + 'c', DATA]) await fs.promises.rm(path.join(ctx.gameDir, f), { force: true })
  // кэш байткода Ren'Py 8 для хука
  await fs.promises.rm(path.join(ctx.gameDir, 'cache', 'bytecode-' + HOOK), { force: true }).catch(() => {})
}

function isApplied(ctx) {
  return fs.existsSync(path.join(ctx.gameDir, HOOK)) && fs.existsSync(path.join(ctx.gameDir, DATA))
}

module.exports = { id: 'renpy', title: "Ren'Py", detect, extract, apply, revert, isApplied, _internal: { readRpyc, readRpaIndex, listFiles, pyLiteral } }
