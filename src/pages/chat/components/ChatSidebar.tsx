import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Plus, X, Pin, Phone, Users, Trash2, CheckCheck, PinOff } from 'lucide-react';
import { useGroupActiveCall } from '../../../api/groupCallPresence';
import ProBadge from '../../../components/ProBadge';
import type { ChatController, ChatFolder } from '../useChatController';
import { type ChatItem, fmtListTime, msgPreview } from '../model';
import { ChatAvatar, CountBadge, DeliveryMark } from './ui';
import { isSearchHotkey } from '../../../utils/searchHotkey';

const FOLDERS: { id: ChatFolder; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'dm', label: 'Личные' },
  { id: 'groups', label: 'Группы' },
  { id: 'unread', label: 'Новые' },
];

interface Props {
  ctl: ChatController;
  onCreateGroup: () => void;
  onDeleteChat: (item: ChatItem) => void;
}

/** Левая колонка: поиск, папки и список чатов (как в Telegram Desktop). */
export function ChatSidebar({ ctl, onCreateGroup, onDeleteChat }: Props) {
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<ChatFolder>('all');
  const [menu, setMenu] = useState<{ item: ChatItem; x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl+F, пока чат не открыт, — фокус на поиск чатов (в открытом чате Ctrl+F ищет по
  // переписке, это обрабатывает ChatWindow). По e.code — работает и в русской раскладке.
  const hasActive = !!ctl.active;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hasActive || e.defaultPrevented || !isSearchHotkey(e)) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasActive]);

  const counts = useMemo(() => ({
    all: ctl.items.filter((i) => i.unread > 0).length,
    dm: ctl.items.filter((i) => i.ref.kind === 'dm' && i.unread > 0).length,
    groups: ctl.items.filter((i) => i.ref.kind === 'group' && i.unread > 0).length,
    unread: ctl.items.filter((i) => i.unread > 0).length,
  }), [ctl.items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ctl.items.filter((i) => {
      if (folder === 'dm' && i.ref.kind !== 'dm') return false;
      if (folder === 'groups' && i.ref.kind !== 'group') return false;
      if (folder === 'unread' && i.unread <= 0 && i.key !== ctl.activeKey) return false;
      if (!q) return true;
      return i.title.toLowerCase().includes(q) || (i.peerUsername || '').toLowerCase().includes(q);
    });
  }, [ctl.items, ctl.activeKey, folder, query]);

  return (
    <aside className="w-[300px] max-[900px]:w-[250px] shrink-0 flex flex-col border-r border-[var(--line)] bg-[var(--panel)] min-h-0">
      {/* поиск + новая группа */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <label className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pearl/65 pointer-events-none" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Enter' && visible[0]) ctl.openThread(visible[0].ref);
            }}
            placeholder="Поиск"
            className="tl-field with-icon dense w-full h-8 tl-term text-[15px]"
            style={{ paddingRight: 26 }}
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-pearl/70 hover:text-white" title="Очистить">
              <X size={12} />
            </button>
          )}
        </label>
        <button
          onClick={onCreateGroup}
          title="Новая группа"
          className="w-8 h-8 shrink-0 flex items-center justify-center border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.12)] text-accent hover:bg-[rgb(var(--accent-rgb)/.24)] hover:shadow-[var(--glow-sm)] transition-colors"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* папки */}
      <div className="flex px-3 gap-1 border-b border-[var(--line)]">
        {FOLDERS.map((f) => {
          const on = folder === f.id;
          const n = counts[f.id];
          return (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={`relative flex items-center gap-1.5 px-2 pt-1 pb-2 tl-head text-[10px] uppercase tracking-[0.14em] transition-colors ${
                on ? 'text-accent' : 'text-pearl/70 hover:text-pearl/80'
              }`}
            >
              {f.label}
              {n > 0 && f.id !== 'unread' && (
                <span className={`tl-num text-[10px] px-1 ${on ? 'bg-accent text-black' : 'bg-pearl/15 text-pearl/70'}`}>{n}</span>
              )}
              {on && <span className="absolute left-1 right-1 -bottom-px h-[2px] bg-accent shadow-[var(--glow-sm)]" />}
            </button>
          );
        })}
      </div>

      {/* список */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!ctl.listLoaded && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
            <div className="w-11 h-11 bg-white/[0.05] border border-[var(--line)]" />
            <div className="flex-1 space-y-2">
              <div className="h-2.5 w-1/2 bg-white/[0.06]" />
              <div className="h-2.5 w-3/4 bg-white/[0.04]" />
            </div>
          </div>
        ))}

        {ctl.listLoaded && visible.length === 0 && (
          <div className="px-6 py-10 text-center">
            <p className="tl-head text-[10px] uppercase tracking-[0.2em] text-pearl/70 mb-2">
              {query ? 'Ничего не найдено' : folder === 'unread' ? 'Всё прочитано' : 'Пока нет чатов'}
            </p>
            {!query && folder === 'all' && (
              <p className="tl-term text-[14px] tl-muted leading-snug">Напишите другу из профиля или создайте группу кнопкой «+»</p>
            )}
          </div>
        )}

        {visible.map((item) => (
          <ChatRow
            key={item.key}
            item={item}
            ctl={ctl}
            query={query}
            onContext={(x, y) => setMenu({ item, x, y })}
          />
        ))}
      </div>

      {menu && (
        <ChatRowMenu
          x={menu.x}
          y={menu.y}
          item={menu.item}
          pinned={ctl.pinnedChats.includes(menu.item.key)}
          onPin={() => { ctl.togglePinChat(menu.item.key); setMenu(null); }}
          onRead={() => { ctl.markRead(menu.item.ref); setMenu(null); }}
          onDelete={() => { onDeleteChat(menu.item); setMenu(null); }}
          isOwner={menu.item.ref.kind === 'group' && menu.item.ownerId === ctl.myId}
          onClose={() => setMenu(null)}
        />
      )}
    </aside>
  );
}

function ChatRow({ item, ctl, query, onContext }: {
  item: ChatItem;
  ctl: ChatController;
  query: string;
  onContext: (x: number, y: number) => void;
}) {
  const active = item.key === ctl.activeKey;
  const online = item.peerId ? ctl.onlineIds.has(item.peerId) : false;
  const playing = item.peerId ? ctl.playing.get(item.peerId) : undefined;
  const typing = ctl.typing[item.key];
  const pinned = ctl.pinnedChats.includes(item.key);
  const draft = !active ? ctl.drafts[item.key] : undefined;
  const last = item.last;
  const mine = !!last && last.sender_id === ctl.myId;

  let preview: React.ReactNode;
  if (typing) {
    preview = (
      <span className="text-accent">
        {item.ref.kind === 'group' ? `${typing.name} печатает` : 'печатает'}<TypingDots />
      </span>
    );
  } else if (draft) {
    preview = <><span className="text-red-400/90">Черновик: </span><span className="tl-muted">{draft}</span></>;
  } else if (last) {
    const prefix = mine ? 'Вы: ' : '';
    preview = (
      <>
        {prefix && <span className="text-pearl/70">{prefix}</span>}
        <span className={last.deleted_at ? 'italic tl-muted' : 'tl-muted'}>
          {msgPreview(last, { outgoing: mine, group: item.ref.kind === 'group' })}
        </span>
      </>
    );
  } else if (playing) {
    preview = <span className="text-accent">Играет в {playing}</span>;
  } else {
    preview = <span className="tl-muted">{item.ref.kind === 'group' ? `${item.membersCount ?? 0} участн.` : 'Нет сообщений'}</span>;
  }

  const inCall = !!useGroupActiveCall(item.ref.kind === 'group' ? item.ref.id : null);
  return (
    <button
      onClick={() => ctl.openThread(item.ref)}
      onContextMenu={(e) => { e.preventDefault(); onContext(e.clientX, e.clientY); }}
      className={`group/row relative w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
        active
          ? 'bg-[rgb(var(--accent-rgb)/.16)]'
          : 'hover:bg-white/[0.035]'
      }`}
    >
      {active && <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-accent shadow-[var(--glow-sm)]" />}
      <ChatAvatar src={item.avatarUrl} size={46} online={online} playing={!!playing} group={item.ref.kind === 'group'} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {item.ref.kind === 'group' && <Users size={11} className="shrink-0 text-pearl/72" />}
          <span className={`tl-head text-[10px] uppercase tracking-[0.1em] truncate ${active ? 'text-white' : 'text-pearl/85'}`}>
            {query ? <Mark text={item.title} q={query} /> : item.title}
          </span>
          {item.isPro && <ProBadge size="sm" className="shrink-0" />}
          {inCall && <span title="Идёт звонок" className="shrink-0"><Phone size={11} className="text-[var(--green2)]" /></span>}
          <span className="ml-auto flex items-center gap-1 shrink-0 tl-term text-[13px] text-pearl/65">
            {mine && last && !last.deleted_at && last.kind !== 'call' && (
              <DeliveryMark read={item.ref.kind === 'dm' ? !!last.read_at : false} className={item.ref.kind === 'group' ? 'opacity-50' : ''} />
            )}
            {last ? fmtListTime(last.created_at) : ''}
          </span>
        </span>
        <span className="flex items-center gap-2 mt-0.5">
          <span className="tl-term text-[15px] leading-tight truncate flex-1">{preview}</span>
          {item.unread > 0
            ? <CountBadge n={item.unread} />
            : pinned ? <Pin size={11} className="shrink-0 text-pearl/65 rotate-45" /> : null}
        </span>
      </span>
    </button>
  );
}

function Mark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i === -1 || !q.trim()) return <>{text}</>;
  const n = q.trim().length;
  return <>{text.slice(0, i)}<span className="text-accent">{text.slice(i, i + n)}</span>{text.slice(i + n)}</>;
}

export function TypingDots() {
  return (
    <span className="inline-flex gap-[2px] ml-1 align-middle">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] h-[3px] bg-current animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

function ChatRowMenu({ x, y, item, pinned, isOwner, onPin, onRead, onDelete, onClose }: {
  x: number; y: number; item: ChatItem; pinned: boolean; isOwner: boolean;
  onPin: () => void; onRead: () => void; onDelete: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 140);
  const row = 'w-full flex items-center gap-2.5 px-3 py-2 tl-term text-[15px] text-pearl/85 hover:bg-[rgb(var(--accent-rgb)/.16)] hover:text-white transition-colors text-left';
  return (
    <div ref={ref} style={{ left, top, width: 210 }} className="fixed z-[90] bg-[#0d0a14] border border-[var(--line)] shadow-[0_8px_28px_rgba(0,0,0,.6)] py-1">
      <button className={row} onClick={onPin}>
        {pinned ? <PinOff size={14} className="text-pearl/72" /> : <Pin size={14} className="text-pearl/72" />}
        {pinned ? 'Открепить' : 'Закрепить'}
      </button>
      {item.unread > 0 && (
        <button className={row} onClick={onRead}>
          <CheckCheck size={14} className="text-pearl/72" /> Отметить прочитанным
        </button>
      )}
      <div className="h-px bg-[var(--line)] my-1" />
      <button className={`${row} hover:!text-red-400`} onClick={onDelete}>
        <Trash2 size={14} className="text-pearl/72" />
        {item.ref.kind === 'group' ? (isOwner ? 'Удалить группу…' : 'Скрыть группу…') : 'Удалить чат…'}
      </button>
    </div>
  );
}
