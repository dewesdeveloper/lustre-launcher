const { rolldown } = require('rolldown');
const fs = require('fs');
const path = require('path');

(async () => {
  const root = path.join(__dirname, '..', '..');
  const out = path.join(__dirname, 'contrast-test.bundle.js');

  const bundle = await rolldown({
    input: path.join(__dirname, 'contrast-test.tsx'),
    platform: 'browser',
  });
  await bundle.write({ file: out, format: 'iife' });
  await bundle.close();

  const dist = path.join(root, 'dist', 'assets');
  const cssFiles = fs.readdirSync(dist).filter((f) => f.endsWith('.css')).sort((a, b) =>
    fs.statSync(path.join(dist, b)).mtimeMs - fs.statSync(path.join(dist, a)).mtimeMs);
  const css = cssFiles[0];
  if (!css) { console.log('нет dist css — сначала vite build'); process.exit(1); }

  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>contrast test</title>
<link rel="stylesheet" href="../../dist/assets/${css}" />
<style>html,body{margin:0;font-family:sans-serif}
/* в headless анимации замораживаются — для скриншота убираем переход, чтобы наклон применился сразу */
.tilt-inner{transition:none !important}</style>
</head><body>
<div id="root"></div>
<div id="err"></div>
<script>
window.onerror = function (m, s, l) {
  document.getElementById('err').textContent = 'ERR: ' + m + ' @' + s + ':' + l;
};
</script>
<script type="module" src="./contrast-test.bundle.js"></script>
</body></html>`;

  const htmlPath = path.join(__dirname, 'contrast-test.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('собрано:', path.basename(out), fs.statSync(out).size, 'байт');
})();
