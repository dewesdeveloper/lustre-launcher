// Выбор анимации перехода между страницами (PageTransition).
// Значение живёт в localStorage и общего для всех окон приложения;
// об изменениях компоненты слушают событие 'storage' (другие окна)
// и кастомное TRANSITION_CHANGED_EVENT (то же окно — например, Настройки).
export const TRANSITION_CHOICE_KEY = 'lustre_pt_choice';

export const TRANSITION_CHANGED_EVENT = 'lustre:transition-choice';

/** [id, подпись] — «Отключить» идёт первым пунктом */
// id a1…a4 сохранены от прежних «чернильных» анимаций — выбор пользователя
// в localStorage переносится на новые минималистичные варианты по порядку
export const TRANSITION_OPTIONS: [string, string][] = [
  ['none', 'Отключить'],
  ['random', 'Рандом'],
  ['a1', 'Плавно'],
  ['a2', 'Сдвиг'],
  ['a3', 'Масштаб'],
  ['a4', 'Луч'],
];

export function getTransitionChoice(): string {
  try {
    const v = localStorage.getItem(TRANSITION_CHOICE_KEY);
    return TRANSITION_OPTIONS.some(([id]) => id === v) ? String(v) : 'random';
  } catch {
    return 'random';
  }
}

export function setTransitionChoice(value: string) {
  try { localStorage.setItem(TRANSITION_CHOICE_KEY, value); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(TRANSITION_CHANGED_EVENT)); } catch { /* ignore */ }
}

// Разовый пропуск основной анимации перехода: следующая навигация (в течение
// секунды) пройдёт без «чернильной» крышки. Нужен для перелёта обложки
// (utils/coverFlight.ts): крышка накрыла бы летящую обложку.
let skipUntil = 0;

export function skipNextPageTransition() {
  skipUntil = Date.now() + 1000;
}

/** true — эту навигацию анимировать не нужно (флаг сбрасывается) */
export function consumeSkipPageTransition(): boolean {
  if (Date.now() > skipUntil) return false;
  skipUntil = 0;
  return true;
}
