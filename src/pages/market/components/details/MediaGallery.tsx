import React, { useState } from 'react';
import { Info, ChevronLeft, ChevronRight, Play } from 'lucide-react';
import type { GameMedia } from '../../types';
import { isPlayableVideo } from '../../../../components/GameVideo';
import VideoPlayer from '../../../../components/VideoPlayer';
import ImageLightbox from '../../../../components/ImageLightbox';

const youtubeId = (url: string) =>
  url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || '';

const toEmbedUrl = (url: string): string => {
  if (!url) return '';
  const yt = youtubeId(url);
  if (yt) return `https://www.youtube.com/embed/${yt}?rel=0`;
  // Vimeo
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  // Steam widget
  const steamMatch = url.match(/store\.steampowered\.com\/app\/(\d+)/);
  if (steamMatch) return `https://store.steampowered.com/widget/${steamMatch[1]}/`;
  // itch.io embed
  if (url.match(/itch\.io\/embed-upload\/\d+/)) return url;
  const itchMatch = url.match(/itch\.io\/(?:embed\/)?([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/);
  if (itchMatch) return `https://itch.io/embed-upload/${itchMatch[1]}`;
  return url;
};

/** Картинка для миниатюры: у видео — его обложка (у YouTube она есть всегда), у изображения — оно само */
export const mediaPreview = (m: GameMedia): string => {
  if (!m.is_video) return m.url;
  if (m.thumbnail) return m.thumbnail;
  const yt = youtubeId(m.url);
  return yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : '';
};

// Миниатюра без картинки или с битой ссылкой: тёмная плашка вместо значка «нет изображения»
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="w-full h-full bg-[linear-gradient(135deg,#1a1026,#07040c)]" />;
  return <img src={src} onError={() => setFailed(true)} className="w-full h-full object-cover" alt="" draggable={false} loading="lazy" />;
}

interface MediaGalleryProps {
  allMedia: GameMedia[];
  activeMediaIdx: number;
  onSelect: React.Dispatch<React.SetStateAction<number>>;
}

const MediaGallery: React.FC<MediaGalleryProps> = ({ allMedia, activeMediaIdx, onSelect }) => {
  // номер открытого на весь экран изображения среди картинок; null — просмотр закрыт
  const [viewer, setViewer] = useState<number | null>(null);
  if (allMedia.length === 0) return null;
  const current = allMedia[Math.min(activeMediaIdx, allMedia.length - 1)];
  const go = (by: number) => onSelect((prev) => (prev + by + allMedia.length) % allMedia.length);
  const images = allMedia.filter((m) => !m.is_video);

  return (
    <section>
      <div className="tl-sec-head">
        <span className="bar" />
        <h2><Info size={15} className="text-accent" /> Медиа</h2>
        <span className="line" />
      </div>
      <div className="tl-panel overflow-hidden">
        <div
          className="relative aspect-video bg-black group/media outline-none"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') go(-1);
            if (e.key === 'ArrowRight') go(1);
          }}
        >
          {current.is_video ? (
            isPlayableVideo(current.url) ? (
              <VideoPlayer key={current.url} src={current.url} poster={mediaPreview(current) || undefined} className="absolute inset-0" />
            ) : (
              <iframe
                key={current.url}
                src={toEmbedUrl(current.url)}
                className="absolute inset-0 w-full h-full"
                title="Видео игры"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => setViewer(Math.max(0, images.findIndex((m) => m.id === current.id)))}
              aria-label="Открыть изображение на весь экран"
              className="absolute inset-0 cursor-zoom-in"
            >
              <img src={current.url} alt="Медиа игры" className="w-full h-full object-cover" draggable={false} />
            </button>
          )}

          {/* Стрелки по центру краёв; над видео — только при наведении, чтобы не закрывать кадр */}
          {allMedia.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Предыдущее"
                className={`lb-btn absolute left-3 top-1/2 -translate-y-1/2 z-10 transition-opacity ${current.is_video ? 'opacity-0 group-hover/media:opacity-100 focus:opacity-100' : ''}`}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Следующее"
                className={`lb-btn absolute right-3 top-1/2 -translate-y-1/2 z-10 transition-opacity ${current.is_video ? 'opacity-0 group-hover/media:opacity-100 focus:opacity-100' : ''}`}
              >
                <ChevronRight size={18} />
              </button>
              <span className="absolute right-3 top-3 z-10 tl-num text-[10px] text-white/90 bg-black/60 px-2 py-1 pointer-events-none">
                {activeMediaIdx + 1} / {allMedia.length}
              </span>
            </>
          )}
        </div>

        {allMedia.length > 1 && (
          <div className="flex gap-2 p-3 bg-[rgb(var(--accent-rgb)/.04)] overflow-x-auto custom-scrollbar">
            {allMedia.map((item, idx) => (
              <button
                type="button"
                key={item.id}
                onClick={() => onSelect(idx)}
                aria-label={item.is_video ? `Видео ${idx + 1}` : `Изображение ${idx + 1}`}
                aria-current={activeMediaIdx === idx}
                className={`relative shrink-0 w-28 h-16 overflow-hidden border transition-all ${
                  activeMediaIdx === idx
                    ? 'border-[var(--pink)] opacity-100'
                    : 'border-[var(--line)] opacity-60 hover:opacity-100'
                }`}
              >
                <Thumb src={mediaPreview(item)} />
                {item.is_video && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                    <span className="w-7 h-7 flex items-center justify-center bg-black/60 border border-white/40">
                      <Play size={12} className="fill-white text-white ml-0.5" />
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {viewer !== null && images.length > 0 && (
        <ImageLightbox
          images={images.map((m) => m.url)}
          index={Math.min(viewer, images.length - 1)}
          onIndex={(i) => { setViewer(i); onSelect(allMedia.findIndex((m) => m.id === images[i].id)); }}
          onClose={() => setViewer(null)}
        />
      )}
    </section>
  );
};

export default MediaGallery;
