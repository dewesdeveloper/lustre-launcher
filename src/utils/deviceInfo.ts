import { secureStorage } from '../api/secureStorage';

export type DeviceInfo = {
  id: string;
  name: string;
  platform: string;
};

let cached: DeviceInfo = { id: '', name: '', platform: '' };

export function getCachedDeviceInfo(): DeviceInfo {
  return cached;
}

export async function initDeviceInfo(): Promise<void> {
  const electron = (window as any).electron;
  if (electron?.getDeviceInfo) {
    try {
      const info = await electron.getDeviceInfo();
      if (info?.id) {
        cached = {
          id: String(info.id),
          name: String(info.name || ''),
          platform: String(info.platform || ''),
        };
        return;
      }
    } catch {
      // fall through to web fallback
    }
  }

  let id = secureStorage.getItem('deviceId');
  if (!id || typeof id !== 'string') {
    id =
      (globalThis.crypto as any)?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    secureStorage.setItem('deviceId', id);
  }
  const { name, platform } = detectWebDevice();
  cached = { id, name, platform };
}

function detectWebDevice(): { name: string; platform: string } {
  if (typeof navigator === 'undefined') return { name: 'Браузер', platform: 'web' };
  const ua = navigator.userAgent || '';
  let platform = 'Web';
  if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) platform = 'macOS';
  else if (/Android/i.test(ua)) platform = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'iOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';

  let browser = 'Браузер';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/YaBrowser/i.test(ua)) browser = 'Яндекс';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';

  return { name: `${browser} · ${platform}`, platform };
}
