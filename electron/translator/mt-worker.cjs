// Поток машинного перевода: Bergamot (движок переводчика Firefox), WASM на CPU.
// Без нейросетевых сервисов и сети: модель лежит на диске (см. mt.cjs).
// Протокол: init → { ok } ; { id, texts, html } → { id, out } | { id, error }
const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const { wasmDir, modelDir, files } = workerData

// Заглушки intgemm: в WASM-сборке есть встроенные реализации под другими именами
const GEMM = {
  int8_prepare_a: 'int8PrepareAFallback',
  int8_prepare_b: 'int8PrepareBFallback',
  int8_prepare_b_from_transposed: 'int8PrepareBFromTransposedFallback',
  int8_prepare_b_from_quantized_transposed: 'int8PrepareBFromQuantizedTransposedFallback',
  int8_prepare_bias: 'int8PrepareBiasFallback',
  int8_multiply_and_add_bias: 'int8MultiplyAndAddBiasFallback',
  int8_select_columns_of_b: 'int8SelectColumnsOfBFallback',
}

function loadModule() {
  const wasm = fs.readFileSync(path.join(wasmDir, 'bergamot-translator-worker.wasm'))
  return new Promise((resolve, reject) => {
    const Module = {
      instantiateWasm(info, accept) {
        const gemm = {}
        for (const [k, v] of Object.entries(GEMM)) gemm[k] = (...a) => Module.asm[v](...a)
        WebAssembly.instantiate(wasm, { ...info, wasm_gemm: gemm })
          .then(({ instance }) => accept(instance))
          .catch(reject)
        return {}
      },
      onRuntimeInitialized() { resolve(Module) },
      print() {},
      printErr() {},
    }
    // emscripten-обвязка ищет глобальный Module
    globalThis.Module = Module
    try {
      const glue = fs.readFileSync(path.join(wasmDir, 'bergamot-translator-worker.js'), 'utf8')
      vm.runInThisContext(glue, { filename: 'bergamot-translator-worker.js' })
    } catch (e) { reject(e) }
  })
}

const CONFIG = [
  'beam-size: 1', 'normalize: 1.0', 'word-penalty: 0', 'cpu-threads: 0',
  'gemm-precision: int8shiftAlphaAll', 'skip-cost: true', 'alignment: soft',
  'quiet: true', 'quiet-translation: true', 'max-length-break: 128',
  'mini-batch-words: 1024', 'workspace: 128', 'max-length-factor: 2.0',
].join('\n') + '\n'

let M, model, service

async function init() {
  M = await loadModule()
  const mem = (file, align) => {
    const buf = fs.readFileSync(path.join(modelDir, file))
    const m = new M.AlignedMemory(buf.byteLength, align)
    m.getByteArrayView().set(buf)
    return m
  }
  const vocabs = new M.AlignedMemoryList()
  vocabs.push_back(mem(files.vocab, 64))
  model = new M.TranslationModel(CONFIG, mem(files.model, 256), mem(files.lex, 64), vocabs, null)
  service = new M.BlockingService({ cacheSize: 0 })
}

function translate(texts, html) {
  const input = new M.VectorString()
  const opts = new M.VectorResponseOptions()
  for (const t of texts) {
    input.push_back(t)
    opts.push_back({ alignment: false, html: !!html, qualityScores: false })
  }
  const res = service.translate(model, input, opts)
  const out = []
  for (let i = 0; i < res.size(); i++) out.push(res.get(i).getTranslatedText())
  input.delete(); opts.delete(); res.delete?.()
  return out
}

init().then(() => {
  parentPort.postMessage({ ready: true })
  parentPort.on('message', (msg) => {
    try {
      parentPort.postMessage({ id: msg.id, out: translate(msg.texts, msg.html) })
    } catch (e) {
      parentPort.postMessage({ id: msg.id, error: String(e?.message || e) })
    }
  })
}).catch((e) => parentPort.postMessage({ ready: false, error: String(e?.stack || e) }))
