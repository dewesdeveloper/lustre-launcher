#!/usr/bin/env node
/**
 * Публикация мобильного приложения:
 *  1) APK и latest.json — на наш сервер (/var/www/lustre-updates/android): оттуда приложение
 *     обновляется само (GET /app/android/latest) и оттуда же его отдаёт кнопка на сайте;
 *  2) Lustre.apk — в последний релиз репозитория релизов: запасной вариант, если зеркало недоступно.
 *
 *   node scripts/publish-apk.cjs --eas <id сборки EAS>     — артефакт, версия и номер сборки из EAS
 *   node scripts/publish-apk.cjs <адрес или путь> --version 1.1.0 --code 5
 *
 * Без номера сборки (--code) автообновление не сработает: им приложение сравнивает версии.
 * Что нового — из LustreMobile/release-notes.md (если есть). Сервер — WEB_SSH или scripts/deploy.local.json.
 * Нужен GH_TOKEN с доступом к репозиторию релизов.
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// APK живёт в старом репозитории релизов: оттуда его отдаёт сервер (GET /download/android,
// RELEASES_REPO). build.publish лаунчера теперь указывает на открытый lustre-launcher — он сюда не подходит.
// Другой репозиторий — переменной APK_REPO=owner/name (тогда и на сервере RELEASES_REPO_ANDROID).
const [owner, repo] = (process.env.APK_REPO || 'DewesDeveloper/LustreHub-releases').split('/');
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const API = `https://api.github.com/repos/${owner}/${repo}`;
const ASSET = 'Lustre.apk';

function fail(msg) {
  console.error(`\n  ПУБЛИКАЦИЯ ОСТАНОВЛЕНА: ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const MOBILE = path.join(__dirname, '..', '..', 'LustreMobile');
let source = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
let appVersion = opt('--version') || '';
let versionCode = Number(opt('--code') || 0);

const easId = opt('--eas');
if (easId) {
  console.log(`> сборка EAS ${easId}`);
  const out = execFileSync('npx', ['eas-cli', 'build:view', easId, '--json'], { cwd: MOBILE, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const b = JSON.parse(out.slice(out.indexOf('{')));
  if (b.status !== 'FINISHED') fail(`сборка в статусе ${b.status}`);
  source = b.artifacts?.buildUrl || b.artifacts?.applicationArchiveUrl;
  appVersion = b.appVersion || appVersion;
  versionCode = Number(b.appBuildVersion || versionCode);
}
if (!source) fail('укажите --eas <id> или адрес APK / путь к файлу');
if (!TOKEN) fail('нет GH_TOKEN');
if (!Number.isInteger(versionCode) || versionCode <= 0) console.warn('  ВНИМАНИЕ: нет номера сборки (--code) — на зеркало APK не попадёт, автообновление его не увидит');

function mirrorTarget() {
  let local = {};
  try { local = JSON.parse(fs.readFileSync(path.join(__dirname, 'deploy.local.json'), 'utf8')); } catch { /* нет файла */ }
  const ssh = process.env.WEB_SSH || local.ssh;
  const key = process.env.WEB_SSH_KEY || path.join(os.homedir(), '.ssh', 'id_ed25519');
  return ssh ? { ssh, key } : null;
}

/** APK и latest.json на сервер: сначала файл, последним — манифест (он делает версию видимой) */
function mirror(file, size) {
  const t = mirrorTarget();
  if (!t) {
    console.warn('  зеркало пропущено: не задан сервер (WEB_SSH или scripts/deploy.local.json)');
    return;
  }
  const DIR = '/var/www/lustre-updates/android';
  const name = `Lustre-${versionCode}.apk`;
  let notes = '';
  try { notes = fs.readFileSync(path.join(MOBILE, 'release-notes.md'), 'utf8').trim().slice(0, 4000); } catch { /* без описания */ }
  const manifest = {
    version: appVersion, version_code: versionCode, file: name, size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    notes, published_at: new Date().toISOString(),
  };
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lustre-apk-'));
  const apkCopy = path.join(tmpDir, name);
  const json = path.join(tmpDir, 'latest.json');
  fs.copyFileSync(file, apkCopy);
  fs.writeFileSync(json, JSON.stringify(manifest, null, 2));
  const base = ['-i', t.key, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=25'];
  const run = (cmd, a) => execFileSync(cmd, a, { stdio: 'inherit', cwd: tmpDir });
  try {
    console.log(`> зеркало: https://lustrehub.pro/updates/android/${name}`);
    run('ssh', [...base, t.ssh, `mkdir -p ${DIR}/.incoming`]);
    for (let i = 1; ; i++) {
      // относительные имена: scp из Git Bash принимает «C:\…» за адрес хоста
      try { run('scp', [...base, name, 'latest.json', `${t.ssh}:${DIR}/.incoming/`]); break; } catch (e) {
        if (i === 4) throw e;
        console.warn(`  повтор копирования на сервер (${i}/3)`);
      }
    }
    // APK, потом манифест; из старых сборок оставляем одну предыдущую
    run('ssh', [...base, t.ssh, [
      `cd ${DIR}`,
      `mv -f .incoming/${name} .`,
      'mv -f .incoming/latest.json latest.json',
      'ls -1t Lustre-*.apk | tail -n +3 | xargs -r rm -f',
      'chmod -R a+rX .',
    ].join(' && ')]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Токен — во временном файле заголовков, а не в аргументах (их видно в списке процессов)
const hdr = path.join(os.tmpdir(), `lustre-apk-${process.pid}.hdr`);
fs.writeFileSync(hdr, `Authorization: Bearer ${TOKEN}\nAccept: application/vnd.github+json\n`, { mode: 0o600 });

function gh(method, url, extra = []) {
  const out = execFileSync('curl', ['-sS', '--fail-with-body', '--retry', '3', '--max-time', '120', '-X', method, '-H', `@${hdr}`, ...extra, url], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return out ? JSON.parse(out) : null;
}

let tmpFile = null;
try {
  let file = source;
  if (/^https?:\/\//.test(source)) {
    tmpFile = path.join(os.tmpdir(), `lustre-${process.pid}.apk`);
    file = tmpFile;
    console.log('> скачиваю APK…');
    execFileSync('curl', ['-sSL', '--fail', '--retry', '3', '--max-time', '1800', '-o', file, source], { stdio: 'inherit' });
  }
  if (!fs.existsSync(file)) fail(`файл не найден: ${file}`);
  const size = fs.statSync(file).size;
  // APK — это ZIP: защита от загрузки страницы с ошибкой вместо приложения
  const head = Buffer.alloc(2);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, head, 0, 2, 0);
  fs.closeSync(fd);
  if (head.toString('latin1') !== 'PK') fail('файл не похож на APK');

  if (versionCode > 0) mirror(file, size);

  const release = gh('GET', `${API}/releases/latest`);
  console.log(`> релиз ${release.tag_name}, ${ASSET} (${(size / 1024 / 1024).toFixed(1)} МБ)`);
  const stale = (release.assets || []).find((a) => a.name === ASSET);
  if (stale) gh('DELETE', `${API}/releases/assets/${stale.id}`);

  const asset = gh(
    'POST',
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${ASSET}`,
    ['-H', 'Content-Type: application/vnd.android.package-archive', '--data-binary', `@${file}`, '--max-time', '3600'],
  );
  if (asset.size !== size) fail(`размер не совпал: ${asset.size} ≠ ${size}`);
  console.log(`Готово: ${asset.browser_download_url}${versionCode > 0 ? ` (сборка ${versionCode}, версия ${appVersion || '—'})` : ''}`);
} catch (e) {
  fail((e.stdout || '').toString().slice(0, 300) || e.message);
} finally {
  fs.rmSync(hdr, { force: true });
  if (tmpFile) fs.rmSync(tmpFile, { force: true });
}
