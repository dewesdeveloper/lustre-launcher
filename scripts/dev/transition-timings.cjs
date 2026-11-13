// Замер длительности фаз переходов (scripts/transition-timings.cjs)
// Запуск: vite dev на 5173, затем: npx electron scripts/transition-timings.cjs
const { app, BrowserWindow } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL: ' + msg); app.exit(1); };

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1280, height: 800, webPreferences: { backgroundThrottling: false } });
  win.webContents.setBackgroundThrottling(false);
  try {
    await win.loadURL('http://localhost:5173/');
  } catch (e) { return fail('load: ' + e.message); }

  const js = (code) => win.webContents.executeJavaScript(code, true);

  for (let i = 0; i < 75; i++) {
    if (await js('!!document.getElementById("pageTrans")').catch(() => false)) break;
    await sleep(200);
  }

  // Инструментация: время смены классов оверлея и времени хэша
  await js(`
    (() => {
      window.__t0 = performance.now();
      window.__log = [];
      const rec = (ev) => window.__log.push({ ev, t: Math.round(performance.now() - window.__t0), hash: location.hash, cls: document.getElementById('pageTrans')?.className });
      const obs = new MutationObserver(() => rec('class'));
      obs.observe(document.getElementById('pageTrans'), { attributes: true, attributeFilter: ['class'] });
      let last = location.hash;
      setInterval(() => { if (location.hash !== last) { last = location.hash; rec('hash'); } }, 16);
      window.__restart = () => { window.__t0 = performance.now(); window.__log = []; };
      return true;
    })()
  `);

  const dump = async (label) => {
    const log = await js('JSON.stringify(window.__log)');
    console.log('--- ' + label + ' ---');
    const events = JSON.parse(log);
    // Сводка: начало крышки, смена маршрута, раскрытие, сброс
    const t = events.map((e) => `${e.t}ms ${e.ev} hash=${e.hash} cls="${e.cls}"`);
    console.log(t.join('\n'));
    const coverOn = events.find((e) => e.cls && /\bcover\b/.test(e.cls) && !/\bnoanim\b/.test(e.cls));
    const coverOff = events.find((e) => e.cls && !/\bcover\b/.test(e.cls) && /\ba[1-4]\b/.test(e.cls));
    const reset = events.find((e) => e.cls && e.cls.trim() === 'pageTrans');
    if (coverOn && coverOff) console.log(`>>> полное покрытие (крышка закрыта): ~${coverOff.t - coverOn.t}ms от старта`);
    if (coverOn && reset) console.log(`>>> всего «в цвете» от старта до сброса: ${reset.t - coverOn.t}ms`);
  };

  // 1. Ссылка
  await js(`
    (() => { const a = document.createElement('a'); a.href = '#/privacy'; a.textContent = 't'; document.body.appendChild(a); a.click(); a.remove(); return true; })()
  `);
  await sleep(3000);
  await dump('link → #/privacy');

  // 2. Программный переход (raw pushState → instant flow)
  await js('window.__restart(); true');
  await js('window.history.pushState({}, "", "#/about"); true');
  await sleep(3000);
  await dump('pushState → #/about');

  console.log('DONE');
  app.exit(0);
}).catch((e) => fail(String((e && e.stack) || e)));
