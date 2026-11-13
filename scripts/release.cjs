#!/usr/bin/env node
/**
 * Сборка и публикация релиза в GitHub Releases (репозиторий из build.publish в package.json).
 *
 * Почему не `electron-builder --publish always`: в electron-builder (проверено на 26.15.3 и 26.18.0)
 * PublishManager.getOrCreatePublisher кэширует публикатор только ПОСЛЕ await createPublisher(),
 * а артефакты (.exe и .blockmap) приходят параллельно. Оба видят пустой кэш → создаются два
 * GitHubPublisher, и каждый создаёт свой релиз. С releaseType "draft" это давало дубли
 * черновиков (beta.6–beta.8), с "release" второй запрос падает («Unexpected end of JSON input»),
 * и релиз остаётся опубликованным без .exe и latest.yml (beta.20).
 *
 * Здесь electron-builder только собирает (--publish never), а публикация последовательная:
 *   1. черновик релиза с текстом из build/release-notes.md;
 *   2. загрузка .exe, .blockmap и последним latest.yml (с повторами);
 *   3. сверка размеров загруженных файлов;
 *   4. снятие черновика — клиенты видят релиз только целиком.
 *
 * Требуется GH_TOKEN (права на запись в репозиторий релизов).
 * RELEASE_SKIP_BUILD=1 — не собирать заново (взять готовые файлы из папки сборки).
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const { owner, repo } = pkg.build.publish;
const VERSION = pkg.version;
const TAG = `v${VERSION}`;
const OUT_DIR = path.resolve(ROOT, pkg.build.directories?.output || 'dist');
const EXE = `${pkg.build.productName || pkg.productName}-Setup-${VERSION}.exe`;
const NOTES_FILE = path.join(ROOT, 'build', 'release-notes.md');
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const API = `https://api.github.com/repos/${owner}/${repo}`;

function fail(msg) {
  console.error(`\n  РЕЛИЗ ОСТАНОВЛЕН: ${msg}\n`);
  process.exit(1);
}

// vendor/ не хранится в git, а без встроенного qBittorrent торренты у новых пользователей не заработают
// и без встроенного 7-Zip (7z.exe вместе с 7z.dll) у пользователей без 7-Zip не распакуются игры
for (const f of ['7z.exe', '7z.dll']) {
  if (!fs.existsSync(path.join(ROOT, 'vendor', '7z', f))) fail(`нет vendor/7z/${f}: см. vendor/README.md`);
}
if (!fs.existsSync(path.join(ROOT, 'vendor', 'qbittorrent', 'lustre-torrent.exe'))) {
  fail('нет vendor/qbittorrent/lustre-torrent.exe: см. vendor/README.md');
}

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  // на Windows npm/npx — это .cmd: без shell execFileSync их не находит
  const shell = process.platform === 'win32' && /^(npm|npx)$/.test(cmd);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Запрос к GitHub с повторами: сеть/прокси иногда рвут соединение или отдают пустое тело
async function gh(method, url, { body, headers = {}, okStatuses = [200, 201], attempts = 4 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url.startsWith('http') ? url : `${API}${url}`, {
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...headers,
        },
        body,
      });
      const text = await res.text();
      if (res.status === 404 && okStatuses.includes(404)) return null;
      if (!okStatuses.includes(res.status)) {
        const err = new Error(`${method} ${url}: HTTP ${res.status} ${text.slice(0, 300)}`);
        err.status = res.status;
        if (res.status < 500 && res.status !== 429) throw err; // 4xx — повтор не поможет
        throw Object.assign(err, { retry: true });
      }
      if (!text) {
        if (res.status === 204) return null;
        throw Object.assign(new Error(`${method} ${url}: пустой ответ`), { retry: true });
      }
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (e.status && !e.retry) throw e;
      if (i < attempts) {
        console.warn(`  повтор ${i}/${attempts - 1}: ${e.message}`);
        await sleep(2000 * i);
      }
    }
  }
  throw lastErr;
}

async function listReleases() {
  return gh('GET', '/releases?per_page=100');
}

// Загрузка файла через curl: Node fetch (undici) через HTTP-прокси рвёт соединение на больших
// телах (установщик ~135 МБ — «fetch failed» на каждой попытке), curl отправляет файл потоком.
// Токен — во временном файле заголовков, а не в аргументах (их видно в списке процессов).
function curlUpload(url, filePath) {
  const hdr = path.join(require('os').tmpdir(), `lustre-release-${process.pid}.hdr`);
  fs.writeFileSync(hdr, `Authorization: Bearer ${TOKEN}\nAccept: application/vnd.github+json\nContent-Type: application/octet-stream\n`, { mode: 0o600 });
  try {
    const out = execFileSync('curl', [
      '-sS', '--fail-with-body', '-X', 'POST', '-H', `@${hdr}`,
      '--data-binary', `@${filePath}`, '--retry', '0', '--max-time', '3600', url,
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(out);
  } catch (e) {
    const detail = (e.stdout || '').toString().slice(0, 300) || e.message;
    throw new Error(`curl: ${detail}`);
  } finally {
    fs.rmSync(hdr, { force: true });
  }
}

async function uploadAsset(release, filePath) {
  const name = path.basename(filePath);
  const size = fs.statSync(filePath).size;
  for (let i = 1; i <= 3; i++) {
    // оборванная загрузка оставляет битый ассет с тем же именем — убираем перед повтором
    const current = await gh('GET', `/releases/${release.id}/assets?per_page=100`);
    const stale = current.find((a) => a.name === name);
    if (stale) await gh('DELETE', `/releases/assets/${stale.id}`, { okStatuses: [204] });
    try {
      console.log(`  загрузка ${name} (${(size / 1024 / 1024).toFixed(1)} МБ)…`);
      const asset = curlUpload(
        `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        filePath,
      );
      if (asset.size !== size) throw new Error(`размер не совпал: ${asset.size} ≠ ${size}`);
      return asset;
    } catch (e) {
      if (i === 3) throw e;
      console.warn(`  повтор загрузки ${name}: ${e.message}`);
      await sleep(3000 * i);
    }
  }
}

function readUpdateInfo() {
  const yml = path.join(OUT_DIR, 'latest.yml');
  if (!fs.existsSync(yml)) fail(`нет ${yml}`);
  const text = fs.readFileSync(yml, 'utf8');
  const version = text.match(/^version:\s*(.+)$/m)?.[1]?.trim();
  const sha = text.match(/^sha512:\s*(.+)$/m)?.[1]?.trim();
  if (version !== VERSION) fail(`latest.yml описывает версию ${version}, а собирается ${VERSION}`);
  const exeSha = crypto.createHash('sha512').update(fs.readFileSync(path.join(OUT_DIR, EXE))).digest('base64');
  if (sha !== exeSha) fail('sha512 в latest.yml не совпадает с установщиком');
  return yml;
}

(async () => {
  if (!TOKEN) fail('не задан GH_TOKEN');

  // 0. Текст релиза и проверка, что он обновлён
  const notes = fs.existsSync(NOTES_FILE) ? fs.readFileSync(NOTES_FILE, 'utf8').trim() : '';
  if (!notes) fail(`пустой ${path.relative(ROOT, NOTES_FILE)} — его увидят пользователи в «Что нового»`);
  const body = `## Что нового в ${VERSION}\n\n${notes}\n`;

  const releases = await listReleases();
  const sameTag = releases.filter((r) => r.tag_name === TAG);
  if (sameTag.some((r) => !r.draft)) fail(`релиз ${TAG} уже опубликован — поднимите версию в package.json`);
  // created_at у релизов этого репозитория ненадёжен (совпадает у разных версий) — берём по публикации
  const previous = releases
    .filter((r) => !r.draft && r.tag_name !== TAG && r.published_at)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  if (previous && previous.body && previous.body.includes(notes)) {
    fail(`build/release-notes.md совпадает с текстом прошлого релиза ${previous.tag_name} — обновите его`);
  }

  // 1. Сборка (без публикации)
  if (process.env.RELEASE_SKIP_BUILD !== '1') {
    run('node', ['scripts/check-api-url.cjs']);
    run('npm', ['run', 'build']);
    run('npx', ['electron-builder', '--publish', 'never']);
  }
  const files = [EXE, `${EXE}.blockmap`].map((f) => path.join(OUT_DIR, f));
  for (const f of files) if (!fs.existsSync(f)) fail(`нет файла сборки ${f}`);
  files.push(readUpdateInfo()); // latest.yml — последним: он делает версию видимой для апдейтера

  // 2. Черновик: оставшиеся от прошлых попыток черновики этой версии удаляем
  for (const r of sameTag) {
    console.log(`  удаляю старый черновик ${TAG} (id ${r.id})`);
    await gh('DELETE', `/releases/${r.id}`, { okStatuses: [204] });
  }
  console.log(`> создаю черновик ${TAG} в ${owner}/${repo}`);
  const release = await gh('POST', '/releases', {
    body: JSON.stringify({ tag_name: TAG, name: pkg.releaseName || VERSION, body, draft: true, prerelease: false }),
    headers: { 'Content-Type': 'application/json' },
    okStatuses: [201],
    attempts: 1, // повтор создания мог бы сделать второй черновик
  });

  // 3. Файлы — по одному
  for (const f of files) await uploadAsset(release, f);

  // 4. Сверка и публикация
  const assets = await gh('GET', `/releases/${release.id}/assets?per_page=100`);
  for (const f of files) {
    const a = assets.find((x) => x.name === path.basename(f));
    if (!a || a.state !== 'uploaded' || a.size !== fs.statSync(f).size) {
      fail(`файл ${path.basename(f)} не загрузился целиком — черновик ${TAG} оставлен неопубликованным`);
    }
  }
  await gh('PATCH', `/releases/${release.id}`, {
    body: JSON.stringify({ draft: false, make_latest: 'true' }),
    headers: { 'Content-Type': 'application/json' },
  });
  console.log(`\nГотово: ${TAG} опубликован — https://github.com/${owner}/${repo}/releases/tag/${TAG}`);
})().catch((e) => fail(e.message));
