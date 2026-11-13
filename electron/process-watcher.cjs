// Учёт времени игры (порт process-watcher из Hydra, упрощённый для Windows):
// после запуска игры поллинг процессов; пока процесс жив — playtimeMs растёт в реестре
const { spawn } = require('node:child_process')
const path = require('node:path')
const { loadRegistry, saveRegistry } = require('./installer.cjs')

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

function isGameRunning(proc, g) {
  const pPath = (proc.path || '').toLowerCase()
  if (pPath) {
    // процессы из папки игры (лаунчеры-обёртки) тоже считаем
    if (g.installPath && pPath.startsWith(g.installPath)) return true
    return pPath === g.exePath
  }
  // путь недоступен (повышенный процесс) — сверяем имя
  return (proc.name || '').toLowerCase() === g.exeBase
}

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
  const procs = await listProcesses()
  for (const [id, g] of [...tracked]) {
    if (procs.some((p) => isGameRunning(p, g))) accumulate(id, delta)
    else {
      tracked.delete(id)
      if (g.onExit) { try { g.onExit(id) } catch {} }
    }
  }
}

module.exports = { track }
