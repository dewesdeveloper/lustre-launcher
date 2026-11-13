// Автопереводчик игр (офлайн): определяет движок, извлекает текст,
// переводит локальной моделью Bergamot и ставит перевод поверх игры с возможностью отката.
const fs = require('node:fs')
const path = require('node:path')
const renpy = require('./renpy.cjs')
const rpgmv = require('./rpgmv.cjs')
const godot = require('./godot.cjs')
const unity = require('./unity.cjs')
const unreal = require('./unreal.cjs')
const { createServer } = require('./server.cjs')
const { protect, hasWords, RENPY, RPGM, GODOT, UNREAL } = require('./markup.cjs')
const { RENPY_UI, RPGM_TERMS, GENERIC_UI } = require('./glossary.cjs')
const { ensureModel, MTPool } = require('./mt.cjs')

// Godot последним: его проверка открывает exe в поисках встроенного пака
const ENGINES = [renpy, rpgmv, unity, unreal, godot]
const PAIR = 'en-ru'
const TM_VERSION = 1

function detect(installPath) {
  if (!installPath || !fs.existsSync(installPath)) return null
  for (const e of ENGINES) {
    const ctx = e.detect(installPath)
    if (ctx) return { ...ctx, module: e }
  }
  return null
}

// Состояние для карточки игры: какой движок, стоит ли перевод
function status(installPath) {
  const ctx = detect(installPath)
  if (!ctx) return { supported: false }
  return {
    supported: true,
    engine: ctx.engine,
    engineTitle: ctx.module.variantOf ? ctx.module.variantOf(ctx) : ctx.variant ? `RPG Maker ${ctx.variant}` : ctx.module.title,
    applied: ctx.module.isApplied(ctx),
    nativeRussian: !!ctx.nativeRussian,
    runtime: !!ctx.module.runtime,
    backend: ctx.backend,
    // Перевод заведомо невозможен (подпись/шифрование паков Unreal) — причина для панели
    blocked: ctx.module.precheck?.(ctx) || null,
  }
}

// --- память переводов: общий кэш «оригинал → перевод» на всех играх ---

function tmPath(dataDir) { return path.join(dataDir, `tm-${PAIR}.json`) }

// Одна копия на процесс: её же пополняет сервер перевода для Unity
let tmCache = null
function loadTM(dataDir) {
  if (tmCache?.dir === dataDir) return tmCache.map
  let map = new Map()
  try {
    const j = JSON.parse(fs.readFileSync(tmPath(dataDir), 'utf8'))
    if (j.v === TM_VERSION) map = new Map(Object.entries(j.items))
  } catch { /* нет кэша */ }
  tmCache = { dir: dataDir, map }
  return map
}

async function saveTM(dataDir, tm) {
  const file = tmPath(dataDir)
  await fs.promises.writeFile(file + '.part', JSON.stringify({ v: TM_VERSION, items: Object.fromEntries(tm) }), 'utf8')
  await fs.promises.rename(file + '.part', file)
}

// Bergamot иногда повторяет слово или фразу: «Алюминий Алюминий», «Здравствуйте, здравствуйте».
// Убираем повтор, если в оригинале его не было.
const REPEAT = /(^|[^\p{L}])(\p{L}[\p{L}'-]*)(?:[,\s]+\2)+(?!\p{L})/giu
function dedupe(src, out) {
  if (/(^|[^A-Za-z])([A-Za-z][A-Za-z'-]*)[,\s]+\2(?![A-Za-z])/i.test(src)) return out
  return out.replace(REPEAT, '$1$2')
}

// Общая чистка вывода модели
function postprocess(src, t) {
  t = dedupe(src, t)
  // На одно-два слова модель иногда выдаёт варианты через запятую («Дерика, Дейка») — берём первый
  if (src.trim().split(/\s+/).length <= 2 && !src.includes(',') && t.includes(',')) t = t.split(',')[0].trim()
  return t
}

// --- сервер перевода для Unity (XUnity.AutoTranslator → CustomTranslate) ---
let server = null
async function startServer(dataDir) {
  if (server) return server
  await fs.promises.mkdir(dataDir, { recursive: true })
  const tm = loadTM(dataDir)
  const s = createServer({ dataDir, tm, saveTM: () => saveTM(dataDir, tm), postprocess })
  try {
    await s.listen()
  } catch (e) {
    // Порт занят: если это уже наш сервер (второй экземпляр Lustre) — просто пользуемся им
    if (e?.code === 'EADDRINUSE' && await probeServer(s.port)) return { port: s.port, external: true }
    if (e?.code === 'EADDRINUSE') throw new Error(`Порт ${s.port} занят другой программой — перевод Unity-игр недоступен`)
    throw e
  }
  server = s
  return s
}

async function probeServer(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/translate?from=en&to=ru&text=`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch { return false }
}
async function stopServer() {
  const s = server
  server = null
  await s?.close()
}

let running = null // { abort: AbortController, installPath }

/**
 * @param {{ installPath: string, dataDir: string, onProgress?: (p: object) => void }} opts
 */
async function translate({ installPath, dataDir, onProgress }) {
  if (running) throw new Error('Перевод другой игры уже идёт')
  const ctx = detect(installPath)
  if (!ctx) throw new Error('Движок игры не поддерживается (пока Ren\'Py, RPG Maker MV/MZ, Godot, Unity и Unreal)')
  const abort = new AbortController()
  running = { abort, installPath }
  const progress = (p) => { try { onProgress?.(p) } catch { /* окно закрыто */ } }
  const cancelled = () => abort.signal.aborted
  const started = Date.now()
  let pool = null
  try {
    await fs.promises.mkdir(dataDir, { recursive: true })

    // Перевод во время игры (Unity): модель + плагин, текст переводится на лету сервером лаунчера
    if (ctx.module.runtime) {
      progress({ phase: 'model', done: 0, total: 1 })
      await ensureModel(dataDir, PAIR, (done, total) => progress({ phase: 'model', done, total }), abort.signal)
      if (cancelled()) throw new Error('Отменено')
      const srv = await startServer(dataDir)
      progress({ phase: 'install', done: 0, total: 1 })
      const res = await ctx.module.apply(ctx, { port: srv.port, dataDir, onProgress: progress, signal: abort.signal })
      const stats = { engine: ctx.engine, runtime: true, backend: ctx.backend, files: res.files, strings: 0, translated: 0, failed: 0, badFonts: [], errors: [], ms: Date.now() - started }
      progress({ phase: 'done', stats })
      return stats
    }

    progress({ phase: 'scan' })
    const ex = ctx.module.extract(ctx)
    if (!ex.segments.length) {
      const why = ex.broken?.length ? `архивы в нестандартном формате (${ex.broken.join(', ')})` : 'текст не найден'
      throw new Error('Нечего переводить: ' + why)
    }
    const grammar = { renpy: RENPY, rpgmv: RPGM, godot: GODOT, unreal: UNREAL }[ctx.engine]
    const glossary = { renpy: RENPY_UI, rpgmv: RPGM_TERMS, godot: GENERIC_UI, unreal: GENERIC_UI }[ctx.engine]

    // Уникальные строки, которые нужно перевести
    const tm = loadTM(dataDir)
    const result = new Map() // оригинал → перевод
    const todo = []
    const seen = new Set()
    for (const { text } of ex.segments) {
      if (seen.has(text)) continue
      seen.add(text)
      const g = glossary[text] ?? glossary[text.trim()]
      if (g != null) { result.set(text, text.replace(text.trim(), g)); continue }
      if (!hasWords(text, grammar)) continue
      const cached = tm.get(text)
      if (cached != null) { result.set(text, cached); continue }
      todo.push(text)
    }

    if (todo.length) {
      progress({ phase: 'model', done: 0, total: 1 })
      const model = await ensureModel(dataDir, PAIR, (done, total) => progress({ phase: 'model', done, total }), abort.signal)
      if (cancelled()) throw new Error('Отменено')
      progress({ phase: 'translate', done: 0, total: todo.length })
      pool = new MTPool({ modelDir: model.dir, files: model.files })
      await pool.start()

      const run = async (texts, stubs) => {
        const prot = texts.map(t => protect(t, grammar, { stubs }))
        const out = await pool.translate(prot.map(p => p.html), {
          html: true,
          isCancelled: cancelled,
          onBatch: stubs ? (n) => { done += n; progress({ phase: 'translate', done, total: todo.length }) } : undefined,
        })
        return prot.map((p, i) => p.restore(out[i]))
      }
      let done = 0
      const first = await run(todo, true)
      if (cancelled()) throw new Error('Отменено')
      // Где разметка не восстановилась — второй заход без условных слов
      const retry = []
      first.forEach((t, i) => { if (t == null) retry.push(i) })
      if (retry.length) {
        const second = await run(retry.map(i => todo[i]), false)
        retry.forEach((idx, j) => { first[idx] = second[j] })
      }
      first.forEach((t, i) => {
        if (t == null || !t.trim()) return
        t = postprocess(todo[i], t)
        result.set(todo[i], t)
        tm.set(todo[i], t)
      })
      await saveTM(dataDir, tm)
    }
    if (cancelled()) throw new Error('Отменено')

    progress({ phase: 'apply' })
    if (ctx.engine === 'renpy') {
      const say = {}
      const ui = {}
      for (const s of ex.segments) {
        const t = result.get(s.text)
        if (t == null) continue
        if (s.kind === 'ui') ui[s.text] = t; else say[s.text] = t
      }
      // стандартный интерфейс Ren'Py (часть строк живёт в движке, а не в скриптах игры)
      for (const [k, v] of Object.entries(RENPY_UI)) if (!(k in ui)) ui[k] = v
      await ctx.module.apply(ctx, { say, ui, fonts: ex.badFonts })
    } else if (ctx.engine === 'godot') {
      const tr = Object.fromEntries(result)
      for (const [k, v] of Object.entries(GENERIC_UI)) if (!(k in tr)) tr[k] = v
      await ctx.module.apply(ctx, { tr })
    } else {
      await ctx.module.apply(ctx, { table: Object.fromEntries(result) })
    }

    const stats = {
      engine: ctx.engine,
      strings: seen.size,
      translated: result.size,
      failed: todo.filter(t => !result.has(t)).length,
      badFonts: ex.badFonts,
      errors: ex.errors.slice(0, 20),
      ms: Date.now() - started,
    }
    progress({ phase: 'done', stats })
    return stats
  } finally {
    running = null
    if (pool) await pool.stop()
  }
}

function cancel() {
  running?.abort.abort()
  return !!running
}

async function revert(installPath) {
  const ctx = detect(installPath)
  if (!ctx) throw new Error('Движок игры не поддерживается')
  if (running?.installPath === installPath) throw new Error('Сначала остановите перевод')
  await ctx.module.revert(ctx)
  return { ok: true }
}

module.exports = { status, translate, cancel, revert, detect, startServer, stopServer }
