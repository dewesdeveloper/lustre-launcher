// Файлообменники: как скачать игру по ссылке на страницу файла.
//
//   pixeldrain — открытое API: /u/{id} → api/file/{id}?download, папка /l/{id} → zip целиком;
//   mediafire  — ссылка с кнопки «Download» на странице файла (то же, что делает браузер);
//   mega       — официальное API через библиотеку megajs, файл расшифровывается в лаунчере;
//   browser    — сервисы без открытого API (Gofile, Mixdrop и любые неизвестные страницы):
//                страница открывается во встроенном окне, пользователь сам нажимает «Скачать»,
//                а лаунчер перехватывает файл. Защиту сервисов (капчи, ключи) не обходим.
//   direct     — прямая ссылка на файл.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// Сервисы, которые качаются только через встроенное окно
const BROWSER_HOSTS = [
  /(^|\.)gofile\.io$/,
  /(^|\.)mixdrop\.[a-z]+$/, /(^|\.)m1xdrop\.[a-z]+$/, /(^|\.)mixdrp\.[a-z]+$/,
  /(^|\.)1fichier\.com$/, /(^|\.)uptobox\.com$/, /(^|\.)krakenfiles\.com$/,
  /(^|\.)workupload\.com$/, /(^|\.)buzzheavier\.com$/, /(^|\.)qiwi\.gg$/, /(^|\.)datanodes\.to$/,
  /(^|\.)drive\.google\.com$/, /(^|\.)disk\.yandex\.[a-z]+$/, /(^|\.)cloud\.mail\.ru$/,
]

function hostOf(raw) {
  try {
    return new URL(String(raw)).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** Как качать ссылку: pixeldrain | mega | mediafire | browser | direct */
function hostKind(url, kind) {
  const host = hostOf(url)
  if (kind === 'pixeldrain' || /(^|\.)pixeldrain\.(com|net)$/.test(host)) return 'pixeldrain'
  if (kind === 'mega' || /(^|\.)mega\.(nz|co\.nz|io)$/.test(host)) return 'mega'
  if (kind === 'mediafire' || /(^|\.)mediafire\.com$/.test(host)) {
    // сама ссылка с сервера загрузки уже прямая
    return /^download\d*\.mediafire\.com$/.test(host) ? 'direct' : 'mediafire'
  }
  if (kind === 'browser' || BROWSER_HOSTS.some((re) => re.test(host))) return 'browser'
  return 'direct'
}

/** Pixeldrain: файл — прямой поток API, папка (список) — zip-архив целиком */
function pixeldrainUrl(url) {
  const m = /pixeldrain\.(?:com|net)\/(u|l|api\/file|api\/list)\/([\w-]+)/i.exec(String(url))
  if (!m) return String(url)
  const isList = m[1] === 'l' || m[1] === 'api/list'
  return isList ? `https://pixeldrain.com/api/list/${m[2]}/zip` : `https://pixeldrain.com/api/file/${m[2]}?download`
}

/** MediaFire: ссылка кнопки «Download» со страницы файла (обычная или в data-scrambled-url) */
function parseMediafirePage(html) {
  const page = String(html || '')
  const button = /<a[^>]+id="downloadButton"[^>]*>/i.exec(page)?.[0] || ''
  const scrambled = /data-scrambled-url="([A-Za-z0-9+/=]+)"/i.exec(button || page)?.[1]
  if (scrambled) {
    try {
      const decoded = Buffer.from(scrambled, 'base64').toString('utf8')
      if (/^https:\/\/download\d*\.mediafire\.com\//i.test(decoded)) return decoded
    } catch { /* ниже — обычная ссылка */ }
  }
  const href = /href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/i.exec(button || page)?.[1]
  return href ? href.replace(/&amp;/g, '&') : ''
}

async function resolveMediafire(url) {
  const res = await fetch(String(url), { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow' })
  if (res.status === 404) throw new Error('Файл на MediaFire удалён или ссылка неверная')
  if (!res.ok) throw new Error(`MediaFire: HTTP ${res.status}`)
  const direct = parseMediafirePage(await res.text())
  if (!direct) throw new Error('MediaFire не отдал ссылку на файл — попробуйте открыть её во встроенном окне')
  return direct
}

/** Название сервиса для подписей */
function hostLabel(url) {
  const host = hostOf(url).replace(/^www\./, '')
  if (/gofile/.test(host)) return 'Gofile'
  if (/m[i1]xdr[o]?p/.test(host)) return 'Mixdrop'
  if (/mega\./.test(host)) return 'MEGA'
  if (/mediafire/.test(host)) return 'MediaFire'
  if (/pixeldrain/.test(host)) return 'Pixeldrain'
  return host || 'сайт'
}

module.exports = { hostKind, hostOf, hostLabel, pixeldrainUrl, parseMediafirePage, resolveMediafire, BROWSER_UA }
