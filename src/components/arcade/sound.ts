// Звуки мини-игр: синтез через Web Audio в духе 8-бит, без файлов. Контекст создаётся при первом
// звуке — он всегда звучит в ответ на действие игрока, поэтому браузер его не блокирует.

export type ArcadeSound =
  | 'start' | 'eat' | 'turn' | 'over'          // змейка и общее
  | 'slice' | 'combo' | 'miss' | 'bomb' | 'record';

const MUTE_KEY = 'lh_arcade_muted';
const VOLUME = 0.22;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } })();
let noiseBuffer: AudioBuffer | null = null;

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch { /* ignore */ }
}

function audio(): { ac: AudioContext; out: GainNode } | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ac: ctx, out: master! };
  } catch {
    return null;
  }
}

// Короткая нота: квадрат/пила как у старых приставок, с затуханием и скольжением частоты
function tone(freq: number, dur: number, { type = 'square' as OscillatorType, to = freq, vol = 1, delay = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.ac.currentTime + delay;
  const osc = a.ac.createOscillator();
  const env = a.ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 20), t + dur);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(a.out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// Шум через фильтр: взмах клинка, взрыв
function noise(dur: number, { from = 4000, to = 800, vol = 1, delay = 0, type = 'bandpass' as BiquadFilterType } = {}) {
  const a = audio();
  if (!a) return;
  if (!noiseBuffer || noiseBuffer.sampleRate !== a.ac.sampleRate) {
    noiseBuffer = a.ac.createBuffer(1, a.ac.sampleRate, a.ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = a.ac.currentTime + delay;
  const src = a.ac.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = a.ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(to, 30), t + dur);
  const env = a.ac.createGain();
  env.gain.setValueAtTime(vol, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(a.out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export function playSound(name: ArcadeSound) {
  switch (name) {
    case 'start':
      tone(440, 0.08); tone(660, 0.08, { delay: 0.08 }); tone(880, 0.12, { delay: 0.16 });
      break;
    case 'turn':
      tone(220, 0.03, { vol: 0.25 });
      break;
    case 'eat':
      tone(660, 0.06, { to: 990 }); tone(1320, 0.05, { delay: 0.05, vol: 0.6 });
      break;
    case 'over':
      tone(440, 0.14, { type: 'sawtooth', to: 330 });
      tone(330, 0.14, { type: 'sawtooth', to: 220, delay: 0.14 });
      tone(220, 0.3, { type: 'sawtooth', to: 110, delay: 0.28 });
      break;
    case 'slice':
      noise(0.09, { from: 6000, to: 1500, vol: 0.9 });
      tone(900 + Math.random() * 300, 0.05, { to: 500, vol: 0.35 });
      break;
    case 'combo':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.07, { delay: i * 0.05, vol: 0.7 }));
      break;
    case 'miss':
      tone(180, 0.18, { type: 'triangle', to: 90, vol: 0.9 });
      break;
    case 'bomb':
      noise(0.7, { from: 1200, to: 60, vol: 1, type: 'lowpass' });
      tone(120, 0.5, { type: 'sawtooth', to: 30, vol: 0.8 });
      break;
    case 'record':
      [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.1, { delay: 0.55 + i * 0.09, vol: 0.7 }));
      break;
  }
}
