import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Play, Sparkles } from 'lucide-react';
import { gameBannerFallback, gameKeyArtUrl } from '../../../../utils/gameBanner';
import { startCoverFlight } from '../../../../utils/coverFlight';
import { releaseTime, stripHtml } from '../../constants';

interface StoreHeroProps {
  /** Игры каталога с уже применёнными фильтрами контента/возраста */
  games: any[];
  onOpen: (game: any) => void;
}

const SLIDES = 5;
const AUTOPLAY_MS = 7000;

/** Прямой видеофайл (Steam movie и т.п.) — YouTube в фоне не проигрываем */
const directVideo = (game: any): string | null => {
  const m = (Array.isArray(game?.media) ? game.media : []).find(
    (x: any) => x?.is_video && /\.(mp4|webm)(\?|$)/i.test(String(x.url || '')),
  );
  return m ? String(m.url) : null;
};

const reduceMotion = () =>
  document.documentElement.classList.contains('simple-mode') ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Картинка с запасным вариантом: битая ссылка (нет capsule у игры) → header_image */
const useArt = (game: any) => {
  const [src, setSrc] = useState(() => gameKeyArtUrl(game));
  const onError = () => {
    const fb = gameBannerFallback(game);
    if (fb && fb !== src) setSrc(fb);
  };
  return { src, onError };
};

/**
 * Фон слайда: та же обложка игры, растянутая и размытая (на широком экране) —
 * даёт цвета игры по всему баннеру. На узком экране обложка без размытия:
 * там нет отдельной карточки справа, и фон — единственная картинка.
 */
const HeroBackdrop = ({ game }: { game: any }) => {
  const { src, onError } = useArt(game);
  return (
    // «Наезд камеры» — на обёртке, размытие — на картинке внутри: так blur
    // растеризуется один раз, а анимируется готовый слой (иначе GPU
    // пересчитывал размытие на каждом кадре)
    <div className="hero-kenburns absolute inset-0">
      <img
        src={src}
        alt=""
        draggable={false}
        onError={onError}
        className="absolute inset-0 w-full h-full object-cover lg:blur-2xl lg:saturate-150 lg:opacity-70 lg:scale-110"
      />
    </div>
  );
};

/**
 * Обложка игры справа — чёткая, в неоновой рамке, с лёгким парением.
 * Если у игры есть прямой видеофайл, через ~1.4 с он мягко заменяет картинку.
 */
const HeroKeyArt = ({ game, active }: { game: any; active: boolean }) => {
  const { src, onError } = useArt(game);
  const video = useMemo(() => directVideo(game), [game]);
  const [playVideo, setPlayVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => {
    setPlayVideo(false);
    setVideoReady(false);
    if (!active || !video || reduceMotion()) return;
    const t = window.setTimeout(() => setPlayVideo(true), 1400);
    return () => clearTimeout(t);
  }, [active, video]);

  return (
    <div className="hero-keyart tl-panel relative w-full aspect-[616/353] overflow-hidden">
      <img src={src} alt={game.title} draggable={false} onError={onError} className="absolute inset-0 w-full h-full object-cover" />
      {playVideo && video && (
        <video
          src={video}
          muted
          autoPlay
          loop
          playsInline
          onCanPlay={() => setVideoReady(true)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
          style={{ opacity: videoReady ? 1 : 0 }}
        />
      )}
      <span className="hero-keyart-glint absolute inset-0 pointer-events-none" />
    </div>
  );
};

/**
 * Hero-баннер витрины: 5 свежих игр каталога, автопрокрутка с прогрессом,
 * наезд камеры по фону, параллакс за курсором, глитч-заголовок,
 * лента превью для ручного переключения. Пауза при наведении.
 */
export default function StoreHero({ games, onOpen }: StoreHeroProps) {
  // Набор слайдов фиксируем по id: фоновая догрузка каталога не должна сбрасывать баннер
  const picked = useMemo(() => {
    return [...games]
      .filter((g) => g && (g.banner_url || g.header_image))
      .sort((a, b) => (b.ID || 0) - (a.ID || 0))
      .slice(0, SLIDES);
  }, [games]);
  const pickedKey = picked.map((g) => g.ID).join(',');
  const slides = useMemo(() => picked, [pickedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);

  const count = slides.length;
  const current = slides[Math.min(index, Math.max(0, count - 1))];

  const go = useCallback((next: number, d?: number) => {
    if (!count) return;
    setDir(d ?? (next > index ? 1 : -1));
    setIndex(((next % count) + count) % count);
  }, [count, index]);

  // Автопрокрутка завязана на CSS-анимацию полосы прогресса (animationend):
  // пауза при наведении замораживает и полосу, и переключение — без рассинхрона.
  // В упрощённом режиме анимации отключены, и баннер не листается сам.

  // параллакс фона за курсором — прямо в DOM, без ререндеров
  const onMove = (e: React.PointerEvent) => {
    const el = rootRef.current;
    const bg = bgRef.current;
    if (!el || !bg || e.pointerType !== 'mouse' || reduceMotion()) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    bg.style.transform = `translate3d(${dx * -18}px, ${dy * -12}px, 0) scale(1.04)`;
    // обложка — ближний план: смещается навстречу и слегка поворачивается
    if (artRef.current) {
      artRef.current.style.transform = `translate3d(${dx * 14}px, ${dy * 10}px, 0) rotateY(${dx * -8}deg) rotateX(${dy * 6}deg)`;
    }
  };
  const onLeave = () => {
    setPaused(false);
    if (bgRef.current) bgRef.current.style.transform = '';
    if (artRef.current) artRef.current.style.transform = '';
  };

  if (!current) return null;

  const description = current.description ? stripHtml(current.description) : '';
  const year = (() => {
    const t = releaseTime(current.release_date);
    return t === null ? null : new Date(t).getFullYear();
  })();
  const meta = [current.developer || current.publisher, year].filter(Boolean).join(' · ');
  const tags: any[] = Array.isArray(current.tags) ? current.tags.slice(0, 4) : [];
  const isNewest = index === 0;

  return (
    <section
      ref={rootRef}
      className="store-hero tl-panel relative overflow-hidden mt-6 mb-10 select-none"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={onLeave}
      onPointerMove={onMove}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1, 1);
        if (e.key === 'ArrowLeft') go(index - 1, -1);
      }}
      aria-roledescription="carousel"
      aria-label="Рекомендуемые игры"
    >
      {/* ---- фон ---- */}
      <div ref={bgRef} className="absolute -inset-4 transition-transform duration-700 ease-out will-change-transform">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={current.ID}
            custom={dir}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.08, clipPath: dir > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' }}
            animate={{ opacity: 1, scale: 1, clipPath: 'inset(0 0% 0 0%)' }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroBackdrop game={current} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---- оверлеи: затемнение под текст, сканлайны, цветной отсвет ---- */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#060309] via-[#060309]/65 to-transparent" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-[#060309] via-transparent to-[#060309]/30" />
      <div className="hero-scan absolute inset-0 pointer-events-none" />
      <div className="hero-glow absolute -left-40 -bottom-40 w-[560px] h-[560px] pointer-events-none" />

      {/* ---- обложка игры (широкий экран) ---- */}
      <div className="absolute z-[2] right-8 top-8 hidden lg:block w-[min(42%,480px)]" style={{ perspective: '900px' }}>
        <div ref={artRef} className="transition-transform duration-500 ease-out will-change-transform">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.ID}
              initial={{ opacity: 0, x: 40 * dir, rotateY: -18 * dir, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, rotateY: 0, scale: 1 }}
              exit={{ opacity: 0, x: -30 * dir, rotateY: 12 * dir, scale: 0.96 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* парение — на своём слое: transform из CSS-анимации не должен
                  перебивать transform, которым motion анимирует смену слайда */}
              <div className="hero-keyart-float">
                <HeroKeyArt game={current} active />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ---- контент ---- */}
      <div className="relative z-[2] flex flex-col justify-end min-h-[380px] md:min-h-[420px] p-6 md:p-10 max-w-[640px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.ID}
            initial="hidden"
            animate="show"
            exit="out"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } },
              out: { opacity: 0, y: -8, transition: { duration: 0.2 } },
            }}
          >
            {(() => {
              const item = {
                hidden: { opacity: 0, y: 18, filter: 'blur(4px)' },
                show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
              } as const;
              return (
                <>
                  <motion.div variants={item} className="flex items-center gap-2 mb-4">
                    <span className="tl-live-dot" />
                    <span className="tl-head text-[10px] tracking-[0.28em] text-accent uppercase flex items-center gap-1.5">
                      <Sparkles size={12} /> {isNewest ? 'Новинка каталога' : 'Свежее в Lustre'}
                    </span>
                    <span className="tl-term text-[14px] text-[var(--muted-2)]">// {String(index + 1).padStart(2, '0')}/{String(count).padStart(2, '0')}</span>
                  </motion.div>

                  <motion.h2
                    variants={item}
                    className="tl-glitch-title text-white text-[28px] md:text-[40px] leading-[1.05] uppercase tracking-[0.04em] mb-3 [text-shadow:0_0_24px_rgb(var(--accent-rgb)/.55)]"
                    data-text={current.title}
                  >
                    {current.title}
                  </motion.h2>

                  {meta && <motion.p variants={item} className="tl-term text-[17px] text-[var(--muted)] mb-3">{meta}</motion.p>}

                  {tags.length > 0 && (
                    <motion.div variants={item} className="flex flex-wrap gap-1.5 mb-4">
                      {current.age_rating && <span className="tl-chip age">{current.age_rating}</span>}
                      {tags.map((t) => <span key={t.id ?? t.name} className="tl-chip common">{t.name}</span>)}
                    </motion.div>
                  )}

                  {description && (
                    <motion.p variants={item} className="text-[13px] leading-relaxed text-[var(--muted)] line-clamp-2 mb-6 max-w-[520px]">
                      {description}
                    </motion.p>
                  )}

                  <motion.div variants={item} className="flex flex-wrap items-center gap-3">
                    <button type="button" className="tl-btn solid tl-shine !px-6 !py-3 !text-[11px]" onClick={() => {
                      // обложка из hero летит на место баннера страницы игры
                      startCoverFlight(rootRef.current?.querySelector<HTMLImageElement>('.hero-keyart img'));
                      onOpen(current);
                    }}>
                      <Play size={14} fill="currentColor" /> Открыть игру
                    </button>
                    {count > 1 && (
                      <div className="flex">
                        <button type="button" className="tl-btn ghost !px-3" aria-label="Предыдущая игра" onClick={() => go(index - 1, -1)}>
                          <ChevronLeft size={16} />
                        </button>
                        <button type="button" className="tl-btn ghost !px-3 -ml-px" aria-label="Следующая игра" onClick={() => go(index + 1, 1)}>
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </motion.div>
                </>
              );
            })()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ---- лента превью с прогрессом автопрокрутки ---- */}
      {count > 1 && (
        <div className="absolute z-[3] right-4 bottom-4 md:right-6 md:bottom-6 hidden sm:flex gap-2">
          {slides.map((g, i) => {
            const on = i === index;
            return (
              <button
                key={g.ID}
                type="button"
                onClick={() => go(i)}
                aria-label={g.title}
                aria-current={on}
                className={`hero-thumb relative w-[92px] md:w-[112px] aspect-video overflow-hidden border transition-all duration-300 ${
                  on ? 'border-[var(--pink)] -translate-y-1 shadow-[0_0_16px_rgb(var(--accent-rgb)/.55)]' : 'border-[var(--line)] opacity-60 hover:opacity-100 hover:-translate-y-0.5'
                }`}
              >
                <img src={g.header_image || g.banner_url} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} />
                <span className="absolute left-0 bottom-0 h-[2px] w-full bg-white/10" />
                {on && (
                  <span
                    key={g.ID}
                    onAnimationEnd={() => go(index + 1, 1)}
                    className="hero-progress absolute left-0 bottom-0 h-[2px] bg-[var(--pink)] shadow-[0_0_6px_var(--pink)]"
                    style={{ animationDuration: `${AUTOPLAY_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
