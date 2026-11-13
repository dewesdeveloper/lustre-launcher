const { rolldown } = require('rolldown');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..', '..');
  const out = path.join(__dirname, 'hover-test.bundle.js');

  const bundle = await rolldown({
    input: path.join(__dirname, 'hover-test.tsx'),
    platform: 'browser',
  });
  await bundle.write({ file: out, format: 'iife' });
  await bundle.close();

  const dist = path.join(root, 'dist', 'assets');
  const cssFiles = fs.readdirSync(dist).filter((f) => f.endsWith('.css')).sort((a, b) =>
    fs.statSync(path.join(dist, b)).mtimeMs - fs.statSync(path.join(dist, a)).mtimeMs);
  const css = cssFiles[0];
  if (!css) { console.log('нет dist css — сначала vite build'); process.exit(1); }

  // пути относительные, чтобы страница открывалась и по file://, и через vite dev
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>hover test</title>
<link rel="stylesheet" href="../../dist/assets/${css}" />
<style>html,body{margin:0;background:#050407;color:#e2e2e2;font-family:sans-serif}</style>
</head><body>
<div id="root"></div>
<div id="err"></div>
<script>
window.onerror = function (m, s, l) {
  document.getElementById('err').textContent = 'ERR: ' + m + ' @' + s + ':' + l;
};
window.addEventListener('unhandledrejection', function (e) {
  document.getElementById('err').textContent = 'REJ: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason);
});
</script>
<script type="module" src="./hover-test.bundle.js"></script>
</body></html>`;

  const htmlPath = path.join(__dirname, 'hover-test.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('собрано:', path.basename(out), fs.statSync(out).size, 'байт');
})();
