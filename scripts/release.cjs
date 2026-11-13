#!/usr/bin/env node
/**
 * Сборка и публикация релиза лаунчера в GitHub Releases. Собираются две версии:
 *
 *   public — из открытого кода, БЕЗ закрытого модуля админки (src/pages/admin, src/api/admin.ts
 *            на время сборки убираются из проекта). Обновляется из build.publish в package.json
 *            (открытый репозиторий lustre-launcher), файл обновлений latest.yml.
 *   staff  — с модулем админки, для персонала. Канал обновлений «staff» (staff.yml) в
 *            STAFF_REPO; установщик Lustre-Staff-Setup-<версия>.exe.
 *
 * Куда что выкладывается:
 *   - открытый репозиторий: только public;
 *   - STAFF_REPO (старый репозиторий релизов): public + staff. Public там нужна, пока у
 *     пользователей стоят версии, которые ищут обновления в старом репозитории: они получат
 *     публичную сборку, а она дальше обновляется уже из открытого репозитория.
 *     Персонал после этого один раз ставит Lustre-Staff-Setup вручную.
 *
 * Почему не `electron-builder --publish always`: в electron-builder (проверено на 26.15.3 и 26.18.0)
 * PublishManager.getOrCreatePublisher кэширует публикатор только ПОСЛЕ await createPublisher(),
 * а артефакты (.exe и .blockmap) приходят параллельно. Оба видят пустой кэш → создаются два
 * GitHubPublisher, и каждый создаёт свой релиз (дубли черновиков beta.6–beta.8, релиз без .exe
 * и latest.yml в beta.20). Здесь electron-builder только собирает (--publish never), а публикация
 * последовательная: черновик → файлы по одному (.yml последним) → сверка размеров → публикация.
 *
 * Требуется GH_TOKEN с правом записи в оба репозитория.
 * RELEASE_SKIP_BUILD=1 — не собирать заново (взять готовые файлы из release/public и release/staff).
 * RELEASE_ONLY=public|staff — собрать и выложить только одну версию.
 * RELEASE_DRY=1 — только собрать и проверить файлы, ничего не публикуя (токен не нужен).
 */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const VERSION = pkg.version;
const TAG = `v${VERSION}`;
const PRODUCT = pkg.build.productName || pkg.productName;
const OUT_ROOT = path.resolve(ROOT, pkg.build.directories?.output || 'release');
const NOTES_FILE = path.join(ROOT, 'build', 'release-notes.md');
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const PUBLIC_REPO = { owner: pkg.build.publish.owner, repo: pkg.build.publish.repo };
const STAFF_REPO = { owner: 'DewesDeveloper', repo: 'LustreHub-releases' };

// Закрытый модуль: на время публичной сборки переносится сюда (вне src — его не увидят tsc и vite)
const PRIVATE_PATHS = ['src/pages/admin', 'src/api/admin.ts'];
const STASH = path.join(ROOT, '.release-private-stash');

const FLAVORS = {
  public: {
    outDir: path.join(OUT_ROOT, 'public'),
    exe: `${PRODUCT}-Setup-${VERSION}.exe`,
    yml: 'latest.yml',
    builderArgs: [],
    targets: [PUBLIC_REPO, STAFF_REPO],
  },
  staff: {
    outDir: path.join(OUT_ROOT, 'staff'),
    exe: `${PRODUCT}-Staff-Setup-${VERSION}.exe`,
    yml: 'staff.yml',
    builderArgs: [
      `-c.publish.owner=${STAFF_REPO.owner}`,
      `-c.publish.repo=${STAFF_REPO.repo}`,
      '-c.publish.channel=staff',
      `-c.nsis.artifactName=${PRODUCT}-Staff-Setup-\${version}.\${ext}`,
      '-c.extraMetadata.lustreFlavor=staff',
    ],
    targets: [STAFF_REPO],
  },
};

function fail(msg) {
  restorePrivate(); // process.exit не выполняет finally — модуль админки возвращаем здесь
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
const apiOf = ({ owner, repo }) => `https://api.github.com/repos/${owner}/${repo}`;
const nameOf = ({ owner, repo }) => `${owner}/${repo}`;

// ---------- закрытый модуль: убрать на время публичной сборки и обязательно вернуть ----------

function restorePrivate() {
  for (const rel of PRIVATE_PATHS) {
    const from = path.join(STASH, rel);
    if (fs.existsSync(from)) {
      fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true });
      fs.renameSync(from, path.join(ROOT, rel));
    }
  }
  fs.rmSync(STASH, { recursive: true, force: true });
}

function stashPrivate() {
  restorePrivate(); // остатки прошлого прерванного запуска
  for (const rel of PRIVATE_PATHS) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) continue;
    const to = path.join(STASH, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(src, to);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restorePrivate(); process.exit(130); });

function build(flavor) {
  const f = FLAVORS[flavor];
  const hasAdmin = fs.existsSync(path.join(ROOT, 'src/pages/admin/module.tsx')) || fs.existsSync(path.join(STASH, 'src/pages/admin/module.tsx'));
  if (flavor === 'staff' && !hasAdmin) fail('для сборки персонала нет модуля админки — выполните npm run admin:pull');
  if (flavor === 'public') stashPrivate();
  try {
    run('npm', ['run', 'build']);
    if (flavor === 'public') {
      // защита от ошибки: в публичной сборке не должно остаться кода админки
      const leaked = fs.readdirSync(path.join(ROOT, 'dist', 'assets'))
        .filter((n) => n.endsWith('.js'))
        .some((n) => fs.readFileSync(path.join(ROOT, 'dist', 'assets', n), 'utf8').includes('/admin/stats'));
      if (leaked) fail('в публичную сборку попал код админки');
    }
    fs.rmSync(f.outDir, { recursive: true, force: true });
    run('npx', ['electron-builder', '--publish', 'never', `-c.directories.output=${path.relative(ROOT, f.outDir)}`, ...f.builderArgs]);
  } finally {
    if (flavor === 'public') restorePrivate();
  }
}

// ---------- GitHub ----------

// Запрос к GitHub с повторами: сеть/прокси иногда рвут соединение или отдают пустое тело
async function gh(target, method, url, { body, headers = {}, okStatuses = [200, 201], attempts = 4 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url.startsWith('http') ? url : `${apiOf(target)}${url}`, {
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

// Загрузка файла через curl: Node fetch (undici) через HTTP-прокси рвёт соединение на больших
// телах (установщик ~150 МБ — «fetch failed» на каждой попытке), curl отправляет файл потоком.
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

async function uploadAsset(target, release, filePath) {
  const name = path.basename(filePath);
  const size = fs.statSync(filePath).size;
  for (let i = 1; i <= 3; i++) {
    // оборванная загрузка оставляет битый ассет с тем же именем — убираем перед повтором
    const current = await gh(target, 'GET', `/releases/${release.id}/assets?per_page=100`);
    const stale = current.find((a) => a.name === name);
    if (stale) await gh(target, 'DELETE', `/releases/assets/${stale.id}`, { okStatuses: [204] });
    try {
      console.log(`  ${nameOf(target)}: загрузка ${name} (${(size / 1024 / 1024).toFixed(1)} МБ)…`);
      const asset = curlUpload(
        `https://uploads.github.com/repos/${target.owner}/${target.repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
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

/** Файлы версии: установщик, blockmap и .yml (последним — он делает версию видимой апдейтеру) */
function artifacts(flavor) {
  const f = FLAVORS[flavor];
  const exe = path.join(f.outDir, f.exe);
  const yml = path.join(f.outDir, f.yml);
  for (const p of [exe, `${exe}.blockmap`, yml]) if (!fs.existsSync(p)) fail(`нет файла сборки ${p}`);
  const text = fs.readFileSync(yml, 'utf8');
  const version = text.match(/^version:\s*(.+)$/m)?.[1]?.trim();
  const sha = text.match(/^sha512:\s*(.+)$/m)?.[1]?.trim();
  if (version !== VERSION) fail(`${f.yml} описывает версию ${version}, а собирается ${VERSION}`);
  if (!text.includes(f.exe)) fail(`${f.yml} ссылается не на ${f.exe}`);
  const exeSha = crypto.createHash('sha512').update(fs.readFileSync(exe)).digest('base64');
  if (sha !== exeSha) fail(`sha512 в ${f.yml} не совпадает с установщиком`);
  return [exe, `${exe}.blockmap`, yml];
}

/** Проверки до сборки: права на репозиторий, версия ещё не выпущена, текст релиза новый */
async function preflight(target, notes) {
  const repoInfo = await gh(target, 'GET', '', { okStatuses: [200, 404] });
  if (!repoInfo) fail(`нет доступа к ${nameOf(target)}: токену нужен доступ к репозиторию (Contents: Read and write)`);
  if (repoInfo.private) console.warn(`  ВНИМАНИЕ: ${nameOf(target)} приватный — лаунчеры не смогут скачать из него обновление`);
  const releases = await gh(target, 'GET', '/releases?per_page=100');
  const sameTag = releases.filter((r) => r.tag_name === TAG);
  if (sameTag.some((r) => !r.draft)) fail(`релиз ${TAG} в ${nameOf(target)} уже опубликован — поднимите версию в package.json`);
  // created_at у релизов ненадёжен (совпадает у разных версий) — берём по публикации
  const previous = releases
    .filter((r) => !r.draft && r.tag_name !== TAG && r.published_at)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  if (previous && previous.body && previous.body.includes(notes)) {
    fail(`build/release-notes.md совпадает с текстом прошлого релиза ${previous.tag_name} — обновите его`);
  }
  return sameTag;
}

async function publish(target, files, body, staleDrafts) {
  for (const r of staleDrafts) {
    console.log(`  ${nameOf(target)}: удаляю старый черновик ${TAG} (id ${r.id})`);
    await gh(target, 'DELETE', `/releases/${r.id}`, { okStatuses: [204] });
  }
  console.log(`> создаю черновик ${TAG} в ${nameOf(target)}`);
  const release = await gh(target, 'POST', '/releases', {
    body: JSON.stringify({ tag_name: TAG, name: pkg.releaseName || VERSION, body, draft: true, prerelease: false }),
    headers: { 'Content-Type': 'application/json' },
    okStatuses: [201],
    attempts: 1, // повтор создания мог бы сделать второй черновик
  });

  for (const f of files) await uploadAsset(target, release, f);

  const assets = await gh(target, 'GET', `/releases/${release.id}/assets?per_page=100`);
  for (const f of files) {
    const a = assets.find((x) => x.name === path.basename(f));
    if (!a || a.state !== 'uploaded' || a.size !== fs.statSync(f).size) {
      fail(`файл ${path.basename(f)} не загрузился целиком — черновик ${TAG} в ${nameOf(target)} оставлен неопубликованным`);
    }
  }
  await gh(target, 'PATCH', `/releases/${release.id}`, {
    body: JSON.stringify({ draft: false, make_latest: 'true' }),
    headers: { 'Content-Type': 'application/json' },
  });
  console.log(`  опубликован: https://github.com/${target.owner}/${target.repo}/releases/tag/${TAG}`);
}

(async () => {
  const dry = process.env.RELEASE_DRY === '1';
  if (!TOKEN && !dry) fail('не задан GH_TOKEN');
  const only = process.env.RELEASE_ONLY;
  if (only && !FLAVORS[only]) fail(`RELEASE_ONLY может быть public или staff, а не ${only}`);
  const flavors = only ? [only] : ['public', 'staff'];

  const notes = fs.existsSync(NOTES_FILE) ? fs.readFileSync(NOTES_FILE, 'utf8').trim() : '';
  if (!notes) fail(`пустой ${path.relative(ROOT, NOTES_FILE)} — его увидят пользователи в «Что нового»`);
  const body = `## Что нового в ${VERSION}\n\n${notes}\n`;

  // куда и какие версии выкладываем
  const plan = new Map(); // "owner/repo" → { target, flavors[] }
  for (const fl of flavors) {
    for (const t of FLAVORS[fl].targets) {
      const key = nameOf(t).toLowerCase();
      if (!plan.has(key)) plan.set(key, { target: t, flavors: [] });
      plan.get(key).flavors.push(fl);
    }
  }
  if (!dry) for (const p of plan.values()) p.staleDrafts = await preflight(p.target, notes);

  if (process.env.RELEASE_SKIP_BUILD !== '1') {
    run('node', ['scripts/check-api-url.cjs']);
    for (const fl of flavors) build(fl);
  }

  if (dry) {
    for (const fl of flavors) console.log(`  ${fl}: ${artifacts(fl).map((f) => path.relative(ROOT, f)).join(', ')}`);
    console.log('\nПробная сборка готова, ничего не опубликовано.');
    return;
  }
  for (const p of plan.values()) {
    // staff.yml и latest.yml в одном релизе: публичные лаунчеры читают latest.yml, персонал — staff.yml
    const files = p.flavors.flatMap(artifacts);
    const ymls = files.filter((f) => f.endsWith('.yml'));
    await publish(p.target, [...files.filter((f) => !f.endsWith('.yml')), ...ymls], body, p.staleDrafts);
  }
  console.log(`\nГотово: ${TAG} опубликован.`);
})().catch((e) => fail(e.message));
