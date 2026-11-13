// Сигналы звонка: входящий — mp3-рингтон в цикле, исходящий (КПВ) — синтез Web Audio
import incomingRingUrl from '../assets/sounds/vintage-ringtone-for-nokia-phone.mp3';
import { getNotifyPrefs } from './notifyPrefs';

type Kind = 'incoming' | 'ringback';

let ctx: AudioContext | null = null;
let burstStop: (() => void) | null = null;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
let incomingAudio: HTMLAudioElement | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Разблокировка звука по первому взаимодействию (autoplay-политика браузера)
let unlocked = false;
export function unlockAudio() {
  if (unlocked) return;
  const c = ensureCtx();
  if (c && c.state === 'running') {
    unlocked = true;
    return;
  }
  const onGesture = () => {
    const cc = ensureCtx();
    if (cc) {
      cc.resume()
        .then(() => {
          unlocked = true;
        })
        .catch(() => {});
    }
    window.removeEventListener('pointerdown', onGesture);
    window.removeEventListener('keydown', onGesture);
  };
  window.addEventListener('pointerdown', onGesture);
  window.addEventListener('keydown', onGesture);
}

function playBurst(freqs: number[], onMs: number) {
  const c = ensureCtx();
  if (!c) return;
  const oscs = freqs.map((f) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    return o;
  });
  const gain = c.createGain();
  gain.connect(c.destination);
  const t = c.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.1, t + 0.03);
  gain.gain.setValueAtTime(0.1, t + onMs / 1000 - 0.05);
  gain.gain.linearRampToValueAtTime(0, t + onMs / 1000);
  oscs.forEach((o) => {
    o.connect(gain);
    o.start(t);
    o.stop(t + onMs / 1000 + 0.02);
  });
  // принудительная остановка, если звонок сбросили посреди гудка
  burstStop = () => {
    try {
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.value = 0;
      oscs.forEach((o) => {
        try { o.stop(); } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
    burstStop = null;
  };
}

export function startRingtone(kind: Kind) {
  // входящий: мелодию можно выключить в «Уведомлениях», в «не беспокоить» она молчит
  if (kind === 'incoming') {
    const p = getNotifyPrefs();
    if (!p.ringtone || p.dnd) return;
  }
  stopRingtone();
  if (kind === 'incoming') {
    try {
      if (!incomingAudio) {
        incomingAudio = new Audio(incomingRingUrl);
        incomingAudio.loop = true;
        incomingAudio.volume = 0.8;
      }
      incomingAudio.currentTime = 0;
      incomingAudio
        .play()
        .catch(() => startSynth(kind)); // не удалось воспроизвести — синтез-фолбэк
      return;
    } catch {
      /* fallthrough к синтезу */
    }
  }
  startSynth(kind);
}

function startSynth(kind: Kind) {
  const loop = () => {
    if (kind === 'incoming') {
      playBurst([440, 480], 2000);
      loopTimer = setTimeout(loop, 6000);
    } else {
      playBurst([425], 1000);
      loopTimer = setTimeout(loop, 4000);
    }
  };
  loop();
}

export function stopRingtone() {
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
  burstStop?.();
  if (incomingAudio) {
    try {
      incomingAudio.pause();
      incomingAudio.currentTime = 0;
    } catch { /* ignore */ }
  }
}
