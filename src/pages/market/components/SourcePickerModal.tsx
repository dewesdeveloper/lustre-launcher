import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, HardDrive, Globe, Loader2, Users, Radio } from "lucide-react";
import MarqueeText from "../../../components/ui/MarqueeText";
import { getTorrentHealth, type LiveHealth, type SourceHealth } from "../../../api/torrentHealth";

/** Пока окно открыто, лаунчер переспрашивает трекеры не чаще — трекеры ограничивают частоту scrape */
const LIVE_REFRESH_MS = 30_000;

export interface DownloadSource {
  id?: number;
  kind?: 'torrent' | 'direct' | 'pixeldrain' | 'itch' | 'mega' | 'mediafire' | 'browser';
  label?: string;
  magnet_uri?: string;
  url?: string;
  size?: string;
  sort_order?: number;
}

interface Props {
  open: boolean;
  /** для цифр сидов и пиров с сервера */
  gameId?: number;
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
  mega: "MEGA",
  mediafire: "MediaFire",
  browser: "Скачивание на сайте",
};

/** Подпись источника: у прямой ссылки и «сайта» — название сервиса из адреса */
function sourceLabel(kind: string, url?: string): string {
  if ((kind === 'direct' || kind === 'browser') && url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      if (/gofile/.test(host)) return 'Gofile — скачивание на сайте';
      if (/m[i1]xdr/.test(host)) return 'Mixdrop — скачивание на сайте';
      if (/mega\./.test(host)) return 'MEGA';
      if (/mediafire/.test(host)) return 'MediaFire';
      if (kind === 'browser') return `${host} — скачивание на сайте`;
    } catch { /* некорректная ссылка — общая подпись */ }
  }
  return KIND_LABEL[kind] ?? kind;
}

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} ч назад` : `${Math.round(h / 24)} дн назад`;
};

/** Сиды и пиры источника: живые данные лаунчера, иначе последние с сервера, иначе «нет данных». */
function Health({ live, server, checking }: { live?: LiveHealth; server?: SourceHealth; checking: boolean }) {
  const fresh = live && live.trackers > 0 ? live : null;
  const stored = !fresh && server && server.trackers > 0 ? server : null;
  const data = fresh || stored;
  const connected = live?.connected;
  if (!data && !connected) {
    return checking
      ? <span className="tl-term text-[14px] text-[var(--muted-2)] flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> проверка</span>
      : <span className="tl-term text-[14px] text-[var(--muted-2)]" title="Ни один трекер раздачи не ответил">нет данных</span>;
  }
  const alive = (data?.seeds ?? 0) > 0 || (connected?.seeds ?? 0) > 0;
  return (
    <span className="flex flex-col items-end gap-0.5">
      {data && (
        <span
          className="tl-term text-[15px] flex items-center gap-1.5"
          style={{ color: alive ? 'var(--green2)' : 'var(--muted-2)' }}
          title="Сиды — раздают целиком, пиры — качают. По данным трекеров раздачи"
        >
          <Users size={12} /> {data.seeds} сид. · {data.peers} пир.
        </span>
      )}
      {connected && (
        <span className="tl-term text-[13px] text-accent flex items-center gap-1" title="Раздача уже качается: подключено сейчас">
          <Radio size={11} /> подключено {connected.seeds} / {connected.peers}
        </span>
      )}
      {data && (
        <span className="tl-term text-[12px] text-[var(--muted-2)]">
          {fresh ? (checking ? 'обновляется…' : 'сейчас') : stored?.checked_at ? ago(stored.checked_at) : ''}
        </span>
      )}
    </span>
  );
}

// Модальное окно выбора источника скачивания в стиле TL: панель с уголками,
// пиксельный заголовок, крупные квадратные строки. Длинные названия не обрезаются:
// через секунду они начинают прокручиваться (MarqueeText).
// Сиды и пиры: сразу — последние данные сервера (опрос трекеров раз в 30 минут), затем лаунчер
// сам спрашивает трекеры раздачи (scrape, без скачивания) и обновляет цифры раз в 30 секунд.
const SourcePickerModal = ({ open, gameId, gameTitle, sources, onPick, onClose }: Props) => {
  const [server, setServer] = useState<SourceHealth[]>([]);
  const [live, setLive] = useState<Record<string, LiveHealth>>({});
  const [checking, setChecking] = useState(false);

  const magnets = sources
    .filter((s) => (s.kind || 'torrent') === 'torrent' && s.magnet_uri)
    .map((s) => s.magnet_uri as string);
  const magnetKey = magnets.join('|');

  useEffect(() => {
    if (!open || !gameId || !magnets.length) return;
    let alive = true;
    getTorrentHealth(gameId).then((list) => alive && setServer(list)).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gameId, magnetKey]);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!open || !electron?.torrentHealth || !magnets.length) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      setChecking(true);
      try {
        const res: Record<string, LiveHealth> = await electron.torrentHealth(magnets);
        if (alive && res) setLive(res);
      } catch { /* остаются данные сервера */ }
      if (!alive) return;
      setChecking(false);
      timer = setTimeout(poll, LIVE_REFRESH_MS);
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); setChecking(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, magnetKey]);

  const serverFor = (s: DownloadSource) => server.find((h) => (s.id ? h.source_id === s.id : h.source_id === 0));

  if (!open) return null;

  // Портал в body: иначе фиксированный оверлей ограничивается
  // родителем с transform/overflow и не покрывает весь экран.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="tl-panel w-full max-w-3xl p-7 max-h-[88vh] overflow-hidden flex flex-col animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h3 className="tl-head text-[13px] font-bold uppercase tracking-[0.14em] text-white" style={{ textShadow: 'var(--glow-sm)' }}>
              Выбор источника
            </h3>
            <MarqueeText text={gameTitle} className="tl-term text-[17px] tl-muted mt-2" />
          </div>
          <button onClick={onClose} className="tl-muted hover:text-white transition-colors cursor-pointer shrink-0" title="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="custom-scrollbar space-y-2.5 overflow-y-auto pr-1">
          {sources.map((s, i) => {
            const kind = s.kind || 'torrent';
            const isTorrent = kind === 'torrent';
            return (
              <button
                key={s.id ?? i}
                onClick={() => onPick(s)}
                className="w-full text-left px-4 py-4 border border-[var(--line)] hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.05)] transition-colors flex items-center justify-between gap-4 cursor-pointer"
              >
                <span className="flex items-center gap-4 min-w-0 flex-1">
                  <span className="w-11 h-11 shrink-0 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.06)] flex items-center justify-center">
                    {isTorrent ? (
                      <Download size={18} className="text-accent" />
                    ) : (
                      <Globe size={18} className="text-violet" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <MarqueeText
                      text={s.label || `Источник ${i + 1}`}
                      className="tl-head text-[12px] font-bold uppercase tracking-[0.12em] text-white"
                    />
                    <MarqueeText text={sourceLabel(kind, s.url)} className="tl-term text-[15px] tl-muted mt-1" />
                  </span>
                </span>

                <span className="flex items-center gap-3 shrink-0">
                  {s.size && (
                    <span className="tl-term text-[15px] text-[var(--muted-2)] flex items-center gap-1.5">
                      <HardDrive size={13} /> {s.size}
                    </span>
                  )}
                  {isTorrent ? (
                    <Health live={s.magnet_uri ? live[s.magnet_uri] : undefined} server={serverFor(s)} checking={checking} />
                  ) : (
                    <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)] border border-[var(--line)] px-2 py-1">
                      сервис
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SourcePickerModal;
