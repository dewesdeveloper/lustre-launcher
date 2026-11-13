import { createPortal } from "react-dom";
import { X, Download, HardDrive, Monitor, Smartphone, Terminal, Globe, ExternalLink, Loader2 } from "lucide-react";
import type { ItchFile } from "../itchFiles";
import { formatBytes } from "../itchFiles";

interface Props {
  open: boolean;
  gameTitle: string;
  files: ItchFile[];
  /** Идёт резолв файлов на бэкенде — показываем лоадер вместо пустого окна */
  loading?: boolean;
  onPick: (file: ItchFile) => void;
  onClose: () => void;
}

const platformIcon = (platform: string) => {
  const p = platform.toLowerCase();
  if (p.includes('windows')) return <Monitor size={14} className="text-accent shrink-0" />;
  if (p.includes('android') || p.includes('ios') || p.includes('mobile')) return <Smartphone size={14} className="text-violet shrink-0" />;
  if (p.includes('linux')) return <Terminal size={14} className="text-violet shrink-0" />;
  if (p.includes('web')) return <Globe size={14} className="text-violet shrink-0" />;
  return <Download size={14} className="text-violet shrink-0" />;
};

// Выбор файла игры itch.io (несколько сборок: Windows, apk, macOS…).
// Порядок списка приходит с бэкенда: Windows первым. Стиль TL — как у
// «Выбора источника»: панель с уголками и квадратные строки.
const ItchFilePickerModal = ({ open, gameTitle, files, loading = false, onPick, onClose }: Props) => {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="tl-panel w-full max-w-lg p-6 max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.14em] text-white" style={{ textShadow: 'var(--glow-sm)' }}>
              Выбор файла
            </h3>
            <p className="tl-term text-[14px] tl-muted mt-1.5 truncate">{gameTitle}</p>
          </div>
          <button onClick={onClose} className="tl-muted hover:text-white transition-colors cursor-pointer" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 overflow-y-auto pr-1">
          {loading && files.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 size={22} className="animate-spin text-accent" />
              <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] tl-muted">
                Получаем список файлов…
              </p>
            </div>
          )}
          {!loading && files.length === 0 && (
            <p className="tl-term text-[15px] text-[var(--muted-2)] py-4 text-center">
              Файлы не найдены.
            </p>
          )}
          {files.map((f, i) => (
            <button
              key={`${f.url}-${i}`}
              onClick={() => onPick(f)}
              className="w-full text-left p-3 border border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.05)] transition-colors flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 shrink-0 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.06)] flex items-center justify-center">
                  {platformIcon(f.platform || '')}
                </span>
                <span className="min-w-0">
                  <span className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] text-white block truncate">
                    {f.filename || `Файл ${i + 1}`}
                  </span>
                  <span className="tl-term text-[13px] tl-muted">{f.platform || 'Файл игры'}</span>
                </span>
              </span>

              <span className="flex items-center gap-3 shrink-0">
                {f.external && (
                  <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)] border border-[var(--line)] px-1.5 py-1 flex items-center gap-1">
                    <ExternalLink size={10} /> внешний
                  </span>
                )}
                {f.size ? (
                  <span className="tl-term text-[13px] text-[var(--muted-2)] flex items-center gap-1">
                    <HardDrive size={11} /> {formatBytes(f.size)}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ItchFilePickerModal;
