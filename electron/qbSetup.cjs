// qbSetup.cjs — автонастройка qBittorrent из лаунчера, чтобы пользователю
// не пришлось лезть в саму программу: включаем Web UI, ставим порт,
// отключаем обязательную авторизацию для localhost (лаунчер подключается сам).
//
// Все функции — чистые/системные (без electron), поэтому их можно тестировать
// отдельно: findQbIni/patchWebUiIni работают с копией ini.
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// --- Установленный qBittorrent ---
function findQbExe() {
  const cands = [];
  if (process.env.ProgramFiles) {
    cands.push(path.join(process.env.ProgramFiles, 'qBittorrent', 'qbittorrent.exe'));
  }
  if (process.env['ProgramFiles(x86)']) {
    cands.push(path.join(process.env['ProgramFiles(x86)'], 'qBittorrent', 'qbittorrent.exe'));
  }
  if (process.env.LOCALAPPDATA) {
    cands.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'qBittorrent', 'qbittorrent.exe'));
  }
  try {
    // Распространённое место установки из инсталлятора (HKLM uninstall ключ)
    const out = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\qBittorrent" /v InstallLocation',
      { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const m = /InstallLocation\s+REG_SZ\s+(.+)/i.exec(out);
    if (m) cands.push(path.join(m[1].trim().replace(/"$/, ''), 'qbittorrent.exe'));
  } catch { /* ключа нет — просто пропускаем */ }
  return cands.find((p) => fs.existsSync(p)) || null;
}

// --- Конфиг qBittorrent ---
// Qt-формат: секции [Section], ключи внутри — «плоские» с префиксом секции:
//   [Preferences]
//   WebUI\Enabled=true
// Важно: qB переписывает ini при выходе, поэтому файл правится ТОЛЬКО после
// полной остановки процесса.
function findQbIni() {
  const cands = [];
  if (process.env.APPDATA) cands.push(path.join(process.env.APPDATA, 'qBittorrent', 'qBittorrent.ini'));
  if (process.env.LOCALAPPDATA) cands.push(path.join(process.env.LOCALAPPDATA, 'qBittorrent', 'qBittorrent.ini'));
  const existing = cands.find((p) => fs.existsSync(p));
  return { existing: existing || null, fallback: cands[0] || null };
}

// Выставляет WebUI\{Enabled,Port} внутри секции [Preferences].
// LocalHostAuth НЕ трогаем: авторизацию настраивает сам пользователь
// (поле кредов в лаунчере), а лезть в безопасность без спроса нельзя.
// Возвращает { applied: [...], missingSection: boolean }.
function patchWebUiIni(iniPath, port, { enabled = true } = {}) {
  return patchIniSections(iniPath, {
    Preferences: {
      'WebUI\\Enabled': enabled ? 'true' : 'false',
      'WebUI\\Port': String(port),
    },
  });
}

// Выставляет ключи в секциях ini, остальное содержимое файла сохраняет.
function patchIniSections(iniPath, sections) {
  let text = fs.existsSync(iniPath) ? fs.readFileSync(iniPath, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const applied = [];
  let missingSection = false;

  for (const [section, values] of Object.entries(sections)) {
    // Границы секции
    let start = -1;
    let end = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === `[${section}]`) { start = i + 1; continue; }
      if (start !== -1 && /^\[[^\]]+\]$/.test(t)) { end = i; break; }
    }

    if (start === -1) {
      missingSection = true;
      // Приклеиваем секцию в конец (с пустой строкой перед ней)
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.push('', `[${section}]`);
      start = lines.length;
      end = lines.length;
    }

    for (const [key, value] of Object.entries(values)) {
      let found = false;
      for (let i = start; i < end; i++) {
        const m = /^([^=]+)=(.*)$/.exec(lines[i]);
        if (m && m[1].trim() === key) {
          lines[i] = `${key}=${value}`;
          found = true;
          applied.push({ key, value, replaced: true });
          break;
        }
      }
      if (!found) {
        // конец секции, перед пустыми строками-разделителями
        let at = end;
        while (at > start && lines[at - 1] === '') at -= 1;
        lines.splice(at, 0, `${key}=${value}`);
        end += 1;
        applied.push({ key, value, replaced: false });
      }
    }
  }

  fs.writeFileSync(iniPath, lines.join(eol), 'utf8');
  return { applied, missingSection, path: iniPath };
}

// --- Процесс qBittorrent ---
function isQbRunning() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq qbittorrent.exe" /NH', {
      windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return /qbittorrent\.exe/i.test(out);
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Остановка: сначала мягко (WM_CLOSE — qB успевает записать ini и fast-resume),
// через gracePeriod — принудительно. Возвращает true, если процесса больше нет.
async function stopQb({ graceMs = 8000 } = {}) {
  if (!isQbRunning()) return true;
  try {
    execSync('taskkill /IM qbittorrent.exe', { windowsHide: true, stdio: 'ignore' });
  } catch { /* уже завершился */ }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!isQbRunning()) return true;
    await sleep(400);
  }
  try {
    execSync('taskkill /IM qbittorrent.exe /F', { windowsHide: true, stdio: 'ignore' });
  } catch { /* нет процесса */ }
  await sleep(800);
  return !isQbRunning();
}

function startQb(exePath) {
  const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
  child.unref();
  return true;
}

module.exports = { findQbExe, findQbIni, patchWebUiIni, patchIniSections, isQbRunning, stopQb, startQb };
