// Локальный сервер перевода для игр, переводимых во время игры (Unity + XUnity.AutoTranslator).
// Слушает только 127.0.0.1. Формат XUnity CustomTranslate: GET /translate?from=en&to=ru&text=… → текст.
// Модель поднимается при первом запросе и выгружается после простоя.
const http = require('node:http')
const { protect, hasWords, UNITY } = require('./markup.cjs')
const { GENERIC_UI } = require('./glossary.cjs')
const { ensureModel, MTPool } = require('./mt.cjs')

const PORT = 51719
const IDLE_MS = 10 * 60 * 1000
// Строка интерфейса или реплика игры; длиннее — не текст игры
const MAX_TEXT = 4000

function createServer({ dataDir, tm, saveTM, postprocess }) {
  let pool = null
  let starting = null
  let idleTimer = null
  let saveTimer = null

  const touch = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(async () => {
      const p = pool
      pool = null
      starting = null
      await p?.stop()
    }, IDLE_MS)
  }

  const getPool = () => {
    if (pool) return Promise.resolve(pool)
    if (!starting) {
      starting = (async () => {
        const model = await ensureModel(dataDir, 'en-ru')
        // Для игры хватает двух потоков: тексты приходят по одному
        const p = new MTPool({ modelDir: model.dir, files: model.files, threads: 2 })
        await p.start()
        pool = p
        return p
      })().catch((e) => { starting = null; throw e })
    }
    return starting
  }

  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveTM().catch(() => {}), 5000)
  }

  async function translateOne(text) {
    const g = GENERIC_UI[text] ?? GENERIC_UI[text.trim()]
    if (g != null) return text.replace(text.trim(), g)
    if (!hasWords(text, UNITY)) return text
    const cached = tm.get(text)
    if (cached != null) return cached
    const p = await getPool()
    touch()
    let out = null
    for (const stubs of [true, false]) {
      const prot = protect(text, UNITY, { stubs })
      const [res] = await p.translate([prot.html], { html: true, batch: 1 })
      out = prot.restore(res)
      if (out != null) break
    }
    if (out == null || !out.trim()) return text
    out = postprocess(text, out)
    tm.set(text, out)
    scheduleSave()
    return out
  }

  const server = http.createServer(async (req, res) => {
    // Сервер нужен только игре (XUnity шлёт обычный HTTP-запрос). Браузер же добавляет к
    // запросам Origin/Sec-Fetch-* — так любая открытая страница могла бы дёргать перевод
    // (скачивание модели, нагрузка на процессор). Host проверяем от DNS rebinding.
    const host = String(req.headers.host || '')
    if (req.headers.origin || req.headers['sec-fetch-site'] || req.headers['sec-fetch-mode'] ||
        (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`)) {
      res.writeHead(403).end()
      return
    }
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname !== '/translate') { res.writeHead(404).end(); return }
    const text = url.searchParams.get('text') ?? ''
    if (text.length > MAX_TEXT) { res.writeHead(413).end(); return }
    const to = (url.searchParams.get('to') || 'ru').toLowerCase()
    if (!to.startsWith('ru')) { res.writeHead(400).end('only ru'); return }
    try {
      const out = await translateOne(text)
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(out)
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(String(e?.message || e))
    }
  })

  return {
    port: PORT,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(PORT, '127.0.0.1', () => { server.off('error', reject); resolve() })
    }),
    async close() {
      clearTimeout(idleTimer)
      clearTimeout(saveTimer)
      await saveTM().catch(() => {})
      server.close()
      await pool?.stop()
    },
    translateOne,
  }
}

module.exports = { createServer, PORT }
