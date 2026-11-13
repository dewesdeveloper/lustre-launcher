import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X, Reply, Forward } from 'lucide-react';
import type { Msg } from '../model';
import { fmtClock, fmtDayDivider } from '../model';

/** Полноэкранный просмотр фото/видео чата: ←/→ по медиа ленты, Esc — закрыть. */
export function MediaViewer({ start, messages, senderName, onClose, onReply, onForward }: {
  start: Msg;
  messages: Msg[];
  senderName: (id: number) => string;
  onClose: () => void;
  onReply: (m: Msg) => void;
  onForward: (m: Msg) => void;
}) {
  const media = useMemo(
    () => messages.filter((m) => (m.kind === 'image' || m.kind === 'video') && m.attachment_url && !m.deleted_at),
    [messages],
  );
  const [idx, setIdx] = useState(() => Math.max(0, media.findIndex((m) => m.id === start.id)));
  const cur = media[idx] ?? start;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(media.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [media.length, onClose]);

  const btn = 'w-9 h-9 flex items-center justify-center text-pearl/60 hover:text-white hover:bg-white/10 transition-colors';

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/92 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex items-center gap-3 px-4 h-14 shrink-0">
        <span className="min-w-0 flex-1">
          <span className="block tl-head text-[10px] uppercase tracking-[0.14em] text-white truncate">{senderName(cur.sender_id)}</span>
          <span className="block tl-term text-[14px] tl-muted">{fmtDayDivider(cur.created_at)}, {fmtClock(cur.created_at)}{media.length > 1 ? ` · ${idx + 1} из ${media.length}` : ''}</span>
        </span>
        <button className={btn} title="Ответить" onClick={() => { onReply(cur); onClose(); }}><Reply size={17} /></button>
        <button className={btn} title="Переслать" onClick={() => { onForward(cur); onClose(); }}><Forward size={17} /></button>
        <a className={btn} title="Скачать" href={cur.attachment_url} download={cur.attachment_name} target="_blank" rel="noreferrer"><Download size={17} /></a>
        <button className={btn} title="Закрыть (Esc)" onClick={onClose}><X size={19} /></button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-16" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {idx > 0 && (
          <button onClick={() => setIdx(idx - 1)} className="absolute left-3 w-11 h-11 flex items-center justify-center border border-[var(--line)] bg-black/50 text-pearl/70 hover:text-accent"><ChevronLeft size={22} /></button>
        )}
        {cur.kind === 'video' ? (
          <video key={cur.id} src={cur.attachment_url} controls autoPlay className="max-w-full max-h-full border border-[var(--line)] bg-black" />
        ) : (
          <img key={cur.id} src={cur.attachment_url} alt="" className="max-w-full max-h-full object-contain border border-[var(--line)] shadow-[0_0_40px_rgb(var(--accent-rgb)/.18)]" />
        )}
        {idx < media.length - 1 && (
          <button onClick={() => setIdx(idx + 1)} className="absolute right-3 w-11 h-11 flex items-center justify-center border border-[var(--line)] bg-black/50 text-pearl/70 hover:text-accent"><ChevronRight size={22} /></button>
        )}
      </div>

      {cur.content && (
        <p className="tl-wrap shrink-0 text-center px-8 py-3 tl-term text-[16px] text-pearl/85 whitespace-pre-wrap">{cur.content}</p>
      )}
    </div>,
    document.body,
  );
}
