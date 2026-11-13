// Общее для мини-игр автономного режима: рекорды и подготовка холста.

export type ArcadeGame = 'snake' | 'fruit';

const BEST_KEY: Record<ArcadeGame, string> = { snake: 'lh_arcade_best_snake', fruit: 'lh_arcade_best_fruit' };

export function getBest(game: ArcadeGame): number {
  try { return Number(localStorage.getItem(BEST_KEY[game])) || 0; } catch { return 0; }
}

/** Сохраняет рекорд, если он побит; возвращает актуальный рекорд. */
export function saveBest(game: ArcadeGame, score: number): number {
  const best = getBest(game);
  if (score <= best) return best;
  try { localStorage.setItem(BEST_KEY[game], String(score)); } catch { /* приватный режим */ }
  return score;
}

/**
 * Чёткий холст при любом размере на экране: игра рисует в своих координатах width×height,
 * а внутреннее разрешение подгоняется под реальный размер холста (в том числе на весь экран).
 */
export function setupCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const shown = canvas.clientWidth || width;
  const scale = (shown / width) * dpr;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false; // пиксельная графика без размытия
  return ctx;
}

/** Пересчитывает разрешение холста при изменении его размера (окно, полный экран) */
export function watchCanvasSize(canvas: HTMLCanvasElement, width: number, height: number, onCtx: (ctx: CanvasRenderingContext2D) => void) {
  let shown = -1;
  const update = () => {
    if (canvas.clientWidth === shown) return;
    shown = canvas.clientWidth;
    onCtx(setupCanvas(canvas, width, height));
  };
  update();
  const ro = new ResizeObserver(update);
  ro.observe(canvas);
  // ResizeObserver срабатывает вместе с кадрами; при входе в полный экран дублируем событиями
  const later = () => requestAnimationFrame(update);
  window.addEventListener('resize', update);
  document.addEventListener('fullscreenchange', later);
  return () => {
    ro.disconnect();
    window.removeEventListener('resize', update);
    document.removeEventListener('fullscreenchange', later);
  };
}

/** Логический размер поля обеих игр */
export const FIELD_W = 528;
export const FIELD_H = 352;

/** Цвета темы лаунчера для рисования на холсте */
export function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    accent: pick('--color-accent', '#ff2d8f'),
    green: '#34d399',
    grid: 'rgba(255,255,255,0.04)',
    text: '#f2eaf7',
    muted: 'rgba(242,234,247,0.55)',
    bg: '#08050f',
  };
}

export type GameStatus = 'ready' | 'playing' | 'over';
