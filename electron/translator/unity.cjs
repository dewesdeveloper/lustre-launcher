// Unity: перевод во время игры. Текст в Unity разбросан по ассетам, бандлам и C#-коду,
// поэтому заранее его не извлечь — вместо этого ставим BepInEx + XUnity.AutoTranslator:
// плагин перехватывает весь выводимый текст (UGUI, TextMeshPro, IMGUI, NGUI) и отправляет его
// на локальный эндпоинт лаунчера (CustomTranslate → http://127.0.0.1:<порт>/translate),
// где переводит та же офлайн-модель Bergamot (см. server.cjs). Переводы XUnity кэширует у себя.
//
// Все добавленные файлы записываются в BepInEx/lustre_installed.json — откат удаляет ровно их.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { readZip } = require('./zip.cjs')
const { httpFetch, chunks } = require('./net.cjs')

const MARKER = 'lustre_installed.json'

// Пакеты закреплены по версии и SHA-256
const PACKAGES = {
  'bepinex5-x64': { url: 'https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.6/BepInEx_win_x64_5.4.23.6.zip', size: 642076, sha256: '6c57a714a892efb4e9e1fef63d608a3391f30ec984031c465404e4ee381a0755' },
  'bepinex5-x86': { url: 'https://github.com/BepInEx/BepInEx/releases/download/v5.4.23.6/BepInEx_win_x86_5.4.23.6.zip', size: 641457, sha256: 'a4024dafaca5d3784097e34b3c2921415030c0b461e52f30053ed8914be9622d' },
  'bepinex6-il2cpp-x64': { url: 'https://builds.bepinex.dev/projects/bepinex_be/793/BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.793%2Bdbc82f0.zip', size: 34339235, sha256: '5b63d7d0e92a2448ccd13b738ff95ff1cc1026c6d718555d4df8e6c824953ac4' },
  'bepinex6-il2cpp-x86': { url: 'https://builds.bepinex.dev/projects/bepinex_be/793/BepInEx-Unity.IL2CPP-win-x86-6.0.0-be.793%2Bdbc82f0.zip', size: 31443115, sha256: '6eb35cec828f16836674231b2ab4ab1db6c9953b7a11b34b8c8badba14218ed2' },
  'xunity-mono': { url: 'https://github.com/bbepis/XUnity.AutoTranslator/releases/download/v5.6.3.1/XUnity.AutoTranslator-BepInEx-5.6.3.1.zip', size: 759511, sha256: '6c3ff03aafe9708f25c2115c0c04c255b6a9d88e716896ae7bacb590a8777609' },
  'xunity-il2cpp': { url: 'https://github.com/bbepis/XUnity.AutoTranslator/releases/download/v5.6.3.1/XUnity.AutoTranslator-BepInEx-IL2CPP-5.6.3.1.zip', size: 762471, sha256: 'f1d4d3151a061edfcda815e4472fe1f1de8756bdc23708c9b5ebb9bfe736fb1f' },
}

// --- поиск игры ---

function peMachine(file) {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const b = Buffer.alloc(4096)
      fs.readSync(fd, b, 0, 4096, 0)
      const pe = b.readUInt32LE(0x3c)
      if (b.toString('latin1', pe, pe + 4) !== 'PE\0\0') return null
      const m = b.readUInt16LE(pe + 4)
      return m === 0x8664 ? 'x64' : m === 0x14c ? 'x86' : null
    } finally { fs.closeSync(fd) }
  } catch { return null }
}

function unityVersion(dataDir) {
  for (const f of ['globalgamemanagers', 'mainData', 'data.unity3d']) {
    try {
      const fd = fs.openSync(path.join(dataDir, f), 'r')
      const b = Buffer.alloc(128)
      fs.readSync(fd, b, 0, 128, 0)
      fs.closeSync(fd)
      const m = b.toString('latin1').match(/(\d{4}|[3-6])\.\d+\.\d+[abfpx]\d+/) // 2018.2.14f1, 6000.0.23f1, 5.6.7f1
      if (m) return m[0]
    } catch { /* следующий */ }
  }
  return null
}

function detect(root) {
  root = path.resolve(root)
  const dirs = [root]
  try {
    for (const d of fs.readdirSync(root, { withFileTypes: true })) if (d.isDirectory()) dirs.push(path.join(root, d.name))
  } catch { /* нет доступа */ }
  for (const dir of dirs) {
    let names
    try { names = fs.readdirSync(dir) } catch { continue }
    for (const n of names) {
      if (!/\.exe$/i.test(n) || /^UnityCrashHandler/i.test(n)) continue
      const base = n.replace(/\.exe$/i, '')
      const dataDir = path.join(dir, base + '_Data')
      if (!fs.existsSync(dataDir)) continue
      const il2cpp = fs.existsSync(path.join(dir, 'GameAssembly.dll'))
      const mono = fs.existsSync(path.join(dataDir, 'Managed', 'Assembly-CSharp.dll')) || fs.existsSync(path.join(dataDir, 'Managed', 'UnityEngine.dll'))
      if (!il2cpp && !mono) continue
      const exe = path.join(dir, n)
      const arch = peMachine(fs.existsSync(path.join(dir, 'UnityPlayer.dll')) ? path.join(dir, 'UnityPlayer.dll') : exe) || 'x64'
      return {
        engine: 'unity',
        dir,
        exe,
        dataDir,
        backend: il2cpp ? 'il2cpp' : 'mono',
        arch,
        unity: unityVersion(dataDir),
        bepinex: fs.existsSync(path.join(dir, 'BepInEx', 'core', 'BepInEx.dll')) || fs.existsSync(path.join(dir, 'BepInEx', 'core', 'BepInEx.Core.dll')),
        melonloader: fs.existsSync(path.join(dir, 'MelonLoader')),
      }
    }
  }
  return null
}

const variantOf = (ctx) => `Unity ${ctx.unity ? ctx.unity.replace(/[abfpx]\d+$/, '') + ' ' : ''}(${ctx.backend === 'il2cpp' ? 'IL2CPP' : 'Mono'})`

// --- пакеты ---

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex')

async function readCached(file, spec) {
  try {
    const b = await fs.promises.readFile(file)
    if (b.length === spec.size && sha256(b) === spec.sha256) return b
  } catch { /* нет в кэше */ }
  return null
}

async function saveCached(file, buf) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file + '.part', buf)
  await fs.promises.rename(file + '.part', file)
}

// Скачивание с проверкой SHA-256. Сервера пакетов (особенно builds.bepinex.dev) обрывают долгие
// загрузки — докачиваем с места обрыва. from — смещение куска внутри файла (один файл из zip-архива).
async function download(url, { size, sha256: hash, from = null }, onProgress, signal) {
  const parts = []
  let got = 0
  let lastErr = null
  for (let attempt = 0; attempt < 8 && got < size; attempt++) {
    if (signal?.aborted) throw new Error('Отменено')
    if (attempt) await new Promise(r => setTimeout(r, 1000 * Math.min(attempt, 4)))
    try {
      const headers = from != null ? { Range: `bytes=${from + got}-${from + size - 1}` } : got ? { Range: `bytes=${got}-` } : {}
      const res = await httpFetch(url, { signal, headers })
      if (res.status === 200 && (got || from != null)) {
        if (from != null) throw new Error('сервер не поддерживает частичную загрузку')
        parts.length = 0; got = 0 // докачку сервер не умеет — заново
      } else if (!res.ok) throw new Error(`HTTP ${res.status}`)
      for await (const c of chunks(res)) { parts.push(c); got += c.length; onProgress?.(Math.min(got, size), size) }
    } catch (e) {
      if (signal?.aborted) throw new Error('Отменено')
      lastErr = e
    }
  }
  const buf = Buffer.concat(parts)
  if (buf.length !== size || sha256(buf) !== hash) {
    throw new Error(`Не удалось скачать ${decodeURIComponent(path.basename(url))}: ${got < size ? (lastErr?.message || 'обрыв загрузки') : 'файл повреждён'}`)
  }
  return buf
}

async function ensurePackage(dataDir, id, onProgress, signal) {
  const spec = PACKAGES[id]
  const dest = path.join(dataDir, 'packages', decodeURIComponent(path.basename(spec.url)))
  const cached = await readCached(dest, spec)
  if (cached) return cached
  const buf = await download(spec.url, spec, onProgress, signal)
  await saveCached(dest, buf)
  return buf
}

// --- кириллический шрифт для старого TextMeshPro ---
// TMP ниже 3.2 (Unity до 2022 включительно) не умеет строить шрифт из системного Arial,
// поэтому кириллица в TMP-текстах выходит квадратами. XUnity подключает готовый TMP-шрифт
// из AssetBundle (FallbackFontTextMeshPro). Бандлы — из релизов XUnity, под свою версию Unity.
const TMP_ZIP = 'https://github.com/bbepis/XUnity.AutoTranslator/releases/download/v5.4.4/TMP_Font_AssetBundles.zip'
const TMP_7Z = { url: 'https://github.com/bbepis/XUnity.AutoTranslator/releases/download/v5.5.0/TMP_Font_AssetBundles_2025-12-08.7z', size: 134844329, sha256: '889e963fb9dbd4b64927e0adf5d9060e1d0fb9d6bceb0c407d0597643e2b54ec' }
const TMP_FONTS = {
  // zip — смещение записи в TMP_ZIP (файлы там без сжатия: забираем один Range-запросом); без zip — только в 7z
  u55to2017: { file: 'arialuni_sdf-u55to2017', size: 29612942, sha256: 'd476efbff5a91098eb9b3320a8ab2ab200291197878637d04faa953132d7d577' },
  u2018: { file: 'arialuni_sdf_u2018', size: 29174192, sha256: 'f9ffcfa4819499c50a2acd15d0cc0d398f79b1cfdaba14b5e6b0d6345a22648c', zip: 0 },
  u2019: { file: 'arialuni_sdf_u2019', size: 30986431, sha256: '11b47cae3262648dd9c8b8a29dc25d04309a18790e4130e94fd230791e55c037', zip: 29174240 },
  u2021: { file: 'arialuni_sdf_u2021', size: 22224508, sha256: '63a5cbf2b9c7351c6ff8f7f592be03d2cc79668fad48f3cfe8e0e547af43aa3c' },
  u2022: { file: 'arialuni_sdf_u2022', size: 22224426, sha256: 'de18a759d475e01f90cffee16bdc861bf3aa09bc501f3c622e5822622b5e1606' },
}

// Есть ли в игре TextMeshPro
function hasTmp(ctx) {
  try {
    if (ctx.backend === 'mono') return fs.readdirSync(path.join(ctx.dataDir, 'Managed')).some(f => /TextMeshPro/i.test(f))
    const meta = fs.readFileSync(path.join(ctx.dataDir, 'il2cpp_data', 'Metadata', 'global-metadata.dat'))
    return meta.includes('Unity.TextMeshPro') || meta.includes('TMPro')
  } catch { return false }
}

// Какой бандл нужен этой игре (null — не нужен или версия неизвестна)
function tmpFontFor(ctx) {
  const m = (ctx.unity || '').match(/^(\d+)\.(\d+)/)
  if (!m || !hasTmp(ctx)) return null
  const major = +m[1]
  if (major >= 2023) return null // новый TMP сам строит шрифт из системного Arial
  if (major < 2018) return major >= 5 ? 'u55to2017' : null
  if (major === 2018) return 'u2018'
  if (major <= 2020) return 'u2019'
  if (major === 2021) return 'u2021'
  return 'u2022'
}

// Есть ли в игре ассет «TMP Settings»: без него XUnity не может добавить запасной шрифт
// (TMP_Settings.instance пустой) — тогда шрифт TMP-текстов заменяется целиком
function hasTmpSettings(ctx) {
  const needle = Buffer.from('TMP Settings')
  const file = path.join(ctx.dataDir, 'resources.assets')
  let fd
  try { fd = fs.openSync(file, 'r') } catch { return true } // не знаем — пробуем запасной
  try {
    const size = fs.fstatSync(fd).size
    const chunk = Buffer.alloc(8 * 1024 * 1024)
    for (let pos = 0; pos < size; pos += chunk.length - needle.length) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, pos)
      if (chunk.subarray(0, n).includes(needle)) return true
      if (n < chunk.length) break
    }
    return false
  } finally { fs.closeSync(fd) }
}

function sevenZip() {
  const cands = []
  if (process.resourcesPath) cands.push(path.join(process.resourcesPath, 'vendor', '7z', '7z.exe'))
  cands.push(path.join(__dirname, '..', '..', 'vendor', '7z', '7z.exe'))
  return cands.find(p => fs.existsSync(p)) || null
}

async function ensureTmpFont(dataDir, id, onProgress, signal) {
  const spec = TMP_FONTS[id]
  const dest = path.join(dataDir, 'fonts', spec.file)
  const cached = await readCached(dest, spec)
  if (cached) return cached
  let buf
  if (spec.zip != null) {
    // Локальный заголовок файла в zip: 30 байт + имя (extra у этих записей пустой), дальше данные
    buf = await download(TMP_ZIP, { size: spec.size, sha256: spec.sha256, from: spec.zip + 30 + spec.file.length }, onProgress, signal)
  } else {
    // Нужен весь 7z-архив (135 МБ): кэшируем и распаковываем все шрифты сразу
    const archive = path.join(dataDir, 'packages', decodeURIComponent(path.basename(TMP_7Z.url)))
    if (!(await readCached(archive, TMP_7Z))) await saveCached(archive, await download(TMP_7Z.url, TMP_7Z, onProgress, signal))
    const z = sevenZip()
    if (!z) throw new Error('Не найден 7-Zip для распаковки шрифта')
    const out = path.join(dataDir, 'fonts')
    await fs.promises.mkdir(out, { recursive: true })
    await new Promise((resolve, reject) => {
      require('node:child_process').execFile(z, ['e', '-y', `-o${out}`, archive, spec.file], { windowsHide: true }, (err) => err ? reject(err) : resolve())
    })
    buf = await readCached(dest, spec)
    if (!buf) throw new Error('Шрифт в архиве повреждён')
    return buf
  }
  await saveCached(dest, buf)
  return buf
}

function packagesFor(ctx) {
  const xunity = ctx.backend === 'il2cpp' ? 'xunity-il2cpp' : 'xunity-mono'
  if (ctx.bepinex) return [xunity] // BepInEx уже стоит (моды игрока) — добавляем только плагин
  return [ctx.backend === 'il2cpp' ? `bepinex6-il2cpp-${ctx.arch}` : `bepinex5-${ctx.arch}`, xunity]
}

// --- конфиг XUnity ---

const CONFIG = (port, font, override) => `; Lustre: перевод на русский через локальную офлайн-модель (Bergamot) в лаунчере Lustre.
; Пока Lustre открыт, новые тексты переводятся на лету; переведённое кэшируется в BepInEx/Translation/ru.
[Service]
Endpoint=CustomTranslate
FallbackEndpoint=

[General]
Language=ru
FromLanguage=en

[Behaviour]
MaxCharactersPerTranslation=1000
EnableUIResizing=True
FallbackFontTextMeshPro=${override ? '' : font}
OverrideFontTextMeshPro=${override ? font : ''}
HandleRichText=True
EnableTranslationHelper=False

[Custom]
Url=http://127.0.0.1:${port}/translate
`

// Если у игрока уже есть конфиг XUnity — меняем только наши ключи
function patchIni(text, port, font, override) {
  const want = {
    Service: { Endpoint: 'CustomTranslate', FallbackEndpoint: '' },
    General: { Language: 'ru', FromLanguage: 'en' },
    Behaviour: { FallbackFontTextMeshPro: override ? '' : font, OverrideFontTextMeshPro: override ? font : '' },
    Custom: { Url: `http://127.0.0.1:${port}/translate` },
  }
  const lines = text.split(/\r?\n/)
  let section = ''
  const done = new Set()
  const out = lines.map((l) => {
    const s = l.match(/^\s*\[([^\]]+)\]/)
    if (s) { section = s[1]; return l }
    const kv = l.match(/^(\s*)([A-Za-z]+)(\s*=)/)
    if (kv && want[section] && kv[2] in want[section]) {
      done.add(section + '.' + kv[2])
      return `${kv[1]}${kv[2]}=${want[section][kv[2]]}`
    }
    return l
  })
  let res = out.join('\n')
  for (const [sec, kvs] of Object.entries(want)) {
    for (const [k, v] of Object.entries(kvs)) {
      if (done.has(sec + '.' + k)) continue
      res += `\n[${sec}]\n${k}=${v}\n`
    }
  }
  return res
}

// --- установка / откат ---

async function apply(ctx, { port, dataDir, onProgress, signal }) {
  if (ctx.melonloader) throw new Error('В игре установлен MelonLoader — вместе с BepInEx он не работает. Перевод для таких игр пока не поддерживается.')
  const ids = packagesFor(ctx)
  const fontId = tmpFontFor(ctx)
  const total = ids.length + (fontId ? 1 : 0)
  const bufs = []
  for (let i = 0; i < ids.length; i++) {
    bufs.push(await ensurePackage(dataDir, ids[i], (got, size) => onProgress?.({ phase: 'install', done: i + got / size, total }), signal))
  }
  // Кириллический шрифт для старого TextMeshPro (иначе Arial — новый TMP строит его из системного шрифта)
  let font = 'Arial'
  let override = false
  let fontBuf = null
  if (fontId) {
    fontBuf = await ensureTmpFont(dataDir, fontId, (got, size) => onProgress?.({ phase: 'install', done: ids.length + got / size, total }), signal)
    font = TMP_FONTS[fontId].file
    override = !hasTmpSettings(ctx)
  }
  const markerPath = path.join(ctx.dir, 'BepInEx', MARKER)
  let installed = []
  try { installed = JSON.parse(fs.readFileSync(markerPath, 'utf8')).files || [] } catch { /* первая установка */ }
  const mine = new Set(installed)
  for (const buf of bufs) {
    for (const e of readZip(buf)) {
      if (e.isDir) continue
      // Справка и ненужные онлайн-переводчики не нужны: оставляем только CustomTranslate
      if (/Translators\/(?!CustomTranslate\.dll$)[^/]+\.dll$/i.test(e.name) || /Translators\/FullNET\//i.test(e.name)) continue
      const dest = path.join(ctx.dir, ...e.name.split('/'))
      if (!dest.startsWith(ctx.dir + path.sep)) continue // защита от ../ в архиве
      if (fs.existsSync(dest) && !mine.has(e.name)) continue // чужие файлы (моды игрока) не трогаем
      await fs.promises.mkdir(path.dirname(dest), { recursive: true })
      await fs.promises.writeFile(dest, e.data())
      mine.add(e.name)
    }
  }
  // Шрифт-бандл XUnity ищет в папке игры по имени файла
  if (fontBuf) {
    const dest = path.join(ctx.dir, font)
    if (!fs.existsSync(dest) || mine.has(font)) {
      await fs.promises.writeFile(dest, fontBuf)
      mine.add(font)
    }
  }
  // Конфиг XUnity
  const cfg = path.join(ctx.dir, 'BepInEx', 'config', 'AutoTranslatorConfig.ini')
  const cfgRel = 'BepInEx/config/AutoTranslatorConfig.ini'
  await fs.promises.mkdir(path.dirname(cfg), { recursive: true })
  if (fs.existsSync(cfg) && !mine.has(cfgRel)) {
    const bak = cfg + '.lustre-orig'
    if (!fs.existsSync(bak)) await fs.promises.copyFile(cfg, bak)
    await fs.promises.writeFile(cfg, patchIni(await fs.promises.readFile(cfg, 'utf8'), port, font, override), 'utf8')
  } else if (fs.existsSync(cfg)) {
    // XUnity при первом запуске дописывает в наш конфиг все ключи — правим только нужные
    await fs.promises.writeFile(cfg, patchIni(await fs.promises.readFile(cfg, 'utf8'), port, font, override), 'utf8')
  } else {
    await fs.promises.writeFile(cfg, CONFIG(port, font, override), 'utf8')
    mine.add(cfgRel)
  }
  await fs.promises.writeFile(markerPath, JSON.stringify({ files: [...mine], port, at: Date.now(), packages: ids, font: fontId, fontMode: override ? 'override' : 'fallback' }, null, 1), 'utf8')
  return { files: mine.size }
}

async function revert(ctx) {
  const markerPath = path.join(ctx.dir, 'BepInEx', MARKER)
  let files = []
  try { files = JSON.parse(fs.readFileSync(markerPath, 'utf8')).files || [] } catch { return }
  for (const rel of files) await fs.promises.rm(path.join(ctx.dir, ...rel.split('/')), { force: true })
  // Конфиг игрока возвращаем
  const cfg = path.join(ctx.dir, 'BepInEx', 'config', 'AutoTranslatorConfig.ini')
  if (fs.existsSync(cfg + '.lustre-orig')) await fs.promises.rename(cfg + '.lustre-orig', cfg)
  await fs.promises.rm(markerPath, { force: true })
  // Созданное плагинами за время игры (кэш переводов, логи, interop BepInEx 6) — только если BepInEx ставили мы
  const ours = files.some(f => /^BepInEx\/core\/BepInEx(\.Core)?\.dll$/i.test(f))
  if (ours) {
    await fs.promises.rm(path.join(ctx.dir, 'BepInEx'), { recursive: true, force: true })
    await removeEmptyDirs(path.join(ctx.dir, 'dotnet')) // рантайм BepInEx 6
  } else {
    await fs.promises.rm(path.join(ctx.dir, 'BepInEx', 'Translation', 'ru'), { recursive: true, force: true })
    await removeEmptyDirs(path.join(ctx.dir, 'BepInEx'))
  }
}

async function removeEmptyDirs(dir) {
  let items
  try { items = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const d of items) if (d.isDirectory()) await removeEmptyDirs(path.join(dir, d.name))
  try { if (!(await fs.promises.readdir(dir)).length) await fs.promises.rmdir(dir) } catch { /* не пусто */ }
}

function isApplied(ctx) {
  return fs.existsSync(path.join(ctx.dir, 'BepInEx', MARKER))
}

module.exports = {
  id: 'unity', title: 'Unity', runtime: true, detect, apply, revert, isApplied, variantOf,
  extract: () => ({ segments: [], scripts: 0, errors: [], broken: [], badFonts: [] }),
  _internal: { patchIni, packagesFor, PACKAGES, tmpFontFor, ensureTmpFont },
}
