#!/usr/bin/env node
/**
 * Публикация мобильного приложения: скачивает APK (например, артефакт сборки EAS) и
 * прикрепляет его как Lustre.apk к последнему релизу в репозитории релизов. Сервер
 * (GET /download/android) отдаёт самый свежий APK, найденный среди релизов.
 * Важно: если удалить релиз с APK, ссылка на скачивание потеряет этот файл.
 *
 *   node scripts/publish-apk.cjs <адрес APK или путь к файлу>
 *
 * Нужен GH_TOKEN с доступом к репозиторию релизов.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pkg = require(path.join(__dirname, '..', 'package.json'));
const { owner, repo } = pkg.build.publish;
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const API = `https://api.github.com/repos/${owner}/${repo}`;
const ASSET = 'Lustre.apk';

function fail(msg) {
  console.error(`\n  ПУБЛИКАЦИЯ ОСТАНОВЛЕНА: ${msg}\n`);
  process.exit(1);
}

const source = process.argv[2];
if (!source) fail('укажите адрес APK или путь к файлу');
if (!TOKEN) fail('нет GH_TOKEN');

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
  console.log(`Готово: ${asset.browser_download_url}`);
} catch (e) {
  fail((e.stdout || '').toString().slice(0, 300) || e.message);
} finally {
  fs.rmSync(hdr, { force: true });
  if (tmpFile) fs.rmSync(tmpFile, { force: true });
}
