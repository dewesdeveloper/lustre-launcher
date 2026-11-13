import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Minus, Square, X, MessageSquare, Phone, Video, Search, PanelRight, Pin, ChevronUp, ChevronDown, Loader2,
} from 'lucide-react';
import ProBadge from '../../../components/ProBadge';
import type { ChatController } from '../useChatController';
import { type Msg, fmtClock, fmtListTime, msgPreview, pluralRu } from '../model';
import { formatLastSeen } from './chatUtils';
import { ChatAvatar, IconBtn } from './ui';
import { TypingDots } from './ChatSidebar';

const electron = (window as any).electron;

const winBtn = 'w-8 h-7 bg-white/[0.04] border border-[var(--line)] hover:bg-white/[0.08] text-pearl/72 hover:text-pearl flex items-center justify-center transition-colors';

/** Полоса окна (frameless Electron): перетаскивание + кнопки окна. */
export const ChatTitleBar = ({ unread }: { unread: number }) => (
  <div
    className="flex items-center justify-between px-3 h-9 bg-[var(--bg2)] border-b border-[var(--line)] shrink-0"
    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
  >
    <div className="flex items-center gap-2 pointer-events-none">
      <MessageSquare size={13} className="text-accent" />
      <span className="tl-head text-[10px] uppercase tracking-[0.25em] text-pearl/70">Сообщения</span>
      {unread > 0 && <span className="tl-num text-[10px] px-1.5 bg-accent text-black">{unread}</span>}
    </div>
    <div className="flex items-center gap-1.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      {electron && (
        <>
          <button onClick={() => electron?.minimize?.()} className={winBtn} title="Свернуть"><Minus size={12} /></button>
          <button onClick={() => electron?.maximize?.()} className={winBtn} title="Развернуть"><Square size={10} /></button>
        </>
      )}
      <button
        onClick={() => (electron ? electron?.close?.() : window.close())}
        title="Закрыть"
        className="w-8 h-7 bg-white/[0.04] border border-[var(--line)] hover:bg-red-600 hover:border-red-600 text-pearl/72 hover:text-white flex items-center justify-center transition-colors"
      ><X size={12} /></button>
    </div>
  </div>
);

interface HeaderProps {
  ctl: ChatController;
  searchOpen: boolean;
  infoOpen: boolean;
  onToggleSearch: () => void;
  onToggleInfo: () => void;
  onCall: (withVideo: boolean) => void;
}

export function ThreadHeader({ ctl, searchOpen, infoOpen, onToggleSearch, onToggleInfo, onCall }: HeaderProps) {
  const item = ctl.activeItem;
  if (!item) return null;
  const isGroup = item.ref.kind === 'group';
  const typing = ctl.typing[item.key];
  const online = item.peerId ? ctl.onlineIds.has(item.peerId) : false;
  const playing = item.peerId ? ctl.playing.get(item.peerId) : undefined;
  const members = ctl.thread?.members ?? [];
  const onlineCount = members.filter((m) => m.id === ctl.myId || ctl.onlineIds.has(m.id)).length;

  let status: React.ReactNode;
  if (typing) {
    status = <span className="text-accent">{isGroup ? `${typing.name} печатает` : 'печатает'}<TypingDots /></span>;
  } else if (isGroup) {
    const n = members.length || item.membersCount || 0;
    status = (
      <span className="tl-muted">
        {n} {pluralRu(n, 'участник', 'участника', 'участников')}
        {onlineCount > 0 && members.length > 0 && <>, <span className="text-[var(--green2)]">{onlineCount} в сети</span></>}
      </span>
    );
  } else if (playing) {
    status = <span className="text-accent">Играет в {playing}</span>;
  } else if (online) {
    status = <span className="text-[var(--green2)]">в сети</span>;
  } else {
    const ls = formatLastSeen(item.peerId ? ctl.lastSeen.get(item.peerId) : undefined);
    status = <span className="tl-muted">{ls ? `был(а) ${ls}` : 'не в сети'}</span>;
  }

  return (
    <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--line)] bg-[var(--panel)] shrink-0">
      <button onClick={onToggleInfo} className="flex items-center gap-3 min-w-0 flex-1 text-left group/h" title={isGroup ? 'Информация о группе' : 'Профиль'}>
        <ChatAvatar src={item.avatarUrl} size={38} online={online} playing={!!playing} group={isGroup} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="tl-head text-[11px] uppercase tracking-[0.12em] text-white truncate group-hover/h:text-accent transition-colors">{item.title}</span>
            {item.isPro && <ProBadge size="sm" />}
          </span>
          <span className="block tl-term text-[14px] leading-tight truncate">{status}</span>
        </span>
      </button>
      <div className="flex items-center gap-1">
        <IconBtn title="Поиск по чату (Ctrl+F)" onClick={onToggleSearch} active={searchOpen}><Search size={15} /></IconBtn>
        <IconBtn title={isGroup ? 'Групповой звонок' : 'Аудиозвонок'} onClick={() => onCall(false)}><Phone size={15} /></IconBtn>
        {!isGroup && <IconBtn title="Видеозвонок" onClick={() => onCall(true)}><Video size={15} /></IconBtn>}
        <IconBtn title={isGroup ? 'Информация о группе' : 'Профиль'} onClick={onToggleInfo} active={infoOpen}><PanelRight size={15} /></IconBtn>
      </div>
    </div>
  );
}

/**
 * Закреплённые сообщения: как в Telegram — показываем одно, клик переходит к нему
 * и переключает на следующее (более старое); слева — сегменты-индикатор.
 */
export function PinnedBar({ pinned, canUnpin, onJump, onUnpin }: {
  pinned: Msg[];
  canUnpin: (m: Msg) => boolean;
  onJump: (id: number) => void;
  onUnpin: (id: number) => void;
}) {
  const [idx, setIdx] = useState(0);
  const list = useMemo(() => pinned.filter((m) => !m.deleted_at), [pinned]);
  useEffect(() => { if (idx >= list.length) setIdx(0); }, [list.length, idx]);
  if (!list.length) return null;
  const cur = list[Math.min(idx, list.length - 1)];
  const segs = Math.min(list.length, 4);
  const activeSeg = list.length <= 4 ? idx : Math.floor((idx / list.length) * 4);

  return (
    <div className="flex items-center gap-3 px-4 h-11 border-b border-[var(--line)] bg-[var(--panel2)] shrink-0">
      <div className="flex flex-col gap-[2px] h-8 w-[2px] shrink-0">
        {Array.from({ length: segs }).map((_, i) => (
          <span key={i} className={`flex-1 ${i === activeSeg ? 'bg-accent shadow-[var(--glow-sm)]' : 'bg-[rgb(var(--accent-rgb)/.25)]'}`} />
        ))}
      </div>
      <button
        className="min-w-0 flex-1 text-left"
        onClick={() => { onJump(cur.id); setIdx((i) => (i + 1) % list.length); }}
        title="Перейти к сообщению"
      >
        <span className="block tl-head text-[10px] uppercase tracking-[0.16em] text-accent">
          Закреплённое сообщение{list.length > 1 ? ` #${list.length - idx}` : ''}
        </span>
        <span className="block tl-term text-[14px] text-pearl/80 truncate">{msgPreview(cur)}</span>
      </button>
      {cur.attachment_url && cur.kind === 'image' && (
        <img src={cur.attachment_url} alt="" className="w-8 h-8 object-cover border border-[var(--line)] shrink-0" />
      )}
      <Pin size={13} className="text-pearl/60 rotate-45 shrink-0" />
      {canUnpin(cur) && (
        <button onClick={() => onUnpin(cur.id)} className="text-pearl/70 hover:text-white shrink-0" title="Открепить">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** Поиск по текущему чату: результаты с сервера, навигация ↑/↓, прыжок к найденному. */
export function ChatSearchBar({ ctl, onQueryChange, onClose }: {
  ctl: ChatController;
  onQueryChange: (q: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Msg[]>([]);
  const [pos, setPos] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    onQueryChange(q);
    if (q.trim().length < 2) { setResults([]); setPos(0); return; }
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      const r = await ctl.search(q);
      if (my !== seq.current) return;
      setResults(r);
      setPos(0);
      setBusy(false);
      if (r[0]) ctl.jumpTo(r[0].id);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const go = (next: number) => {
    if (!results.length) return;
    const p = (next + results.length) % results.length;
    setPos(p);
    ctl.jumpTo(results[p].id);
  };

  const senderName = (m: Msg) => {
    if (m.sender_id === ctl.myId) return 'Вы';
    const u = ctl.thread?.members.find((x) => x.id === m.sender_id);
    return u?.display_name || u?.username || ctl.activeItem?.title || '';
  };

  return (
    <div className="relative shrink-0 border-b border-[var(--line)] bg-[var(--panel2)]">
      <div className="flex items-center gap-2 px-4 h-11">
        <Search size={14} className="text-accent shrink-0" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? pos - 1 : pos + 1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); go(pos + 1); }
            if (e.key === 'ArrowUp') { e.preventDefault(); go(pos - 1); }
          }}
          placeholder="Поиск сообщений"
          className="flex-1 bg-transparent outline-none tl-term text-[16px] text-pearl placeholder:text-pearl/60"
        />
        {busy && <Loader2 size={14} className="animate-spin text-pearl/70" />}
        {!busy && q.trim().length >= 2 && (
          <button onClick={() => setShowList((s) => !s)} className="tl-term text-[14px] text-pearl/55 hover:text-white whitespace-nowrap">
            {results.length ? `${pos + 1} из ${results.length}` : 'Не найдено'}
          </button>
        )}
        <IconBtn title="Предыдущее (↑)" onClick={() => go(pos - 1)} disabled={results.length < 2}><ChevronUp size={15} /></IconBtn>
        <IconBtn title="Следующее (↓)" onClick={() => go(pos + 1)} disabled={results.length < 2}><ChevronDown size={15} /></IconBtn>
        <IconBtn title="Закрыть (Esc)" onClick={onClose}><X size={15} /></IconBtn>
      </div>
      {showList && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 max-h-72 overflow-y-auto custom-scrollbar bg-[#0d0a14] border-b border-[var(--line)] shadow-[0_12px_28px_rgba(0,0,0,.6)]">
          {results.map((m, i) => (
            <button
              key={m.id}
              onClick={() => { setPos(i); ctl.jumpTo(m.id); setShowList(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left border-l-2 transition-colors ${
                i === pos ? 'border-accent bg-[rgb(var(--accent-rgb)/.12)]' : 'border-transparent hover:bg-white/[0.04]'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="tl-head text-[10px] uppercase tracking-[0.12em] text-pearl/80 truncate">{senderName(m)}</span>
                  <span className="tl-term text-[13px] text-pearl/65 shrink-0">{fmtListTime(m.created_at)} {fmtClock(m.created_at)}</span>
                </span>
                <span className="block tl-term text-[14px] tl-muted truncate">{msgPreview(m)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
