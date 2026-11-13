// «Перелёт» обложки из карточки каталога на страницу игры (shared element).
//
// 1) startCoverFlight(img) — по клику: копия обложки поднимается в фиксированный
//    слой поверх всего и сразу летит к верху области контента (туда, где будет
//    баннер). Основная «чернильная» анимация перехода для этой навигации
//    пропускается (skipNextPageTransition) — иначе она накрыла бы перелёт.
// 2) landCoverFlight(target) — страница игры, когда баннер отрисован: копия
//    доводится точно до баннера и растворяется, открывая настоящий баннер.
// Если страница не «приземлила» перелёт (ошибка, долгая загрузка) — копия
// растворяется сама.

import { motionReduced } from './uiFx';
import { skipNextPageTransition } from './pageTransitionChoice';

const FLY_MS = 520;
const LAND_MS = 260;
const FADE_MS = 280;
const GIVE_UP_MS = 3000;
const EASE = 'cubic-bezier(.22, 1, .36, 1)';

interface Flight {
  el: HTMLImageElement;
  source: HTMLElement;
  anim: Animation | null;
  giveUp: number;
  landed: boolean;
  done: boolean;
}

let flight: Flight | null = null;

type Box = { left: number; top: number; width: number; height: number };

const boxOf = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const frame = (b: Box) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });

function currentBox(el: HTMLElement): Box {
  return boxOf(el.getBoundingClientRect());
}

// Завершение — по таймерам, а не по onfinish анимации: если окно скрыто или
// свёрнуто, анимации не доигрываются, и копия обложки зависла бы поверх экрана
function finish(f: Flight, fade = true) {
  if (f.done) return;
  f.done = true;
  window.clearTimeout(f.giveUp);
  if (flight === f) flight = null;
  f.source.style.visibility = '';
  if (!fade) { f.el.remove(); return; }
  f.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' });
  window.setTimeout(() => f.el.remove(), FADE_MS + 40);
}

/** Предполагаемое место баннера: верх области контента (main) на всю её ширину */
function predictedTarget(): Box {
  const main = document.querySelector('main');
  const r = main?.getBoundingClientRect();
  if (!r) return { left: 0, top: 0, width: window.innerWidth, height: Math.min(400, window.innerHeight * 0.5) };
  return { left: r.left, top: r.top, width: r.width, height: Math.min(400, r.height * 0.6) };
}

/**
 * Запускает перелёт от картинки карточки. Возвращает false, если перелёт
 * не нужен (анимации выключены, картинка не загружена) — тогда навигация
 * идёт обычным путём, с основной анимацией перехода.
 */
export function startCoverFlight(img: HTMLImageElement | null | undefined): boolean {
  if (!img || !img.complete || !img.naturalWidth || motionReduced()) return false;
  if (flight) finish(flight, false);

  const from = boxOf(img.getBoundingClientRect());
  if (from.width < 4 || from.height < 4) return false;

  const el = document.createElement('img');
  el.src = img.currentSrc || img.src;
  el.alt = '';
  el.className = 'fx-cover-flight';
  Object.assign(el.style, frame(from));
  document.body.appendChild(el);

  // оригинал прячем — в карточке не должна остаться «дырка-дубликат»
  img.style.visibility = 'hidden';
  const f: Flight = { el, source: img, anim: null, giveUp: 0, landed: false, done: false };
  flight = f;

  f.anim = el.animate([frame(from), frame(predictedTarget())], { duration: FLY_MS, easing: EASE, fill: 'forwards' });
  f.giveUp = window.setTimeout(() => finish(f), GIVE_UP_MS);

  skipNextPageTransition();
  return true;
}

/** Страница игры отрисовала баннер: доводим копию до него и растворяем */
export function landCoverFlight(target: HTMLElement | null) {
  const f = flight;
  if (!f || f.landed || !target) return;
  f.landed = true;
  const to = boxOf(target.getBoundingClientRect());
  // продолжаем с того места, где копия сейчас (перелёт мог не закончиться)
  const from = currentBox(f.el);
  f.anim?.cancel();
  Object.assign(f.el.style, frame(from));
  f.anim = f.el.animate([frame(from), frame(to)], { duration: LAND_MS, easing: EASE, fill: 'forwards' });
  window.setTimeout(() => finish(f), LAND_MS + 20);
}

/** Есть ли незавершённый перелёт (странице стоит придержать появление баннера) */
export function hasCoverFlight(): boolean {
  return !!flight && !flight.landed;
}
