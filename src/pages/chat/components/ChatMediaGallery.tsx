import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, Play, X } from 'lucide-react';
import { getConversationMedia, type ChatMessage, type ConversationMediaKind } from '../../../api/chat';
import { formatDay, formatTime } from './chatUtils';

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  const k = 1024;
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)));
  return `${(n / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

const PAGE = 50;

interface ChatMediaGalleryProps {
  conversationId: number;
  kind: ConversationMediaKind;
  onClose: () => void;
}

const TITLES: Record<ConversationMediaKind, string> = { image: 'Фото', video: 'Видео', file: 'Файлы' };

/** Галерея медиа диалога: фото сеткой, видео/файлы списком. Оверлей поверх панели профиля. */
export const ChatMediaGallery = ({ conversationId, kind, onClose }: ChatMediaGalleryProps) => {
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (offset: number) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const res = await getConversationMedia(conversationId, kind, PAGE, offset);
      setTotal(res.total);
      setItems((prev) => (offset === 0 ? res.list : [...prev, ...res.list]));
    } catch {
      if (offset === 0) {
        setItems([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conversationId, kind]);

  useEffect(() => {
    setItems([]);
    void load(0);
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rest = total - items.length;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="tl-panel w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)] shrink-0">
          <span className="tl-head text-[10px] uppercase tracking-[0.2em] text-white">
            {TITLES[kind]} — {total}
          </span>
          <button onClick={onClose} title="Закрыть" className="p-1.5 text-pearl/70 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-pearl/60"><Loader2 size={20} className="animate-spin" /></div>
          ) : items.length === 0 ? (
            <p className="text-center tl-term text-[13px] tl-muted py-14">Нет материалов</p>
          ) : kind === 'image' ? (
            <div className="grid grid-cols-4 gap-1 p-3">
              {items.map((m) => (
                <a
                  key={m.id}
                  href={m.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="aspect-square bg-black border border-[var(--line)] hover:border-accent transition-colors overflow-hidden"
                  title={m.attachment_name || undefined}
                >
                  <img
                    src={m.attachment_url}
                    alt={m.attachment_name || 'Фото'}
                    loading="lazy"
                    draggable={false}
                    className="w-full h-full object-cover select-none"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {items.map((m) => (
                <a
                  key={m.id}
                  href={m.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[rgb(var(--accent-rgb)/.10)] transition-colors"
                >
                  <span className="w-9 h-9 shrink-0 border border-[var(--line)] bg-white/[0.04] flex items-center justify-center text-pearl/60">
                    {kind === 'video' ? <Play size={15} /> : <FileText size={15} className="text-violet" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block tl-term text-[13px] text-pearl/85 truncate">{m.attachment_name || 'Файл'}</span>
                    <span className="block tl-head text-[10px] uppercase tracking-[0.12em] text-pearl/65">
                      {formatBytes(m.attachment_size)}{m.attachment_size ? ' · ' : ''}{formatDay(m.created_at)} {formatTime(m.created_at)}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}

          {!loading && rest > 0 && (
            <div className="p-3 flex justify-center">
              <button
                onClick={() => void load(items.length)}
                disabled={loadingMore}
                className="tl-btn ghost px-4 py-2 text-[12px] disabled:opacity-50"
              >
                {loadingMore ? 'Загрузка…' : `Показать ещё (осталось ${rest})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
