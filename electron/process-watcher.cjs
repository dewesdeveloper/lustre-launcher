// Учёт времени игры (порт process-watcher из Hydra, упрощённый для Windows):
// после запуска игры поллинг процессов; пока процесс жив — playtimeMs растёт в реестре
const { spawn, execFile } = require('node:child_process')
const path = require('node:path')
const { loadRegistry, saveRegistry, isGameExe } = require('./installer.cjs')

const TICK_MS = 15000
const tracked = new Map()
let timer = null
let lastTick = null

// Начать следить за игрой (вызывается после успешного запуска); onExit — вызовется, когда процесс исчезнет
function track(entry, onExit) {
  if (!entry?.id || !entry?.exePath) return
  tracked.set(entry.id, {
    id: entry.id,
    exePath: String(entry.exePath).toLowerCase(),
    exeBase: path.basename(entry.exePath).toLowerCase(),
    installPath: entry.installPath ? String(entry.installPath).toLowerCase() : '',
    onExit: typeof onExit === 'function' ? onExit : null,
  })
  if (!timer) {
    lastTick = Date.now()
    timer = setInterval(tick, TICK_MS)
  }
}

// Список процессов: "имя|путь" (путь может быть пуст — процесс повышен)
function listProcesses() {
  return new Promise((resolve) => {
    const ps = [
      '$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'Get-Process | ForEach-Object { $p = $null; try { $p = $_.Path } catch {}; "$($_.ProcessName)|$p" }',
    ].join('\n')
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.on('error', () => resolve([]))
    child.on('exit', () => {
      resolve(out.split(/\r?\n/).filter(Boolean).map((l) => {
        const i = l.indexOf('|')
        return { name: l.slice(0, i), path: l.slice(i + 1) }
      }))
    })
  })
}

// Только имена запущенных exe — через tasklist: в десятки раз дешевле, чем запуск PowerShell
// (тот при каждом вызове поднимал процесс на ~100 МБ и около секунды процессорного времени).
// Имена в нижнем регистре, с «.exe». null — tasklist недоступен.
function listProcessNames() {
  return new Promise((resolve) => {
    execFile('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) { resolve(null); return }
      const names = new Set()
      for (const line of String(stdout).split(String.fromCharCode(10))) {
        const m = /^"([^"]+)"/.exec(line)
        if (m) names.add(m[1].toLowerCase())
      }
      resolve(names)
    })
  })
}

function isGameRunning(proc, g) {
  const pPath = (proc.path || '').toLowerCase()
  if (pPath) {
    // процессы из папки игры (лаунчеры-обёртки) тоже считаем
    if (g.installPath && pPath.startsWith(g.installPath)) return true
    return pPath === g.exePath
  }
  // путь недоступен (повышенный процесс) — сверяем имя (ProcessName приходит без «.exe»)
  return `${(proc.name || '').toLowerCase()}.exe` === g.exeBase
}

const norm = (p) => String(p || '').toLowerCase().replace(/[\\/]+$/, '')

/**
 * Процесс — установленная игра, запущенная в обход лаунчера (ярлык, exe из папки)?
 * Строже, чем при уже идущем учёте: exe игры или другой exe из её папки, но не утилита
 * (деинсталлятор, обработчик сбоев, redist — isGameExe отсекает их).
 */
function isGameProcess(proc, entry) {
  const exePath = norm(entry.exePath)
  const installPath = norm(entry.installPath)
  const exeBase = path.basename(exePath)
  const pPath = norm(proc.path)
  if (pPath) {
    if (pPath === exePath) return true
    return !!installPath && pPath.startsWith(installPath + path.sep) && isGameExe(pPath)
  }
  return !!exeBase && `${(proc.name || '').toLowerCase()}.exe` === exeBase
}

const isTracked = (id) => tracked.has(id)

function accumulate(id, deltaMs) {
  try {
    const list = loadRegistry()
    const entry = list.find((x) => x.id === id)
    if (!entry) return
    entry.playtimeMs = (entry.playtimeMs || 0) + deltaMs
    entry.lastPlayedAt = Date.now()
    saveRegistry(list)
  } catch {}
}

async function tick() {
  const now = Date.now()
  const delta = Math.min(now - (lastTick || now), 60000)
  lastTick = now
  if (tracked.size === 0) {
    clearInterval(timer)
    timer = null
    return
  }
  // Быстрая проверка по имени exe; список процессов с путями (PowerShell) — только если exe игры
  // не видно: игра закрылась или её держит лаунчер-обёртка из той же папки
  const names = await listProcessNames()
  let procs = null
  for (const [id, g] of [...tracked]) {
    if (names?.has(g.exeBase)) { accumulate(id, delta); continue }
    procs ??= await listProcesses()
    if (procs.some((p) => isGameRunning(p, g))) accumulate(id, delta)
    else {
      tracked.delete(id)
      if (g.onExit) { try { g.onExit(id) } catch {} }
    }
  }
}

module.exports = { track, isTracked, listProcesses, listProcessNames, isGameProcess }
