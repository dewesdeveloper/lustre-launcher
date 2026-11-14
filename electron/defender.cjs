// Проверка скачанной игры Защитником Windows перед установкой.
//
// Используется консольный сканер MpCmdRun.exe, который есть в каждой Windows 10/11.
// -DisableRemediation: найденное не удаляется и не помещается в карантин — решает игрок.
// Если Защитник отключён или заменён другим антивирусом, проверка пропускается (unavailable).

const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const SCAN_TIMEOUT_MS = 40 * 60 * 1000

/** Путь к MpCmdRun.exe: свежая платформа из ProgramData, иначе стандартная папка */
function findMpCmdRun() {
  const platform = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows Defender', 'Platform')
  try {
    // папки с номером версии (4.18.…); «CurrentVersion» — ссылка на одну из них, её берём последней
    const versions = fs.readdirSync(platform)
      .filter((v) => fs.existsSync(path.join(platform, v, 'MpCmdRun.exe')))
      .sort((a, b) => Number(/^\d/.test(b)) - Number(/^\d/.test(a)) || b.localeCompare(a, undefined, { numeric: true }))
    if (versions.length) {
      const version = /^\d/.test(versions[0]) ? versions[0] : ''
      return { exe: path.join(platform, versions[0], 'MpCmdRun.exe'), version }
    }
  } catch { /* папки нет */ }
  const legacy = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe')
  return fs.existsSync(legacy) ? { exe: legacy, version: '' } : null
}

/** Названия угроз из вывода MpCmdRun («Threat : Trojan:Win32/…») */
function parseThreats(output) {
  const found = new Set()
  for (const m of String(output).matchAll(/^\s*Threat\s*:\s*(.+?)\s*$/gim)) found.add(m[1])
  return [...found]
}

/**
 * Проверить файл или папку.
 * Итог: { status: 'clean' | 'threat' | 'unavailable' | 'error', threats, engine }
 */
function scanPath(target) {
  const mp = process.platform === 'win32' ? findMpCmdRun() : null
  if (!mp) return Promise.resolve({ status: 'unavailable', threats: [], engine: '' })
  const engine = `Windows Defender${mp.version ? ' ' + mp.version : ''}`
  return new Promise((resolve) => {
    let out = ''
    let done = false
    const finish = (r) => { if (!done) { done = true; resolve({ ...r, engine }) } }
    let child
    try {
      child = spawn(mp.exe, ['-Scan', '-ScanType', '3', '-File', target, '-DisableRemediation'], { windowsHide: true })
    } catch {
      return finish({ status: 'unavailable', threats: [] })
    }
    const timer = setTimeout(() => { try { child.kill() } catch {} ; finish({ status: 'error', threats: [] }) }, SCAN_TIMEOUT_MS)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('error', () => { clearTimeout(timer); finish({ status: 'unavailable', threats: [] }) })
    child.on('close', (code) => {
      clearTimeout(timer)
      // 0 — угроз нет, 2 — найдены угрозы; остальное — сбой проверки (Защитник выключен и т.п.)
      if (code === 0) return finish({ status: 'clean', threats: [] })
      if (code === 2) return finish({ status: 'threat', threats: parseThreats(out) })
      finish({ status: /0x800106ba|service|отключ|disabled/i.test(out) ? 'unavailable' : 'error', threats: [] })
    })
  })
}

/** SHA-256 файла (у папки — пусто: у раздачи из многих файлов единого хеша нет) */
function sha256File(target) {
  return new Promise((resolve) => {
    let stat
    try { stat = fs.statSync(target) } catch { return resolve('') }
    if (!stat.isFile()) return resolve('')
    const hash = crypto.createHash('sha256')
    fs.createReadStream(target)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', () => resolve(''))
  })
}

module.exports = { scanPath, sha256File, parseThreats, findMpCmdRun }
