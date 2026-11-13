// Локальный машинный перевод на Bergamot: загрузка модели и пул потоков.
// WASM (vendor/bergamot) едет в дистрибутиве, модель языковой пары (~21 МБ)
// скачивается один раз при первом переводе и проверяется по SHA-256.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const zlib = require('node:zlib')
const crypto = require('node:crypto')
const { Worker } = require('node:worker_threads')
const { httpFetch, chunks: bodyChunks } = require('./net.cjs')

// Реестр моделей Bergamot: https://bergamot.s3.amazonaws.com/models/index.json
const MODELS = {
  'en-ru': {
    base: 'https://bergamot.s3.amazonaws.com/models/enru/',
    files: {
      vocab: { name: 'vocab.enru.spm', size: 937157, sha256: 'feca2d44f01b946c85faba3b15b5eb53344bec84cd14a1a4d4a82ddd774c5edd' },
      lex: { name: 'lex.50.50.enru.s2t.bin', size: 3049096, sha256: '7bd3e2c0a72286fe1f3da65c56c49a7cd77efa5f1d1a444e2a9e769480b96ff3' },
      model: { name: 'model.enru.intgemm.alphas.bin', size: 17140836, sha256: '4a45186a93b8a2dd9301c66a3b3dad580b1bcfa74aadda583ca383f9fe0dea93' },
    },
  },
}

function wasmDir() {
  const cands = []
  if (process.resourcesPath) cands.push(path.join(process.resourcesPath, 'vendor', 'bergamot'))
  cands.push(path.join(__dirname, '..', '..', 'vendor', 'bergamot'))
  const hit = cands.find(d => fs.existsSync(path.join(d, 'bergamot-translator-worker.wasm')))
  if (!hit) throw new Error('Не найден движок перевода (vendor/bergamot)')
  return hit
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

function fileOk(p, spec) {
  try {
    const st = fs.statSync(p)
    if (st.size !== spec.size) return false
    return sha256(fs.readFileSync(p)) === spec.sha256
  } catch { return false }
}

// Скачивает недостающие файлы модели в <dataDir>/models/<pair>.
// onProgress(получено байт, всего байт)
async function ensureModel(dataDir, pair, onProgress, signal) {
  const spec = MODELS[pair]
  if (!spec) throw new Error(`Нет модели для пары ${pair}`)
  const dir = path.join(dataDir, 'models', pair)
  await fs.promises.mkdir(dir, { recursive: true })
  const entries = Object.values(spec.files)
  const total = entries.reduce((s, f) => s + f.size, 0)
  let done = 0
  for (const f of entries) {
    const dest = path.join(dir, f.name)
    if (fileOk(dest, f)) { done += f.size; onProgress?.(done, total); continue }
    const res = await httpFetch(spec.base + f.name, { signal })
    if (!res.ok) throw new Error(`Не удалось скачать модель перевода (${res.status})`)
    const chunks = []
    let got = 0
    for await (const chunk of bodyChunks(res)) {
      chunks.push(chunk)
      got += chunk.length
      onProgress?.(done + Math.min(got, f.size), total)
    }
    let buf = Buffer.concat(chunks)
    // S3 отдаёт файлы gzip-ом; fetch обычно распаковывает сам, но не всегда
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf)
    if (buf.length !== f.size || sha256(buf) !== f.sha256) throw new Error(`Файл модели повреждён: ${f.name}`)
    await fs.promises.writeFile(dest + '.part', buf)
    await fs.promises.rename(dest + '.part', dest)
    done += f.size
    onProgress?.(done, total)
  }
  return { dir, files: Object.fromEntries(Object.entries(spec.files).map(([k, f]) => [k, f.name])) }
}

// Пул потоков. Каждый поток держит свою копию модели (~150 МБ памяти),
// поэтому потоков немного: половина ядер, не больше 4.
class MTPool {
  constructor({ modelDir, files, threads }) {
    this.modelDir = modelDir
    this.files = files
    this.threads = threads || Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2)))
    this.workers = []
    this.seq = 0
  }

  async start() {
    const dir = wasmDir()
    // В сборке поток грузится из app.asar.unpacked (см. build.asarUnpack): из архива asar worker не стартует
    let script = path.join(__dirname, 'mt-worker.cjs')
    const unpacked = script.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
    if (unpacked !== script && fs.existsSync(unpacked)) script = unpacked
    const boot = []
    for (let i = 0; i < this.threads; i++) {
      const w = new Worker(script, {
        workerData: { wasmDir: dir, modelDir: this.modelDir, files: this.files },
      })
      const slot = { w, busy: false, pending: new Map() }
      boot.push(new Promise((resolve, reject) => {
        const onFirst = (msg) => {
          if (!('ready' in msg)) return
          w.off('message', onFirst)
          if (msg.ready) resolve()
          else reject(new Error('Движок перевода не запустился: ' + msg.error))
        }
        w.on('message', onFirst)
        w.once('error', reject)
      }))
      w.on('message', (msg) => {
        const p = slot.pending.get(msg.id)
        if (!p) return
        slot.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.out)
      })
      w.on('error', (e) => { for (const p of slot.pending.values()) p.reject(e); slot.pending.clear() })
      this.workers.push(slot)
    }
    await Promise.all(boot)
  }

  _send(slot, texts, html) {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      slot.pending.set(id, { resolve, reject })
      slot.w.postMessage({ id, texts, html })
    })
  }

  // Переводит массив строк, раскидывая пачки по потокам.
  // Если пачка уронила движок — переводим её строки по одной, сбойные оставляем как есть (null).
  async translate(texts, { html = true, batch = 40, onBatch, isCancelled } = {}) {
    const out = new Array(texts.length).fill(null)
    let next = 0
    const run = async (slot) => {
      while (next < texts.length) {
        if (isCancelled?.()) return
        const from = next
        next = Math.min(texts.length, next + batch)
        const part = texts.slice(from, next)
        try {
          const res = await this._send(slot, part, html)
          res.forEach((t, i) => { out[from + i] = t })
        } catch {
          for (let i = 0; i < part.length; i++) {
            try { out[from + i] = (await this._send(slot, [part[i]], html))[0] } catch { /* оставляем null */ }
          }
        }
        onBatch?.(part.length)
      }
    }
    await Promise.all(this.workers.map(run))
    return out
  }

  async stop() {
    await Promise.all(this.workers.map(s => s.w.terminate().catch(() => {})))
    this.workers = []
  }
}

module.exports = { ensureModel, MTPool, MODELS }
