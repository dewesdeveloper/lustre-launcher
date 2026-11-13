// Smoke-тест переходов между страницами (scripts/transition-test.cjs)
// Запуск: сначала vite dev на 5173, затем: npx electron scripts/transition-test.cjs
const { app, BrowserWindow } = require('electron');

const fail = (msg) => { console.error('FAIL: ' + msg); app.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.setBackgroundThrottling(false);

  try {
    await win.loadURL('http://localhost:5173/');
  } catch (e) { return fail('не удалось загрузить страницу: ' + (e && e.message)); }

  const js = (code) => win.webContents.executeJavaScript(code, true).catch((e) => { throw e; });

  // Ждём, пока React смонтирует оверлей #pageTrans
  let mounted = false;
  for (let i = 0; i < 75 && !mounted; i++) {
    mounted = await js('!!document.getElementById("pageTrans")').catch(() => false);
    if (!mounted) await sleep(200);
  }
  if (!mounted) return fail('оверлей #pageTrans не смонтирован за 15с');

  const picker = await js('!!document.querySelector(".pt-pick")');
  if (!picker) return fail('панель выбора анимации .pt-pick не отрисована');

  // 1. Клик по внутренней ссылке → крышка должна накрыть экран
  await js(`
    (() => {
      const a = document.createElement('a');
      a.href = '#/privacy';
      a.textContent = 'transition-test';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    })()
  `);
  await sleep(60);
  const mid = await js('document.getElementById("pageTrans").className');
  if (!/\ba[1-4]\b/.test(mid) || !/\bcover\b/.test(mid)) {
    return fail('крышка не покрыла экран (cls="' + mid + '")');
  }

  // 1b. Яркость краски приглушена: ~60% от акцента темы (−15% и ещё −30%)
  const ink = await js(`
    (() => {
      const hex = (h) => {
        h = h.trim().replace('#', '');
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      };
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent') || '#ff2d8f';
      const shape = document.querySelector('#pageTrans .shape');
      const bg = getComputedStyle(shape).backgroundColor;
      let got = null;
      if (bg.indexOf('rgb') === 0) {
        const m = bg.match(/[0-9]+/g);
        got = m ? m.slice(0, 3).map(Number) : null;
      } else if (bg.indexOf('color(srgb') === 0) {
        const m = bg.match(/[0-9.]+/g);
        got = m ? m.slice(0, 3).map((v) => Math.round(Number(v) * 255)) : null;
      }
      return { expected: hex(accent).map((v) => Math.round(v * 0.6)), got, raw: bg, accent: accent.trim() };
    })()
  `);
  if (!ink.got) return fail('не удалось вычислить цвет краски: ' + JSON.stringify(ink));
  const ok = ink.got.every((v, i) => Math.abs(v - ink.expected[i]) <= 2);
  if (!ok) {
    return fail('яркость краски не ~60% от акцента: ожидалось rgb(' + ink.expected + '), получено rgb(' + ink.got + ')');
  }

  // 2. После DUR (560мс) должна состояться навигация
  let hash = '';
  for (let i = 0; i < 20; i++) {
    hash = await js('location.hash');
    if (hash === '#/privacy') break;
    await sleep(200);
  }
  if (hash !== '#/privacy') return fail('навигация не состоялась, hash=' + hash);
  const path1 = await js('window.__lustrePath');
  if (path1 !== '/privacy') return fail('роутер не перешёл (path=' + path1 + ')');

  // 3. Раскрытие и сброс оверлея (опрашиваем до 6с)
  let end = '';
  for (let i = 0; i < 30; i++) {
    end = (await js('document.getElementById("pageTrans").className')).trim();
    if (end === 'pageTrans') break;
    await sleep(200);
  }
  if (end !== 'pageTrans') return fail('оверлей не сбросился: "' + end + '"');

  // 3b. Клик по навигации во время анимации не теряется и перебивает предыдущий переход
  await js(`
    (() => {
      const click = (href) => {
        const a = document.createElement('a');
        a.href = href; a.textContent = 't';
        document.body.appendChild(a); a.click(); a.remove();
      };
      window.__click1 = () => { click('#/privacy'); return true; };
      window.__click2 = () => { click('#/about'); return true; };
      return true;
    })()
  `);
  await js('window.__click1(); true');   // первый клик — крышка пошла
  await sleep(250);                       // второй клик во время анимации
  await js('window.__click2(); true');
  await sleep(900);                       // даём первому переходу «догнать» свой DUR (560мс)
  const hashB = await js('location.hash');
  if (hashB !== '#/about') return fail('клик во время анимации не сработал (или старый переход перебил): hash=' + hashB);
  let end3 = '';
  for (let i = 0; i < 40; i++) {
    end3 = (await js('document.getElementById("pageTrans").className')).trim();
    if (end3 === 'pageTrans') break;
    await sleep(200);
  }
  if (end3 !== 'pageTrans') return fail('оверлей не сбросился после двойного клика: "' + end3 + '"');

  // 4. Программный переход: плавное покрытие (cover без noanim), навигация — под ним
  const anim = await js(`
    (() => {
      window.history.pushState({}, '', '#/legal');
      return document.getElementById('pageTrans').className;
    })()
  `);
  if (!/\ba[1-4]\b/.test(anim) || !/\bcover\b/.test(anim) || /\bnoanim\b/.test(anim)) {
    return fail('программный переход должен быть плавным покрытием (без noanim): "' + anim + '"');
  }

  // навигация применяется отложенно — после полного покрытия
  let hash2 = '';
  for (let i = 0; i < 40; i++) {
    hash2 = await js('location.hash');
    if (hash2 === '#/legal') break;
    await sleep(100);
  }
  if (hash2 !== '#/legal') return fail('отложенная навигация не применилась, hash=' + hash2);
  const path2 = await js('window.__lustrePath');
  if (path2 !== '/legal') return fail('роутер не перешёл после программного перехода (path=' + path2 + ')');

  // раскрытие и сброс оверлея
  let end2 = '';
  for (let i = 0; i < 40; i++) {
    end2 = (await js('document.getElementById("pageTrans").className')).trim();
    if (end2 === 'pageTrans') break;
    await sleep(200);
  }
  if (end2 !== 'pageTrans') return fail('оверлей не сбросился после программного перехода: "' + end2 + '"');

  console.log('OK: ссылки — cover → navigate → reveal → reset; программный переход — плавное покрытие → отложенная навигация → reveal');
  app.exit(0);
}).catch((e) => fail(String((e && e.stack) || e)));
