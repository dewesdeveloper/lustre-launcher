import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import GameVideo from './GameVideo';

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const VOLUME_KEY = 'lh_trailer_volume';
const readVolume = () => {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem(VOLUME_KEY) !== null ? v : 0.6;
  } catch { return 0.6; }
};

/**
 * Плеер трейлеров в стиле лаунчера: обложка до старта, своя панель (позиция, время, громкость,
 * полный экран), клавиши: пробел/K — пауза, ←/→ — 5 секунд, M — звук, F — полный экран.
 */
export default function VideoPlayer({ src, poster, className = '' }: { src: string; poster?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(readVolume);
  const [muted, setMuted] = useState(false);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Панель прячется через 2,5 с без движения мыши, пока видео идёт
  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  }, []);
  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* не критично */ }
  }, [volume, muted, started]);

  const toggle = () => {
    const v = video.current;
    if (!started) { setStarted(true); return; }
    if (!v) return;
    if (v.paused) void v.play().catch(() => {}); else v.pause();
  };

  // После первого нажатия видео появляется и сразу запускается
  useEffect(() => {
    if (started) void video.current?.play().catch(() => {});
  }, [started]);

  const seek = (t: number) => {
    const v = video.current;
    if (!v || !Number.isFinite(t)) return;
    v.currentTime = Math.max(0, Math.min(duration || v.duration || 0, t));
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void box.current?.requestFullscreen().catch(() => {});
  };

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
    else if (k === 'arrowleft') { e.preventDefault(); seek(time - 5); }
    else if (k === 'arrowright') { e.preventDefault(); seek(time + 5); }
    else if (k === 'm') setMuted((m) => !m);
    else if (k === 'f') toggleFull();
    else return;
    // стрелки не должны листать галерею, пока фокус на плеере
    e.stopPropagation();
    wake();
  };

  const silent = muted || volume === 0;
  const hideUi = started && playing && idle;
  const pct = (v: number) => (duration > 0 ? `${(v / duration) * 100}%` : '0%');

  return (
    <div
      ref={box}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseMove={wake}
      onMouseLeave={() => playing && setIdle(true)}
      className={`${className || 'relative'} bg-black outline-none group/vp select-none ${hideUi ? 'cursor-none' : ''}`}
      role="region"
      aria-label="Видеоплеер"
    >
      {started ? (
        <GameVideo
          src={src}
          videoRef={video}
          poster={poster}
          playsInline
          onClick={toggle}
          onDoubleClick={toggleFull}
          onPlay={() => { setPlaying(true); wake(); }}
          onPause={() => { setPlaying(false); setIdle(false); }}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onProgress={(e) => {
            const b = e.currentTarget.buffered;
            if (b.length) setBuffered(b.end(b.length - 1));
          }}
          onEnded={() => setIdle(false)}
          className="absolute inset-0 w-full h-full object-contain"
        />
      ) : (
        poster
          ? <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          : <div className="absolute inset-0 bg-[linear-gradient(135deg,#120a1d,#05030a)]" />
      )}

      {/* Большая кнопка запуска и индикатор загрузки */}
      {(!started || !playing) && !waiting && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Смотреть"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center bg-[rgb(var(--accent-rgb)/.85)] text-white border border-[var(--pink)] shadow-[var(--glow)] hover:brightness-110 transition"
        >
          <Play size={26} className="fill-white ml-1" />
        </button>
      )}
      {started && waiting && (
        <Loader2 size={34} className="absolute left-1/2 top-1/2 -ml-[17px] -mt-[17px] animate-spin text-white/80 pointer-events-none" />
      )}

      {started && (
        <div
          className={`absolute inset-x-0 bottom-0 px-3 pb-2 pt-8 bg-gradient-to-t from-black/85 to-transparent transition-opacity duration-200 ${hideUi ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
          {/* Позиция: загруженная часть светлее, перетаскивание как у ползунка */}
          <div className="relative h-3 flex items-center group/seek">
            <div className="absolute inset-x-0 h-1 bg-white/15" />
            <div className="absolute left-0 h-1 bg-white/30" style={{ width: pct(buffered) }} />
            <div className="absolute left-0 h-1 bg-[var(--pink)]" style={{ width: pct(time) }} />
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Позиция в видео"
              className="vp-range absolute inset-0 w-full"
            />
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <button type="button" onClick={toggle} aria-label={playing ? 'Пауза' : 'Смотреть'} className="text-white hover:text-[var(--pink)]">
              {playing ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current" />}
            </button>
            <div className="flex items-center gap-2 group/vol">
              <button type="button" onClick={() => setMuted((m) => !m)} aria-label={silent ? 'Включить звук' : 'Выключить звук'} className="text-white hover:text-[var(--pink)]">
                {silent ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={silent ? 0 : volume}
                onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }}
                aria-label="Громкость"
                className="vp-range vp-vol w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100 transition-[width,opacity] duration-200"
              />
            </div>
            <span className="tl-num text-[11px] text-white/85 tabular-nums">{fmt(time)} / {fmt(duration)}</span>
            <span className="flex-1" />
            <button type="button" onClick={toggleFull} aria-label={full ? 'Выйти из полного экрана' : 'Во весь экран'} className="text-white hover:text-[var(--pink)]">
              {full ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
