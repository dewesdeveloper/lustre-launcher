import { useEffect, useState, type CSSProperties } from 'react';
import { Loader2, Minus, Search, Settings, Square, UserPlus, X } from 'lucide-react';
import api from '../../api';
import { connectChat, disconnectChat } from '../../api/chat';
import { getPresence, initPresence, usePresenceVersion } from '../../api/presence';
import { openChatWindow } from '../../utils/openChat';
import { useSearchHotkey } from '../../utils/searchHotkey';
import { StandaloneFriendRow, type FriendEntry } from './components/StandaloneFriendRow';

type WindowBridge = {
  minimize?: () => void;
  maximize?: () => void;
  close?: () => void;
  openSettings?: () => void;
  overlayOpenInLauncher?: (path: string) => void;
};
const bridge = (window as { electron?: WindowBridge }).electron;

const REFRESH_MS = 30_000;
const CTRL = 'h-full flex items-center justify-center text-[var(--muted-2)] hover:text-white transition-colors';

/** Заголовок отдельного окна: перетаскивается мышью, справа — свернуть/развернуть/закрыть */
function TitleBar() {
  return (
    <div style={{ WebkitAppRegion: 'drag' } as CSSProperties} className="relative flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] bg-black/60 px-3">
      <div className="flex items-center gap-2">
        <span className="flex h-4 w-4 items-center justify-center border border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.2)] text-[10px] font-black text-[var(--pink)]">H</span>
        <span className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">Lustre Social</span>
      </div>
      <div style={{ WebkitAppRegion: 'no-drag' } as CSSProperties} className="flex h-full items-stretch">
        <button type="button" aria-label="Свернуть" onClick={() => bridge?.minimize?.()} className={`${CTRL} w-11 hover:bg-[rgb(var(--accent-rgb)/.12)]`}><Minus size={15} /></button>
        <button type="button" aria-label="Развернуть" onClick={() => bridge?.maximize?.()} className={`${CTRL} w-11 hover:bg-[rgb(var(--accent-rgb)/.12)]`}><Square size={12} /></button>
        <button type="button" aria-label="Закрыть" onClick={() => bridge?.close?.()} className={`${CTRL} w-12 hover:bg-[#ff003c]`}><X size={16} /></button>
      </div>
    </div>
  );
}

type Props = {
  /** внутри другого экрана (игровой оверлей): без оконной шапки, по высоте родителя */
  embedded?: boolean;
  /** клик по другу; по умолчанию открывает окно чата */
  onOpenFriend?: (userId: number) => void;
};

/** Список друзей: отдельное окно «Друзья» лаунчера или панель игрового оверлея. */
export default function FriendsStandalone({ embedded = false, onOpenFriend }: Props = {}) {
  const [friends, setFriends] = useState<FriendEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const openFriend = onOpenFriend ?? openChatWindow;

  useSearchHotkey(); // Ctrl+F — фокус на поиск
  usePresenceVersion(); // перерисовка при смене чьего-либо статуса

  useEffect(() => {
    // у окна своё WS-подключение, чтобы статусы приходили сразу
    connectChat();
    initPresence();
    const pull = () => api.get<FriendEntry[]>('/friends/list').then(
      (res) => setFriends(res.data),
      (err) => {
        console.error('Не удалось загрузить друзей', err);
        setFriends((prev) => prev ?? []);
      },
    );
    pull();
    const timer = setInterval(pull, REFRESH_MS);
    return () => { clearInterval(timer); disconnectChat(); };
  }, []);

  const needle = query.toLowerCase();
  const matching = (friends ?? []).filter((f) => f.friend_details.profile.display_name.toLowerCase().includes(needle));
  const online = matching.filter((f) => getPresence(f.friend_details.id));
  const offline = matching.filter((f) => !getPresence(f.friend_details.id));

  const group = (title: string, list: FriendEntry[], live: boolean) => (
    <div className="space-y-2">
      <div className={`tl-head mb-1 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] ${live ? 'text-[var(--green2)]' : 'text-[var(--muted-2)]'}`}>
        {live && <span className="h-1.5 w-1.5 animate-pulse bg-[var(--green2)]" />}
        {title} — {list.length}
      </div>
      {list.map((f) => <StandaloneFriendRow key={f.id} friend={f} onOpen={openFriend} />)}
    </div>
  );

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen'} flex w-full select-none flex-col overflow-hidden border border-[var(--line)] bg-main-bg text-pearl`}>
      {!embedded && (
        <>
          <TitleBar />
          <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
            <div className="tl-sec-head" style={{ marginBottom: 0 }}>
              <span className="bar" />
              <h2>Друзья</h2>
            </div>
            <div className="flex gap-3 text-[var(--muted)]">
              <button type="button" title="Добавить друга" aria-label="Добавить друга" onClick={() => bridge?.overlayOpenInLauncher?.('/friends/add')} className="cursor-pointer transition-colors hover:text-white"><UserPlus size={16} /></button>
              <button type="button" title="Настройки" aria-label="Настройки" onClick={() => bridge?.openSettings?.()} className="cursor-pointer transition-colors hover:text-white"><Settings size={16} /></button>
            </div>
          </div>
        </>
      )}

      <div className="border-y border-[var(--line)] bg-black/20 px-3 py-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-2)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-search-hotkey="page"
            placeholder="ПОИСК ПО НИКУ..."
            className="tl-field font-bold uppercase"
            style={{ fontSize: 10, letterSpacing: '0.1em', padding: '8px 10px 8px 30px' }}
          />
        </div>
      </div>

      <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-3">
        {friends === null ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-accent" /></div>
        ) : (
          <>
            {group('В сети', online, true)}
            {group('Не в сети', offline, false)}
            {friends.length === 0 && (
              <div className="tl-panel py-10 text-center">
                <p className="tl-term tl-muted text-[15px] uppercase tracking-[0.1em]">Список друзей пуст</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
