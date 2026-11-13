// Обработка микрофона для всех голосовых режимов (звонки, группы, голосовые каналы, проверка
// микрофона в настройках):
//
//   микрофон (эхо/АРУ/шумодав Chromium) → [RNNoise] → усиление → гейт (порог / рация) → выход
//
// Порог чувствительности и рация раньше работали только в старом P2P-звонке: через LiveKit
// (основной путь) голос передавался всегда, а режим «При нажатии кнопки» не действовал.
import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import gateWorkletUrl from './voiceGate.worklet.js?url';
import { buildAudioConstraints, getVoicePrefs, playMicSound, pushVoiceLog, subscribeVoicePrefs, type VoicePrefs } from './voicePrefs';
import { isPttHeld, onPttChange } from './ptt';

export interface MicLevel {
  /** Уровень после шумоподавления и усиления, дБ (-100…0) */
  db: number;
  /** Текущий порог открытия, дБ (в авторежиме меняется по шуму) */
  threshold: number;
  /** Микрофон сейчас передаёт звук */
  open: boolean;
}

export interface MicPipeline {
  /** Обработанный трек для публикации */
  track: MediaStreamTrack;
  stream: MediaStream;
  /** Настройки захвата, с которыми он создан (смена — пересоздать конвейер) */
  captureKey: string;
  onLevel(fn: (l: MicLevel) => void): () => void;
  /** Прослушивание себя (проверка микрофона) */
  setMonitor(on: boolean): void;
  destroy(): void;
}

export interface MicPipelineOptions {
  /** Микрофон не даёт звука — показать предупреждение */
  onSilentMic?: () => void;
  /** Проверка в настройках: без рации (иначе индикатор молчит, пока клавиша не нажата) */
  test?: boolean;
}

// Модель RNNoise грузится один раз (SIMD-сборка, если процессор умеет)
let rnnoiseBinary: Promise<ArrayBuffer> | null = null;
function rnnoiseWasm(): Promise<ArrayBuffer> {
  rnnoiseBinary ??= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl });
  rnnoiseBinary.catch(() => { rnnoiseBinary = null; });
  return rnnoiseBinary;
}

/** Параметры захвата: их смена требует нового getUserMedia */
export function captureKeyOf(p: VoicePrefs): string {
  return [p.input_device_id, p.echo_cancellation, p.auto_gain, p.noise_mode].join('|');
}

async function capture(): Promise<MediaStream> {
  const constraints = buildAudioConstraints();
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    // запомненное устройство могло пропасть — берём системное, сохраняя обработку
    if (!constraints.deviceId) throw e;
    pushVoiceLog(`getUserMedia fallback (без deviceId): ${(e as Error)?.message || e}`);
    const rest = { ...constraints };
    delete rest.deviceId;
    return await navigator.mediaDevices.getUserMedia({ audio: rest });
  }
}

function gateMode(p: VoicePrefs, test: boolean): 'vad' | 'open' | 'closed' {
  if (test || p.transmission === 'voice') return 'vad';
  if (!p.ptt_key) return p.transmission === 'ptt' ? 'closed' : 'vad';
  const held = isPttHeld();
  if (p.transmission === 'ptt') return held ? 'open' : 'closed';
  return held ? 'closed' : 'vad'; // ptm: нажатие глушит
}

export async function createMicPipeline(opts: MicPipelineOptions = {}): Promise<MicPipeline | null> {
  const prefs = getVoicePrefs();
  let raw: MediaStream;
  try {
    raw = await capture();
  } catch (e) {
    pushVoiceLog(`getUserMedia failed: ${(e as Error)?.message || e}`);
    return null;
  }

  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  } catch {
    ctx = new AudioContext();
  }
  await ctx.resume().catch(() => {});

  const source = ctx.createMediaStreamSource(raw);
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(3, prefs.input_volume));
  const dest = ctx.createMediaStreamDestination();
  let rnnoise: RnnoiseWorkletNode | null = null;
  let gate: AudioWorkletNode | null = null;
  const levelFns = new Set<(l: MicLevel) => void>();

  // 1) нейросетевое шумоподавление
  let head: AudioNode = source;
  if (prefs.noise_mode === 'rnnoise' && ctx.sampleRate === 48000) {
    try {
      const [wasm] = await Promise.all([rnnoiseWasm(), ctx.audioWorklet.addModule(rnnoiseWorkletUrl)]);
      rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary: wasm, maxChannels: 1 });
      head.connect(rnnoise);
      head = rnnoise;
    } catch (e) {
      pushVoiceLog(`rnnoise unavailable: ${(e as Error)?.message || e}`);
      rnnoise = null;
    }
  }
  head.connect(gain);

  // 2) гейт: порог / рация
  try {
    await ctx.audioWorklet.addModule(gateWorkletUrl);
    gate = new AudioWorkletNode(ctx, 'lustre-voice-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    gain.connect(gate).connect(dest);
    gate.port.onmessage = (e: MessageEvent<MicLevel>) => levelFns.forEach((fn) => fn(e.data));
  } catch (e) {
    pushVoiceLog(`voice gate unavailable: ${(e as Error)?.message || e}`);
    gain.connect(dest);
  }

  const sendGate = (p: VoicePrefs) => {
    gate?.port.postMessage({
      mode: gateMode(p, !!opts.test),
      auto: p.auto_sensitivity,
      thresholdDb: p.sensitivity_db,
    });
  };
  sendGate(prefs);

  const offPrefs = subscribeVoicePrefs((p) => {
    gain.gain.setTargetAtTime(Math.max(0, Math.min(3, p.input_volume)), ctx.currentTime, 0.02);
    sendGate(p);
  });
  const offPtt = onPttChange((down) => {
    const p = getVoicePrefs();
    sendGate(p);
    if (!opts.test && p.mic_toggle_sound && p.transmission !== 'voice' && p.ptt_key) {
      playMicSound(p.transmission === 'ptt' ? down : !down);
    }
  });

  // 3) микрофон молчит (выключен в Windows, не тот вход) — предупреждаем один раз
  let silentTimer: ReturnType<typeof setInterval> | null = null;
  if (opts.onSilentMic) {
    const probe = ctx.createAnalyser();
    probe.fftSize = 2048;
    source.connect(probe);
    const buf = new Float32Array(probe.fftSize);
    let silentSince = Date.now();
    silentTimer = setInterval(() => {
      probe.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      const track = raw.getAudioTracks()[0];
      if (peak > 1e-4 || !track?.enabled) { silentSince = Date.now(); return; }
      if (Date.now() - silentSince > 8000 && getVoicePrefs().no_mic_warning) {
        if (silentTimer) clearInterval(silentTimer);
        silentTimer = null;
        opts.onSilentMic?.();
      }
    }, 1000);
  }

  let monitorNode: AudioNode | null = null;
  const track = dest.stream.getAudioTracks()[0];
  return {
    track,
    stream: dest.stream,
    captureKey: captureKeyOf(prefs),
    onLevel(fn) {
      levelFns.add(fn);
      return () => levelFns.delete(fn);
    },
    setMonitor(on) {
      const tail = gate ?? gain;
      if (on && !monitorNode) {
        tail.connect(ctx.destination);
        monitorNode = tail;
      } else if (!on && monitorNode) {
        try { monitorNode.disconnect(ctx.destination); } catch { /* ignore */ }
        monitorNode = null;
      }
    },
    destroy() {
      offPrefs();
      offPtt();
      if (silentTimer) clearInterval(silentTimer);
      levelFns.clear();
      if (gate) gate.port.onmessage = null;
      rnnoise?.destroy();
      raw.getTracks().forEach((t) => t.stop());
      track?.stop();
      ctx.close().catch(() => {});
    },
  };
}
