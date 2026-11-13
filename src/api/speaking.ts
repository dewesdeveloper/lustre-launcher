// Детектор голосовой активности для звонков: опрашивает WebRTC getStats()
// и превращает «уровень звука» в булево «говорит сейчас» с гистерезисом,
// чтобы подсветка не мигала на границе порога.

/** Гистерезис: включается при level >= on, выключается после level < off дольше releaseMs. */
export class VoiceGate {
  private speaking = false;
  private belowSince = 0;
  private on: number;
  private off: number;
  private releaseMs: number;

  constructor(on: number, off: number, releaseMs = 350) {
    this.on = on;
    this.off = off;
    this.releaseMs = releaseMs;
  }

  update(level: number, now = Date.now()): boolean {
    if (level >= this.on) {
      this.speaking = true;
      this.belowSince = 0;
      return true;
    }
    if (this.speaking && level < this.off) {
      if (!this.belowSince) this.belowSince = now;
      else if (now - this.belowSince >= this.releaseMs) {
        this.speaking = false;
        this.belowSince = 0;
      }
    }
    return this.speaking;
  }

  reset() {
    this.speaking = false;
    this.belowSince = 0;
  }
}

// Пороги: audioLevel в Chromium (0..1, сглаженный) — речь заметно выше шума;
// энергетический фолбэк (RMS из totalAudioEnergy) — шкала ниже.
export const AUDIO_LEVEL_GATE: [number, number] = [0.07, 0.03];
export const ENERGY_GATE: [number, number] = [0.02, 0.008];

// Предыдущие значения энергии для расчёта дельты (по id stats-отчёта)
const prevEnergy = new Map<string, { energy: number; samples: number }>();

/**
 * Уровни звука одного RTCPeerConnection:
 * local  — наш микрофон (media-source.audioLevel),
 * remote — входящий аудио потока собеседника (inbound-rtp.audioLevel
 *          или фолбэк — RMS из дельты totalAudioEnergy/totalSamplesReceived).
 */
export async function readAudioLevels(pc: RTCPeerConnection): Promise<{ local: number | null; remote: number | null }> {
  let local: number | null = null;
  let remote: number | null = null;
  let remoteFromEnergy: number | null = null;
  try {
    const stats = await pc.getStats();
    stats.forEach((rep: any) => {
      const kind = rep.kind || rep.mediaType;
      if (rep.type === 'media-source' && kind === 'audio' && typeof rep.audioLevel === 'number') {
        local = Math.max(local ?? 0, rep.audioLevel);
      } else if (rep.type === 'inbound-rtp' && kind === 'audio') {
        if (typeof rep.audioLevel === 'number') {
          remote = Math.max(remote ?? 0, rep.audioLevel);
        } else if (typeof rep.totalAudioEnergy === 'number' && typeof rep.totalSamplesReceived === 'number') {
          const prev = prevEnergy.get(rep.id);
          prevEnergy.set(rep.id, { energy: rep.totalAudioEnergy, samples: rep.totalSamplesReceived });
          if (prev && rep.totalSamplesReceived > prev.samples) {
            const dE = rep.totalAudioEnergy - prev.energy;
            const dS = rep.totalSamplesReceived - prev.samples;
            if (dS > 0 && dE >= 0) {
              const rms = Math.sqrt(dE / dS);
              remoteFromEnergy = Math.max(remoteFromEnergy ?? 0, rms);
            }
          }
        }
      }
    });
  } catch {
    // соединение закрыто во время опроса — сбрасываем кэш энергии
    prevEnergy.clear();
    return { local: null, remote: null };
  }
  if (remote === null && remoteFromEnergy !== null) remote = remoteFromEnergy;
  return { local, remote };
}

/** Сброс кэшей (при завершении звонка). */
export function resetSpeakingCache() {
  prevEnergy.clear();
}
