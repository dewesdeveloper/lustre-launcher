import GameVideo, { isPlayableVideo } from './GameVideo';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ThumbsUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { getGameRatingSummary, type GameRatingSummary } from '../api/gamePreview';

const SHOW_DELAY = 400;
const HIDE_DELAY = 250;
const CARD_W = 320;
const CARD_H = 310; // высота карточки с каруселью медиа
const GAP = 12;

interface GameHoverPreviewProps {
  game: any;
  children: ReactNode;
  className?: string;
}

/**
 * Строка оценки: процент положительных, полоска и число отзывов.
 * Состояния: undefined — загрузка, null — ошибка, percent null — отзывов нет.
 */
export function GameRating({ rating }: { rating: GameRatingSummary | null | undefined }) {
  if (rating === undefined) {
    return (
      <span className="text-[10px] text-pearl/65 uppercase tracking-widest">Загрузка оценки…</span>
    );
  }
  if (rating === null) {
    return (
      <span className="text-[10px] text-pearl/70 uppercase tracking-widest">Оценка недоступна</span>
    );
  }
  if (rating.percent === null) {
    return (
      <span className="text-[10px] text-pearl/70 uppercase tracking-widest">Пока нет отзывов</span>
    );
  }

  return (
    <>
      <ThumbsUp size={12} className="text-green-400 shrink-0" />
      <span className="text-[11px] font-black text-green-400 shrink-0 tabular-nums">
        {rating.percent}%
      </span>
      <div className="h-1.5 flex-1 min-w-0 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-green-400"
          style={{ width: `${rating.percent}%` }}
        />
      </div>
      <span className="text-[10px] text-pearl/70 shrink-0 whitespace-nowrap">
        {rating.total} отзывов
      </span>
    </>
  );
}

/**
 * Всплывающая карточка игры при наведении в каталоге:
 * название, оценка пользователей и до четырёх медиа (изображения/видео).
 * Портал в body — карточка не обрезается прокручиваемыми списками.
 */
export function GameHoverPreview({ game, children, className = '' }: GameHoverPreviewProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // undefined — загрузка, null — не удалось получить, объект — готово
  const [rating, setRating] = useState<GameRatingSummary | null | undefined>(undefined);
  // текущий слайд карусели медиа
  const [slide, setSlide] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  const id = Number(game?.ID ?? game?.id) || 0;

  // до четырёх медиа из игры; если их нет — берём шапку/баннер как заглушку
  const raw: any[] = Array.isArray(game?.media) ? game.media : [];
  const media = raw
    .filter((m) => m && m.url)
    .slice(0, 4)
    .map((m) => ({ url: String(m.url), isVideo: !!m.is_video }));
  const strip = media.length
    ? media
    : [game?.header_image || game?.banner_url]
        .filter(Boolean)
        .map((url) => ({ url: String(url), isVideo: false }));

  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const clearShow = () => { if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; } };
  const clearHide = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };

  const show = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    let x = r.left;
    let y = r.bottom + GAP;
    if (x + CARD_W > window.innerWidth - 8) x = window.innerWidth - CARD_W - 8;
    if (y + CARD_H > window.innerHeight - 8) y = r.top - GAP - CARD_H;
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
    setOpen(true);
    setRating(undefined);
    setSlide(0);
    if (id) {
      getGameRatingSummary(id)
        .then((r) => setRating(r ?? null))
        .catch(() => setRating(null));
    }
  };

  const scheduleHide = () => {
    clearHide();
    hideTimer.current = setTimeout(() => { setOpen(false); setRating(undefined); hideTimer.current = null; }, HIDE_DELAY);
  };

  const onMouseEnter = () => {
    clearHide();
    clearShow();
    showTimer.current = setTimeout(() => { showTimer.current = null; show(); }, SHOW_DELAY);
  };

  const onMouseLeave = () => {
    clearShow();
    scheduleHide();
  };

  // --- карусель медиа: листается колесом, перетаскиванием, стрелками и точками ---
  const go = (i: number) => {
    const strip = stripRef.current;
    if (!strip) return;
    const count = strip.children.length;
    const idx = Math.max(0, Math.min(i, count - 1));
    strip.scrollTo({ left: idx * CARD_W, behavior: 'smooth' });
    setSlide(idx);
  };

  const onStripScroll = () => {
    const strip = stripRef.current;
    if (!strip) return;
    const idx = Math.round(strip.scrollLeft / CARD_W);
    if (idx !== slide) setSlide(idx);
  };

  return (
    <>
      <span
        ref={wrapRef}
        // block — карточка занимает всю ширину колонки; [&>*]:h-full —
        // растягивается по высоте строки, чтобы карточки в ряд были одинаковыми
        className={`relative block [&>*]:h-full ${className}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            className="fixed z-[400] animate-in fade-in slide-in-from-bottom-1 duration-200"
            style={{ left: pos.x, top: pos.y }}
            onMouseEnter={clearHide}
            onMouseLeave={scheduleHide}
          >
            <div className="w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0a0f]/95 backdrop-blur-xl shadow-[0_25px_60px_rgba(0,0,0,0.7)]">
              <div className="px-4 pt-3.5 pb-3">
                <p className="text-[13px] font-black uppercase tracking-wide text-white truncate">
                  {game?.title || 'Без названия'}
                </p>

                <div className="mt-2 flex items-center gap-2">
                  <GameRating rating={rating} />
                </div>
              </div>

              {strip.length > 0 && (
                <div className="relative">
                  {/* листается колесом/перетаскиванием + стрелки и точки */}
                  <div
                    ref={stripRef}
                    onScroll={onStripScroll}
                    className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
                  >
                    {strip.map((m, i) => (
                      <div key={i} className="w-[320px] flex-none snap-start">
                        {m.isVideo && isPlayableVideo(m.url) ? (
                          <GameVideo
                            src={m.url}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="h-[176px] w-full bg-black object-cover"
                          />
                        ) : m.isVideo ? (
                          // ролик YouTube/Vimeo в маленьком превью не встраиваем
                          <div className="h-[176px] w-full bg-black" />
                        ) : (
                          <img
                            src={m.url}
                            alt=""
                            draggable={false}
                            loading="lazy"
                            decoding="async"
                            className="h-[176px] w-full bg-black object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {strip.length > 1 && (
                    <>
                      <button
                        onClick={() => go(slide - 1)}
                        disabled={slide === 0}
                        aria-label="Предыдущее медиа"
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/70 border border-white/15 text-white flex items-center justify-center hover:bg-black transition-colors disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => go(slide + 1)}
                        disabled={slide >= strip.length - 1}
                        aria-label="Следующее медиа"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/70 border border-white/15 text-white flex items-center justify-center hover:bg-black transition-colors disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronRight size={16} />
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1">
                        {strip.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => go(i)}
                            aria-label={`Медиа ${i + 1}`}
                            className={`h-1.5 rounded-full transition-all cursor-pointer ${
                              i === slide ? 'w-4 bg-accent' : 'w-1.5 bg-white/40 hover:bg-white/80'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default GameHoverPreview;
