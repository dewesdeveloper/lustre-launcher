// Настройки «живости» интерфейса: уровень визуальных эффектов и звуки.
// Хранятся локально (как выбор анимации перехода): это свойство устройства,
// а не аккаунта — на слабом ноутбуке и мощном ПК разумны разные значения.
// Изменения в других окнах приходят через 'storage', в этом окне — через FX_CHANGED_EVENT.

export type FxLevel = 'min' | 'std' | 'max';

export const FX_LEVEL_KEY = 'lustre_fx_level';
export const UI_SOUNDS_KEY = 'lustre_ui_sounds';
export const UI_VOLUME_KEY = 'lustre_ui_volume';
export const FX_CHANGED_EVENT = 'lustre:fx-changed';

export const FX_LEVEL_OPTIONS: [FxLevel, string, string][] = [
  ['min', 'Минимум', 'Только отклик кнопок и карточек. Без частиц, свечения за курсором и искр.'],
  ['std', 'Стандарт', 'Живой фон, частицы, прожектор за курсором и искры по клику.'],
  ['max', 'Максимум', 'Больше частиц, ярче свечение, неоновый след за курсором.'],
];

const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(FX_CHANGED_EVENT)); } catch { /* ignore */ }
};

export function getFxLevel(): FxLevel {
  const v = read(FX_LEVEL_KEY);
  return v === 'min' || v === 'max' ? v : 'std';
}
export function setFxLevel(level: FxLevel) {
  write(FX_LEVEL_KEY, level);
  applyFxLevel();
}
/** Атрибут на <html>: по нему fx.css включает/выключает слои эффектов */
export function applyFxLevel() {
  document.documentElement.dataset.fxLevel = getFxLevel();
}

export function getUiSounds(): boolean {
  return read(UI_SOUNDS_KEY) !== '0'; // по умолчанию включены, но тихие
}
export function setUiSounds(on: boolean) {
  write(UI_SOUNDS_KEY, on ? '1' : '0');
}
export function getUiVolume(): number {
  const v = Number(read(UI_VOLUME_KEY));
  return Number.isFinite(v) && read(UI_VOLUME_KEY) !== null ? Math.min(1, Math.max(0, v)) : 0.35;
}
export function setUiVolume(v: number) {
  write(UI_VOLUME_KEY, String(Math.min(1, Math.max(0, v))));
}

/** Движение отключено: упрощённый режим или системная настройка */
export function motionReduced(): boolean {
  return document.documentElement.classList.contains('simple-mode') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ============ Звуки интерфейса ============
// Синтез через WebAudio: никаких файлов, мгновенный отклик, громкость под контролем.

export type UiSound = 'hover' | 'click' | 'toggle' | 'success' | 'error' | 'whoosh';

let ctx: AudioContext | null = null;
let lastHover = 0;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, opts: {
  freq: number; to?: number; at?: number; dur: number; type?: OscillatorType; gain: number;
}) {
  const t0 = ac.currentTime + (opts.at || 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type || 'square';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

export function playUi(sound: UiSound) {
  if (!getUiSounds()) return;
  const vol = getUiVolume();
  if (vol <= 0) return;
  if (sound === 'hover') {
    const now = performance.now();
    if (now - lastHover < 70) return; // быстрый проход мышью по списку не «трещит»
    lastHover = now;
  }
  const ac = audio();
  if (!ac) return;
  const v = 0.06 * vol;
  switch (sound) {
    case 'hover':
      tone(ac, { freq: 2200, dur: 0.025, type: 'sine', gain: v * 0.35 });
      break;
    case 'click':
      tone(ac, { freq: 900, to: 420, dur: 0.06, gain: v * 0.6 });
      break;
    case 'toggle':
      tone(ac, { freq: 600, dur: 0.04, gain: v * 0.5 });
      tone(ac, { freq: 1000, at: 0.045, dur: 0.05, gain: v * 0.5 });
      break;
    case 'whoosh':
      tone(ac, { freq: 220, to: 880, dur: 0.18, type: 'sawtooth', gain: v * 0.25 });
      break;
    case 'success':
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, { freq: f, at: i * 0.07, dur: 0.16, gain: v * 0.7 }));
      break;
    case 'error':
      tone(ac, { freq: 180, dur: 0.12, type: 'sawtooth', gain: v * 0.6 });
      tone(ac, { freq: 140, at: 0.13, dur: 0.16, type: 'sawtooth', gain: v * 0.6 });
      break;
  }
}

// ============ Праздничный салют ============

/**
 * Пиксельное конфетти из точки (или из центра экрана) + звук успеха.
 * Холст создаётся на время анимации и удаляется — ничего не висит в DOM.
 */
export function celebrate(opts: { x?: number; y?: number; count?: number } = {}) {
  playUi('success');
  if (motionReduced() || getFxLevel() === 'min') return;

  const canvas = document.createElement('canvas');
  canvas.className = 'fx-confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const c = canvas.getContext('2d');
  if (!c) { canvas.remove(); return; }
  c.scale(dpr, dpr);

  const css = getComputedStyle(document.documentElement);
  const colors = [
    css.getPropertyValue('--color-accent').trim() || '#ff2d8f',
    css.getPropertyValue('--color-cyan').trim() || '#22d3ee',
    css.getPropertyValue('--color-violet').trim() || '#8338ec',
    '#fbbf24', '#ffffff',
  ];
  const ox = opts.x ?? window.innerWidth / 2;
  const oy = opts.y ?? window.innerHeight * 0.45;
  const n = opts.count ?? (getFxLevel() === 'max' ? 160 : 100);
  const parts = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 9;
    return {
      x: ox, y: oy,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6,
      s: 3 + Math.floor(Math.random() * 4),
      c: colors[Math.floor(Math.random() * colors.length)],
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      life: 0, max: 70 + Math.random() * 50,
    };
  });

  let raf = 0;
  const step = () => {
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = 0;
    for (const p of parts) {
      if (p.life++ > p.max) continue;
      alive++;
      p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.32;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      c.globalAlpha = Math.max(0, 1 - p.life / p.max);
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.r);
      c.fillStyle = p.c;
      c.shadowColor = p.c;
      c.shadowBlur = 6;
      c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
      c.restore();
    }
    if (alive > 0) raf = requestAnimationFrame(step);
    else canvas.remove();
  };
  raf = requestAnimationFrame(step);
  window.setTimeout(() => { cancelAnimationFrame(raf); canvas.remove(); }, 4000);
}
