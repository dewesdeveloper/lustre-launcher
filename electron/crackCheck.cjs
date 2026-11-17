// crackCheck.cjs — применён ли в установленной игре кряк Steam.
//
// Многие репаки на Inno Setup предлагают в мастере выбор «Crack version / Steam version».
// Лаунчер ставит их тихо (/VERYSILENT), мастер не показывается, и иногда срабатывает вариант
// по умолчанию — «Steam version»: в папке остаётся оригинальная steam_api(64).dll от Valve,
// игра при запуске не находит покупку в Steam и открывает его страницу магазина.
//
// Признак проблемы: все steam_api*.dll в папке игры подписаны Valve и рядом нет ни одного
// следа эмулятора/кряка. Эмуляторы (Goldberg, CODEX, RUNE…) подменяют dll своей — без подписи
// Valve; другие (OnlineFix, CreamAPI, TENOKE) оставляют оригинал, но кладут свои файлы.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const MAX_DEPTH = 5
const MAX_ENTRIES = 20000

const STEAM_API_RE = /^steam_api(64)?\.dll$/i
// файлы и папки кряков/эмуляторов Steam
const MARKER_FILE_RE = new RegExp([
  'steam_emu\\.ini', 'steam_api(64)?\\.ini', 'steam_api(64)?_o\\.dll', 'steam_interfaces\\.txt',
  'local_save\\.txt', 'account_name\\.txt', 'force_account_name\\.txt', 'steam_appid\\.txt',
  'codex\\.ini', 'rune\\.ini', 'tenoke\\.ini', 'empress\\.ini', 'flt\\.ini', 'razor1911\\.ini',
  'onlinefix(64)?\\.(ini|dll)', 'cream_api\\.ini', 'coldclientloader\\.ini', 'steamclient_loader.*\\.exe',
  'smartsteamemu\\.ini', 'ali213\\.ini', '3dmgame\\.ini', 'unsteam\\.ini', 'steamless.*', '.*\\.cdx',
].map((s) => `^${s}$`).join('|'), 'i')
const MARKER_DIR_RE = /^(steam_settings|steamdata|3dmgame|steamemu|onlinefix|smartsteamemu)$/i

/** Обход папки игры: steam_api*.dll и следы кряка */
function scan(dir) {
  const dlls = []
  const markers = []
  const stack = [{ dir, depth: 0 }]
  let seen = 0
  while (stack.length && seen < MAX_ENTRIES) {
    const cur = stack.pop()
    let items
    try { items = fs.readdirSync(cur.dir, { withFileTypes: true }) } catch { continue }
    for (const it of items) {
      seen++
      const full = path.join(cur.dir, it.name)
      if (it.isDirectory()) {
        if (MARKER_DIR_RE.test(it.name)) markers.push(full)
        if (cur.depth < MAX_DEPTH) stack.push({ dir: full, depth: cur.depth + 1 })
      } else if (STEAM_API_RE.test(it.name)) {
        dlls.push(full)
      } else if (MARKER_FILE_RE.test(it.name)) {
        markers.push(full)
      }
    }
  }
  return { dlls, markers }
}

const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'"

/** Подписан ли каждый файл Valve (Authenticode). Ошибка проверки — null. */
function valveSigned(files) {
  if (process.platform !== 'win32' || files.length === 0) return Promise.resolve(null)
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    `foreach ($f in @(${files.map(psQuote).join(',')})) {`,
    '  $s = Get-AuthenticodeSignature -LiteralPath $f',
    '  $ok = ($s.Status -eq "Valid") -and ("$($s.SignerCertificate.Subject)" -match "Valve")',
    '  "SIG|$ok"',
    '}',
  ].join('\n')
  return new Promise((resolve) => {
    let out = ''
    let child
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true })
    } catch { return resolve(null) }
    const timer = setTimeout(() => { try { child.kill() } catch { /* ignore */ } resolve(null) }, 30000)
    child.stdout.on('data', (d) => { out += d })
    child.on('error', () => { clearTimeout(timer); resolve(null) })
    child.on('close', () => {
      clearTimeout(timer)
      const res = out.split(/\r?\n/).filter((l) => l.startsWith('SIG|')).map((l) => /true/i.test(l))
      resolve(res.length === files.length ? res : null)
    })
  })
}

/**
 * Проверить установленную игру.
 * status: 'ok' — кряк есть; 'steam-only' — оригинальный Steam API без кряка (игра откроет Steam);
 *         'no-steam' — игра без Steam API (GOG, DRM-free); 'unknown' — проверить не удалось.
 */
async function check(gameDir) {
  if (!gameDir) return { status: 'unknown' }
  const { dlls, markers } = scan(gameDir)
  if (dlls.length === 0) return { status: 'no-steam' }
  if (markers.length > 0) return { status: 'ok', markers: markers.slice(0, 5) }
  const signed = await valveSigned(dlls)
  if (!signed) return { status: 'unknown', dlls }
  // хоть одна dll подменена (нет подписи Valve) — это эмулятор
  if (signed.some((v) => !v)) return { status: 'ok', dlls }
  return { status: 'steam-only', dlls }
}

module.exports = { check, scan }
