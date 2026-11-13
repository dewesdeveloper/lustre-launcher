// Godot 3 / 4: извлечение текста из ресурс-пака (.pck отдельно или внутри exe)
// и установка перевода без пересборки игры.
//
// Перевод ставится «поверх» стандартными средствами движка:
//   override.cfg       — рядом с exe; Godot читает его при запуске и добавляет нашу автозагрузку;
//   lustre_tl.gd       — автозагрузка: регистрирует Translation (оригинал → перевод) для локали ru
//                        и включает её. Label/Button/RichTextLabel и tr() переводятся движком сами;
//   lustre_ru.json     — словарь перевода.
// Оригинальные файлы игры не меняются; откат = удалить эти файлы (свой override.cfg игры восстанавливается).
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const HOOK = 'lustre_tl.gd'
const DATA = 'lustre_ru.json'
const OVERRIDE = 'override.cfg'
const OVERRIDE_BACKUP = 'override.cfg.lustre-orig'
const MAGIC = 0x43504447 // 'GDPC'

// --- поиск пака ---

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len)
  const n = fs.readSync(fd, b, 0, len, pos)
  return n === len ? b : b.subarray(0, n)
}

// Секция "pck" в PE (Godot 4 встраивает пак так, чтобы exe можно было подписать)
function peSectionOffset(fd) {
  try {
    const dos = readAt(fd, 0, 64)
    if (dos.toString('latin1', 0, 2) !== 'MZ') return 0
    const pe = dos.readUInt32LE(0x3c)
    const hdr = readAt(fd, pe, 24)
    if (hdr.toString('latin1', 0, 4) !== 'PE\0\0') return 0
    const nsec = hdr.readUInt16LE(6)
    const optSize = hdr.readUInt16LE(20)
    const secs = readAt(fd, pe + 24 + optSize, nsec * 40)
    for (let i = 0; i < nsec; i++) {
      const name = secs.toString('latin1', i * 40, i * 40 + 8).replace(/\0+$/, '')
      if (name === 'pck') return secs.readUInt32LE(i * 40 + 20) // PointerToRawData
    }
  } catch { /* не PE */ }
  return 0
}

// Начало пака в файле: сам .pck, секция pck в exe или пак, дописанный в конец exe
function findPackStart(fd, size) {
  if (size >= 4 && readAt(fd, 0, 4).readUInt32LE(0) === MAGIC) return 0
  const sec = peSectionOffset(fd)
  if (sec) {
    for (let i = 0; i < 8; i++) if (readAt(fd, sec + i, 4).readUInt32LE(0) === MAGIC) return sec + i
  }
  if (size > 16) {
    const tail = readAt(fd, size - 12, 12)
    if (tail.readUInt32LE(8) === MAGIC) {
      const ds = Number(tail.readBigUInt64LE(0))
      const start = size - 12 - ds
      if (start >= 0 && readAt(fd, start, 4).readUInt32LE(0) === MAGIC) return start
    }
  }
  return -1
}

// Каталог пака: { version, godot: [major, minor, patch], encrypted, files: [{ path, offset, size, encrypted }] }
function readPack(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const start = findPackStart(fd, size)
    if (start < 0) return null
    const h = readAt(fd, start, 4 + 4 * 4 + 4 + 8 + 8)
    const version = h.readUInt32LE(4)
    const godot = [h.readUInt32LE(8), h.readUInt32LE(12), h.readUInt32LE(16)]
    let pos
    let fileBase = 0
    let encryptedDir = false
    if (version === 1) {
      pos = start + 20 + 16 * 4
    } else if (version === 2 || version === 3) {
      const flags = h.readUInt32LE(20)
      encryptedDir = !!(flags & 1)
      const rel = !!(flags & 2)
      fileBase = Number(h.readBigUInt64LE(24))
      if (version === 3 || rel) fileBase += start
      if (version === 3) pos = Number(h.readBigUInt64LE(32)) + start
      else pos = start + 32 + 16 * 4
    } else {
      return { version, godot, unsupported: true, files: [] }
    }
    if (encryptedDir) return { version, godot, encrypted: true, files: [] }
    const count = readAt(fd, pos, 4).readUInt32LE(0)
    pos += 4
    const files = []
    for (let i = 0; i < count; i++) {
      const sl = readAt(fd, pos, 4).readUInt32LE(0)
      pos += 4
      const p = readAt(fd, pos, sl).toString('utf8').replace(/\0+$/, '')
      pos += sl
      const meta = readAt(fd, pos, version === 1 ? 32 : 36)
      pos += meta.length
      const offset = Number(meta.readBigUInt64LE(0))
      const fsize = Number(meta.readBigUInt64LE(8))
      const flags = version === 1 ? 0 : meta.readUInt32LE(32)
      if (flags & 2) continue // файл удалён патчем
      files.push({ path: p.replace(/^res:\/\//, ''), offset: fileBase + offset, size: fsize, encrypted: !!(flags & 1) })
    }
    return { version, godot, files }
  } finally {
    fs.closeSync(fd)
  }
}

function readPackFile(file, entry) {
  const fd = fs.openSync(file, 'r')
  try { return readAt(fd, entry.offset, entry.size) } finally { fs.closeSync(fd) }
}

function listDir(root) {
  try { return fs.readdirSync(root, { withFileTypes: true }) } catch { return [] }
}

function detect(root) {
  const dirs = [root, ...listDir(root).filter(d => d.isDirectory()).map(d => path.join(root, d.name))]
  for (const dir of dirs) {
    const entries = listDir(dir).filter(d => d.isFile())
    const names = entries.map(d => d.name)
    // 1) game.exe + game.pck
    for (const n of names) {
      if (!/\.pck$/i.test(n)) continue
      const base = n.replace(/\.pck$/i, '')
      const exe = names.find(x => x.toLowerCase() === (base + '.exe').toLowerCase())
      if (!exe) continue
      const pack = readPack(path.join(dir, n))
      if (pack) return withNative({ engine: 'godot', dir, exe: path.join(dir, exe), packFile: path.join(dir, n), pack })
    }
    // 2) пак внутри exe (быстрая проверка: в exe есть строка «Godot Engine»)
    for (const n of names) {
      if (!/\.exe$/i.test(n) || /^(unins|crash|UnityCrash|notification_helper)/i.test(n)) continue
      const p = path.join(dir, n)
      let pack = null
      try { pack = readPack(p) } catch { /* не пак */ }
      if (pack) return withNative({ engine: 'godot', dir, exe: p, packFile: p, pack })
    }
  }
  return null
}

// Русский от авторов: файл перевода *.ru.translation в паке
const RU_TRANSLATION = /(^|[._/])ru([_-][A-Za-z]+)?\.translation$/i
function withNative(ctx) {
  ctx.nativeRussian = ctx.pack.files.some(f => RU_TRANSLATION.test(f.path))
  return ctx
}

const variantOf = (ctx) => `Godot ${ctx.pack?.godot?.[0] || '?'}`

// --- распаковка ресурсов ---

// Сжатые ресурсы Godot (RSCC / GCPF): блоки deflate/zstd/gzip
function decompressGodot(buf) {
  const magic = buf.toString('latin1', 0, 4)
  if (magic !== 'RSCC' && magic !== 'GCPF') return buf
  const mode = buf.readUInt32LE(4)
  const blockSize = buf.readUInt32LE(8)
  const total = buf.readUInt32LE(12)
  const bc = Math.floor(total / blockSize) + 1
  let pos = 16
  const sizes = []
  for (let i = 0; i < bc; i++) { sizes.push(buf.readUInt32LE(pos)); pos += 4 }
  const out = []
  for (const cs of sizes) {
    const chunk = buf.subarray(pos, pos + cs)
    pos += cs
    if (mode === 1) out.push(zlib.inflateSync(chunk))
    else if (mode === 2 && zlib.zstdDecompressSync) out.push(zlib.zstdDecompressSync(chunk))
    else if (mode === 3) out.push(zlib.gunzipSync(chunk))
    else return null // fastlz/brotli — не поддерживаем
  }
  return Buffer.concat(out)
}

// Скрипт в двоичных токенах Godot 4.3+: GDSC, версия, размер распакованного (0 — не сжат), zstd
function decodeGdc(buf) {
  if (buf.toString('latin1', 0, 4) !== 'GDSC') return buf
  const unpacked = buf.readUInt32LE(8)
  if (unpacked && buf.length > 12) {
    try { if (zlib.zstdDecompressSync) return zlib.zstdDecompressSync(buf.subarray(12)) } catch { /* формат 3.x */ }
  }
  return buf
}

// Нет управляющих символов, кроме \t и \n
const clean = (b) => b.every(c => c >= 0x20 || c === 0x09 || c === 0x0a)

const UTF8 = new TextDecoder('utf-8', { fatal: true })
function utf8(b) { try { return UTF8.decode(b) } catch { return null } }

// Строки с длиной в двоичных ресурсах и токенах:
//   A) ресурсы: [u32 len+1][utf8][\0]
//   B) Variant-строки (константы скриптов): [u32 type=4][u32 len][utf8][выравнивание до 4]
function scanBinaryStrings(buf, out) {
  const n = buf.length
  let i = 0
  while (i + 8 <= n) {
    const len = buf.readUInt32LE(i)
    if (len >= 3 && len < 8192 && i + 4 + len <= n) {
      // A
      if (buf[i + 4 + len - 1] === 0) {
        const body = buf.subarray(i + 4, i + 4 + len - 1)
        if (clean(body)) {
          const s = utf8(body)
          if (s != null) { out.push(s); i += 4 + len; continue }
        }
      }
      // B
      if (i >= 4 && (buf.readUInt32LE(i - 4) & 0xff) === 4) {
        const body = buf.subarray(i + 4, i + 4 + len)
        if (clean(body)) {
          const s = utf8(body)
          if (s != null) { out.push(s); i += 4 + len; continue }
        }
      }
    }
    i++
  }
}

// Строковые литералы в тексте (.gd, .tscn, .tres) с разбором экранирования
function scanTextLiterals(text, out, { tscn = false } = {}) {
  const lines = tscn ? text.split('\n').filter(l => !l.startsWith('[')).join('\n') : text.replace(/^\s*#.*$/gm, '')
  const re = /(?<![&^$@])("""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')/g
  for (const m of lines.matchAll(re)) {
    let s = m[1]
    s = s.startsWith('"""') ? s.slice(3, -3) : s.slice(1, -1)
    out.push(s.replace(/\\(?:u([0-9a-fA-F]{4})|(.))/g, (x, u, c) =>
      u ? String.fromCharCode(parseInt(u, 16)) : ({ n: '\n', t: '\t', r: '\r', '"': '"', "'": "'", '\\': '\\' }[c] ?? x)))
  }
}

function scanJson(text, out) {
  let data
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { return }
  const walk = (v) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(data)
}

// Текст для игрока, а не путь/идентификатор/имя сигнала
function looksLikeText(s) {
  if (!s || s.length < 2 || s.length > 4000) return false
  if (!/[A-Za-z]{2,}/.test(s)) return false
  if (/^(res|user|uid|http|https):\/\//.test(s)) return false
  if (/\.(png|jpe?g|webp|svg|ogg|mp3|wav|tscn|scn|tres|res|gd|gdc|json|ttf|otf|import|ctex|shader|gdshader)$/i.test(s)) return false
  if (/^[a-z0-9_]+$/.test(s)) return false // snake_case, signal_name
  if (/^[A-Z0-9_]+$/.test(s) && s.includes('_')) return false // TRANSLATION_KEY
  if (/^[A-Za-z]+[A-Z][a-z]+[A-Za-z]*$/.test(s) && !/\s/.test(s)) return false // CamelCase: имена узлов и классов
  if (/^[\w./:@$%-]+$/.test(s) && /[/:@$]/.test(s)) return false // пути узлов, свойства
  if (/^[#$%@]/.test(s) && !/\s/.test(s)) return false
  if (GODOT_NAMES.has(s)) return false
  return true
}

// Имена классов и служебные слова из таблиц строк двоичных сцен
const GODOT_NAMES = new Set(('Node Node2D Node3D Control Label Button Script Resource Texture Sprite Sprite2D Sprite3D ' +
  'AnimationPlayer AnimatedSprite Timer Area Area2D Camera Camera2D Camera3D Panel Container VBoxContainer HBoxContainer ' +
  'MarginContainer CenterContainer GridContainer ScrollContainer TextureRect ColorRect RichTextLabel LineEdit TextEdit ' +
  'AudioStreamPlayer CanvasLayer Tween Theme Font Main Root Background Sprite Animation Collision Shape Rect Position ' +
  'Viewport World Environment Light Mesh Material Shader Path Polygon Line Tile TileMap TileSet Scene Player').split(/\s+/))

const SKIP_EXT = /\.(ctex|stex|png|jpe?g|webp|ogg|oggvorbisstr|mp3|wav|sample|wasm|so|dll|mesh|import|md5|ttf|otf|fontdata|res\.remap|remap|glb|gltf|ogv|webm|scn\.remap|bin|ctex\.import)$/i

function extract(ctx) {
  const { pack, packFile } = ctx
  if (pack.encrypted) throw new Error('Пак игры зашифрован — перевести без ключа нельзя')
  if (pack.unsupported) throw new Error(`Неизвестный формат пака (версия ${pack.version})`)
  const raw = []
  const errors = []
  let scripts = 0
  let encryptedFiles = 0
  let nativeRussian = false
  for (const f of pack.files) {
    if (RU_TRANSLATION.test(f.path)) nativeRussian = true
    if (SKIP_EXT.test(f.path) || f.size > 32 * 1024 * 1024) continue
    if (f.encrypted || /\.gde$/i.test(f.path)) { encryptedFiles++; continue }
    const ext = path.extname(f.path).toLowerCase()
    if (!['.tscn', '.tres', '.gd', '.json', '.scn', '.res', '.gdc', '.dialogue', '.dtl', '.csv', '.translation', '.txt'].includes(ext)) continue
    try {
      let buf = readPackFile(packFile, f)
      const out = []
      if (ext === '.tscn' || ext === '.tres') scanTextLiterals(buf.toString('utf8'), out, { tscn: true })
      else if (ext === '.gd') scanTextLiterals(buf.toString('utf8'), out)
      else if (ext === '.json') scanJson(buf.toString('utf8'), out)
      else if (ext === '.csv') {
        const head = buf.toString('utf8').split(/\r?\n/, 1)[0].toLowerCase().split(',')
        if (head.some(h => /^ru([_-]|$)/.test(h.trim()))) nativeRussian = true
        continue // таблицы локализации CSV в экспорт обычно не попадают; ключи переводятся через .translation
      } else if (ext === '.txt' || ext === '.dialogue' || ext === '.dtl') {
        // построчно: реплики диалоговых плагинов (Dialogue Manager / Dialogic)
        for (const line of buf.toString('utf8').split(/\r?\n/)) {
          const t = line.replace(/^\s*(?:-\s+|[^:\n]{1,40}:\s+)?/, '').trim()
          if (t && !/^(~|#|=>|if |elif |else|do |set |\[|\{)/.test(line.trim())) out.push(t)
        }
      } else {
        if (ext === '.gdc') buf = decodeGdc(buf)
        else buf = decompressGodot(buf) || buf
        scanBinaryStrings(buf, out)
      }
      if (/\.(gd|gdc)$/i.test(ext)) scripts++
      for (const s of out) raw.push({ text: s, file: f.path })
    } catch (e) {
      errors.push(`${f.path}: ${e.message}`)
    }
  }
  const segments = []
  for (const { text } of raw) if (looksLikeText(text)) segments.push({ text, kind: 'ui' })
  return { segments, scripts, errors, broken: encryptedFiles ? [`зашифрованные скрипты: ${encryptedFiles}`] : [], badFonts: [], nativeRussian }
}

// --- установка / откат ---

const hookGodot4 = () => `# Lustre: машинный перевод на русский (офлайн, Bergamot). Оригинальные файлы игры не изменены.
# Чтобы вернуть оригинал, удалите ${HOOK}, ${DATA} и строку LustreTL из ${OVERRIDE} (или нажмите «Откатить перевод» в Lustre).
extends Node

var _tr: Translation
var _table: Dictionary = {}
var _tick := 0.0

func _enter_tree() -> void:
	var f := FileAccess.open(OS.get_executable_path().get_base_dir().path_join("${DATA}"), FileAccess.READ)
	if f == null:
		return
	var data = JSON.parse_string(f.get_as_text())
	if typeof(data) != TYPE_DICTIONARY:
		return
	_table = data.get("tr", {})
	_tr = Translation.new()
	_tr.locale = "ru"
	for k in _table:
		_tr.add_message(k, _table[k])
	_add_keyed()
	TranslationServer.add_translation(_tr)
	_force_locale()
	get_tree().node_added.connect(_on_node_added)

# Godot до 4.3 не переводит BBCode-текст RichTextLabel из сцены, пока не сменится язык — напоминаем
func _on_node_added(node: Node) -> void:
	if node is RichTextLabel:
		node.notification.call_deferred(NOTIFICATION_TRANSLATION_CHANGED)

# Игра с ключами (tr("MENU_START")): берём английский текст ключа и подставляем наш перевод
func _add_keyed() -> void:
	for loc in TranslationServer.get_loaded_locales():
		if not str(loc).begins_with("en"):
			continue
		var t = TranslationServer.get_translation_object(loc)
		if t == null or t == _tr or t.get_class() != "Translation":
			continue
		for key in t.get_message_list():
			var en = str(t.get_message(key))
			if _table.has(en):
				_tr.add_message(key, _table[en])

# Английская (или стандартная) локаль → русская; если игрок выбрал другой язык — не трогаем
func _force_locale() -> void:
	var loc := TranslationServer.get_locale()
	if loc == "" or loc.begins_with("en"):
		TranslationServer.set_locale("ru")

func _process(delta: float) -> void:
	_tick += delta
	if _tick > 1.0:
		_tick = 0.0
		if _tr != null:
			_force_locale()
`

const hookGodot3 = () => `# Lustre: машинный перевод на русский (офлайн, Bergamot). Оригинальные файлы игры не изменены.
# Чтобы вернуть оригинал, удалите ${HOOK}, ${DATA} и строку LustreTL из ${OVERRIDE} (или нажмите «Откатить перевод» в Lustre).
extends Node

var _tr = null
var _tick = 0.0
var _font = null
var _fonts_done = {}

func _enter_tree():
	var f = File.new()
	if f.open(OS.get_executable_path().get_base_dir().plus_file("${DATA}"), File.READ) != OK:
		return
	var res = JSON.parse(f.get_as_text())
	f.close()
	if res.error != OK or typeof(res.result) != TYPE_DICTIONARY:
		return
	var table = res.result.get("tr", {})
	_tr = Translation.new()
	_tr.locale = "ru"
	for k in table:
		_tr.add_message(k, table[k])
	TranslationServer.add_translation(_tr)
	_force_locale()
	# В Godot 3 у шрифтов нет системного запасного: добавляем Arial/Segoe UI для кириллицы
	for p in ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]:
		if File.new().file_exists(p):
			_font = DynamicFontData.new()
			_font.font_path = p
			break
	get_tree().connect("node_added", self, "_on_node_added")

func _force_locale():
	var loc = TranslationServer.get_locale()
	if loc == "" or loc.begins_with("en"):
		TranslationServer.set_locale("ru")

func _on_node_added(node):
	if _font == null or not (node is Control):
		return
	for name in ["font", "normal_font", "bold_font", "italics_font", "bold_italics_font", "mono_font"]:
		var fnt = node.get_font(name) if node.has_font(name) or name == "font" else null
		if fnt is DynamicFont and not _fonts_done.has(fnt):
			_fonts_done[fnt] = true
			fnt.add_fallback(_font)

func _process(delta):
	_tick += delta
	if _tick > 1.0:
		_tick = 0.0
		if _tr != null:
			_force_locale()
`

const overrideLine = (gdPath) => `LustreTL="*${gdPath.replace(/\\/g, '/')}"`

async function apply(ctx, { tr }) {
  const dir = path.dirname(ctx.exe)
  const major = ctx.pack?.godot?.[0] || 4
  await fs.promises.writeFile(path.join(dir, DATA), JSON.stringify({ lang: 'ru', tr }), 'utf8')
  await fs.promises.writeFile(path.join(dir, HOOK), major >= 4 ? hookGodot4() : hookGodot3(), 'utf8')
  // override.cfg: свой у игры сохраняем и дописываем автозагрузку в конец
  const ov = path.join(dir, OVERRIDE)
  const bak = path.join(dir, OVERRIDE_BACKUP)
  let base = ''
  if (fs.existsSync(bak)) base = await fs.promises.readFile(bak, 'utf8')
  else if (fs.existsSync(ov)) { base = await fs.promises.readFile(ov, 'utf8'); await fs.promises.copyFile(ov, bak) }
  const block = `\n; Lustre: автоперевод на русский\n[autoload]\n\n${overrideLine(path.join(dir, HOOK))}\n`
  await fs.promises.writeFile(ov, base.replace(/\s*$/, '\n') + block, 'utf8')
}

async function revert(ctx) {
  const dir = path.dirname(ctx.exe)
  const ov = path.join(dir, OVERRIDE)
  const bak = path.join(dir, OVERRIDE_BACKUP)
  if (fs.existsSync(bak)) await fs.promises.rename(bak, ov)
  else await fs.promises.rm(ov, { force: true })
  for (const f of [HOOK, DATA]) await fs.promises.rm(path.join(dir, f), { force: true })
}

function isApplied(ctx) {
  const dir = path.dirname(ctx.exe)
  try {
    return fs.existsSync(path.join(dir, DATA)) && fs.readFileSync(path.join(dir, OVERRIDE), 'utf8').includes('LustreTL=')
  } catch { return false }
}

module.exports = {
  id: 'godot', title: 'Godot', detect, extract, apply, revert, isApplied, variantOf,
  _internal: { readPack, readPackFile, scanBinaryStrings, scanTextLiterals, looksLikeText, decompressGodot, hookGodot3, hookGodot4 },
}
