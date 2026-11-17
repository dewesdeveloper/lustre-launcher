// Следы установщика игры в Windows («Установленные приложения»). Репаки на Inno Setup при
// установке пишут запись …_is1 в раздел Uninstall реестра. Раньше лаунчер при удалении игры
// стирал только папку, и запись оставалась: в «Установленных приложениях» висела игра, а её
// деинсталлятор выдавал «Не удаётся найти unins000.exe».
//
// Здесь: найти записи, ведущие в папку игры; запустить деинсталлятор игры (он убирает запись,
// ярлыки в «Пуске» и свои файлы); оставшиеся записи удалить. Записи в HKLM требуют прав
// администратора — тогда Windows один раз спросит разрешение.
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOTS = [
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
]

const psQuote = (s) => "'" + String(s).replace(/'/g, "''") + "'"

function runPs(script, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    const timer = setTimeout(() => { try { child.kill() } catch { /* ignore */ } }, timeoutMs)
    child.on('error', () => { clearTimeout(timer); resolve('') })
    child.on('exit', () => { clearTimeout(timer); resolve(out) })
  })
}

// Скрипт: записи Uninstall, у которых InstallLocation или путь деинсталлятора — папка игры
const findScript = (dir) => [
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  `$dir = ${psQuote(path.resolve(dir).replace(/[\\/]+$/, ''))}`,
  `$roots = @(${ROOTS.map(psQuote).join(',')})`,
  'foreach ($r in $roots) { Get-ChildItem $r -ErrorAction SilentlyContinue | ForEach-Object {',
  '  $p = Get-ItemProperty $_.PSPath',
  '  $loc = "$($p.InstallLocation)".TrimEnd(\'\\\')',
  '  $un = "$($p.UninstallString)".Trim(\'"\')',
  '  if (($loc -and $loc -ieq $dir) -or ($un -and (Split-Path $un -Parent) -ieq $dir)) { "KEY|$($_.PSPath)" }',
  '} }',
].join('\n')

/** Записи «Установленных приложений», ведущие в папку игры: [{ psPath, machine }] */
async function findUninstallEntries(dir) {
  if (process.platform !== 'win32' || !dir) return []
  const out = await runPs(findScript(dir), 30000)
  return out.split(/\r?\n/).filter((l) => l.startsWith('KEY|')).map((l) => {
    const psPath = l.slice(4).trim()
    return { psPath, machine: /HKEY_LOCAL_MACHINE/i.test(psPath) }
  })
}

/**
 * Удалить игру как приложение Windows: деинсталлятор (тихо) + оставшиеся записи реестра.
 * Возвращает { removed: число убранных записей, cancelled: отказ в окне прав администратора }.
 */
/**
 * Скрипт удаления: деинсталлятор Inno (он копирует себя во временную папку и сразу выходит —
 * ждём, пока запись исчезнет), затем удаляем всё, что осталось
 */
function removeScript(entries, unins) {
  return [
    unins ? `try { Start-Process -FilePath ${psQuote(unins)} -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait -ErrorAction Stop } catch {}` : '',
    `$keys = @(${entries.map((e) => psQuote(e.psPath)).join(',')})`,
    unins ? 'for ($i = 0; $i -lt 60 -and @($keys | Where-Object { Test-Path -LiteralPath $_ }).Count -gt 0; $i++) { Start-Sleep -Milliseconds 500 }' : '',
    'foreach ($k in $keys) { if (Test-Path -LiteralPath $k) { Remove-Item -LiteralPath $k -Recurse -Force -ErrorAction SilentlyContinue } }',
    '$left = @($keys | Where-Object { Test-Path -LiteralPath $_ }).Count',
    'exit $left',
  ].filter(Boolean).join('\n')
}

async function removeUninstallEntries(dir) {
  const entries = await findUninstallEntries(dir)
  if (entries.length === 0) return { removed: 0 }
  const needAdmin = entries.some((e) => e.machine)
  const unins = (() => {
    try {
      const f = fs.readdirSync(dir).find((n) => /^unins\d*\.exe$/i.test(n))
      return f ? path.join(dir, f) : ''
    } catch { return '' }
  })()
  const body = removeScript(entries, unins)

  if (!needAdmin) {
    await runPs(body)
  } else {
    // запуск с повышением прав: отказ в окне UAC — ошибка Start-Process (код 1223)
    const scriptFile = path.join(os.tmpdir(), `lustre-uninstall-${Date.now()}.ps1`)
    fs.writeFileSync(scriptFile, '﻿' + body, 'utf8')
    const out = await runPs([
      'try {',
      `  $p = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',${psQuote(scriptFile)} -ErrorAction Stop`,
      '  "EXIT|$($p.ExitCode)"',
      '} catch { "CANCEL" }',
    ].join('\n'), 180000)
    try { fs.rmSync(scriptFile, { force: true }) } catch { /* ignore */ }
    if (/CANCEL/.test(out)) return { removed: 0, cancelled: true }
  }
  const left = await findUninstallEntries(dir)
  return { removed: entries.length - left.length, left: left.length }
}

module.exports = { findUninstallEntries, removeUninstallEntries, removeScript, findScript }
