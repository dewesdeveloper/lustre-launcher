// qbManaged.cjs — встроенный qBittorrent: ставится вместе с лаунчером (resources/vendor/qbittorrent)
// и работает со своим профилем в userData, поэтому не трогает qBittorrent пользователя,
// если тот у него есть. Исполняемый файл переименован, чтобы установщик мог закрыть именно
// наш процесс при обновлении (taskkill по имени), а не клиент пользователя.
//
// Без electron, поэтому тестируется отдельно.
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { patchIniSections } = require('./qbSetup.cjs');

const MANAGED_EXE = 'lustre-torrent.exe';
const MANAGED_USER = 'lustre';
const DEFAULT_MANAGED_PORT = 19091;

function findManagedExe() {
  const cands = [];
  if (process.resourcesPath) cands.push(path.join(process.resourcesPath, 'vendor', 'qbittorrent', MANAGED_EXE));
  cands.push(path.join(__dirname, '..', 'vendor', 'qbittorrent', MANAGED_EXE));
  return cands.find((p) => fs.existsSync(p)) || null;
}

function generatePassword() {
  return crypto.randomBytes(24).toString('hex');
}

// Формат qBittorrent: PBKDF2-SHA512, 100000 итераций, соль 16 байт, ключ 64 байта
function hashWebUiPassword(pass) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(pass, salt, 100000, 64, 'sha512');
  return `"@ByteArray(${salt.toString('base64')}:${key.toString('base64')})"`;
}

function managedIniPath(profileDir) {
  return path.join(profileDir, 'qBittorrent', 'config', 'qBittorrent.ini');
}

// Веб-интерфейс только на 127.0.0.1 и со случайным паролем. Остальные настройки не трогаем:
// слушающий порт, скорость и очередь qBittorrent хранит сам.
function writeManagedConfig(profileDir, { port, pass }) {
  const ini = managedIniPath(profileDir);
  fs.mkdirSync(path.dirname(ini), { recursive: true });
  return patchIniSections(ini, {
    LegalNotice: { Accepted: 'true' },
    Preferences: {
      'General\\StartMinimized': 'true',
      'General\\NoSplashScreen': 'true',
      'General\\SystrayEnabled': 'true',
      'General\\MinimizeToTray': 'true',
      'General\\CloseToTray': 'true',
      'General\\CloseToTrayNotified': 'true',
      'General\\ExitConfirm': 'false',
      'Advanced\\updateCheck': 'false', // версию обновляет лаунчер
      'Downloads\\NewAdditionDialog': 'false',
      'WebUI\\Enabled': 'true',
      'WebUI\\Address': '127.0.0.1',
      'WebUI\\Port': String(port),
      'WebUI\\LocalHostAuth': 'true',
      'WebUI\\MaxAuthenticationFailCount': '0',
      'WebUI\\Username': MANAGED_USER,
      'WebUI\\Password_PBKDF2': hashWebUiPassword(pass),
    },
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

function anyFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function pickPort(preferred) {
  const n = Number(preferred);
  const port = Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_MANAGED_PORT;
  return (await isPortFree(port)) ? port : anyFreePort();
}

// Есть ли торренты, которые нужно продолжить после запуска лаунчера
function hasTorrents(profileDir) {
  try {
    return fs.readdirSync(path.join(profileDir, 'qBittorrent', 'data', 'BT_backup')).some((f) => f.endsWith('.fastresume'));
  } catch {
    return false;
  }
}

function startManaged(exe, profileDir) {
  const child = spawn(exe, [`--profile=${profileDir}`, '--no-splash'], {
    detached: true, stdio: 'ignore', cwd: path.dirname(exe),
  });
  child.on('error', () => {}); // отсутствие ответа заметит ожидание входа
  child.unref();
}

function isManagedRunning() {
  try {
    const out = execSync(`tasklist /FI "IMAGENAME eq ${MANAGED_EXE}" /NH`, {
      windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toLowerCase().includes(MANAGED_EXE);
  } catch {
    return false;
  }
}

function killManaged() {
  try {
    execSync(`taskkill /IM ${MANAGED_EXE} /F`, { windowsHide: true, stdio: 'ignore' });
  } catch { /* процесса уже нет */ }
}

// Состояние qBittorrent → статус загрузки в лаунчере. В qB 5 pausedDL стал stoppedDL.
function torrentStatus(state, progress) {
  if (state === 'pausedDL' || state === 'stoppedDL') return 'paused';
  if (state === 'error' || state === 'missingFiles') return 'error';
  return progress >= 1 ? 'completed' : 'downloading';
}

// Качать не у кого: метаданные ещё не получены или нет ни одного подключённого пира.
// Такое бывает, если раздачу никто не раздаёт или сеть блокирует торренты.
function torrentSearching(t) {
  if (torrentStatus(t.state, t.progress) !== 'downloading' || t.dlspeed > 0) return false;
  if (t.state === 'queuedDL' || t.state === 'checkingDL' || t.state === 'checkingResumeData' || t.state === 'moving') return false;
  return (t.num_seeds || 0) + (t.num_leechs || 0) === 0;
}

function torrentError(state) {
  if (state === 'missingFiles') return 'Файлы загрузки не найдены';
  if (state === 'error') return 'Ошибка записи: проверьте место на диске и доступ к папке';
  return undefined;
}

module.exports = {
  MANAGED_USER, DEFAULT_MANAGED_PORT,
  findManagedExe, generatePassword, hashWebUiPassword, managedIniPath, writeManagedConfig,
  pickPort, hasTorrents, startManaged, isManagedRunning, killManaged, torrentStatus, torrentError, torrentSearching,
};
