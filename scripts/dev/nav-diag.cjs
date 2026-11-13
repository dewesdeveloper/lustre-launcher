// Диагностика программных переходов (кнопки navigate) — scripts/nav-diag.cjs
// Запуск: vite dev на 5173, затем: npx electron scripts/nav-diag.cjs
const { app, BrowserWindow } = require('electron');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL: ' + msg); app.exit(1); };

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: true, width: 1200, height: 800, webPreferences: { backgroundThrottling: false } });
  win.webContents.setBackgroundThrottling(false);
  try {
    await win.loadURL('http://localhost:5173/');
  } catch (e) { return fail('load: ' + e.message); }

  const js = (code) => win.webContents.executeJavaScript(code, true);

  for (let i = 0; i < 75; i++) {
    if (await js('!!window.__lustreNavigate && !!document.getElementById("pageTrans")').catch(() => false)) break;
    await sleep(200);
  }
  if (!(await js('!!window.__lustreNavigate'))) return fail('нет __lustreNavigate (dev-хук)');

  await sleep(2000); // даём приложению «устояться» (без стартовых редиректов)

  await js(`
    (() => {
      window.__t0 = performance.now();
      window.__log = [];
      const rec = (ev) => window.__log.push({ ev, t: Math.round(performance.now() - window.__t0), hash: location.hash, cls: document.getElementById('pageTrans').className });
      const obs = new MutationObserver(() => rec('class'));
      obs.observe(document.getElementById('pageTrans'), { attributes: true, attributeFilter: ['class'] });
      let last = location.hash;
      setInterval(() => { if (location.hash !== last) { last = location.hash; rec('hash'); } }, 16);
      window.__restart = () => { window.__t0 = performance.now(); window.__log = []; };
      return true;
    })()
  `);

  const dump = async (label) => {
    const raw = await js('JSON.stringify(window.__log)');
    const log = JSON.parse(raw);
    console.log('--- ' + label + ' ---');
    for (const e of log) console.log('  ' + e.t + 'ms ' + e.ev + ' hash=' + e.hash + ' cls="' + e.cls + '"');
  };
  const routePath = () => js('window.__lustrePath');

  // A. Одиночная программная навигация (как клик по вкладке)
  await js('window.__restart(); window.__lustreNavigate("/about"); true');
  await sleep(2500);
  await dump('A: один navigate(/about)');
  console.log('A hash:', await js('location.hash'), ' router path:', await routePath());

  // B. Пользователь жмёт ещё раз через 300мс (как при «не сработало»)
  await js('window.__restart(); window.__lustreNavigate("/privacy"); true');
  await sleep(300);
  await js('window.__lustreNavigate("/legal"); true');
  await sleep(3000);
  await dump('B: navigate(/privacy), через 300мс navigate(/legal)');
  console.log('B hash:', await js('location.hash'), ' router path:', await routePath());

  // C. Три быстрых подряд (100мс)
  await js('window.__restart(); window.__lustreNavigate("/about"); true');
  await sleep(100);
  await js('window.__lustreNavigate("/privacy"); true');
  await sleep(100);
  await js('window.__lustreNavigate("/subscriber-agreement"); true');
  await sleep(3500);
  await dump('C: три подряд');
  console.log('C hash:', await js('location.hash'), ' router path:', await routePath());

  // D. Программная навигация во время раскрытия предыдущей (как «докликал»)
  await js('window.__restart(); window.__lustreNavigate("/about"); true');
  await sleep(700); // крышка уже раскрывается
  await js('window.__lustreNavigate("/privacy"); true');
  await sleep(2500);
  await dump('D: navigate, через 700мс ещё navigate');
  console.log('D hash:', await js('location.hash'), ' router path:', await routePath());

  console.log('DONE');
  app.exit(0);
}).catch((e) => fail(String((e && e.stack) || e)));
