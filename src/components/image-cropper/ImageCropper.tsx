import { useCallback, useEffect, useRef, useState } from 'react';
import { IconCheck, IconX, IconMaximize, IconArrowsMove, IconLoader2, IconAlertTriangle } from '@tabler/icons-react';

/**
 * Кадрирование изображения (аватар 1:1, баннер 4:1). Изображение показывается целиком,
 * поверх — рамка кадра с фиксированными пропорциями: её двигают мышью, размер меняют
 * за углы, колесом или ползунком «Масштаб» (меньше рамка — крупнее итог). Справа/снизу —
 * живое превью результата. Экспорт — в фиксированный размер.
 * Для локальных файлов (object/data URL) работает всегда; для внешних URL — только если
 * хранилище отдаёт CORS (иначе canvas «заражён»).
 */
export type CropShape = 'avatar' | 'banner';

type Geometry = {
  aspect: number;               // ширина / высота кадра
  outW: number; outH: number;   // итоговый файл, px
  stageW: number; stageH: number; // максимальная область показа изображения, px
  previewW: number;             // ширина превью результата, px
};

const CROP_GEOMETRY: Record<CropShape, Geometry> = {
  avatar: { aspect: 1, outW: 512, outH: 512, stageW: 520, stageH: 400, previewW: 120 },
  banner: { aspect: 4, outW: 1920, outH: 480, stageW: 640, stageH: 300, previewW: 320 },
};

// Шапка профиля — 190 px по высоте на ширину ~1240 px (ProfileHeader): из баннера 4:1
// там видна центральная полоса. Показываем её пунктиром внутри рамки.
const PROFILE_HEADER_RATIO = 1240 / 190;
const MAX_ZOOM = 8;          // во сколько раз рамка может быть меньше максимальной
const MAX_UPSCALE = 3;       // маленькие картинки на экране увеличиваем не больше чем втрое

type Box = { x: number; y: number; w: number }; // в пикселях исходника; h = w / aspect
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Drag = { mode: 'move' | Corner; sx: number; sy: number; box: Box };

type Props = {
  src: string;
  shape: CropShape;
  title?: string;
  /** Формат результата: webp меньше весит; png — если получатель ждёт именно его */
  format?: 'image/webp' | 'image/png';
  onConfirm: (blob: Blob) => void;
  onClose: () => void;
};

const CORNERS: { id: Corner; cls: string; cursor: string }[] = [
  { id: 'nw', cls: '-left-[6px] -top-[6px]', cursor: 'nwse-resize' },
  { id: 'ne', cls: '-right-[6px] -top-[6px]', cursor: 'nesw-resize' },
  { id: 'sw', cls: '-left-[6px] -bottom-[6px]', cursor: 'nesw-resize' },
  { id: 'se', cls: '-right-[6px] -bottom-[6px]', cursor: 'nwse-resize' },
];

export default function ImageCropper({ src, shape, title, format = 'image/webp', onConfirm, onClose }: Props) {
  const g = CROP_GEOMETRY[shape];
  const A = g.aspect;
  const [img, setImg] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<Box>({ x: 0, y: 0, w: 1 });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // масштаб показа: изображение целиком помещается в область
  const scale = img ? Math.min(g.stageW / img.w, g.stageH / img.h, MAX_UPSCALE) : 1;
  // самая большая рамка, помещающаяся в изображение, и самая маленькая
  const fitW = img ? Math.min(img.w, img.h * A) : 1;
  const minW = Math.min(fitW, Math.max(16, fitW / MAX_ZOOM));
  const h = box.w / A;

  const centered = useCallback((w: number, cx: number, cy: number, size: { w: number; h: number }): Box => {
    const bh = w / A;
    return {
      w,
      x: Math.min(Math.max(0, cx - w / 2), size.w - w),
      y: Math.min(Math.max(0, cy - bh / 2), size.h - bh),
    };
  }, [A]);

  useEffect(() => {
    setImg(null);
    setErr('');
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => {
      imageRef.current = el;
      const size = { w: el.naturalWidth, h: el.naturalHeight };
      setImg(size);
      // по умолчанию — максимальный кадр по центру
      setBox(centered(Math.min(size.w, size.h * A), size.w / 2, size.h / 2, size));
    };
    el.onerror = () => setErr('Не удалось открыть изображение. Загрузите исходный файл заново.');
    el.src = src;
    return () => { imageRef.current = null; };
  }, [src, A, centered]);

  // новый размер рамки вокруг её центра
  const resizeAroundCenter = useCallback((w: number) => {
    if (!img) return;
    setBox((b) => centered(Math.min(fitW, Math.max(minW, w)), b.x + b.w / 2, b.y + b.w / A / 2, img));
  }, [img, fitW, minW, A, centered]);

  // колесо над изображением — размер рамки (нативный слушатель: React onWheel пассивный)
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !img) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setBox((b) => {
        const w = Math.min(fitW, Math.max(minW, b.w * (1 + e.deltaY * 0.0012)));
        return centered(w, b.x + b.w / 2, b.y + b.w / A / 2, img);
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [img, fitW, minW, A, centered]);

  const startDrag = (mode: Drag['mode']) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    stageRef.current?.setPointerCapture?.(e.pointerId);
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, box };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !img) return;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    const b = d.box;
    const bh = b.w / A;
    if (d.mode === 'move') {
      setBox({
        w: b.w,
        x: Math.min(Math.max(0, b.x + dx), img.w - b.w),
        y: Math.min(Math.max(0, b.y + dy), img.h - bh),
      });
      return;
    }
    // угол: противоположный угол стоит на месте, пропорции сохраняются
    const east = d.mode === 'ne' || d.mode === 'se';
    const south = d.mode === 'sw' || d.mode === 'se';
    const ax = east ? b.x : b.x + b.w;
    const ay = south ? b.y : b.y + bh;
    const wantW = Math.max(b.w + (east ? dx : -dx), (bh + (south ? dy : -dy)) * A);
    const maxW = Math.min(east ? img.w - ax : ax, (south ? img.h - ay : ay) * A);
    const w = Math.min(maxW, Math.max(minW, wantW));
    setBox({ w, x: east ? ax : ax - w, y: south ? ay : ay - w / A });
  };

  const onPointerUp = () => { dragRef.current = null; };

  const confirm = useCallback(() => {
    const el = imageRef.current;
    if (!img || !el || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = g.outW;
      canvas.height = g.outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(el, box.x, box.y, box.w, box.w / A, 0, 0, g.outW, g.outH);
      canvas.toBlob((blob) => {
        setBusy(false);
        if (blob) onConfirm(blob);
        else setErr('Не удалось сохранить кадр. Загрузите исходный файл заново.');
      }, format, 0.92);
    } catch {
      setBusy(false);
      setErr('Не удалось сохранить кадр: хранилище не разрешает редактировать этот файл. Загрузите исходный файл заново.');
    }
  }, [img, busy, g, box, A, format, onConfirm]);

  // Esc — закрыть, Enter — применить
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' && !err) confirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirm, err]);

  const zoom = fitW / box.w;
  const maxZoom = fitW / minW;
  // кадр заметно меньше итогового размера — результат будет мыльным
  const lowRes = !!img && box.w < g.outW / 2;
  const bandH = shape === 'banner' ? Math.min(h, box.w / PROFILE_HEADER_RATIO) : 0;
  const previewH = g.previewW / A;
  const pk = g.previewW / box.w; // масштаб превью

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        className="tl-panel bg-[#0c0910] w-full max-h-full overflow-y-auto"
        style={{ maxWidth: g.stageW + (shape === 'avatar' ? g.previewW + 24 : 0) + 48 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>
            {title || (shape === 'avatar' ? 'КАДР АВАТАРА' : 'КАДР БАННЕРА')}
          </h3>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="tl-muted hover:text-white transition-colors">
            <IconX size={16} />
          </button>
        </div>

        {err ? (
          <div className="px-6 py-8 flex flex-col items-center text-center gap-4">
            <IconAlertTriangle size={22} className="text-red-400" />
            <p className="tl-term text-[15px] tl-muted">{err}</p>
            <button type="button" onClick={onClose} className="tl-btn ghost">Закрыть</button>
          </div>
        ) : !img ? (
          <div className="flex items-center justify-center" style={{ height: g.stageH }}>
            <IconLoader2 size={26} className="text-accent animate-spin" />
          </div>
        ) : (
          <div className="px-6 pb-6 pt-4">
            <div className={`flex gap-6 ${shape === 'avatar' ? 'items-start' : 'flex-col'}`}>
              {/* Изображение целиком + рамка кадра */}
              <div className="flex items-center justify-center bg-black/60 shrink-0" style={{ width: g.stageW, height: g.stageH }}>
                <div
                  ref={stageRef}
                  className="relative select-none touch-none overflow-hidden"
                  style={{ width: img.w * scale, height: img.h * scale }}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <img src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" />
                  <div
                    className="absolute cursor-move"
                    style={{
                      left: box.x * scale,
                      top: box.y * scale,
                      width: box.w * scale,
                      height: h * scale,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,.62), inset 0 0 0 2px var(--pink)',
                    }}
                    onPointerDown={startDrag('move')}
                  >
                    {/* сетка третей — помогает выстроить композицию */}
                    <div className="absolute inset-0 pointer-events-none opacity-40" style={{
                      backgroundImage: 'linear-gradient(to right, transparent calc(33.33% - .5px), #fff calc(33.33% - .5px), #fff calc(33.33% + .5px), transparent calc(33.33% + .5px), transparent calc(66.66% - .5px), #fff calc(66.66% - .5px), #fff calc(66.66% + .5px), transparent calc(66.66% + .5px)), linear-gradient(to bottom, transparent calc(33.33% - .5px), #fff calc(33.33% - .5px), #fff calc(33.33% + .5px), transparent calc(33.33% + .5px), transparent calc(66.66% - .5px), #fff calc(66.66% - .5px), #fff calc(66.66% + .5px), transparent calc(66.66% + .5px))',
                    }} />
                    {shape === 'banner' && (
                      <div
                        className="absolute left-0 right-0 pointer-events-none border-y border-dashed border-white/70"
                        style={{ top: ((h - bandH) / 2) * scale, height: bandH * scale }}
                      />
                    )}
                    {CORNERS.map((c) => (
                      <span
                        key={c.id}
                        className={`absolute w-3 h-3 bg-[var(--pink)] border border-black/60 ${c.cls}`}
                        style={{ cursor: c.cursor }}
                        onPointerDown={startDrag(c.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Превью результата */}
              <div className="shrink-0">
                <div className="tl-head text-[10px] uppercase tracking-[0.16em] tl-muted mb-2">
                  {shape === 'avatar' ? 'Результат' : 'Результат · между пунктирами — что видно в шапке профиля'}
                </div>
                <div
                  className="relative overflow-hidden border border-[var(--line)] bg-black"
                  style={{ width: g.previewW, height: previewH }}
                >
                  <img
                    src={src}
                    alt=""
                    draggable={false}
                    className="absolute max-w-none pointer-events-none"
                    style={{ width: img.w * pk, height: img.h * pk, left: -box.x * pk, top: -box.y * pk }}
                  />
                  {shape === 'banner' && (
                    <div
                      className="absolute left-0 right-0 pointer-events-none border-y border-dashed border-white/70"
                      style={{ top: (previewH - g.previewW / PROFILE_HEADER_RATIO) / 2, height: g.previewW / PROFILE_HEADER_RATIO }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <span className="tl-head text-[10px] uppercase tracking-[0.16em] tl-muted shrink-0">Масштаб</span>
              <input
                type="range" min={1} max={maxZoom} step={0.01} value={zoom}
                onChange={(e) => resizeAroundCenter(fitW / Number(e.target.value))}
                className="flex-1 accent-[color:var(--pink)] cursor-pointer"
              />
              <span className="tl-term text-[13px] tl-muted w-12 text-right">{zoom.toFixed(2)}×</span>
              <button
                type="button"
                onClick={() => resizeAroundCenter(fitW)}
                title="Максимальный кадр"
                className="tl-btn ghost !px-2 !py-1.5"
              ><IconMaximize size={13} /></button>
            </div>
            <p className="flex items-center gap-1.5 tl-term text-[13px] tl-muted mt-2">
              <IconArrowsMove size={13} /> Двигайте рамку · тяните за углы или крутите колесо — размер · итог {g.outW}×{g.outH}
            </p>
            {lowRes && (
              <p className="tl-term text-[13px] text-amber-300/80 mt-1">
                Кадр меньше {g.outW / 2}px по ширине — изображение может быть нечётким.
              </p>
            )}

            <div className="flex gap-2.5 mt-5">
              <button type="button" onClick={onClose} className="tl-btn ghost flex-1">Отмена</button>
              <button type="button" onClick={confirm} disabled={busy} className="tl-btn solid flex-1 disabled:opacity-50">
                {busy ? <IconLoader2 size={14} className="animate-spin" /> : <IconCheck size={14} />} Применить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
