import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CallQuality } from '../api/livekitRoom';

/** Индикатор качества соединения (полоски сигнала, как в Discord). */
export function ConnectionBars({ quality, className = '' }: { quality?: CallQuality; className?: string }) {
  if (!quality || quality === 'unknown') return null;
  const filled = quality === 'poor' ? 1 : quality === 'average' ? 2 : quality === 'good' ? 3 : 4;
  const color = quality === 'poor' ? '#ef4444' : quality === 'average' ? '#f59e0b' : '#22c55e';
  const title = quality === 'poor' ? 'Слабое соединение' : quality === 'average' ? 'Среднее соединение' : quality === 'good' ? 'Хорошее соединение' : 'Отличное соединение';
  return (
    <span
      title={title}
      className={`inline-flex items-end gap-[2px] h-3.5 px-1 py-[2px] bg-black/50 rounded ${className}`}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{ height: 4 + i * 2.5, background: i < filled ? color : 'rgba(255,255,255,.22)' }}
        />
      ))}
    </span>
  );
}

/** Аватар-заглушка участника звонка. */
export function Avatar({ url, name, size = 56, pulse = false, speaking = false }: { url?: string; name: string; size?: number; pulse?: boolean; speaking?: boolean }) {
  const letter = (name || '?').charAt(0).toUpperCase();
  return (
    <div
      className={`relative rounded-full overflow-hidden bg-white/10 border flex items-center justify-center text-white font-bold shrink-0 transition-shadow duration-150 ${
        pulse ? 'animate-pulse' : ''
      } ${
        speaking
          ? 'border-accent shadow-[0_0_0_2px_var(--accent),0_0_14px_rgba(255,45,143,0.45)]'
          : 'border-white/10'
      }`}
      style={{ width: size, height: size }}
      title={speaking ? 'Говорит…' : undefined}
    >
      {url ? (
        <img src={url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.4 }}>{letter}</span>
      )}
    </div>
  );
}

function clampZoom(v: number) { return Math.max(1, Math.min(4, v)); }

/** <video>, привязанный к потоку: привязка после каждого рендера, без мигания. */
export function StreamVideo({ get, muted = false, fit = 'contain', zoomable = false }: {
  get: () => MediaStream | null;
  muted?: boolean;
  fit?: 'contain' | 'cover';
  /** Демонстрация экрана: масштаб колесом, перетаскивание при увеличении. */
  zoomable?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lastStreamRef = useRef<MediaStream | null>(null);
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const movedRef = useRef(false);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const s = get();
    if (el.srcObject !== s) el.srcObject = s;
    // Chromium может не стартовать автоплей по политике — пробуем вручную
    if (s && el.paused) void el.play().catch(() => {});
  });

  // сброс масштаба при смене потока (собеседник перезапустил демонстрацию)
  useEffect(() => {
    const s = get();
    if (s !== lastStreamRef.current) {
      lastStreamRef.current = s;
      setZoom({ scale: 1, x: 0, y: 0 });
    }
  });

  // нативный non-passive wheel: React делает wheel passive, preventDefault не сработает
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((prev) => {
        const scale = clampZoom(prev.scale * (1 - e.deltaY * 0.002));
        return scale <= 1 ? { scale: 1, x: 0, y: 0 } : { ...prev, scale };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomable]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!zoomable || zoom.scale <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    movedRef.current = false;
    panRef.current = { sx: e.clientX, sy: e.clientY, px: zoom.x, py: zoom.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const st = panRef.current;
    if (!st) return;
    const dx = e.clientX - st.sx;
    const dy = e.clientY - st.sy;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
    setZoom((prev) => ({ ...prev, x: st.px + dx, y: st.py + dy }));
  };
  const onPointerUp = () => { panRef.current = null; };
  // после перетаскивания клик не должен «разворачивать»/сворачивать плитку
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation();
      movedRef.current = false;
    }
  };

  const zoomBy = (f: number) => {
    setZoom((prev) => {
      const scale = clampZoom(prev.scale * f);
      return scale <= 1 ? { scale: 1, x: 0, y: 0 } : { ...prev, scale };
    });
  };

  return (
    <div
      ref={wrapRef}
      className={`absolute inset-0 overflow-hidden ${zoomable && zoom.scale > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClickCapture={onClickCapture}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`absolute inset-0 w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
        style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`, transformOrigin: 'center center', transition: 'transform .05s linear' }}
      />
      {zoomable && (
        <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 opacity-0 group/tile:hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); zoomBy(1 / 1.25); }}
            title="Уменьшить"
            className="w-6 h-6 border border-white/20 bg-black/60 text-white/80 hover:text-white hover:border-white/50 flex items-center justify-center text-[14px] leading-none cursor-pointer"
          >−</button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setZoom({ scale: 1, x: 0, y: 0 }); }}
            title="Исходный размер"
            className="h-6 px-1.5 border border-white/20 bg-black/60 text-white/80 hover:text-white hover:border-white/50 flex items-center justify-center text-[10px] font-bold cursor-pointer"
          >{Math.round(zoom.scale * 100)}%</button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); zoomBy(1.25); }}
            title="Увеличить"
            className="w-6 h-6 border border-white/20 bg-black/60 text-white/80 hover:text-white hover:border-white/50 flex items-center justify-center text-[14px] leading-none cursor-pointer"
          >+</button>
        </div>
      )}
    </div>
  );
}

export interface StageTileData {
  id: string;
  title: string;
  icon: ReactNode;
  get: () => MediaStream | null;
  muted: boolean;
  fit: 'contain' | 'cover';
  avatarUrl?: string;
  avatarName?: string;
  /** Участник говорит — подсвечиваем плитку/аватар. */
  speaking?: boolean;
  /** Демонстрация экрана — доступно масштабирование. */
  zoomable?: boolean;
  /** Качество соединения участника (для полосок сигнала). */
  quality?: CallQuality;
  /** У участника выключен микрофон (иконка mute на плите). */
  micOff?: boolean;
}

/**
 * Плитка сцены звонка (дискорд-раскладка): аватар как фон, поверх — видео,
 * снизу слева плашка с именем. Режимы: большая (сцена), сетка, миниатюра.
 */
export function StageTile({ tile, mode, active = false, onClick }: {
  tile: StageTileData;
  mode: 'large' | 'grid' | 'thumb';
  active?: boolean;
  onClick?: () => void;
}) {
  const box = mode === 'thumb' ? 'w-44 h-24 shrink-0' : 'w-full h-full min-h-[140px]';
  const ring = active
    ? 'border-2 border-accent'
    : tile.speaking
      ? 'border-2 border-accent shadow-[0_0_14px_rgba(255,45,143,0.35)]'
      : 'border border-white/10';
  const labelSize = mode === 'thumb' ? 'text-[10px]' : 'text-[10px]';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onClick) { e.preventDefault(); onClick(); } }}
      title={onClick ? 'Развернуть' : undefined}
      className={`group/tile relative overflow-hidden bg-black cursor-pointer transition-colors hover:border-white/40 ${box} ${ring}`}
    >
      {tile.avatarName && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Avatar
            url={tile.avatarUrl}
            name={tile.avatarName}
            size={mode === 'large' ? 120 : mode === 'grid' ? 64 : 36}
            speaking={tile.speaking}
          />
        </span>
      )}
      <StreamVideo get={tile.get} muted={tile.muted} fit={tile.fit} zoomable={tile.zoomable} />
      {/* Качество связи + mute-индикатор — верхний правый угол плитки */}
      {(tile.quality || tile.micOff) && (
        <span className="absolute right-2 top-2 z-10 flex items-center gap-1">
          {tile.micOff && (
            <span title="Микрофон выключен" className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                <line x1="4" y1="4" x2="20" y2="20" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </span>
          )}
          <ConnectionBars quality={tile.quality} />
        </span>
      )}
      <span className={`absolute left-2 bottom-2 max-w-[85%] truncate flex items-center gap-1.5 bg-black/60 text-white/85 px-2 py-1 font-semibold ${labelSize}`}>
        {tile.icon}{tile.title}
      </span>
    </div>
  );
}

/** Классы сетки сцены: 1 колонка на узких экранах, 2 — как в Discord. */
export function stageGridClass(n: number): string {
  const cols = n <= 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2';
  return `grid gap-3 h-full ${cols} auto-rows-fr`;
}
