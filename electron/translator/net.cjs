// Загрузки переводчика: в лаунчере — сетевой стек Chromium (net.fetch учитывает системный прокси/VPN
// пользователя), вне Electron (тесты) — обычный fetch из Node.
let netFetch = null
try {
  const electron = require('electron')
  if (electron && typeof electron === 'object' && electron.net?.fetch) netFetch = electron.net.fetch.bind(electron.net)
} catch { /* не Electron */ }

function httpFetch(url, opts) {
  return netFetch ? netFetch(url, opts) : fetch(url, opts)
}

// Тело ответа по кускам: и у net.fetch, и у fetch это web ReadableStream
async function* chunks(res) {
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    yield Buffer.from(value)
  }
}

module.exports = { httpFetch, chunks }
