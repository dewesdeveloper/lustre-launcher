import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, MessageSquareDashed, Upload } from 'lucide-react';
import type { ChatController } from '../useChatController';
import { buildFeed, type Msg } from '../model';
import { MessageBubble, type BubbleCtx } from './MessageBubble';
import { CountBadge } from './ui';

interface Props {
  ctl: ChatController;
  highlight?: string;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onContext: (m: Msg, x: number, y: number) => void;
  onReply: (m: Msg) => void;
  onOpenMedia: (m: Msg) => void;
  onCallBack: () => void;
  onOpenProfile: (userId: number) => void;
  onDropFiles: (files: File[]) => void;
}

const NEAR_TOP = 400;
const AT_BOTTOM = 80;

/**
 * Лента сообщений: подгрузка истории при прокрутке вверх с сохранением позиции,
 * «прилипание» к низу, переход к сообщению с подсветкой, кнопка «вниз» со счётчиком,
 * перетаскивание файлов.
 */
export function MessageFeed({
  ctl, highlight, selectedIds, onToggleSelect, onContext, onReply, onOpenMedia, onCallBack, onOpenProfile, onDropFiles,
}: Props) {
  const t = ctl.thread;
  const key = ctl.activeKey;
  const messages = t?.messages ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevInfo = useRef<{ key: string | null; firstId?: number; lastId?: number; height: number; count: number }>({ key: null, height: 0, count: 0 });
  const [showFab, setShowFab] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  const rows = useMemo(() => buildFeed(messages, t?.unreadFromId ?? null), [messages, t?.unreadFromId]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Позиционирование после изменения ленты (до отрисовки — без «прыжков»)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevInfo.current;
    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;

    if (prev.key !== key) {
      // новый чат: к фокусу (непрочитанные) или вниз
      atBottom.current = true;
      setNewBelow(0);
      setShowFab(false);
      if (!t?.focus) scrollToBottom();
    } else if (messages.length > prev.count && firstId !== prev.firstId && lastId === prev.lastId) {
      // подгрузили старую историю сверху — держим позицию
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (lastId !== prev.lastId && messages.length >= prev.count) {
      const last = messages[messages.length - 1];
      if (last && (atBottom.current || last.sender_id === ctl.myId)) scrollToBottom(prev.count > 0);
      else if (last && last.kind !== 'call') setNewBelow((n) => n + 1);
    }
    prevInfo.current = { key, firstId, lastId, height: el.scrollHeight, count: messages.length };
  });

  // Переход к сообщению (цитата, закреп, поиск, «непрочитанные»)
  useEffect(() => {
    if (!t?.focus) return;
    const id = t.focus.id;
    const raf = requestAnimationFrame(() => {
      const box = scrollRef.current;
      const el = box?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
      if (!box || !el) return;
      // считаем вручную: scrollIntoView прокручивает и предков (всё окно уезжает вверх)
      const cr = box.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const delta = er.top - cr.top;
      box.scrollTop += t.unreadFromId === id ? delta - 56 : delta - (cr.height - er.height) / 2;
      if (t.unreadFromId !== id) {
        setFlashId(id);
        setTimeout(() => setFlashId((x) => (x === id ? null : x)), 1700);
      }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.focus?.nonce]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !t) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = fromBottom < AT_BOTTOM;
    setShowFab(fromBottom > 600 || t.hasNewer);
    if (atBottom.current) setNewBelow(0);
    if (el.scrollTop < NEAR_TOP && t.hasOlder && !t.loadingOlder && t.loaded) ctl.loadOlder();
    if (fromBottom < NEAR_TOP && t.hasNewer && !t.loadingNewer) ctl.loadNewer();
  };

  const onFab = async () => {
    if (t?.hasNewer) await ctl.jumpToLatest();
    requestAnimationFrame(() => scrollToBottom(true));
    setNewBelow(0);
  };

  // ---- контекст для пузырей ----
  const membersById = useMemo(() => new Map((t?.members ?? []).map((u) => [u.id, u])), [t?.members]);
  const msgById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const item = ctl.activeItem;

  const ctx: BubbleCtx = {
    myId: ctl.myId,
    isGroup: item?.ref.kind === 'group',
    selecting: selectedIds.size > 0,
    highlight,
    senderName: (id) => {
      if (id === ctl.myId) return 'Вы';
      const u = membersById.get(id);
      if (u) return u.display_name || u.username;
      return item?.ref.kind === 'dm' ? item.title : 'Участник';
    },
    senderAvatar: (id) => membersById.get(id)?.avatar_url || (item?.ref.kind === 'dm' && id === item.peerId ? item.avatarUrl : undefined),
    findMsg: (id) => msgById.get(id) ?? t?.pinned.find((p) => p.id === id),
    isRead: ctl.isReadByOthers,
    onJump: ctl.jumpTo,
    onReply,
    onReact: (m, e) => ctl.react(m.id, e),
    onContext,
    onToggleSelect,
    onOpenMedia,
    onCallBack,
    onOpenProfile,
  };

  // ---- перетаскивание файлов ----
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');

  return (
    <div
      className="relative flex-1 min-h-0 flex flex-col"
      onDragEnter={(e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragging(true); }}
      onDragOver={(e) => { if (hasFiles(e)) e.preventDefault(); }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onDropFiles(files);
      }}
    >
      <div ref={scrollRef} onScroll={onScroll} className="lc-feed flex-1 overflow-y-auto custom-scrollbar py-3">
        {t?.loadingOlder && (
          <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-pearl/70" /></div>
        )}
        {t && t.loaded && !t.hasOlder && messages.length > 0 && (
          <div className="flex justify-center pb-3">
            <span className="tl-head text-[10px] uppercase tracking-[0.2em] text-pearl/60">Начало переписки</span>
          </div>
        )}

        {(!t || (t.loading && !messages.length)) && (
          <div className="h-full flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-accent/70" />
          </div>
        )}

        {t?.loaded && !t.loading && messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
            <span className="w-16 h-16 flex items-center justify-center border border-[var(--line)] bg-[var(--panel)] text-accent shadow-[var(--glow-sm)]">
              <MessageSquareDashed size={28} />
            </span>
            <p className="tl-head text-[10px] uppercase tracking-[0.2em] text-pearl/70">Здесь пока пусто</p>
            <p className="tl-term text-[15px] tl-muted">Отправьте первое сообщение или стикер-эмодзи 👋</p>
          </div>
        )}

        {rows.map((r) => {
          if (r.type === 'day') {
            return (
              <div key={r.key} className="lc-day flex justify-center my-2 pointer-events-none">
                <span className="tl-head text-[10px] uppercase tracking-[0.2em] text-pearl/70 border border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur px-3 py-1">
                  {r.label}
                </span>
              </div>
            );
          }
          if (r.type === 'unread') {
            return (
              <div key={r.key} className="flex items-center gap-3 my-3 px-4">
                <span className="flex-1 h-px bg-[var(--line-2)]" />
                <span className="tl-head text-[10px] uppercase tracking-[0.2em] text-accent">Непрочитанные сообщения</span>
                <span className="flex-1 h-px bg-[var(--line-2)]" />
              </div>
            );
          }
          const m = r.msg!;
          return (
            <MessageBubble
              key={r.key}
              m={m}
              first={!!r.first}
              last={!!r.last}
              selected={selectedIds.has(m.id)}
              flash={flashId === m.id}
              ctx={ctx}
            />
          );
        })}

        {t?.loadingNewer && (
          <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-pearl/70" /></div>
        )}
      </div>

      {(showFab || newBelow > 0) && (
        <button
          onClick={onFab}
          title="Вниз"
          className="lc-pop absolute right-5 bottom-4 w-11 h-11 flex items-center justify-center border border-[var(--line-2)] bg-[var(--panel)] text-pearl/80 hover:text-accent hover:shadow-[var(--glow)] transition-colors"
        >
          <ChevronDown size={20} />
          {newBelow > 0 && <span className="absolute -top-2 -right-2"><CountBadge n={newBelow} /></span>}
        </button>
      )}

      {dragging && (
        <div className="lc-drop absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <Upload size={34} className="text-accent" />
          <p className="tl-head text-[11px] uppercase tracking-[0.2em] text-white">Отпустите, чтобы отправить</p>
          <p className="tl-term text-[15px] tl-muted">Фото, видео и файлы</p>
        </div>
      )}
    </div>
  );
}
