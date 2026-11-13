import api from './index';

// ICE-серверы (STUN + TURN) для P2P-звонков. Берём с бэкенда,
// чтобы TURN-креды не были вшиты в клиент. Кэшируем на сессию.

const FALLBACK: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

let cached: RTCIceServer[] | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

export async function getIceServers(): Promise<RTCIceServer[]> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = api
    .get('/calls/ice')
    .then((r) => {
      const list = (r.data as { iceServers?: RTCIceServer[] } | undefined)?.iceServers;
      cached = Array.isArray(list) && list.length ? list : FALLBACK;
      return cached;
    })
    .catch(() => {
      cached = FALLBACK;
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Сбросить кэш (например, после смены TURN-конфига). */
export function resetIceCache() {
  cached = null;
}
