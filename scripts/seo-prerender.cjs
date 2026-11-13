#!/usr/bin/env node
/**
 * SEO веб-версии: после сборки создаёт для публичных страниц и страниц игр отдельные
 * HTML-файлы (dist-web/store/index.html, dist-web/games/12/index.html…) со своими title,
 * description, canonical, Open Graph, JSON-LD и текстом, а также sitemap.xml.
 * Поисковикам и соцсетям контент виден без выполнения JavaScript; nginx отдаёт эти файлы
 * через try_files ($uri/), а React после загрузки заменяет текст приложением.
 *
 * Игры 18+ (is_adult) не публикуются: их нет ни в sitemap, ни в статических файлах.
 * Каталог не получен — страницы и sitemap создаются без игр (сборка не падает).
 *
 *   node scripts/seo-prerender.cjs [папка сборки, по умолчанию dist-web]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'dist-web');
const { site, siteName, routes } = require(path.join(ROOT, 'src', 'seo', 'routes.json'));

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// В JSON-LD внутри <script> нельзя допустить закрывающий тег из данных игры
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&#x27;': "'" };
function plain(html, max) {
  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[#a-z0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function replaceTag(html, pattern, value) {
  if (!pattern.test(html)) throw new Error(`в index.html нет ожидаемого тега: ${pattern}`);
  return html.replace(pattern, () => value);
}

function renderPage(template, { title, description, pagePath, image, heading, bodyHtml, extraHead = '' }) {
  const url = site + pagePath;
  let html = template;
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = replaceTag(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}" />`);
  html = replaceTag(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(url)}" />`);
  html = replaceTag(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`);
  html = replaceTag(html, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(description)}" />`);
  html = replaceTag(html, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}" />`);
  html = replaceTag(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(title)}" />`);
  html = replaceTag(html, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(description)}" />`);
  if (image) {
    html = replaceTag(html, /<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(image)}" />`);
    html = replaceTag(html, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(image)}" />`);
  }
  const shell =
    `<main style="max-width:860px;margin:0 auto;padding:48px 24px;font-family:system-ui,sans-serif;line-height:1.6;color:#f7e9f3">` +
    `<h1 style="font-size:28px;margin:0 0 16px">${esc(heading)}</h1>${bodyHtml}` +
    `<p><a href="/store" style="color:#ff2d8f">Каталог игр</a> · <a href="/about" style="color:#ff2d8f">О Lustre</a></p></main>`;
  html = replaceTag(html, /<div id="root"><\/div>/, `<div id="root">${shell}</div>`);
  if (extraHead) html = html.replace('</head>', () => `${extraHead}</head>`);
  return html;
}

function writePage(pagePath, html) {
  const dir = path.join(OUT, ...pagePath.split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

function apiUrl() {
  const env = fs.readFileSync(path.join(ROOT, '.env.production'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.trim().startsWith('VITE_API_URL'));
  return line ? line.split('=')[1].trim() : '';
}

// curl, а не fetch: как и в release.cjs — fetch через прокси рвёт большие ответы
function loadGames() {
  try {
    const out = execFileSync('curl', ['-sS', '--fail', '--retry', '3', '--max-time', '120', `${apiUrl()}/games/?limit=500`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const data = JSON.parse(out);
    const list = Array.isArray(data) ? data : data.games || data.items || [];
    if (!list.length) throw new Error('пустой каталог');
    return list;
  } catch (e) {
    console.warn(`  каталог игр не получен (${e.message}) — страницы игр не созданы`);
    return [];
  }
}

function main() {
  const indexFile = path.join(OUT, 'index.html');
  if (!fs.existsSync(indexFile)) throw new Error(`${indexFile} не найден — сначала выполните сборку`);
  const template = fs.readFileSync(indexFile, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];

  for (const r of routes) {
    writePage(r.path, renderPage(template, {
      title: r.title,
      description: r.description,
      pagePath: r.path,
      heading: r.heading,
      bodyHtml: `<p>${esc(r.body)}</p>`,
    }));
    urls.push({ loc: site + r.path, changefreq: r.changefreq, priority: r.priority, lastmod: today });
  }

  const games = loadGames();
  const published = games.filter((g) => g && !g.is_adult && (g.ID || g.id) && g.title);
  for (const g of published) {
    const id = g.ID || g.id;
    const pagePath = `/games/${id}`;
    const text = plain(g.description || g.about_game, 1200);
    const description = plain(g.description || g.about_game, 160) || `${g.title} в каталоге игр Lustre.`;
    const image = g.header_image || g.banner_url || '';
    const title = `${g.title} — игра в каталоге ${siteName}`;
    writePage(pagePath, renderPage(template, {
      title,
      description,
      pagePath,
      image,
      heading: g.title,
      bodyHtml:
        (image ? `<img src="${esc(image)}" alt="${esc(g.title)}" style="max-width:100%;height:auto" />` : '') +
        (g.developer ? `<p>Разработчик: ${esc(g.developer)}</p>` : '') +
        (text ? `<p>${esc(text)}</p>` : ''),
      extraHead: jsonLd({
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: g.title,
        url: site + pagePath,
        description,
        ...(image ? { image } : {}),
        ...(g.developer ? { author: { '@type': 'Organization', name: g.developer } } : {}),
        ...(g.publisher ? { publisher: { '@type': 'Organization', name: g.publisher } } : {}),
        gamePlatform: 'PC',
      }),
    }));
    urls.push({ loc: site + pagePath, changefreq: 'weekly', priority: '0.8', lastmod: String(g.UpdatedAt || g.updated_at || today).slice(0, 10) });
  }

  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join('\n') +
    '\n</urlset>\n';
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemap, 'utf8');

  console.log(`SEO: ${routes.length} страниц, ${published.length} игр (из ${games.length}, без 18+), sitemap: ${urls.length} адресов`);
}

try {
  main();
} catch (e) {
  console.error(`SEO: ${e.message}`);
  process.exit(1);
}
