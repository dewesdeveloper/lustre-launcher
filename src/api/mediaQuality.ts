// Качество медиа в звонках: обычные пользователи — SD (720p/30), Pro — HD (1080p/60).
// Значение хранится в localStorage и общее для камеры и демонстрации экрана.
// Без активной Pro-подписки HD принудительно понижается до SD.

export type MediaQuality = 'sd' | 'hd';

export interface QualityPreset {
  id: MediaQuality;
  label: string;
  short: string;
  /** Разрешение захвата. */
  resolution: { width: number; height: number };
  /** Верхняя граница кадров в секунду. */
  frameRate: number;
  /** Битрейт камеры. */
  cameraBitrate: number;
  /** Битрейт демонстрации экрана. */
  screenBitrate: number;
}

export const QUALITY_PRESETS: Record<MediaQuality, QualityPreset> = {
  sd: {
    id: 'sd',
    label: 'SD · 720p · 30 к/с',
    short: 'SD',
    resolution: { width: 1280, height: 720 },
    frameRate: 30,
    cameraBitrate: 1_500_000,
    screenBitrate: 2_500_000,
  },
  hd: {
    id: 'hd',
    label: 'HD · 1080p · 60 к/с',
    short: 'HD',
    resolution: { width: 1920, height: 1080 },
    frameRate: 60,
    cameraBitrate: 3_000_000,
    screenBitrate: 6_000_000,
  },
};

const QUALITY_KEY = 'lustre_media_quality';
const SHARE_AUDIO_KEY = 'lustre_share_audio';

let pro = false;

/** Обновляется из UI (MainLayout) при изменении профиля/подписки. */
export function setProStatus(value: boolean) {
  pro = !!value;
}

export function isProUser(): boolean {
  return pro;
}

export function canUseHd(): boolean {
  return pro;
}

/** Текущий тариф качества (без Pro HD недоступен). По умолчанию Pro — HD. */
export function getQuality(): MediaQuality {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(QUALITY_KEY);
  } catch { /* ignore */ }
  if (stored === 'sd') return 'sd';
  if (stored === 'hd') return pro ? 'hd' : 'sd';
  return pro ? 'hd' : 'sd';
}

/** Сохраняет выбор; HD без Pro молча понижается до SD. */
export function setQuality(quality: MediaQuality): MediaQuality {
  const next: MediaQuality = quality === 'hd' && !pro ? 'sd' : quality;
  try { localStorage.setItem(QUALITY_KEY, next); } catch { /* ignore */ }
  return next;
}

export function getPreset(quality: MediaQuality = getQuality()): QualityPreset {
  return QUALITY_PRESETS[quality];
}

/** Делиться системным звуком при демонстрации экрана (по умолчанию — да). */
export function getShareAudio(): boolean {
  try {
    const raw = localStorage.getItem(SHARE_AUDIO_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function setShareAudio(value: boolean) {
  try { localStorage.setItem(SHARE_AUDIO_KEY, value ? '1' : '0'); } catch { /* ignore */ }
}
