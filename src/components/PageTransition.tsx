import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import {
  getTransitionChoice,
  TRANSITION_CHANGED_EVENT,
  consumeSkipPageTransition,
} from '../utils/pageTransitionChoice';

/**
 * Минималистичные переходы между страницами — в духе перелёта обложки на
 * страницу игры: навигация происходит СРАЗУ (без «крышки» на весь экран и без
 * откладывания перехода), а новая страница коротко проявляется в области
 * контента. Навбар, сайдбар и нижняя панель остаются неподвижными.
 *
 *  a1 «Плавно»  — растворение;
 *  a2 «Сдвиг»   — въезд сбоку (назад — с другой стороны);
 *  a3 «Масштаб» — лёгкое приближение;
 *  a4 «Луч»     — неоновая линия пробегает по верху контента, страница
 *                 проявляется следом за ней.
 *
 * Анимируются только transform/opacity через Web Animations API и без
 * fill: после окончания на контенте не остаётся transform (иначе модальные
 * окна с position: fixed внутри страницы центрировались бы не по экрану).
 * Выбор (в т.ч. «Отключить») — Настройки → Интерфейс (utils/pageTransitionChoice).
 */

const ANIMS = ['a1', 'a2', 'a3', 'a4'] as const;
type Anim = (typeof ANIMS)[number];

const EASE = 'cubic-bezier(.22, 1, .36, 1)';

const pick = (): Anim => ANIMS[Math.floor(Math.random() * ANIMS.length)];
const preferred = (choice: string): Anim | null =>
  (ANIMS as readonly string[]).includes(choice) ? (choice as Anim) : null;

const skipMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  document.documentElement.classList.contains('simple-mode');

/** Область контента текущего шелла (MainLayout / публичный шелл), иначе — вся страница */
const contentEl = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-page-content]') ||
  (document.getElementById('root')?.firstElementChild as HTMLElement | null);

function playEnter(anim: Anim, back: boolean, line: HTMLElement | null) {
  const el = contentEl();
  if (!el) return;
  const dx = back ? -28 : 28;
  switch (anim) {
    case 'a1':
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
      break;
    case 'a2':
      el.animate(
        [{ opacity: 0, transform: `translate3d(${dx}px, 0, 0)` }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
        { duration: 340, easing: EASE },
      );
      break;
    case 'a3':
      el.animate(
        [{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 320, easing: EASE },
      );
      break;
    case 'a4': {
      el.animate(
        [{ opacity: 0, transform: 'translate3d(0, 10px, 0)' }, { opacity: 0, offset: 0.25 }, { opacity: 1, transform: 'translate3d(0, 0, 0)' }],
        { duration: 420, easing: EASE },
      );
      if (line) {
        // линия — по верхней кромке области контента
        const r = el.getBoundingClientRect();
        line.style.left = `${Math.max(0, r.left)}px`;
        line.style.top = `${Math.max(0, r.top)}px`;
        line.style.width = `${Math.min(window.innerWidth, r.width)}px`;
        line.animate(
          [
            { opacity: 1, transform: `scaleX(0)`, transformOrigin: back ? 'right' : 'left' },
            { opacity: 1, transform: `scaleX(1)`, transformOrigin: back ? 'right' : 'left', offset: 0.6 },
            { opacity: 0, transform: `scaleX(1)`, transformOrigin: back ? 'right' : 'left' },
          ],
          { duration: 520, easing: EASE },
        );
      }
      break;
    }
  }
}

export default function PageTransition() {
  const navigate = useNavigate();
  const location = useLocation();
  const navType = useNavigationType();
  const lineRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef(true);
  const [choice, setChoice] = useState<string>(getTransitionChoice);

  // Смена выбора в Настройках (другое окно — storage; это окно — своё событие)
  useEffect(() => {
    const sync = () => setChoice(getTransitionChoice());
    window.addEventListener('storage', sync);
    window.addEventListener(TRANSITION_CHANGED_EVENT, sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(TRANSITION_CHANGED_EVENT, sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  // Отладочный доступ к навигации роутера (только dev): scripts/nav-diag.cjs и тесты
  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      w.__lustreNavigate = (to: string) => navigate(to);
      w.__lustrePath = location.pathname;
    }
  }, [navigate, location.pathname]);

  // Новая страница закоммичена — проигрываем вход (первую загрузку не анимируем).
  // Замены адреса (replace) и смена только ?query/#hash на той же странице —
  // это фильтры и служебные редиректы, а не переход: их не анимируем.
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const samePage = prevPathRef.current === location.pathname;
    prevPathRef.current = location.pathname;
    if (firstRef.current) { firstRef.current = false; return; }
    if (navType === 'REPLACE' || samePage) return;
    // перелёт обложки (utils/coverFlight) сам анимирует этот переход
    if (consumeSkipPageTransition()) return;
    if (choice === 'none' || skipMotion()) return;
    const anim = preferred(choice) || pick();
    playEnter(anim, navType === 'POP', lineRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return <div id="pageTrans" ref={lineRef} className="pageTrans-line" aria-hidden="true" />;
}
