import { useEffect } from 'react';
import { applyFxLevel, FX_CHANGED_EVENT, FX_LEVEL_KEY, getFxLevel, playUi } from '../utils/uiFx';

/**
 * Глобальные интерактивные эффекты лаунчера (стили — src/fx.css):
 *  - прожектор: под курсором карточка/панель получает --mx/--my;
 *  - искры: короткая пиксельная вспышка в точке клика по кнопкам и вкладкам;
 *  - появление секций (.tl-sec, [data-reveal]) при прокрутке.
 * Всё в одном компоненте и без ререндеров React: слушатели пишут прямо в DOM.
 */

// без .tl-panel: большие панели перерисовывались бы целиком на каждое движение мыши
const SPOT_SELECTOR = '.tl-gcard, .tl-preset, .tl-tog, .tl-vrow, .tl-stat';
const SPARK_SELECTOR = '.tl-btn, .tl-tab, .tl-preset, .tl-tagpick, button';
const REVEAL_SELECTOR = '.tl-sec, [data-reveal]';

const SOUND_HOVER_SELECTOR = '.tl-btn, .tl-tab, .tl-gcard, .tl-preset, .hero-thumb, nav a, nav button';
const SOUND_CLICK_SELECTOR = 'button, a, [role="link"], [role="button"], .tl-tab, .tl-gcard, label';

const motionOff = () =>
  document.documentElement.classList.contains('simple-mode') ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  getFxLevel() === 'min';

export default function MotionFX() {
  // ---- уровень эффектов: атрибут на <html>, синхронно между окнами ----
  useEffect(() => {
    applyFxLevel();
    const onStorage = (e: StorageEvent) => { if (e.key === FX_LEVEL_KEY) applyFxLevel(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(FX_CHANGED_EVENT, applyFxLevel);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(FX_CHANGED_EVENT, applyFxLevel);
    };
  }, []);

  // ---- пауза декора, пока окно не в фокусе: игра или другое окно получают весь GPU ----
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      root.classList.toggle('fx-paused', document.visibilityState !== 'visible' || !document.hasFocus());
    };
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      document.removeEventListener('visibilitychange', sync);
      root.classList.remove('fx-paused');
    };
  }, []);

  // ---- прокрутка: на время скролла отключаем наведение (анимация фона продолжается) ----
  // Под неподвижным курсором проезжают карточки: каждая включала hover
  // (подъём, тени, превью игры, звук) — это и давало рывки при прокрутке.
  useEffect(() => {
    const root = document.documentElement;
    let timer = 0;
    let on = false;
    const onScroll = () => {
      if (!on) { on = true; root.classList.add('fx-scrolling'); }
      clearTimeout(timer);
      timer = window.setTimeout(() => { on = false; root.classList.remove('fx-scrolling'); }, 140);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      clearTimeout(timer);
      root.classList.remove('fx-scrolling');
    };
  }, []);

  // ---- звуки интерфейса: тихий тик на наведение, щелчок на нажатие ----
  useEffect(() => {
    let hovered: Element | null = null;
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element | null)?.closest?.(SOUND_HOVER_SELECTOR) || null;
      if (el === hovered) return;
      hovered = el;
      if (el && !(el as HTMLButtonElement).disabled) playUi('hover');
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      if (t.closest('input[type="checkbox"], .tl-sw2, .neo-toggle')) { playUi('toggle'); return; }
      const el = t.closest(SOUND_CLICK_SELECTOR) as HTMLButtonElement | null;
      if (el && !el.disabled) playUi('click');
    };
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('click', onClick, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  // ---- неоновый след за курсором (только уровень «Максимум») ----
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-trail';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    const c = canvas.getContext('2d');
    const pts: { x: number; y: number; t: number }[] = [];
    let raf = 0;
    let color = '#ff2d8f';

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      c?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const draw = () => {
      raf = 0;
      if (!c) return;
      const now = performance.now();
      while (pts.length && now - pts[0].t > 260) pts.shift();
      c.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (pts.length > 1) {
        // свечение — широкий полупрозрачный штрих под тонким (shadowBlur на канвасе дорогой)
        c.lineCap = 'round';
        c.strokeStyle = color;
        for (const [width, alpha] of [[7, 0.18], [2.5, 0.75]] as const) {
          for (let i = 1; i < pts.length; i++) {
            const k = i / pts.length;
            c.globalAlpha = k * alpha;
            c.lineWidth = width * (0.4 + k * 0.6);
            c.beginPath();
            c.moveTo(pts[i - 1].x, pts[i - 1].y);
            c.lineTo(pts[i].x, pts[i].y);
            c.stroke();
          }
        }
        raf = requestAnimationFrame(draw);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || getFxLevel() !== 'max' || motionOff()) return;
      if (!pts.length) color = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || color;
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (!raf) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
      canvas.remove();
    };
  }, []);

  // ---- прожектор за курсором ----
  useEffect(() => {
    let raf = 0;
    let lastEv: PointerEvent | null = null;
    let lastEl: HTMLElement | null = null;

    const apply = () => {
      raf = 0;
      const e = lastEv;
      if (!e) return;
      const el = (e.target as Element | null)?.closest?.(SPOT_SELECTOR) as HTMLElement | null;
      if (lastEl && lastEl !== el) {
        lastEl.style.removeProperty('--mx');
        lastEl.style.removeProperty('--my');
      }
      lastEl = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || getFxLevel() === 'min') return;
      lastEv = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // ---- искры по клику ----
  useEffect(() => {
    const layer = document.createElement('div');
    layer.className = 'fx-spark-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(layer);

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || motionOff()) return;
      const target = (e.target as Element | null)?.closest?.(SPARK_SELECTOR) as HTMLElement | null;
      if (!target || (target as HTMLButtonElement).disabled) return;
      // кликов много — не копим узлы
      if (layer.childElementCount > 40) layer.replaceChildren();

      const frag = document.createDocumentFragment();
      const ring = document.createElement('span');
      ring.className = 'fx-ring';
      ring.style.left = `${e.clientX}px`;
      ring.style.top = `${e.clientY}px`;
      frag.appendChild(ring);

      const n = 7;
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        s.className = i % 3 === 0 ? 'fx-spark c' : 'fx-spark';
        const a = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const d = 18 + Math.random() * 22;
        s.style.left = `${e.clientX}px`;
        s.style.top = `${e.clientY}px`;
        s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
        s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
        frag.appendChild(s);
      }
      const nodes = Array.from(frag.childNodes);
      layer.appendChild(frag);
      window.setTimeout(() => nodes.forEach((nd) => nd.parentNode === layer && layer.removeChild(nd)), 650);
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown);
      layer.remove();
    };
  }, []);

  // ---- появление секций при прокрутке ----
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const seen = new WeakSet<Element>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const el = en.target as HTMLElement;
          io.unobserve(el);
          el.dataset.fx = 'in';
          // после анимации снимаем атрибут: на элементе не остаётся анимации/transform
          el.addEventListener('animationend', () => { delete el.dataset.fx; }, { once: true });
          window.setTimeout(() => { if (el.dataset.fx === 'in') delete el.dataset.fx; }, 1200);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );

    const scan = (root: ParentNode) => {
      if (motionOff()) return;
      root.querySelectorAll?.(REVEAL_SELECTOR).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        // уже на экране при монтировании — не прячем, показываем сразу без мигания
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.92 && r.bottom > 0) return;
        (el as HTMLElement).dataset.fx = 'wait';
        io.observe(el);
      });
    };

    scan(document);
    // Чат, присутствие и списки меняют DOM постоянно: проверяем только
    // добавленные узлы, где реально есть секции, а не весь документ
    let pending = 0;
    let roots: Element[] = [];
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          if (el.matches(REVEAL_SELECTOR) || el.querySelector(REVEAL_SELECTOR)) roots.push(el);
        });
      }
      if (!roots.length || pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        const batch = roots;
        roots = [];
        batch.forEach((el) => { if (el.isConnected) scan(el.parentElement || el); });
      }, 80);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      if (pending) clearTimeout(pending);
    };
  }, []);

  return null;
}
