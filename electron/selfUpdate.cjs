// selfUpdate.cjs — обновление «как у Steam». Лаунчер стоит в Program Files (x86)\Lustre, а установщик
// при первой установке открыл эту папку на запись пользователям. Поэтому новую версию можно положить
// поверх без установщика и без окна запроса прав администратора: файлы приложения берутся из
// скачанного и проверенного electron-updater установщика (архив app-64.7z внутри него), а заменяет
// их отдельный скрипт уже после выхода из лаунчера — работающие файлы Windows заменить не даст.
//
// Без electron, поэтому тестируется отдельно.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

const PAYLOAD = '$PLUGINSDIR\\app-64.7z';

// Установка для всех пользователей, и папка доступна на запись: тогда обновляемся сами.
// В установке для одного пользователя (AppData\Local\Programs) работает обычный установщик,
// прав он и так не просит.
function canSelfUpdate(installDir) {
  const perUser = process.env.LOCALAPPDATA ? path.resolve(process.env.LOCALAPPDATA, 'Programs').toLowerCase() : '';
  const dir = path.resolve(installDir).toLowerCase();
  if (perUser && (dir === perUser || dir.startsWith(perUser + path.sep))) return false;
  const probe = path.join(installDir, `.lustre-write-test-${process.pid}`);
  try {
    fs.writeFileSync(probe, 'x');
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

const run7z = (sevenZip, args) => new Promise((resolve, reject) => {
  execFile(sevenZip, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) reject(new Error(`7-Zip: ${String(stderr || stdout || err.message).trim().split(/\r?\n/).pop()}`));
    else resolve();
  });
});

// Достаёт файлы приложения из установщика NSIS в staging и проверяет, что там есть сам лаунчер
async function extractAppPayload(installerFile, stagingDir, sevenZip, exeName) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  const tmp = `${stagingDir}.payload`;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  try {
    await run7z(sevenZip, ['e', '-y', `-o${tmp}`, installerFile, PAYLOAD]);
    const payload = path.join(tmp, 'app-64.7z');
    if (!fs.existsSync(payload)) throw new Error('в установщике нет архива приложения');
    await run7z(sevenZip, ['x', '-y', `-o${stagingDir}`, payload]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  for (const must of [exeName, path.join('resources', 'app.asar')]) {
    if (!fs.existsSync(path.join(stagingDir, must))) throw new Error(`в обновлении нет файла ${must}`);
  }
}

// Скрипт замены файлов: ждёт выхода лаунчера (и закрывает оставшиеся его процессы, в том числе
// встроенный торрент-клиент), копирует новую версию поверх и запускает лаунчер. Результат пишет
// в statusFile: при сбое лаунчер в следующий раз обновится обычным установщиком.
function applyScript({ staging, installDir, pid, exeName, statusFile, logFile }) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  return [
    '$ErrorActionPreference = "SilentlyContinue"',
    `$staging = ${q(staging)}; $dir = ${q(installDir)}; $exe = Join-Path $dir ${q(exeName)}`,
    `$status = ${q(statusFile)}; $log = ${q(logFile)}`,
    "Add-Content -Path $log -Value ((Get-Date).ToString('s') + ' старт')",
    `Wait-Process -Id ${Number(pid) || 0} -Timeout 60`,
    // процессы из папки лаунчера: окна Electron, торрент-клиент; без них файлы не заменить
    "Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($dir, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force",
    'Start-Sleep -Seconds 1',
    '& robocopy.exe $staging $dir /E /R:5 /W:2 /NFL /NDL /NP /NJH /NJS | Out-Null',
    '$rc = $LASTEXITCODE',
    'Add-Content -Path $log -Value ((Get-Date).ToString("s") + " robocopy " + $rc)',
    // у robocopy 0–7 — успех (с разными оттенками), 8 и выше — ошибка
    'if ($rc -lt 8) { Set-Content -Path $status -Value "ok" -Encoding UTF8; Remove-Item -Recurse -Force $staging }',
    'else { Set-Content -Path $status -Value ("failed:" + $rc) -Encoding UTF8 }',
    'Start-Process -FilePath $exe -WorkingDirectory $dir',
  ].join('\n');
}

function spawnApplyHelper(opts) {
  const scriptFile = path.join(path.dirname(opts.staging), 'lustre-apply-update.ps1');
  // BOM: Windows PowerShell без него читает скрипт в кодировке системы и портит кириллицу в путях
  fs.writeFileSync(scriptFile, '﻿' + applyScript(opts), 'utf8');
  // Через «start»: отделённый от лаунчера PowerShell без своей консоли не запускается вовсе,
  // а start даёт ему консоль (скрытую -WindowStyle Hidden), и скрипт переживает выход лаунчера
  const child = spawn('cmd.exe', ['/d', '/c', 'start', '""', '/min', 'powershell.exe', '-NoProfile', '-NonInteractive',
    '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptFile], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
  return scriptFile;
}

// Итог прошлого обновления: 'ok', 'failed:<код>' или null
function readApplyStatus(statusFile) {
  try { return fs.readFileSync(statusFile, 'utf8').replace(/^﻿/, '').trim() || null; } catch { return null; }
}

const defaultWorkDir = () => path.join(os.tmpdir(), 'LustreHub', 'update');

module.exports = { canSelfUpdate, extractAppPayload, applyScript, spawnApplyHelper, readApplyStatus, defaultWorkDir };
