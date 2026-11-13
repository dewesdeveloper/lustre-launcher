#!/usr/bin/env node
/**
 * Деплой web-версии на сервер статикой.
 *
 * Собирает dist-web (npm run build:web: абсолютные пути и SEO-страницы; dist с
 * относительными путями — для лаунчера), упаковывает в tar.gz, копирует на сервер
 * и атомарно подменяет каталог /var/www/lustre:
 *   1. распаковка в /var/www/lustre.next
 *   2. старый каталог → /var/www/lustre.prev
 *   3. .next → /var/www/lustre
 *
 * Переменные окружения (по умолчанию — production):
 *   WEB_SSH       — ssh-подключение, например deploy@example.com (обязательно; можно задать
 *                   в scripts/deploy.local.json: { "ssh": "…" } — файл не коммитится)
 *   WEB_SSH_KEY   — путь к ключу  (default: ~/.ssh/id_ed25519)
 *   WEB_DIR       — каталог на сервере (default: /var/www/lustre)
 *   WEB_SKIP_BUILD=1 — не запускать сборку (использовать готовый dist-web)
 *
 * Требования на машине: ssh/scp (OpenSSH) и tar (есть в Windows 10+).
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let localCfg = {};
try { localCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'deploy.local.json'), 'utf8')); } catch { /* нет файла */ }
const SSH = process.env.WEB_SSH || localCfg.ssh;
if (!SSH) {
  console.error('Не задан сервер: WEB_SSH=user@host или scripts/deploy.local.json { "ssh": "user@host" }');
  process.exit(1);
}
const KEY = process.env.WEB_SSH_KEY || path.join(os.homedir(), '.ssh', 'id_ed25519');
const REMOTE_DIR = process.env.WEB_DIR || '/var/www/lustre';
// Путь относительно корня проекта: GNU tar и scp (Git Bash) принимают «C:\…» за адрес хоста
const ARCHIVE = 'lustre-web.tar.gz';
const ARCHIVE_PATH = path.join(ROOT, ARCHIVE);

function sh(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  // На Windows npm — это npm.cmd: без shell spawnSync его не находит
  const useShell = process.platform === 'win32' && /npm$/.test(cmd);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: useShell });
}

// 1. Сборка
if (process.env.WEB_SKIP_BUILD !== '1') {
  sh('npm', ['run', 'build:web']);
}

if (!fs.existsSync(path.join(ROOT, 'dist-web', 'index.html'))) {
  console.error('dist-web/index.html не найден — сборка не удалась?');
  process.exit(1);
}

// 2. Архив (tar — содержимое dist-web без самой папки)
try { fs.rmSync(ARCHIVE_PATH, { force: true }); } catch { /* ignore */ }
sh('tar', ['-czf', ARCHIVE, '-C', 'dist-web', '.']);

// 3. Копирование архива
sh('scp', ['-i', KEY, '-o', 'StrictHostKeyChecking=no', ARCHIVE, `${SSH}:/tmp/lustre-web.tar.gz`]);

// 4. Распаковка + атомарная подмена каталога на сервере
const remote = [
  'set -e',
  `rm -rf ${REMOTE_DIR}.next`,
  `mkdir -p ${REMOTE_DIR}.next`,
  'tar -xzf /tmp/lustre-web.tar.gz -C ' + REMOTE_DIR + '.next',
  `rm -rf ${REMOTE_DIR}.prev`,
  `[ -d ${REMOTE_DIR} ] && mv ${REMOTE_DIR} ${REMOTE_DIR}.prev || true`,
  `mv ${REMOTE_DIR}.next ${REMOTE_DIR}`,
  'rm -f /tmp/lustre-web.tar.gz',
  `echo "deployed to ${REMOTE_DIR}"`,
].join(' && ');
sh('ssh', ['-i', KEY, '-o', 'StrictHostKeyChecking=no', SSH, remote]);

try { fs.rmSync(ARCHIVE_PATH, { force: true }); } catch { /* ignore */ }
console.log('Готово: web-версия обновлена на сервере.');
