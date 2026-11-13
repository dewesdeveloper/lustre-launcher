import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Reply, Pencil, Pin, PinOff, Copy, Forward, Trash2, CheckCircle, ChevronDown, Link2 } from 'lucide-react';
import { ALL_REACTIONS, QUICK_REACTIONS } from '../../../api/chat';

export interface MessageMenuState {
  id: number;
  x: number;
  y: number;
}

interface MessageContextMenuProps {
  x: number;
  y: number;
  mine: boolean;
  isDeleted: boolean;
  hasText: boolean;
  canEdit: boolean;
  canPin: boolean;
  pinned?: boolean;
  canDeleteForAll: boolean;
  /** Реакции, уже поставленные мной — подсвечиваются в полосе */
  myReactions?: string[];
  /** Ссылка на вложение (копировать ссылку) */
  attachmentUrl?: string;
  onReact?: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onPin: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
  onSelect: () => void;
  onClose: () => void;
}

/** Контекстное меню сообщения (ПКМ): полоса реакций сверху (как в Telegram) + действия. */
export const MessageContextMenu = ({
  x, y, isDeleted, hasText, canEdit, canPin, pinned, myReactions = [], attachmentUrl,
  onReact, onReply, onEdit, onPin, onCopy, onForward, onDelete, onSelect, onClose,
}: MessageContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [allReactions, setAllReactions] = useState(false);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  // прижимаем меню к краям окна по реальному размеру
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y, allReactions]);

  const item = 'w-full flex items-center gap-2.5 px-3 py-[7px] tl-term text-[15px] text-pearl/85 hover:bg-[rgb(var(--accent-rgb)/.16)] hover:text-white transition-colors text-left';
  const sep = <div className="h-px bg-[var(--line)] my-1" />;
  const reactions = allReactions ? ALL_REACTIONS : QUICK_REACTIONS;

  return (
    <div ref={ref} style={{ left: pos.left, top: pos.top }} className="fixed z-[90] flex flex-col gap-1.5 lc-pop">
      {!isDeleted && onReact && (
        <div className={`bg-[#0d0a14] border border-[var(--line)] shadow-[0_8px_28px_rgba(0,0,0,.6)] p-1 ${allReactions ? 'w-[296px]' : ''}`}>
          <div className={`flex ${allReactions ? 'flex-wrap' : ''} items-center gap-0.5`}>
            {reactions.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { onReact(e); onClose(); }}
                className={`w-8 h-8 text-[18px] transition-transform hover:scale-125 ${myReactions.includes(e) ? 'bg-[rgb(var(--accent-rgb)/.3)]' : 'hover:bg-[rgb(var(--accent-rgb)/.16)]'}`}
              >
                {e}
              </button>
            ))}
            {!allReactions && (
              <button type="button" onClick={() => setAllReactions(true)} title="Все реакции" className="w-7 h-8 flex items-center justify-center text-pearl/72 hover:text-accent">
                <ChevronDown size={15} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="w-[210px] bg-[#0d0a14] border border-[var(--line)] shadow-[0_8px_28px_rgba(0,0,0,.6)] py-1">
        {!isDeleted && (
          <button className={item} onClick={onReply}>
            <Reply size={15} className="text-pearl/72" /> Ответить
          </button>
        )}
        {canEdit && (
          <button className={item} onClick={onEdit}>
            <Pencil size={15} className="text-pearl/72" /> Изменить
          </button>
        )}
        {canPin && !isDeleted && (
          <button className={item} onClick={onPin}>
            {pinned ? <PinOff size={15} className="text-pearl/72" /> : <Pin size={15} className="text-pearl/72" />}
            {pinned ? 'Открепить' : 'Закрепить'}
          </button>
        )}
        {!isDeleted && hasText && (
          <button className={item} onClick={onCopy}>
            <Copy size={15} className="text-pearl/72" /> Копировать текст
          </button>
        )}
        {!isDeleted && attachmentUrl && (
          <button className={item} onClick={() => { navigator.clipboard?.writeText(attachmentUrl).catch(() => {}); onClose(); }}>
            <Link2 size={15} className="text-pearl/72" /> Копировать ссылку
          </button>
        )}
        {!isDeleted && (
          <button className={item} onClick={onForward}>
            <Forward size={15} className="text-pearl/72" /> Переслать
          </button>
        )}
        <button className={item} onClick={onSelect}>
          <CheckCircle size={15} className="text-pearl/72" /> Выделить
        </button>
        {sep}
        <button className={`${item} !text-red-400/90 hover:!text-red-300`} onClick={onDelete}>
          <Trash2 size={15} /> Удалить
        </button>
      </div>
    </div>
  );
};
