/**
 * Кэш MediaStream для привязки к <video>.
 * Геттеры потоков вызываются на каждом рендере — без кэша они возвращали бы
 * новый объект каждый раз, и элемент видео перепривязывался бы, «мигая» кадром.
 */
const cache = new Map<string, MediaStream>();

export function cachedStream(key: string, track: MediaStreamTrack | null | undefined): MediaStream | null {
  if (!track) {
    cache.delete(key);
    return null;
  }
  const current = cache.get(key);
  if (current && current.getTracks()[0] === track) return current;
  const stream = new MediaStream([track]);
  cache.set(key, stream);
  return stream;
}
