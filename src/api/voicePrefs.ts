// Голосовые настройки: реестр, доступный из любого окна (call.ts читает без React).
// Хранятся в localStorage + дублируются в бэкенд через SettingsContext (voice-секция).

export type InputProfile = 'isolation' | 'studio' | 'custom';
/** off — без шумоподавления; standard — встроенное в Chromium; rnnoise — нейросетевое (RNNoise) */
export type NoiseMode = 'off' | 'standard' | 'rnnoise';

export interface VoicePrefs {
  input_device_id: string;
  output_device_id: string;
  input_volume: number;   // усиление ввода 0..2 (1 = 100%)
  output_volume: number;  // громкость друзей 0..2 (свыше 1 — WebAudio-усиление)
  transmission: 'voice' | 'ptt' | 'ptm'; // по голосу / рация / выкл звука при нажатии
  ptt_key: string;        // KeyboardEvent.code или Mouse3..Mouse5, '' = нет
  mic_toggle_sound: boolean;
  /** Профиль ввода: готовые наборы обработки (как в Discord) или свои настройки */
  input_profile: InputProfile;
  noise_mode: NoiseMode;
  /** Чувствительность ввода: автоматически по уровню шума или вручную (sensitivity_db) */
  auto_sensitivity: boolean;
  /** Порог открытия микрофона, дБ: -100 (всё передаётся) … 0 */
  sensitivity_db: number;
  echo_cancellation: boolean;
  auto_gain: boolean;
  /** Предупреждать, если микрофон не передаёт звук */
  no_mic_warning: boolean;
  /** Устаревшие поля: оставлены для мобильного клиента и старых сохранений */
  input_threshold: 'off' | 'medium' | 'high';
  noise_suppression: boolean;
}

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  input_device_id: '',
  output_device_id: '',
  input_volume: 1,
  output_volume: 1,
  transmission: 'voice',
  ptt_key: '',
  mic_toggle_sound: true,
  input_profile: 'isolation',
  noise_mode: 'rnnoise',
  auto_sensitivity: true,
  sensitivity_db: -50,
  echo_cancellation: true,
  auto_gain: true,
  no_mic_warning: true,
  input_threshold: 'medium',
  noise_suppression: true,
};

/** Что включает каждый профиль ввода */
export const PROFILE_PRESETS: Record<Exclude<InputProfile, 'custom'>, Partial<VoicePrefs>> = {
  // только голос: нейросетевое шумоподавление, эхо, АРУ, автопорог
  isolation: { noise_mode: 'rnnoise', echo_cancellation: true, auto_gain: true, auto_sensitivity: true },
  // открытый микрофон без обработки
  studio: { noise_mode: 'off', echo_cancellation: false, auto_gain: false, auto_sensitivity: false, sensitivity_db: -100 },
};

/** Приводит сохранённые настройки (в т.ч. старого формата) к текущему виду */
export function normalizeVoicePrefs(raw: Partial<VoicePrefs> | null | undefined): VoicePrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VOICE_PREFS };
  const legacy = raw.input_profile === undefined && Object.keys(raw).length > 0;
  const p: VoicePrefs = { ...DEFAULT_VOICE_PREFS, ...raw };
  if (legacy) {
    // старые настройки: сохраняем выбор пользователя, а не навязываем новый профиль
    p.input_profile = 'custom';
    p.noise_mode = raw.noise_suppression === false ? 'off' : 'standard';
    p.auto_sensitivity = (raw.input_threshold ?? 'medium') === 'medium';
    p.sensitivity_db = raw.input_threshold === 'off' ? -100 : raw.input_threshold === 'high' ? -30 : -50;
  }
  if (!['off', 'standard', 'rnnoise'].includes(p.noise_mode)) p.noise_mode = 'standard';
  p.sensitivity_db = Math.max(-100, Math.min(0, Number(p.sensitivity_db) || -50));
  p.noise_suppression = p.noise_mode !== 'off';
  return p;
}

const STORAGE_KEY = 'lustre_voice_prefs';

let prefs: VoicePrefs = { ...DEFAULT_VOICE_PREFS };
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) prefs = normalizeVoicePrefs(JSON.parse(raw));
  } catch { /* ignore */ }
}

export function getVoicePrefs(): VoicePrefs {
  load();
  return prefs;
}

const subs = new Set<(p: VoicePrefs) => void>();

export function subscribeVoicePrefs(fn: (p: VoicePrefs) => void): () => void {
  load();
  subs.add(fn);
  return () => subs.delete(fn);
}

export function setVoicePrefs(patch: Partial<VoicePrefs>) {
  load();
  prefs = normalizeVoicePrefs({ ...prefs, ...patch });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  subs.forEach((fn) => fn(prefs));
}

// Живая синхронизация между окнами лаунчера
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      prefs = normalizeVoicePrefs(JSON.parse(e.newValue));
      subs.forEach((fn) => fn(prefs));
    } catch { /* ignore */ }
  });
}

export function replaceVoicePrefs(next: Partial<VoicePrefs>) {
  loaded = true;
  // с сервера могут прийти настройки старого формата (без профиля) — нормализуем как есть
  prefs = normalizeVoicePrefs(loaded && prefs.input_profile ? { ...prefs, ...next } : next);
  loaded = true;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  subs.forEach((fn) => fn(prefs));
}

export function buildAudioConstraints(): MediaTrackConstraints {
  const p = getVoicePrefs();
  const c: MediaTrackConstraints = {
    echoCancellation: p.echo_cancellation,
    // RNNoise работает сам: двойное шумоподавление «съедает» голос
    noiseSuppression: p.noise_mode === 'standard',
    autoGainControl: p.auto_gain,
    channelCount: 1,
    sampleRate: 48000,
  };
  if (p.input_device_id) c.deviceId = { exact: p.input_device_id };
  return c;
}

export async function listAudioDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === 'audioinput'),
      outputs: devices.filter((d) => d.kind === 'audiooutput'),
    };
  } catch {
    return { inputs: [], outputs: [] };
  }
}

/** Порог голосовой активности в RMS (0 = выкл) */
export function thresholdRMS(level: 'off' | 'medium' | 'high'): number {
  if (level === 'medium') return 0.015;
  if (level === 'high') return 0.045;
  return 0;
}

/** Короткий бип при вкл/выкл микрофона */
export function playMicSound(on: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = on ? 880 : 440;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch { /* ignore */ }
}

// --- Усиление громкости вывода (>100%) ---
// HTMLMediaElement.volume ограничен диапазоном 0..1, поэтому громкость свыше
// 100% физически недостижима на одном <audio>. Чтобы «усиление вывода» в
// настройках (0..200%) реально работало, при значениях >1 канал дополнительно
// заводится в WebAudio GainNode, а сам элемент глушится (иначе было бы удвоение).
// При значениях ≤100% играет сам <audio> — Chromium использует его как опорный
// сигнал для эхоподавления, поэтому в обычном режиме AEC не страдает.
let outBoostCtx: AudioContext | null = null;
const outBoosts = new Map<HTMLMediaElement, { src: MediaStreamAudioSourceNode; gain: GainNode }>();

export function applyOutputVolumeToElement(
  el: HTMLMediaElement,
  track: MediaStreamTrack | null,
  volume: number,
) {
  const v = Math.max(0, Math.min(2, volume));
  const existing = outBoosts.get(el);
  const teardown = () => {
    if (!existing) return;
    try { existing.src.disconnect(); existing.gain.disconnect(); } catch { /* ignore */ }
    outBoosts.delete(el);
  };

  if (v <= 1 || !track) {
    teardown();
    el.muted = false;
    el.volume = v;
    return;
  }

  try {
    if (!outBoostCtx) outBoostCtx = new AudioContext();
    void outBoostCtx.resume().catch(() => {});
    let b = existing;
    if (!b) {
      const src = outBoostCtx.createMediaStreamSource(new MediaStream([track]));
      const gain = outBoostCtx.createGain();
      src.connect(gain).connect(outBoostCtx.destination);
      b = { src, gain };
      outBoosts.set(el, b);
    }
    b.gain.gain.value = v;
    el.volume = 1;
    el.muted = true; // звук идёт из WebAudio
  } catch {
    el.muted = false;
    el.volume = Math.min(1, v);
  }
}

/** Снимает WebAudio-усиление с элемента (при завершении звонка). */
export function releaseOutputBoost(el: HTMLMediaElement) {
  const b = outBoosts.get(el);
  if (!b) return;
  try { b.src.disconnect(); b.gain.disconnect(); } catch { /* ignore */ }
  outBoosts.delete(el);
}

/** Направляет WebAudio-усиление на выбранное устройство вывода. */
export async function setOutputBoostSink(deviceId: string) {
  if (!outBoostCtx || !deviceId) return;
  const ctx = outBoostCtx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (typeof ctx.setSinkId !== 'function') return;
  try { await ctx.setSinkId(deviceId); } catch { /* ignore */ }
}

// --- Журнал ошибок голосового чата ---

const voiceLog: { t: number; msg: string }[] = [];

export function pushVoiceLog(msg: string) {
  voiceLog.push({ t: Date.now(), msg });
  if (voiceLog.length > 50) voiceLog.shift();
}

export function getVoiceLogText(): string {
  return voiceLog
    .map((e) => `[${new Date(e.t).toLocaleTimeString()}] ${e.msg}`)
    .join('\n');
}

/** Красивое имя клавиши из KeyboardEvent.code */
export function prettyKey(code: string): string {
  if (!code) return 'Нет';
  if (code === 'Mouse3') return 'Колесо мыши';
  if (code === 'Mouse4' || code === 'Mouse5') return `Мышь ${code.slice(5)}`;
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Space', 'Пробел')
    .replace('ShiftLeft', 'Левый Shift')
    .replace('ShiftRight', 'Правый Shift')
    .replace('ControlLeft', 'Левый Ctrl')
    .replace('ControlRight', 'Правый Ctrl')
    .replace('AltLeft', 'Левый Alt')
    .replace('AltRight', 'Правый Alt');
}
