import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Просмотр изображений на весь экран: стрелки и ←/→ листают, Esc или клик по фону закрывает.
 * Рисуется в body: внутри страницы с анимацией position: fixed растягивался бы не на экран.
 */
export default function ImageLightbox({ images, index, onIndex, onClose }: {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const go = (by: number) => onIndex((index + by + images.length) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && images.length > 1) go(-1);
      else if (e.key === 'ArrowRight' && images.length > 1) go(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр изображения"
      className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <img
        src={images[index]}
        alt=""
        className="max-w-[calc(100vw-140px)] max-h-[calc(100vh-80px)] object-contain select-none"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />
      <button type="button" onClick={onClose} aria-label="Закрыть" className="lb-btn absolute right-4 top-4">
        <X size={20} />
      </button>
      {images.length > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Предыдущее" className="lb-btn absolute left-4 top-1/2 -translate-y-1/2">
            <ChevronLeft size={24} />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Следующее" className="lb-btn absolute right-4 top-1/2 -translate-y-1/2">
            <ChevronRight size={24} />
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 tl-num text-[11px] text-white/80 bg-black/60 px-2.5 py-1">
            {index + 1} / {images.length}
          </span>
        </>
      )}
    </div>,
    document.body,
  );
}
