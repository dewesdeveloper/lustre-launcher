import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronRight, Crown, Gauge, MonitorUp, Volume2, X } from 'lucide-react';
import { QUALITY_PRESETS, type MediaQuality } from '../api/mediaQuality';

export interface ScreenShareMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onStop: () => void;
  onChangeSource: () => void;
  quality: MediaQuality;
  canHd: boolean;
  onQuality: (quality: MediaQuality) => void;
  shareAudio: boolean;
  onToggleShareAudio: (value: boolean) => void;
  onReport: () => void;
}

const MENU_WIDTH = 288;

/** Контекстное меню демонстрации экрана (как в Discord) — портал, чтобы не
 *  обрезалось overflow-hidden контейнером звонка. */
export default function ScreenShareMenu({
  open, anchorRef, onClose, onStop, onChangeSource,
  quality, canHd, onQuality, shareAudio, onToggleShareAudio, onReport,
}: ScreenShareMenuProps) {
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setPos(null);
      setQualityOpen(false);
      return;
    }
    const compute = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) {
        setPos({ left: window.innerWidth - MENU_WIDTH - 12, bottom: 80 });
        return;
      }
      setPos({
        left: Math.min(window.innerWidth - MENU_WIDTH - 8, Math.max(8, rect.right - MENU_WIDTH)),
        bottom: window.innerHeight - rect.top + 8,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [open, anchorRef]);

  if (!open) return null;

  const rowClass =
    'w-full flex items-center gap-3 px-3 py-2 text-left text-[13px] text-pearl/80 hover:bg-white/[0.06] hover:text-white transition-colors';

  return createPortal(
    <>
      <div className="fixed inset-0 z-[139]" onClick={onClose} />
      <div
        ref={menuRef}
        style={{ left: pos?.left ?? 0, bottom: pos?.bottom ?? 0, visibility: pos ? 'visible' : 'hidden' }}
        className="fixed z-[140] w-72 rounded-xl border border-white/10 bg-[#0d0a16]/98 backdrop-blur-xl shadow-2xl shadow-black/60 p-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onStop} className={`${rowClass} text-red-400 hover:text-red-300`}>
          <X size={15} className="shrink-0" />
          <span>Прекратить стрим</span>
        </button>

        <button type="button" onClick={onChangeSource} className={rowClass}>
          <MonitorUp size={15} className="shrink-0" />
          <span>Изменить источник</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setQualityOpen((v) => !v)}
            className={rowClass}
          >
            <Gauge size={15} className="shrink-0" />
            <span>Качество передачи</span>
            <ChevronRight
              size={14}
              className={`ml-auto shrink-0 transition-transform ${qualityOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {qualityOpen && (
            <div className="absolute right-full top-0 mr-1 w-64 rounded-xl border border-white/10 bg-[#0d0a16]/98 backdrop-blur-xl shadow-2xl shadow-black/60 p-1.5">
              {(['sd', 'hd'] as const).map((q) => {
                const preset = QUALITY_PRESETS[q];
                const locked = q === 'hd' && !canHd;
                const active = quality === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onQuality(q)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2 text-left rounded-lg transition-colors ${
                      active ? 'bg-[rgb(var(--accent-rgb)/.12)] text-white' : 'text-pearl/75 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span className="w-8 text-[10px] font-black uppercase tracking-wider text-pearl/60">{preset.short}</span>
                    <span className="flex-1 min-w-0 text-[12px] truncate">{preset.label}</span>
                    {locked
                      ? <Crown size={13} className="text-amber-400 shrink-0" />
                      : active
                        ? <Check size={14} className="text-accent shrink-0" />
                        : null}
                  </button>
                );
              })}
              {!canHd && (
                <p className="px-2.5 pt-1.5 pb-1 text-[10px] text-amber-300/80 leading-tight">
                  HD доступно с подпиской Lustre Pro
                </p>
              )}
            </div>
          )}
        </div>

        <label className={`${rowClass} cursor-pointer`}>
          <Volume2 size={15} className="shrink-0" />
          <span className="flex-1">Поделиться звуком стрима</span>
          <input
            type="checkbox"
            checked={shareAudio}
            onChange={(e) => onToggleShareAudio(e.target.checked)}
            className="w-4 h-4 accent-[color:var(--color-accent)] cursor-pointer"
          />
        </label>

        <div className="my-1 h-px bg-white/10" />

        <button type="button" onClick={onReport} className={rowClass}>
          <AlertTriangle size={15} className="shrink-0 text-red-400" />
          <span>Сообщить о проблеме</span>
        </button>
      </div>
    </>,
    document.body,
  );
}
