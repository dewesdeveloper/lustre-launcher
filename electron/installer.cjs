const { app, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const SEVENZIP_CANDIDATES = [
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe',
]
const UNRAR_CANDIDATES = [
  'C:\\Program Files\\WinRAR\\UnRAR.exe',
  'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe',
]

// В упакованном приложении node_modules лежит внутри app.asar, а запустить
// бинарник оттуда нельзя (spawn → ENOENT: ...\app.asar\node_modules\7zip-bin\...).
// electron-builder распаковывает 7zip-bin в app.asar.unpacked (asarUnpack в
// package.json) — перенаправляем путь на распакованную копию.
function unpackedBin(p) {
  return typeof p === 'string' ? p.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2') : p
}

let bundled7za = null
try { bundled7za = unpackedBin(require('7zip-bin').path7za) } catch {}

// Дополнительные бинарники лежат в vendor/ и кладутся в дистрибутив через
// extraResources — они попадают в resources/vendor как настоящие файлы
// (вне app.asar), поэтому их можно спавнить. В dev — <проект>/vendor.
function vendorCandidates(...parts) {
  const out = []
  if (process.resourcesPath) out.push(path.join(process.resourcesPath, 'vendor', ...parts))
  out.push(path.join(__dirname, '..', 'vendor', ...parts))
  return out
}

function findFirst(paths) {
  for (const p of paths) { try { if (p && fs.existsSync(p)) return p } catch {} }
  return null
}

// Полный 7-Zip, который ставится вместе с лаунчером (resources/vendor/7z). Без 7z.dll он не
// открывает RAR, поэтому считаем его доступным только вместе с ней.
function getBundled7z() {
  const exe = findFirst(vendorCandidates('7z', '7z.exe'))
  return exe && fs.existsSync(path.join(path.dirname(exe), '7z.dll')) ? exe : null
}
function getUnrar() { return findFirst(UNRAR_CANDIDATES) }

// Распаковщики по порядку. Первым — встроенный: его версия известна. Раньше первым брался 7-Zip
// из системы, и старая версия (например, 9.20) не открывала RAR5, а встроенный так и не пробовался.
// Остальные — запасные, если встроенный не справился.
function extractorsFor(isRar) {
  const list = []
  const add = (kind, bin) => { if (bin && !list.some((x) => x.bin === bin)) list.push({ kind, bin }) }
  add('7z', getBundled7z())
  if (isRar) add('unrar', getUnrar())
  add('7z', findFirst(SEVENZIP_CANDIDATES))
  // 7za из 7zip-bin не умеет RAR
  if (!isRar) add('7z', findFirst([bundled7za]))
  return list
}

const INSTALLER_NAME_RE = /^(setup|install|installer|autorun|redist)([ _\-.]?\d+)?\.(exe|msi|bat|cmd)$/i
const EXE_EXCLUDE_RE = /unins|setup|install|redist|directx|dxsetup|dxweb|vcredist|dotnet|crash|handler|unrar|winrar|7-?zip|7za|readme|autoupdate|unity|unarc|inno/i
const VOLUME_RE = /^(.*?)(\.part\d+\.rar|\.\d{3}|\.r\d{2})$/i
const ARCHIVE_FILE_RE = /\.(zip|7z|rar|\d{3}|r\d{2})$/i

function walk(dir, depth, out, maxDepth) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.dirs.push({ path: full, depth })
      if (depth < maxDepth) walk(full, depth + 1, out, maxDepth)
    } else if (e.isFile()) {
      let size = 0
      try { size = fs.statSync(full).size } catch {}
      out.files.push({ path: full, name: e.name, depth, size })
    }
  }
  return out
}

function volNumber(vol) {
  if (!vol) return 0
  let m = vol.match(/\.part0*(\d+)\.rar$/i)
  if (m) return parseInt(m[1], 10)
  m = vol.match(/\.(\d{3})$/)
  if (m) return parseInt(m[1], 10)
  m = vol.match(/\.r(\d{2})$/i)
  if (m) return parseInt(m[1], 10) + 1
  return 999
}

function pickFirstPart(parts) {
  return parts.slice().sort((a, b) => volNumber(a.vol) - volNumber(b.vol))[0]?.file
}

// Имя архива, к которому относится том: «Game.part2.rar» и «Game.r00» — части «Game.rar»,
// «Game.7z.001» — часть «Game.7z». null — файл не архив.
function archiveGroupOf(name) {
  if (!ARCHIVE_FILE_RE.test(name)) return null
  const m = name.match(VOLUME_RE)
  if (!m) return /\.(zip|7z|rar)$/i.test(name) ? { base: name, vol: '' } : null
  const vol = m[2]
  if (/^\.part\d+\.rar$/i.test(vol) || /^\.r\d{2}$/i.test(vol)) return { base: m[1] + '.rar', vol }
  return /\.(zip|7z|rar)$/i.test(m[1]) ? { base: m[1], vol } : null
}

// --- Ранжирование исполняемых файлов (порт game-executable-ranking.ts из Hydra) ---

const REDIST_DIRECTORIES = new Set([
  '_commonredist', 'commonredist', 'steamworks shared', 'redist', 'redists',
  '_redist', 'directx', 'dotnet', 'dotnetfx', 'vcredist', 'openal', 'physx',
  'prerequisites', 'prereq',
])

const REDIST_FILE_PATTERN =
  /^(vcredist|vc_redist|dotnetfx|dxsetup|dxwebsetup|directx|oalinst|xnafx|physx|ue[345]prereqsetup|ue3redist)/

const SHARED_INSTALLER_PATTERN =
  /^(uplayinstaller|pbsvc|pbsetup|setup_battleye|beservice|social-club-setup|easyanticheat|dauservicesetup)/

const SHARED_RUNTIME_FILES = new Set([
  'unitycrashhandler32.exe', 'unitycrashhandler64.exe', 'crashreportclient.exe',
  'crashpad_handler.exe', 'unrealcefsubprocess.exe', 'epicwebhelper.exe',
  'start_protected_game.exe', 'javaw.exe', 'java.exe', 'dotnet.exe', 'setup.exe',
])

const toSegments = (value) =>
  String(value).toLowerCase().split(/[\\/]/).filter(Boolean)

const basenameOf = (relativePath) => toSegments(relativePath).at(-1)

const isRedistributablePath = (relativePath) => {
  const segments = toSegments(relativePath)
  const basename = segments.pop() ?? ''
  return (
    REDIST_FILE_PATTERN.test(basename) ||
    SHARED_INSTALLER_PATTERN.test(basename) ||
    SHARED_RUNTIME_FILES.has(basename) ||
    segments.some((segment) => REDIST_DIRECTORIES.has(segment))
  )
}

const countBasenames = (relativeFilePaths) => {
  const counts = new Map()
  for (const filePath of relativeFilePaths) {
    const basename = basenameOf(filePath)
    if (basename) counts.set(basename, (counts.get(basename) ?? 0) + 1)
  }
  return counts
}

const directoryOf = (relativePath) => {
  const segments = toSegments(relativePath)
  return segments.slice(0, -1).join('/')
}

const countUnsharedSiblings = (relativePath, relativeFilePaths, basenameCounts) => {
  const directory = directoryOf(relativePath)
  return relativeFilePaths.filter((filePath) => {
    if (directoryOf(filePath) !== directory) return false
    const basename = basenameOf(filePath)
    return !!basename && basenameCounts.get(basename) === 1
  }).length
}

// Лучший exe в папке игры: выкидываем redist/сервисные, предпочитаем exe
// с токенами названия игры в имени, затем по числу "уникальных соседей" и глубине
function rankGameExecutable(folderPath, title) {
  try {
    const tree = walk(folderPath, 0, { files: [], dirs: [] }, 6)
    const titleTokens = new Set(
      String(title || '').toLowerCase().split(/[^a-z0-9а-яё]+/).filter(t => t.length >= 3)
    )
    const rels = tree.files.map(f => path.relative(folderPath, f.path))
    const candidates = rels.filter(r => {
      const base = path.basename(r)
      return /\.exe$/i.test(base) && !INSTALLER_NAME_RE.test(base) &&
        !EXE_EXCLUDE_RE.test(base) && !isRedistributablePath(r)
    })
    if (candidates.length === 0) return null
    if (candidates.length === 1) return path.join(folderPath, candidates[0])

    const named = candidates.filter(r => {
      const base = path.basename(r).toLowerCase().replace(/\.exe$/, '')
      const baseTokens = new Set(base.split(/[^a-z0-9а-яё]+/))
      for (const t of titleTokens) if (baseTokens.has(t) || base.includes(t)) return true
      return false
    })
    const pool = named.length ? named : candidates
    const counts = countBasenames(rels)
    const scored = pool.map(r => ({
      r,
      s: [
        -countUnsharedSiblings(r, rels, counts),
        toSegments(r).length,
        named.includes(r) ? 0 : 1,
      ],
    }))
    scored.sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1] || a.s[2] - b.s[2] || a.r.localeCompare(b.r))
    return path.join(folderPath, scored[0].r)
  } catch { return null }
}

// --- Определение корня игры (порт find-game-root.ts из Hydra) ---

const NESTED_EXECUTABLE_DIRS = new Set([
  'bin', 'bin32', 'bin64', 'binaries', 'win32', 'win64', 'x64', 'x86',
  'game', 'runtime', 'engine',
])

const GAME_ROOT_INDICATORS = new Set([
  'data', 'assets', 'content', 'paks', 'pak', 'resources', 'localization',
  'languages', 'saves', 'mods', 'dlc', 'music', 'sound', 'sounds', 'audio',
  'videos', 'movies', 'cinematics', 'textures', 'shaders', 'configs', 'config',
  'settings', 'plugins', 'native', 'managed', 'mono', 'dotnet', 'engine', 'launcher',
])

const UNITY_DATA_SUFFIX = '_data'

const GAME_DATA_EXTENSIONS = new Set([
  '.pak', '.dat', '.bundle', '.assets', '.forge', '.arc', '.pck', '.vpk',
  '.wad', '.bsa', '.ba2', '.big', '.cpk', '.fsb', '.bank',
])

const MAX_UPWARD_LEVELS = 3

const UNSAFE_ROOTS = new Set([
  'program files', 'program files (x86)', 'users', 'windows', 'system32',
  'appdata', 'programdata', 'steamapps', 'common', 'desktop', 'documents', 'downloads',
])

const GAME_ROOT_FILES = new Set([
  'steam_api.dll', 'steam_api64.dll', 'version.txt', 'readme.txt',
  'eula.txt', 'unins000.exe', 'uninstall.exe',
])

const isUnsafePath = (dirPath) => {
  const parts = String(dirPath).toLowerCase().split(path.sep)
  const lastPart = parts.at(-1) ?? ''
  if (UNSAFE_ROOTS.has(lastPart)) return true
  const parsed = path.parse(dirPath)
  return parsed.dir === parsed.root || dirPath === parsed.root
}

const isNestedExeDir = (dirName) => NESTED_EXECUTABLE_DIRS.has(String(dirName).toLowerCase())

const scoreEntry = (entry) => {
  const nameLower = entry.name.toLowerCase()
  let score = 0
  let hasExecutable = false
  if (entry.isDirectory()) {
    if (GAME_ROOT_INDICATORS.has(nameLower)) score += 2
    if (nameLower.endsWith(UNITY_DATA_SUFFIX)) score += 3
    if (nameLower === 'binaries' || nameLower === 'content') score += 2
  } else if (entry.isFile()) {
    if (nameLower.endsWith('.exe')) { hasExecutable = true; score += 1 }
    if (GAME_DATA_EXTENSIONS.has(path.extname(nameLower))) score += 2
    if (GAME_ROOT_FILES.has(nameLower)) score += 1
  }
  return { score, hasExecutable }
}

const scoreDirectory = (dirPath) => {
  try {
    let totalScore = 0
    let hasExecutable = false
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const result = scoreEntry(entry)
      totalScore += result.score
      hasExecutable = hasExecutable || result.hasExecutable
    }
    return { path: dirPath, score: totalScore, hasExecutable }
  } catch { return { path: dirPath, score: 0, hasExecutable: false } }
}

// Восходящее сканирование от папки exe: где настоящий корень игры
function findGameRootFromExe(exePath) {
  try {
    const exeDir = path.dirname(exePath)
    if (isUnsafePath(exeDir)) return exeDir

    const candidates = []
    let currentDir = exeDir
    let levelsUp = 0
    while (levelsUp <= MAX_UPWARD_LEVELS) {
      if (isUnsafePath(currentDir)) break
      const score = scoreDirectory(currentDir)
      candidates.push(score)
      const dirName = path.basename(currentDir)
      if (levelsUp === 0 && isNestedExeDir(dirName)) {
        levelsUp++
        currentDir = path.dirname(currentDir)
        continue
      }
      if (score.score >= 3 && score.hasExecutable) break
      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) break
      currentDir = parentDir
      levelsUp++
    }
    if (candidates.length === 0) return exeDir

    let best = candidates[0]
    for (const candidate of candidates) {
      const isBetterWithExe =
        candidate.score >= 3 && candidate.hasExecutable &&
        (!best.hasExecutable || candidate.score > best.score)
      const isBetterWithoutExe =
        !best.hasExecutable && candidate.score > best.score
      if (isBetterWithExe || isBetterWithoutExe) best = candidate
    }

    if (best.score < 2) {
      const exeDirName = path.basename(exeDir)
      if (isNestedExeDir(exeDirName)) {
        const parentDir = path.dirname(exeDir)
        if (!isUnsafePath(parentDir)) return parentDir
      }
      return exeDir
    }
    return best.path
  } catch {
    return exePath ? path.dirname(exePath) : null
  }
}

// Самый крупный архив среди файлов: первый том и все тома. Ключ — каталог и имя архива,
// чтобы одноимённые архивы в разных папках не склеивались.
function largestArchive(files) {
  const groups = new Map()
  for (const f of files) {
    const g = archiveGroupOf(f.name)
    if (!g) continue
    const key = path.join(path.dirname(f.path), g.base).toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ file: f, vol: g.vol })
  }
  let best = null
  for (const [, parts] of groups) {
    const total = parts.reduce((s, p) => s + p.file.size, 0)
    const first = pickFirstPart(parts)
    if (first && (!best || total > best.total)) best = { first, total, files: parts.map((p) => p.file) }
  }
  return best
}

const MAX_NESTED_ARCHIVES = 3

// «Архив → архив → папка с игрой»: после распаковки внешнего архива в папке может оказаться
// ещё один, и без его распаковки exe игры не найти. Распаковываем вложенные архивы на месте,
// пока не появится exe или установщик; распакованный архив удаляем, чтобы не занимать место.
// Если exe уже есть, архивы рядом с ним не трогаем: это могут быть данные самой игры.
async function extractNestedArchives(dest, title, { onProgress, beforeExtract } = {}) {
  for (let level = 0; level < MAX_NESTED_ARCHIVES; level++) {
    if (rankGameExecutable(dest, title) || findInstallerIn(dest)) return level
    const inner = largestArchive(walk(dest, 0, { files: [], dirs: [] }, 4).files)
    if (!inner) return level
    if (beforeExtract) await beforeExtract(inner)
    await extractArchive(inner.first.path, path.dirname(inner.first.path), onProgress)
    for (const f of inner.files) await fs.promises.rm(f.path, { force: true }).catch(() => {})
  }
  return MAX_NESTED_ARCHIVES
}

// --- Тихая установка setup.exe ---

// Метки внутри файла: установщик Inno Setup (почти все репаки) и NSIS. Ищем в начале файла,
// там загрузчик и заголовок данных; строки встречаются и в ANSI, и в UTF-16.
const INSTALLER_MARKERS = [
  { type: 'inno', needles: ['Inno Setup Setup Data', 'InnoSetupLdrWindow', 'Inno Setup'] },
  { type: 'nsis', needles: ['Nullsoft Install System', 'NullsoftInst'] },
]
const MARKER_SCAN_BYTES = 8 * 1024 * 1024

function detectInstallerType(file) {
  if (/\.msi$/i.test(file)) return 'msi'
  if (!/\.exe$/i.test(file)) return null
  let buf
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const size = Math.min(fs.fstatSync(fd).size, MARKER_SCAN_BYTES)
      buf = Buffer.alloc(size)
      fs.readSync(fd, buf, 0, size, 0)
    } finally { fs.closeSync(fd) }
  } catch { return null }
  for (const { type, needles } of INSTALLER_MARKERS) {
    for (const n of needles) {
      if (buf.includes(Buffer.from(n, 'latin1')) || buf.includes(Buffer.from(n, 'utf16le'))) return type
    }
  }
  return null
}

// Ключи тихой установки в указанную папку
function silentInstallCommand(file, type, dir) {
  if (type === 'inno') {
    return { exe: file, args: ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR="${dir}"`] }
  }
  // У NSIS путь — последним и без кавычек, даже с пробелами
  if (type === 'nsis') return { exe: file, args: ['/S', `/D=${dir}`] }
  if (type === 'msi') {
    return { exe: 'msiexec.exe', args: ['/i', `"${file}"`, '/qn', '/norestart', `INSTALLDIR="${dir}"`, `TARGETDIR="${dir}"`] }
  }
  return null
}

// 3010 у MSI — «установлено, нужна перезагрузка»
const silentInstallSucceeded = (type, code) => code === 0 || (type === 'msi' && code === 3010)

// Запуск установщика через ShellExecute: так Windows сама спрашивает права
// администратора, если они нужны. Ждём завершения и возвращаем код выхода.
function runInstallerSilently(file, type, dir) {
  const cmd = silentInstallCommand(file, type, dir)
  if (!cmd) return Promise.resolve({ error: 'неизвестный тип установщика' })
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`
  const ps = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    // Не Start-Process: он дописывает пробел в конец командной строки, а у NSIS путь стоит последним
    // и без кавычек — пробел попал бы в имя папки
    'try {',
    '$i = New-Object System.Diagnostics.ProcessStartInfo',
    `$i.FileName = ${q(cmd.exe)}; $i.Arguments = ${q(cmd.args.join(' '))}; $i.WorkingDirectory = ${q(path.dirname(file))}`,
    '$i.UseShellExecute = $true',
    "$p = [System.Diagnostics.Process]::Start($i); $p.WaitForExit(); Write-Output ('EXIT:' + $p.ExitCode) }",
    // код ошибки Windows: 1223 — пользователь отказал в окне запроса прав
    "catch { $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; Write-Output ('FAIL:' + $e.NativeErrorCode + ':' + $e.Message); exit 1 }",
  ].join('\n')
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.on('error', (e) => resolve({ error: e.message }))
    child.on('exit', () => {
      const exit = /EXIT:(-?\d*)/.exec(out)
      if (exit) {
        const code = exit[1] === '' ? null : Number(exit[1])
        resolve({ code, ok: code !== null && silentInstallSucceeded(type, code) })
        return
      }
      const fail = /FAIL:(\d*):(.*)/.exec(out)
      const message = (fail?.[2] || '').trim()
      // Отказ в окне «Разрешить этому приложению вносить изменения?» (ERROR_CANCELLED)
      const cancelled = fail?.[1] === '1223'
      resolve({ error: message || 'установщик не запустился', cancelled })
    })
  })
}

function detectInstall(contentPath) {
  try {
    if (!contentPath || !fs.existsSync(contentPath)) return null
    const st = fs.statSync(contentPath)
    // Одиночный файл-торрент (qb сохраняет его в корень загрузок без папки) —
    // НЕ сканируем родительский каталог, иначе захватим чужие загрузки
    if (!st.isDirectory()) {
      const name = path.basename(contentPath)
      if (ARCHIVE_FILE_RE.test(name)) {
        return { kind: 'archive', root: path.dirname(contentPath), archivePath: contentPath, exePath: null }
      }
      if (INSTALLER_NAME_RE.test(name) || EXE_EXCLUDE_RE.test(name) || /\.msi$/i.test(name)) {
        return { kind: 'installer', root: path.dirname(contentPath), installerPath: contentPath }
      }
      return { kind: 'portable', root: path.dirname(contentPath), gameFolder: path.dirname(contentPath), singleFile: contentPath, exePath: contentPath }
    }

    let root = contentPath

    const tree = walk(root, 0, { files: [], dirs: [] }, 3)

    const exes = tree.files.filter(f =>
      /\.exe$/i.test(f.name) && !INSTALLER_NAME_RE.test(f.name) && !EXE_EXCLUDE_RE.test(f.name)
    )
    exes.sort((a, b) => (a.depth - b.depth) || (b.size - a.size))
    const exePath = exes[0]?.path || null

    // В загрузке нет готового exe, но есть установщик (setup.exe, "Game-v2-setup.exe", .msi) —
    // запускаем его для ручной установки пользователем
    if (exes.length === 0) {
      const exeLike = tree.files.filter(f => /\.(exe|msi)$/i.test(f.name))
      exeLike.sort((a, b) => (a.depth - b.depth) || (b.size - a.size))
      if (exeLike[0]) {
        return { kind: 'installer', root, installerPath: exeLike[0].path }
      }
    }

    const best = largestArchive(tree.files)
    if (best) {
      return { kind: 'archive', root, archivePath: best.first.path, exePath }
    }

    let entries = []
    try { entries = fs.readdirSync(root, { withFileTypes: true }) } catch {}
    const visible = entries.filter(e => e.name !== 'desktop.ini' && !e.name.startsWith('.'))
    let gameFolder = root
    if (visible.length === 1 && visible[0].isDirectory()) gameFolder = path.join(root, visible[0].name)

    return { kind: 'portable', root, gameFolder, exePath }
  } catch {
    return null
  }
}

// Пароли защищённых репак-архивов (как в Hydra game-files-manager.ts)
const ARCHIVE_PASSWORDS = ['', 'online-fix.me', 'steamrip.com']

function extractArchive(archivePath, destDir, onProgress) {
  const lower = String(archivePath).toLowerCase()
  const isRar = /\.rar$/.test(lower) || /\.r\d{2}$/.test(lower) || /\.part\d+\.rar$/.test(lower)

  const tools = extractorsFor(isRar)
  if (tools.length === 0) {
    return Promise.reject(new Error('встроенный распаковщик 7-Zip не найден. Переустановите лаунчер'))
  }

  try { fs.mkdirSync(destDir, { recursive: true }) } catch (e) { return Promise.reject(e) }

  // Одна попытка распаковки конкретным распаковщиком (с паролем или без).
  // stdin закрыт: если распаковщик запросит пароль — получит EOF и вернёт ошибку вместо зависания
  const attempt = (bin, args) => new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let buf = ''
    let settled = false
    const settle = (fn, arg) => { if (!settled) { settled = true; fn(arg) } }

    child.stdout.on('data', (d) => {
      buf += d.toString()
      if (buf.length > 65536) buf = buf.slice(-8192)
      const matches = [...buf.matchAll(/(\d{1,3})\s*%/g)]
      if (matches.length && onProgress) {
        const pct = parseInt(matches[matches.length - 1][1], 10)
        if (pct >= 0 && pct <= 100) onProgress(pct)
      }
    })
    child.stderr.on('data', (d) => { buf += d.toString() })
    child.on('error', (e) => settle(reject, e))
    child.on('exit', (code) => settle(resolve, code))
    child.on('close', (code) => settle(resolve, code))
  })

  // Перебираем распаковщики и пароли: неудачная попытка (код > 1 — неверный пароль/CRC/формат) —
  // следующий пароль, затем следующий распаковщик
  return (async () => {
    let lastError = null
    for (const tool of tools) {
      for (const password of ARCHIVE_PASSWORDS) {
        const args = tool.kind === 'unrar'
          ? ['x', '-y', '-o+', ...(password ? ['-p' + password] : ['-p-']), archivePath, destDir + path.sep]
          : ['x', '-y', '-bso0', '-bsp1', ...(password ? ['-p' + password] : []), '-o' + destDir, archivePath]
        let code
        try {
          code = await attempt(tool.bin, args)
        } catch (err) {
          // распаковщик не запустился (удалён, заблокирован антивирусом) — пробуем следующий
          lastError = err
          break
        }
        if (code === 0 || code === 1) return
        lastError = new Error(`архив повреждён, скачан не полностью или защищён неизвестным паролем (код ${code})`)
      }
    }
    throw lastError || new Error('Не удалось распаковать архив')
  })()
}

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
const isInside = (child, parent) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

// Папка без единого файла (только пустые подпапки)
function isEmptyTree(p) {
  try {
    if (!fs.statSync(p).isDirectory()) return false
    return fs.readdirSync(p).every((n) => isEmptyTree(path.join(p, n)))
  } catch { return false }
}

// Поднимает найденный корень игры (findGameRootFromExe) в dest целиком: «dest/Repack/Game/…» → «dest/…».
// Раньше на уровень dest вытаскивалась папка самого exe, и у игр Unreal exe из Binaries/Win64
// оказывался рядом с Content — игра переставала запускаться. Возвращает true, если структура изменилась.
function hoistGameRoot(dest, gameRoot) {
  try {
    if (!gameRoot || samePath(dest, gameRoot) || !isInside(gameRoot, dest)) return false
    // Переносим через временное имя: внутри корня игры может быть папка с тем же именем, что и он сам
    const staging = uniqueDest(path.join(dest, '.lustre-hoist'))
    fs.renameSync(gameRoot, staging)
    // Всё, что лежало в dest рядом с корнем игры (readme, папки репака), убираем в отдельную папку;
    // опустевшие папки-обёртки просто удаляем
    const leftovers = fs.readdirSync(dest).filter((n) => !samePath(path.join(dest, n), staging))
      .filter((n) => {
        const p = path.join(dest, n)
        if (!isEmptyTree(p)) return true
        fs.rmSync(p, { recursive: true, force: true })
        return false
      })
    if (leftovers.length) {
      const extras = uniqueDest(path.join(staging, '_extras'))
      fs.mkdirSync(extras, { recursive: true })
      for (const n of leftovers) fs.renameSync(path.join(dest, n), path.join(extras, n))
    }
    for (const n of fs.readdirSync(staging)) fs.renameSync(path.join(staging, n), path.join(dest, n))
    fs.rmSync(staging, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

// Установщик внутри распакованного архива: репаки часто упакованы целиком, вместе с setup.exe
function findInstallerIn(folder) {
  const tree = walk(folder, 0, { files: [], dirs: [] }, 3)
  const found = tree.files
    .filter((f) => {
      if (!(INSTALLER_NAME_RE.test(f.name) || /setup.*\.exe$/i.test(f.name) || /\.msi$/i.test(f.name))) return false
      // setup.exe сам по себе в списке «общих» файлов, поэтому отсеиваем только папки и файлы redist
      const segments = toSegments(path.relative(folder, f.path))
      const base = segments.pop() ?? ''
      return !REDIST_FILE_PATTERN.test(base) && !segments.some((s) => REDIST_DIRECTORIES.has(s))
    })
    .sort((a, b) => (a.depth - b.depth) || (b.size - a.size))
  return found[0]?.path || null
}

// Папки, которые лаунчер не удаляет ни при каких условиях
function isProtectedPath(target, extraProtected = []) {
  if (!target) return true
  const resolved = path.resolve(target)
  if (samePath(resolved, path.parse(resolved).root)) return true
  if (isUnsafePath(resolved)) return true
  const home = os.homedir()
  const named = ['desktop', 'documents', 'downloads', 'music', 'pictures', 'videos', 'home', 'appData', 'userData', 'temp']
    .map((n) => { try { return app.getPath(n) } catch { return '' } })
  const all = [home, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.SystemRoot, ...named, ...extraProtected].filter(Boolean)
  // Сама защищённая папка и всё, что выше неё (например, весь диск или профиль)
  return all.some((p) => samePath(resolved, p) || isInside(p, resolved))
}

// Свободное место на томе, где лежит путь (или ближайшая существующая папка выше)
function freeSpace(target) {
  let p = path.resolve(target)
  while (!fs.existsSync(p)) {
    const up = path.dirname(p)
    if (up === p) return null
    p = up
  }
  try {
    const s = fs.statfsSync(p)
    return Number(s.bavail) * Number(s.bsize)
  } catch { return null }
}

async function pathSize(target) {
  let st
  try { st = await fs.promises.stat(target) } catch { return 0 }
  if (st.isFile()) return st.size
  let total = 0
  const stack = [target]
  while (stack.length) {
    const cur = stack.pop()
    let entries = []
    try { entries = await fs.promises.readdir(cur, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = path.join(cur, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.isFile()) { try { total += (await fs.promises.stat(p)).size } catch {} }
    }
  }
  return total
}

const sameVolume = (a, b) => path.parse(path.resolve(a)).root.toLowerCase() === path.parse(path.resolve(b)).root.toLowerCase()

function formatSize(bytes) {
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} ГБ` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} МБ`
}

// Запуск процесса с обработкой ошибок (без краха main-процесса)
function launchProcess(bin, args, opts) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(bin, args, opts)
    } catch (e) {
      resolve({ error: e.message })
      return
    }
    child.on('error', (e) => resolve({ error: e.message }))
    child.on('spawn', () => resolve({ ok: true, pid: child.pid ?? null }))
    if (opts?.detached) child.unref()
  })
}

// ShellExecute с аргументами (обходит блокировку свежих exe в CreateProcess)
function launchViaShell(exePath, args, cwd) {
  return new Promise((resolve) => {
    const fp = String(exePath).replace(/'/g, "''")
    const wd = String(cwd || path.dirname(exePath)).replace(/'/g, "''")
    const argList = args && args.length
      ? ` -ArgumentList @(${args.map(a => `'${String(a).replace(/'/g, "''")}'`).join(',')})`
      : ''
    const ps = `try { $p = Start-Process -FilePath '${fp}'${argList} -WorkingDirectory '${wd}' -ErrorAction Stop -PassThru; Write-Output $p.Id } catch { exit 1 }`
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.on('error', (e) => resolve({ error: e.message }))
    child.on('exit', (code) => {
      if (code === 0) {
        const pid = parseInt(out.trim().split(/\r?\n/).pop(), 10)
        resolve({ ok: true, pid: Number.isFinite(pid) && pid > 0 ? pid : null })
      } else {
        resolve({ error: 'Start-Process завершился с кодом ' + code })
      }
    })
  })
}

// Разделение пути и аргументов запуска (порт resolve-launch-command из Hydra):
// "game.exe" + '-windowed -nolauncher' -> { command: 'game.exe', args: ['-windowed','-nolauncher'] }
function parseLaunchArgs(exePath, launchOptions) {
  const options = String(launchOptions || '').trim()
  if (!options) return { command: exePath, args: [] }
  const args = []
  const re = /"([^"]*)"|(\S+)/g
  let m
  while ((m = re.exec(options))) args.push(m[1] ?? m[2])
  return { command: exePath, args }
}

// Запуск игры: shell.openPath (ShellExecute, как в Hydra launch-game.ts),
// при аргументах — spawn, при EACCES — Start-Process
async function launchGameExe(exePath, launchOptions) {
  if (!exePath || !fs.existsSync(exePath)) return { error: 'Файл не найден: ' + exePath }
  const cwd = path.dirname(exePath)
  const { command, args } = parseLaunchArgs(exePath, launchOptions)

  // .bat/.cmd — только через shell
  if (/\.(bat|cmd)$/i.test(command)) {
    const err = await shell.openPath(command)
    if (err) return { error: err }
    return { ok: true, pid: null }
  }

  // Без аргументов — shell.openPath (PID недоступен, время игры считает process-watcher)
  if (args.length === 0) {
    const err = await shell.openPath(command)
    if (!err) return { ok: true, pid: null }
  }

  let res = await launchProcess(command, args, { cwd, detached: true, stdio: 'ignore' })
  if (res.ok) return res

  res = await launchViaShell(command, args, cwd)
  if (res.ok) return res

  // повтор через 1.5 сек — файл мог быть занят антивирусом после загрузки
  await new Promise(r => setTimeout(r, 1500))
  return await launchProcess(command, args, { cwd, detached: true, stdio: 'ignore' })
}

// Снимает метку блокировки (Zone.Identifier / Mark of the Web) со всех файлов папки
function unblockFolder(target) {
  return new Promise((resolve) => {
    let isFile = false
    try { isFile = fs.statSync(target).isFile() } catch {}
    const fp = String(target).replace(/'/g, "''")
    const ps = isFile
      ? `Unblock-File -LiteralPath '${fp}' -ErrorAction SilentlyContinue`
      : `Get-ChildItem -LiteralPath '${fp}' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue`
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], {
      windowsHide: true, stdio: 'ignore',
    })
    const timer = setTimeout(() => resolve(), 15000)
    child.on('error', () => { clearTimeout(timer); resolve() })
    child.on('exit', () => { clearTimeout(timer); resolve() })
  })
}

async function launchInstalledGame(entry, launchOptions) {
  if (!entry?.exePath || !fs.existsSync(entry.exePath)) {
    return { error: 'Исполняемый файл игры не найден' }
  }
  return launchGameExe(entry.exePath, launchOptions)
}

// Запуск установщика игры вручную пользователем.
// ShellExecute ПЕРВЫМ (как двойной клик): корректно поднимает UAC и показывает окно.
// spawn(CreateProcess) у requireAdministrator-репаков создаёт невидимую заглушку без окна
async function launchInstaller(installerPath) {
  if (!installerPath || !fs.existsSync(installerPath)) return { error: 'Файл не найден: ' + installerPath }
  const cwd = path.dirname(installerPath)
  let res = await launchViaShell(installerPath, [], cwd)
  if (res.ok) return res
  res = await launchProcess(installerPath, [], { cwd, detached: true, stdio: 'ignore' })
  if (res.ok) return res
  await new Promise(r => setTimeout(r, 1500))
  return await launchViaShell(installerPath, [], cwd)
}

// Ждёт завершения процесса по PID; EPERM = процесс жив (запущен с повышением)
function waitProcessExit(pid, timeoutMs = 2 * 60 * 60 * 1000) {
  return new Promise((resolve) => {
    if (!pid) { resolve(false); return }
    const startedAt = Date.now()
    const poll = () => {
      try {
        process.kill(pid, 0)
      } catch (e) {
        if (e.code === 'ESRCH') { resolve(true); return }
      }
      if (Date.now() - startedAt > timeoutMs) { resolve(false); return }
      setTimeout(poll, 2000)
    }
    poll()
  })
}

function sanitizeName(name) {
  let clean = String(name || 'Game')
    // убираем расширение архива из имени торрента ("Happy.Endings.rar" -> "Happy.Endings")
    .replace(/\.(part\d+\.rar|r\d{2}|\d{3}|rar|zip|7z)$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (clean || 'Game').slice(0, 100)
}

function uniqueDest(dir) {
  if (!fs.existsSync(dir)) return dir
  let i = 2
  while (fs.existsSync(`${dir} (${i})`)) i++
  return `${dir} (${i})`
}

// Асинхронно: rename не прошёл (папка заблокирована qBittorrent) — копируем на threadpool,
// чтобы не блокировать главный поток; исходник доудалится qb при удалении торрента
async function moveFolder(src, destBase, name) {
  await fs.promises.mkdir(destBase, { recursive: true })
  const dest = uniqueDest(path.join(destBase, name))
  try {
    await fs.promises.rename(src, dest)
    return dest
  } catch {}
  await fs.promises.cp(src, dest, { recursive: true })
  await fs.promises.rm(src, { recursive: true, force: true }).catch(() => {})
  return dest
}

// --- Пути скачивания и установки (машинные настройки пользователя) ---
// Лежат рядом с реестром игр (userData/app-paths.json): пути привязаны к
// компьютеру, поэтому не уезжают в общий JSON настроек аккаунта.
// Пользователь выбирает только диск, папки на нём лаунчер задаёт сам: X:\Lustre\Downloads
// и X:\Lustre\Games. На системном диске — папки в данных лаунчера, как и раньше.
const APP_PATHS_DEFAULTS = {
  downloadDrive: '',     // '' — системный диск
  installDrive: '',      // '' — системный диск
  askDownloadDir: true,  // спрашивать диск при каждом скачивании
  askInstallDir: true,   // спрашивать диск при каждой установке
  launchAtLogin: false,  // запускать лаунчер вместе с Windows (HKCU Run)
  autoInstallSetups: true, // ставить игры из setup.exe без мастера, в папку установки лаунчера
  qbWebPort: 9091,       // порт веб-интерфейса qBittorrent (к нему подключается лаунчер)
  qbWebUser: 'admin',    // логин Web UI (дефолт qBittorrent)
  qbWebPass: '',         // пароль Web UI; шифруется safeStorage при сохранении
}

function appPathsFile() {
  return path.join(app.getPath('userData'), 'app-paths.json')
}

function loadAppPaths() {
  try {
    return { ...APP_PATHS_DEFAULTS, ...JSON.parse(fs.readFileSync(appPathsFile(), 'utf8')) }
  } catch {
    return { ...APP_PATHS_DEFAULTS }
  }
}

function saveAppPaths(patch) {
  const next = { ...loadAppPaths(), ...patch }
  try { fs.writeFileSync(appPathsFile(), JSON.stringify(next, null, 2), 'utf8') } catch {}
  return next
}

const DRIVE_FOLDERS = { downloadDrive: 'Downloads', installDrive: 'Games' }

const systemDrive = () => path.parse(app.getPath('userData')).root.toUpperCase()

// «d», «D:», «D:\Games» → «D:\»; всё остальное (в том числе сетевые пути) → ''
function normalizeDrive(value) {
  const m = /^([a-z]):/i.exec(String(value || '').trim())
  return m ? `${m[1].toUpperCase()}:\\` : ''
}

function listDrives() {
  const drives = []
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`
    try {
      if (!fs.existsSync(root)) continue
      const st = fs.statfsSync(root)
      if (!st.blocks) continue
      drives.push({ root, total: st.blocks * st.bsize, free: st.bavail * st.bsize })
    } catch { /* диск недоступен */ }
  }
  return drives
}

// Папка лаунчера на выбранном диске; '' — диск системный, используется папка по умолчанию
function folderOnDrive(key) {
  const drive = normalizeDrive(loadAppPaths()[key])
  if (!drive || drive === systemDrive()) return ''
  return path.join(drive, 'Lustre', DRIVE_FOLDERS[key])
}

// Раньше можно было указать любую папку. Переводим на выбор диска: диск берём из старого пути,
// а сам путь запоминаем, чтобы лаунчер узнавал скачанное и установленное туда раньше.
function migrateCustomPaths() {
  let raw = {}
  try { raw = JSON.parse(fs.readFileSync(appPathsFile(), 'utf8')) } catch { return }
  const patch = {}
  for (const [oldKey, driveKey, listKey] of [['downloadDir', 'downloadDrive', 'legacyDownloadDirs'], ['installDir', 'installDrive', 'legacyInstallDirs']]) {
    const old = String(raw[oldKey] || '').trim()
    if (!old) continue
    const drive = normalizeDrive(old)
    patch[driveKey] = drive && drive !== systemDrive() ? drive : ''
    patch[listKey] = [...new Set([...(raw[listKey] || []), old])]
    patch[oldKey] = ''
  }
  if (Object.keys(patch).length) saveAppPaths(patch)
}

const legacyDirs = (key) => (loadAppPaths()[key] || []).filter((d) => typeof d === 'string' && d)

function getGamesDir() {
  const dir = folderOnDrive('installDrive') || path.join(app.getPath('userData'), 'games')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  return dir
}

function registryPath() {
  return path.join(app.getPath('userData'), 'installed-games.json')
}

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(registryPath(), 'utf8')) } catch { return [] }
}

function saveRegistry(list) {
  fs.writeFileSync(registryPath(), JSON.stringify(list, null, 2), 'utf8')
}

function registerGame(entry) {
  const list = loadRegistry().filter(g => g.id !== entry.id)
  list.push(entry)
  saveRegistry(list)
  return entry
}

function removeGameEntry(id) {
  saveRegistry(loadRegistry().filter(g => g.id !== id))
}

// Ярлык игры на рабочем столе
function createDesktopShortcut(name, targetPath) {
  return new Promise((resolve) => {
    let desktop
    try { desktop = app.getPath('desktop') } catch { desktop = path.join(os.homedir(), 'Desktop') }
    const lnk = path.join(desktop, `${sanitizeName(name)}.lnk`)
    const lp = String(lnk).replace(/'/g, "''")
    const tp = String(targetPath).replace(/'/g, "''")
    const wd = String(path.dirname(targetPath)).replace(/'/g, "''")
    const ps = [
      '$ws = New-Object -ComObject WScript.Shell',
      `$s = $ws.CreateShortcut('${lp}')`,
      `$s.TargetPath = '${tp}'`,
      `$s.WorkingDirectory = '${wd}'`,
      '$s.Save()',
    ].join('\n')
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], {
      windowsHide: true, stdio: 'ignore',
    })
    child.on('error', (e) => resolve({ error: e.message }))
    child.on('exit', (code) => resolve(code === 0 ? { ok: true, path: lnk } : { error: 'Код выхода ' + code }))
  })
}

module.exports = {
  extractorsFor,
  getBundled7z,
  detectInstall,
  extractArchive,
  hoistGameRoot,
  findInstallerIn,
  largestArchive,
  extractNestedArchives,
  detectInstallerType,
  silentInstallCommand,
  runInstallerSilently,
  isProtectedPath,
  isInside,
  samePath,
  freeSpace,
  pathSize,
  sameVolume,
  formatSize,
  archiveGroupOf,
  rankGameExecutable,
  findGameRootFromExe,
  parseLaunchArgs,
  sanitizeName,
  uniqueDest,
  moveFolder,
  getGamesDir,
  systemDrive,
  normalizeDrive,
  listDrives,
  folderOnDrive,
  migrateCustomPaths,
  legacyDirs,
  loadAppPaths,
  saveAppPaths,
  loadRegistry,
  registerGame,
  removeGameEntry,
  launchInstalledGame,
  launchInstaller,
  waitProcessExit,
  unblockFolder,
  createDesktopShortcut,
}
