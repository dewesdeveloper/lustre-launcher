import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, Users, Loader2, HardDrive, Globe } from "lucide-react";

export interface DownloadSource {
  id?: number;
  kind?: 'torrent' | 'direct' | 'pixeldrain' | 'itch';
  label?: string;
  magnet_uri?: string;
  url?: string;
  size?: string;
  sort_order?: number;
}

interface PeerInfo {
  seeds: number;
  totalSeeds: number;
  leechers: number;
  totalLeechers: number;
  known: boolean;
}

interface Props {
  open: boolean;
  gameTitle: string;
  sources: DownloadSource[];
  onPick: (source: DownloadSource) => void;
  onClose: () => void;
}

const KIND_LABEL: Record<string, string> = {
  torrent: "Торрент",
  direct: "Прямая ссылка",
  pixeldrain: "Pixeldrain",
  itch: "itch.io",
};

// Модальное окно выбора источника скачивания в стиле TL: панель с уголками,
// пиксельный заголовок, квадратные строки. Для торрентов при открытии
// опрашиваем qBittorrent и показываем живое число сидов/пиров.
const SourcePickerModal = ({ open, gameTitle, sources, onPick, onClose }: Props) => {
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const magnets = sources
      .filter((s) => (s.kind || 'torrent') === 'torrent' && s.magnet_uri)
      .map((s) => s.magnet_uri as string);
    const electron = (window as any).electron;
    if (!electron?.torrentPeers || magnets.length === 0) return;

    let cancelled = false;
    setLoading(true);
    setPeers({});
    electron
      .torrentPeers(magnets)
      .then((res: Record<string, PeerInfo>) => {
        if (!cancelled) setPeers(res || {});
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Портал в body: иначе фиксированный оверлей ограничивается
  // родителем с transform/overflow и не покрывает весь экран.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="tl-panel w-full max-w-lg p-6 max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.14em] text-white" style={{ textShadow: 'var(--glow-sm)' }}>
              Выбор источника
            </h3>
            <p className="tl-term text-[14px] tl-muted mt-1.5 truncate">{gameTitle}</p>
          </div>
          <button onClick={onClose} className="tl-muted hover:text-white transition-colors cursor-pointer" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 overflow-y-auto pr-1">
          {sources.map((s, i) => {
            const kind = s.kind || 'torrent';
            const isTorrent = kind === 'torrent';
            const info = isTorrent && s.magnet_uri ? peers[s.magnet_uri] : undefined;
            return (
              <button
                key={s.id ?? i}
                onClick={() => onPick(s)}
                className="w-full text-left p-3 border border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.05)] transition-colors flex items-center justify-between gap-3 cursor-pointer"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 shrink-0 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.06)] flex items-center justify-center">
                    {isTorrent ? (
                      <Download size={14} className="text-accent" />
                    ) : (
                      <Globe size={14} className="text-violet" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] text-white block truncate group-hover:text-white">
                      {s.label || `Источник ${i + 1}`}
                    </span>
                    <span className="tl-term text-[13px] tl-muted">{KIND_LABEL[kind]}</span>
                  </span>
                </span>

                <span className="flex items-center gap-3 shrink-0">
                  {s.size && (
                    <span className="tl-term text-[13px] text-[var(--muted-2)] flex items-center gap-1">
                      <HardDrive size={11} /> {s.size}
                    </span>
                  )}
                  {!isTorrent ? (
                    <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)] border border-[var(--line)] px-1.5 py-1">
                      сервис
                    </span>
                  ) : loading && !info ? (
                    <span className="tl-term text-[13px] text-[var(--muted-2)] flex items-center gap-1">
                      <Loader2 size={11} className="animate-spin" /> проверка
                    </span>
                  ) : info && (info.totalSeeds > 0 || info.totalLeechers > 0) ? (
                    <span className="tl-term text-[13px] flex items-center gap-1" style={{ color: 'var(--green2)' }}>
                      <Users size={11} />
                      {info.seeds} сид. · {info.leechers} пир.
                    </span>
                  ) : info ? (
                    <span className="tl-term text-[13px] text-[var(--muted-2)]">нет данных</span>
                  ) : (
                    <span className="tl-term text-[13px] text-[var(--muted-2)]">—</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {loading && (
          <p className="tl-term text-[13px] text-[var(--muted-2)] mt-4 text-center">
            Определяем количество сидов и пиров через трекеры…
          </p>
        )}
      </div>
    </div>,
    document.body
  );
};

export default SourcePickerModal;
