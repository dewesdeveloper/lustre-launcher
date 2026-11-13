// Unreal Engine 4/5: перевод таблиц локализации (.locres).
//
// Текст игры, собранный в локализацию, лежит в Content/Localization/<Target>/<культура>/<Target>.locres
// внутри .pak (в UE5 с IoStore такие файлы тоже остаются в .pak). Мы читаем locres родной культуры
// (обычно en), переводим строки и собираем маленький патч LustreRu_P.pak с переведёнными locres
// по тем же путям: движок монтирует *_P.pak поверх основных паков, и английский заменяется русским.
// Оригинальные файлы игры не меняются; откат = удалить патч.
//
// Ограничения (проверяются заранее, с понятной причиной в ошибке):
//   - зашифрованный индекс пака (AES) — без ключа не прочитать;
//   - подписанные паки (.sig рядом) — неподписанный патч игра не смонтирует;
//   - locres, сжатые Oodle — проприетарный формат без открытого декодера (UE 4.27+/UE5 по умолчанию).
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const crypto = require('node:crypto')

const PATCH = 'LustreRu_P.pak'
const PAK_MAGIC = 0x5A6F12E1
const MOUNT = '../../../'

// --- поиск игры ---

function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
}

function detect(root) {
  root = path.resolve(root)
  const cands = [root, ...listDir(root).filter(d => d.isDirectory()).map(d => path.join(root, d.name))]
  for (const dir of cands) {
    for (const d of listDir(dir)) {
      if (!d.isDirectory() || d.name === 'Engine') continue
      const paksDir = path.join(dir, d.name, 'Content', 'Paks')
      const paks = listDir(paksDir).filter(f => f.isFile() && /\.pak$/i.test(f.name) && f.name !== PATCH).map(f => f.name)
      if (!paks.length) continue
      return {
        engine: 'unreal',
        dir,
        project: d.name,
        paksDir,
        paks,
        signed: listDir(paksDir).some(f => /\.sig$/i.test(f.name)),
        iostore: listDir(paksDir).some(f => /\.utoc$/i.test(f.name)),
      }
    }
  }
  return null
}

// --- чтение пака ---

function readAt(fd, pos, len) {
  const b = Buffer.alloc(len)
  const n = fs.readSync(fd, b, 0, len, pos)
  return n === len ? b : b.subarray(0, n)
}

class Reader {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos }
  u8() { return this.b[this.p++] }
  u32() { const v = this.b.readUInt32LE(this.p); this.p += 4; return v }
  i32() { const v = this.b.readInt32LE(this.p); this.p += 4; return v }
  u64() { const v = Number(this.b.readBigUInt64LE(this.p)); this.p += 8; return v }
  bytes(n) { const v = this.b.subarray(this.p, this.p + n); this.p += n; return v }
  fstring() {
    const n = this.i32()
    if (n === 0) return ''
    if (n > 0) { const s = this.b.toString('utf8', this.p, this.p + n - 1); this.p += n; return s }
    const s = this.b.toString('utf16le', this.p, this.p + (-n - 1) * 2); this.p += -n * 2; return s
  }
}

// Футер: [guid 16][зашифрован 1][магия 4][версия 4][индекс: смещение 8, размер 8, sha1 20][frozen 1 — v9][методы сжатия N×32]
function readFooter(fd, size) {
  const tailLen = Math.min(size, 400)
  const tail = readAt(fd, size - tailLen, tailLen)
  for (let i = tail.length - 44; i >= 0; i--) {
    if (tail.readUInt32LE(i) !== PAK_MAGIC) continue
    const version = tail.readUInt32LE(i + 4)
    if (version < 1 || version > 20) continue
    const indexOffset = Number(tail.readBigUInt64LE(i + 8))
    const indexSize = Number(tail.readBigUInt64LE(i + 16))
    let after = i + 44 + (version === 9 ? 1 : 0)
    const methods = []
    while (after + 32 <= tail.length) {
      methods.push(tail.toString('latin1', after, after + 32).replace(/\0[\s\S]*$/, ''))
      after += 32
    }
    const v8a = version === 8 && methods.length === 4
    if (version < 8) methods.push('Zlib', 'Gzip', 'Oodle') // до v8 методы — фиксированные флаги
    return { version, v8a, indexOffset, indexSize, encrypted: version >= 4 && tail[i - 1] === 1, methods, footerPos: size - tailLen + i }
  }
  return null
}

// Запись индекса в старом формате (v3–v9): FPakEntry
function readLegacyEntry(r, version, v8a) {
  const offset = r.u64()
  const csize = r.u64()
  const usize = r.u64()
  const method = v8a ? r.u8() : r.u32() // v8A (UE 4.22) хранил номер метода в u8
  if (version < 3) r.u64() // timestamp
  r.bytes(20)
  let blocks = null
  if (version >= 3) {
    if (method) {
      const n = r.u32()
      blocks = []
      for (let k = 0; k < n; k++) blocks.push([r.u64(), r.u64()])
    }
    const flags = r.u8()
    r.u32() // block size
    return { offset, csize, usize, method, blocks, encrypted: !!(flags & 1), relative: version >= 5 }
  }
  return { offset, csize, usize, method, blocks, encrypted: false, relative: false }
}

// Закодированная запись индекса v10+ (FPakFile::DecodePakEntry)
function decodeEntry(buf, at) {
  const r = new Reader(buf, at)
  const v = r.u32()
  const method = (v >>> 23) & 0x3f
  const encrypted = !!(v & (1 << 22))
  const nblocks = (v >>> 6) & 0xffff
  if ((v & 0x3f) === 0x3f) r.u32()
  const offset = (v & 0x80000000) ? r.u32() : r.u64()
  const usize = (v & 0x40000000) ? r.u32() : r.u64()
  const csize = method ? ((v & 0x20000000) ? r.u32() : r.u64()) : usize
  let blocks = null
  if (method && nblocks) {
    const head = 8 + 8 + 8 + 4 + 20 + 4 + nblocks * 16 + 1 + 4
    blocks = []
    if (nblocks === 1 && !encrypted) blocks.push([head, head + csize])
    else {
      let start = head
      for (let k = 0; k < nblocks; k++) {
        const len = r.u32()
        blocks.push([start, start + len])
        start += encrypted ? (len + 15) & ~15 : len
      }
    }
  }
  return { offset, csize, usize, method, blocks, encrypted, relative: true }
}

// Каталог пака: { version, methods, mount, files: Map<путь от ../../../, entry> }
function readPak(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const foot = readFooter(fd, size)
    if (!foot) return { error: 'not-pak' }
    if (foot.encrypted) return { ...foot, error: 'encrypted' }
    const idx = readAt(fd, foot.indexOffset, foot.indexSize)
    const r = new Reader(idx)
    const mount = r.fstring()
    const count = r.i32()
    const files = new Map()
    const full = (p) => (mount + p).replace(/^(\.\.\/)+/, '')
    if (foot.version < 10) {
      for (let i = 0; i < count; i++) {
        const p = r.fstring()
        files.set(full(p), readLegacyEntry(r, foot.version, foot.v8a))
      }
    } else {
      r.u64() // seed
      if (r.u32()) { r.u64(); r.u64(); r.bytes(20) }
      let fdiOff = -1, fdiSize = 0
      if (r.u32()) { fdiOff = r.u64(); fdiSize = r.u64(); r.bytes(20) }
      const encLen = r.i32()
      const enc = r.bytes(encLen)
      const plainCount = r.i32()
      const plain = []
      for (let i = 0; i < plainCount; i++) plain.push(readLegacyEntry(r, foot.version, foot.v8a))
      if (fdiOff < 0) return { ...foot, error: 'no-directory' }
      const fr = new Reader(readAt(fd, fdiOff, fdiSize))
      const dirs = fr.i32()
      for (let d = 0; d < dirs; d++) {
        const dir = fr.fstring()
        const n = fr.i32()
        for (let i = 0; i < n; i++) {
          const name = fr.fstring()
          const off = fr.i32()
          const dirPart = dir === '/' ? '' : dir
          files.set(full(dirPart + name), off >= 0 ? decodeEntry(enc, off) : plain[-off - 1])
        }
      }
    }
    return { ...foot, mount, files }
  } finally {
    fs.closeSync(fd)
  }
}

function readEntry(file, pak, e) {
  if (e.encrypted) throw new Error('файл в паке зашифрован')
  const fd = fs.openSync(file, 'r')
  try {
    if (!e.method) {
      // данные идут после копии заголовка записи
      const head = pak.version >= 3 ? (pak.v8a ? 50 : 53) : 56
      return readAt(fd, e.offset + head, e.usize)
    }
    const name = (pak.methods[e.method - 1] || '').toLowerCase()
    const parts = []
    for (const [s, en] of e.blocks) {
      const start = e.relative ? e.offset + s : s
      const chunk = readAt(fd, start, en - s)
      if (name === 'zlib') parts.push(zlib.inflateSync(chunk))
      else if (name === 'gzip') parts.push(zlib.gunzipSync(chunk))
      else throw Object.assign(new Error(`сжатие ${pak.methods[e.method - 1] || '?'}`), { code: 'compression', method: pak.methods[e.method - 1] })
    }
    return Buffer.concat(parts)
  } finally {
    fs.closeSync(fd)
  }
}

// --- .locres ---

const LOCRES_MAGIC = Buffer.from([0x0E, 0x14, 0x74, 0x75, 0x67, 0x4A, 0x03, 0xFC, 0x4A, 0x15, 0x90, 0x9D, 0xC3, 0x37, 0x7F, 0x1B])

// → { version, strings: string[], splitAt, refCounts } (для v0 strings — по порядку записей)
function parseLocres(buf) {
  const r = new Reader(buf)
  let version = 0
  if (buf.subarray(0, 16).equals(LOCRES_MAGIC)) { r.p = 16; version = r.u8() }
  if (version === 0) {
    // Legacy: строки прямо в записях — переписываем файл целиком
    const ns = []
    const nsCount = r.u32()
    for (let i = 0; i < nsCount; i++) {
      const name = r.fstring()
      const keys = []
      const kc = r.u32()
      for (let k = 0; k < kc; k++) keys.push({ key: r.fstring(), hash: r.u32(), text: r.fstring() })
      ns.push({ name, keys })
    }
    return { version, ns, strings: ns.flatMap(n => n.keys.map(k => k.text)) }
  }
  const arrayOffset = r.u64()
  const ar = new Reader(buf, arrayOffset)
  const n = ar.i32()
  const strings = []
  const refs = []
  for (let i = 0; i < n; i++) {
    strings.push(ar.fstring())
    if (version >= 2) refs.push(ar.i32())
  }
  return { version, arrayOffset, strings, refs }
}

function fstringBytes(s) {
  // ASCII — однобайтовая строка, иначе UTF-16 (отрицательная длина)
  if ([...s].every(c => c.charCodeAt(0) < 0x80)) {
    const b = Buffer.alloc(4 + s.length + 1)
    b.writeInt32LE(s.length + 1, 0)
    b.write(s, 4, 'latin1')
    return b
  }
  const u = Buffer.from(s + '\0', 'utf16le')
  const b = Buffer.alloc(4)
  b.writeInt32LE(-(s.length + 1), 0)
  return Buffer.concat([b, u])
}

// Тот же locres, но с переведёнными строками
function writeLocres(buf, parsed, translated) {
  if (parsed.version === 0) {
    const out = []
    const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); out.push(b) }
    u32(parsed.ns.length)
    let i = 0
    for (const n of parsed.ns) {
      out.push(fstringBytes(n.name))
      u32(n.keys.length)
      for (const k of n.keys) { out.push(fstringBytes(k.key)); u32(k.hash); out.push(fstringBytes(translated[i++])) }
    }
    return Buffer.concat(out)
  }
  // Пространства имён и ключи не меняются — копируем всё до массива строк, массив пишем заново
  const head = buf.subarray(0, parsed.arrayOffset)
  const parts = [head]
  const cnt = Buffer.alloc(4)
  cnt.writeInt32LE(translated.length)
  parts.push(cnt)
  translated.forEach((s, i) => {
    parts.push(fstringBytes(s))
    if (parsed.version >= 2) { const b = Buffer.alloc(4); b.writeInt32LE(parsed.refs[i]); parts.push(b) }
  })
  return Buffer.concat(parts)
}

// Родная культура цели локализации из .locmeta: [magic 16][версия 1][NativeCulture][NativeLocRes]…
const LOCMETA_MAGIC = Buffer.from([0x4F, 0xEE, 0x4C, 0xA1, 0x68, 0x48, 0x55, 0x83, 0x6C, 0x4C, 0x46, 0xBD, 0x70, 0xDA, 0x50, 0x7C])
function nativeCulture(buf) {
  try {
    if (!buf.subarray(0, 16).equals(LOCMETA_MAGIC)) return null
    const r = new Reader(buf, 17)
    return r.fstring() || null
  } catch { return null }
}

// --- запись патч-пака ---

const sha1 = (b) => crypto.createHash('sha1').update(b).digest()

function u32b(v) { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b }
function u64b(v) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b }

// FPakEntry без сжатия; offset — 0 в копии перед данными и настоящий в индексе
function entryBytes(offset, size, hash, version, v8a) {
  const parts = [u64b(offset), u64b(size), u64b(size), v8a ? Buffer.from([0]) : u32b(0)]
  if (version < 3) parts.push(u64b(0))
  parts.push(hash)
  if (version >= 3) parts.push(Buffer.from([0]), u32b(0))
  return Buffer.concat(parts)
}

function encodedEntry(offset, size) {
  const flags = (1 << 31) * (offset <= 0xffffffff ? 1 : 0) + (1 << 30) + (1 << 29)
  return Buffer.concat([u32b(flags >>> 0), offset <= 0xffffffff ? u32b(offset) : u64b(offset), u32b(size)])
}

function fnv64Path(p, seed) {
  let h = (0xcbf29ce484222325n + BigInt(seed)) & 0xffffffffffffffffn
  for (const byte of Buffer.from(p.toLowerCase(), 'utf16le')) {
    h ^= BigInt(byte)
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h
}

// files: [{ path: 'Proj/Content/Localization/Game/en/Game.locres', data: Buffer }] → Buffer пака
function writePak(files, gameVersion, v8a = false) {
  // v12 пишем как v11 (движок читает старые версии), v10 — как v8 (5 методов сжатия)
  const version = gameVersion >= 11 ? 11 : gameVersion === 10 ? 8 : Math.max(3, gameVersion)
  files = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const parts = []
  let pos = 0
  const entries = []
  for (const f of files) {
    const hash = sha1(f.data)
    const head = entryBytes(0, f.data.length, hash, version, v8a && version === 8)
    entries.push({ path: f.path, offset: pos, size: f.data.length, hash })
    parts.push(head, f.data)
    pos += head.length + f.data.length
  }
  const indexOffset = pos
  let index
  let secondary = []
  if (version < 10) {
    const ip = [fstringBytes(MOUNT), u32b(entries.length)]
    for (const e of entries) ip.push(fstringBytes(e.path), entryBytes(e.offset, e.size, e.hash, version, v8a && version === 8))
    index = Buffer.concat(ip)
  } else {
    const enc = []
    const offs = []
    let encLen = 0
    for (const e of entries) { const b = encodedEntry(e.offset, e.size); offs.push(encLen); enc.push(b); encLen += b.length }
    const encBuf = Buffer.concat(enc)
    const seed = 0
    // Индекс хэшей путей
    const phi = [u32b(entries.length)]
    entries.forEach((e, i) => { const h = Buffer.alloc(8); h.writeBigUInt64LE(fnv64Path(e.path, seed)); phi.push(h, u32b(offs[i])) })
    phi.push(u32b(0))
    const phiBuf = Buffer.concat(phi)
    // Полный индекс каталогов (как у repak: каталоги с родителями до корня)
    const dirs = new Map()
    entries.forEach((e, i) => {
      const cut = e.path.lastIndexOf('/') + 1
      const dir = e.path.slice(0, cut) || '/'
      let p = dir
      while (p && p !== '/') {
        if (!dirs.has(p)) dirs.set(p, [])
        const trimmed = p.slice(0, -1)
        const j = trimmed.lastIndexOf('/')
        p = j >= 0 ? trimmed.slice(0, j + 1) : '/'
      }
      if (!dirs.has('/')) dirs.set('/', [])
      dirs.get(dir).push([e.path.slice(cut), offs[i]])
    })
    const fdi = [u32b(dirs.size)]
    for (const d of [...dirs.keys()].sort()) {
      fdi.push(fstringBytes(d), u32b(dirs.get(d).length))
      for (const [name, off] of dirs.get(d)) fdi.push(fstringBytes(name), u32b(off))
    }
    const fdiBuf = Buffer.concat(fdi)
    const mountB = fstringBytes(MOUNT)
    const headLen = mountB.length + 4 + 8 + 4 + 36 + 4 + 36 + 4 + encBuf.length + 4
    const phiOff = indexOffset + headLen
    const fdiOff = phiOff + phiBuf.length
    index = Buffer.concat([
      mountB, u32b(entries.length), u64b(seed),
      u32b(1), u64b(phiOff), u64b(phiBuf.length), sha1(phiBuf),
      u32b(1), u64b(fdiOff), u64b(fdiBuf.length), sha1(fdiBuf),
      u32b(encBuf.length), encBuf, u32b(0),
    ])
    secondary = [phiBuf, fdiBuf]
  }
  const footer = []
  if (version >= 7) footer.push(Buffer.alloc(16))
  if (version >= 4) footer.push(Buffer.from([0]))
  footer.push(u32b(PAK_MAGIC), u32b(version), u64b(indexOffset), u64b(index.length), sha1(index))
  if (version === 9) footer.push(Buffer.from([0]))
  if (version >= 8) footer.push(Buffer.alloc(32 * (v8a && version === 8 ? 4 : 5)))
  return Buffer.concat([...parts, index, ...secondary, ...footer])
}

// --- API движка ---

// Заведомо невозможный перевод видно без чтения файлов: подпись и шифрование паков
function precheck(ctx) {
  if (ctx.signed) return 'Игра проверяет подпись своих паков — патч с переводом она не загрузит.'
  let encrypted = 0
  for (const name of ctx.paks) {
    try {
      const fd = fs.openSync(path.join(ctx.paksDir, name), 'r')
      try { if (readFooter(fd, fs.fstatSync(fd).size)?.encrypted) encrypted++ } finally { fs.closeSync(fd) }
    } catch { /* пропускаем */ }
  }
  if (encrypted && encrypted === ctx.paks.length) return 'Паки игры зашифрованы — без ключа текст не прочитать.'
  return null
}

const LOCRES_RE = /^(.+\/Content\/Localization\/([^/]+))\/([^/]+)\/\2\.locres$/i

function scanPaks(ctx) {
  const problems = { encrypted: [], compression: new Set(), notPak: [] }
  const locres = new Map() // путь → { pakFile, pak, entry }
  const locmeta = new Map()
  let maxVersion = 0
  let v8a = false
  for (const name of ctx.paks) {
    const file = path.join(ctx.paksDir, name)
    let pak
    try { pak = readPak(file) } catch { problems.notPak.push(name); continue }
    if (pak.error === 'encrypted') { problems.encrypted.push(name); continue }
    if (pak.error) { problems.notPak.push(name); continue }
    if (pak.version >= maxVersion) { maxVersion = pak.version; v8a = !!pak.v8a }
    for (const [p, e] of pak.files) {
      if (/\/Content\/Localization\/[^/]+\/[^/]+\.locmeta$/i.test(p)) locmeta.set(p, { file, pak, e })
      else if (LOCRES_RE.test(p)) locres.set(p, { file, pak, e })
    }
  }
  return { problems, locres, locmeta, maxVersion, v8a }
}

// Какие locres переводим: по каждой цели локализации игры (не движка) — файл родной культуры
function pickTargets(scan) {
  const byTarget = new Map()
  for (const p of scan.locres.keys()) {
    const m = p.match(LOCRES_RE)
    if (/^Engine\//i.test(p)) continue
    const key = m[1]
    if (!byTarget.has(key)) byTarget.set(key, { base: m[1], name: m[2], cultures: new Map() })
    byTarget.get(key).cultures.set(m[3], p)
  }
  const out = []
  for (const t of byTarget.values()) {
    let native = null
    const meta = scan.locmeta.get(`${t.base}/${t.name}.locmeta`)
    if (meta) { try { native = nativeCulture(readEntry(meta.file, meta.pak, meta.e)) } catch { /* нет */ } }
    const cultures = [...t.cultures.keys()]
    native = native && t.cultures.has(native) ? native : cultures.find(c => /^en(-|$)/i.test(c)) || null
    if (!native) continue
    out.push({ ...t, native, path: t.cultures.get(native), hasRussian: cultures.some(c => /^ru(-|$)/i.test(c)) })
  }
  return out
}

function extract(ctx) {
  if (ctx.signed) throw new Error('Игра проверяет подпись своих паков (.sig) — патч с переводом она не загрузит.')
  const scan = scanPaks(ctx)
  if (!scan.locres.size) {
    if (scan.problems.encrypted.length) throw new Error('Паки игры зашифрованы (AES) — без ключа текст не прочитать.')
    throw new Error('В игре нет файлов локализации (.locres) — её текст не собран в таблицы перевода, этот способ не подходит.')
  }
  const targets = pickTargets(scan)
  if (!targets.length) throw new Error('Не найдены таблицы локализации игры на английском.')
  const segments = []
  const files = []
  const errors = []
  for (const t of targets) {
    const src = scan.locres.get(t.path)
    let buf
    try { buf = readEntry(src.file, src.pak, src.e) } catch (e) {
      if (e.code === 'compression') { errors.push(`${t.name}: ${e.message}`); continue }
      throw e
    }
    const parsed = parseLocres(buf)
    files.push({ path: t.path, buf, parsed })
    for (const s of parsed.strings) segments.push({ text: s, kind: 'ui' })
  }
  if (!files.length) {
    const method = errors[0]?.match(/сжатие (\S+)/)?.[1] || 'неизвестное'
    throw new Error(`Таблицы локализации сжаты (${method}) — это проприетарный формат без открытого декодера, перевести нельзя.`)
  }
  ctx._files = files
  ctx._version = scan.maxVersion
  ctx._v8a = scan.v8a
  return { segments, scripts: files.length, errors, broken: [], badFonts: [], nativeRussian: targets.some(t => t.hasRussian) }
}

async function apply(ctx, { table }) {
  const out = ctx._files.map(f => ({
    path: f.path,
    data: writeLocres(f.buf, f.parsed, f.parsed.strings.map(s => table[s] ?? s)),
  }))
  const pak = writePak(out, ctx._version, ctx._v8a)
  const dest = path.join(ctx.paksDir, PATCH)
  await fs.promises.writeFile(dest + '.part', pak)
  await fs.promises.rename(dest + '.part', dest)
  return { files: out.length }
}

async function revert(ctx) {
  await fs.promises.rm(path.join(ctx.paksDir, PATCH), { force: true })
}

function isApplied(ctx) {
  return fs.existsSync(path.join(ctx.paksDir, PATCH))
}

const variantOf = (ctx) => `Unreal Engine${ctx.iostore ? ' 5' : ''}`

module.exports = {
  id: 'unreal', title: 'Unreal Engine', detect, extract, apply, revert, isApplied, variantOf, precheck,
  _internal: { readPak, readEntry, parseLocres, writeLocres, writePak, scanPaks, pickTargets, nativeCulture, fnv64Path },
}
