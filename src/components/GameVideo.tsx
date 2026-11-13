import { useEffect, useRef, type MutableRefObject, type VideoHTMLAttributes } from 'react';

// Трейлеры Steam приходят потоком HLS (.m3u8), остальные видео — файлами
export const isStreamVideo = (url: string) => /\.m3u8(?:[?#]|$)/i.test(url);
export const isFileVideo = (url: string) => /\.(?:mp4|webm|ogg|mov|m4v)(?:[?#]|$)/i.test(url);
export const isPlayableVideo = (url: string) => isStreamVideo(url) || isFileVideo(url);

/**
 * Видео игры. HLS Chromium лаунчера играет сам; браузерам без такой поддержки (Firefox)
 * подключаем hls.js, и только им: библиотека грузится по требованию.
 */
export default function GameVideo({ src, autoPlay, videoRef, ...props }: {
  src: string;
  /** доступ к элементу для своих кнопок управления */
  videoRef?: MutableRefObject<HTMLVideoElement | null>;
} & Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'>) {
  const own = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef ?? own;

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!isStreamVideo(src) || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return () => { video.removeAttribute('src'); video.load(); };
    }
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return;
      const player = new Hls();
      // через MediaSource атрибут autoplay сам не срабатывает
      if (autoPlay) player.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
      player.loadSource(src);
      player.attachMedia(video);
      hls = player;
    }).catch(() => { /* видео не покажется, остальная страница работает */ });
    return () => { destroyed = true; hls?.destroy(); };
  }, [src, autoPlay]);

  return <video ref={ref} autoPlay={autoPlay} {...props} />;
}
