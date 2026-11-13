const { rolldown } = require('rolldown');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..', '..');
  const out = path.join(__dirname, 'title-preview.bundle.js');

  const bundle = await rolldown({
    input: path.join(__dirname, 'title-preview-test.tsx'),
    platform: 'browser',
    jsx: 'react-jsx',
  });
  await bundle.write({ file: out, format: 'iife' });
  await bundle.close();

  // берём последнюю собранную css-ку витрины — в ней уже есть все Tailwind-утилиты
  const dist = path.join(root, 'dist', 'assets');
  const cssFiles = fs.readdirSync(dist).filter((f) => f.endsWith('.css')).sort((a, b) => {
    return fs.statSync(path.join(dist, b)).mtimeMs - fs.statSync(path.join(dist, a)).mtimeMs;
  });
  const css = cssFiles[0];
  if (!css) { console.log('dist/assets/*.css не найден — сначала vite build'); process.exit(1); }

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Превью титулов</title>
<link rel="stylesheet" href="${path.join(dist, css).replace(/\\/g, '/')}" />
<style>html,body{margin:0;background:#050407;font-family:Inter,sans-serif}</style>
</head>
<body>
<div id="root"></div>
<script src="${path.join(__dirname, 'title-preview.bundle.js').replace(/\\/g, '/')}"></script>
</body>
</html>`;

  const htmlPath = path.join(__dirname, 'title-preview-test.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('собрано:', out, fs.statSync(out).size, 'байт');
  console.log('html:', htmlPath, '| css:', css);
})();
