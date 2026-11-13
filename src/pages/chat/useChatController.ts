// Состояние и логика окна сообщений (вынесено из ChatWindow).
// Кэш открытых чатов (по ключу dm:N / group:N), постраничная история, прыжки к сообщениям,
// закрепы, реакции, черновики, прочтение, WS-события — всё здесь; компоненты только рисуют.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  connectChat, disconnectChat, onChatEvent, sendWS,
  getConversations, getMessages, getOrCreateConversation, getPinnedMessages, searchMessages,
  uploadChatAttachment, wsEditMessage, wsDeleteMessages, wsPinMessage, wsForwardDM, wsDeleteConversation,
  wsEditGroupMessage, wsDeleteGroupMessages, wsPinGroupMessage, wsForwardGroup,
  wsReactMessage, wsReactGroupMessage, wsMarkRead,
  type ChatConversation, type MessageReaction,
} from '../../api/chat';
import {
  getGroups, getGroup, getGroupMessages, getGroupPinnedMessages, searchGroupMessages, deleteGroup,
  type GroupSummary, type GroupMember,
} from '../../api/groups';
import api from '../../api';
import {
  type ThreadRef, type Msg, type ChatItem,
  threadKey, fromDM, fromGroup, dmItem, groupItem, mergeMessages,
} from './model';

export const PAGE_SIZE = 50;

export interface ThreadData {
  messages: Msg[];
  loaded: boolean;
  loading: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
  /** Есть ли что подгружать вверх */
  hasOlder: boolean;
  /** Открыто «окно» в середине истории (после прыжка) — снизу есть ещё сообщения */
  hasNewer: boolean;
  pinned: Msg[];
  /** С какого сообщения показывать плашку «Непрочитанные сообщения» */
  unreadFromId: number | null;
  /** Участники группы (с отметками прочтения) */
  members: GroupMember[];
  /** Запрос ленте: прокрутить к сообщению и подсветить (nonce — чтобы повторять) */
  focus: { id: number; nonce: number } | null;
}

const emptyThread = (): ThreadData => ({
  messages: [], loaded: false, loading: false, loadingOlder: false, loadingNewer: false,
  hasOlder: true, hasNewer: false, pinned: [], unreadFromId: null, members: [], focus: null,
});

export interface TypingInfo {
  userId: number;
  name: string;
}

export type ChatFolder = 'all' | 'dm' | 'groups' | 'unread';

/** Локальные настройки списка чатов (закреплённые чаты) — per-user в localStorage. */
function prefsKey(uid: number) { return `lh_chat_prefs_${uid}`; }
function draftsKey(uid: number) { return `lh_chat_drafts_${uid}`; }

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch { return fallback; }
}

function saveJSON(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* квота/приватный режим */ }
}

export interface Me {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export function useChatController(me: Me) {
  const myId = me.id;

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [active, setActive] = useState<ThreadRef | null>(null);
  const [threads, setThreads] = useState<Record<string, ThreadData>>({});
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
  const [playing, setPlaying] = useState<Map<number, string>>(new Map());
  const [lastSeen, setLastSeen] = useState<Map<number, string>>(new Map());
  const [typing, setTyping] = useState<Record<string, TypingInfo>>({});
  // Сервер отклонил сообщение (флуд, копипаст): причина над полем ввода
  const [sendBlock, setSendBlock] = useState<{ key: string; message: string; until: number } | null>(null);
  const [pinnedChats, setPinnedChats] = useState<string[]>(() => loadJSON(prefsKey(myId), { pinned: [] as string[] }).pinned);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => loadJSON(draftsKey(myId), {} as Record<string, string>));

  const activeKey = active ? threadKey(active) : null;
  const activeRef = useRef<ThreadRef | null>(null);
  activeRef.current = active;
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => { saveJSON(prefsKey(myId), { pinned: pinnedChats }); }, [myId, pinnedChats]);
  useEffect(() => {
    const t = setTimeout(() => saveJSON(draftsKey(myId), drafts), 400);
    return () => clearTimeout(t);
  }, [myId, drafts]);

  const patchThread = useCallback((key: string, fn: (t: ThreadData) => ThreadData) => {
    setThreads((prev) => ({ ...prev, [key]: fn(prev[key] ?? emptyThread()) }));
  }, []);

  // ---------------- Список чатов ----------------

  const refreshConversations = useCallback(async () => {
    try { setConversations(await getConversations()); } catch { /* сеть */ }
  }, []);

  const refreshGroups = useCallback(async () => {
    try { setGroups(await getGroups()); } catch { /* сеть */ }
  }, []);

  useEffect(() => {
    Promise.all([refreshConversations(), refreshGroups()]).finally(() => setListLoaded(true));
  }, [refreshConversations, refreshGroups]);

  const items = useMemo<ChatItem[]>(() => {
    const all = [...conversations.map(dmItem), ...groups.map(groupItem)];
    const t = (i: ChatItem) => (i.last ? new Date(i.last.created_at).getTime() : 0);
    const pinIdx = (i: ChatItem) => pinnedChats.indexOf(i.key);
    return all.sort((a, b) => {
      const pa = pinIdx(a), pb = pinIdx(b);
      if (pa !== -1 || pb !== -1) {
        if (pa === -1) return 1;
        if (pb === -1) return -1;
        return pa - pb;
      }
      return t(b) - t(a);
    });
  }, [conversations, groups, pinnedChats]);

  const activeItem = useMemo(
    () => (activeKey ? items.find((i) => i.key === activeKey) ?? null : null),
    [items, activeKey],
  );

  // ---------------- Загрузка истории ----------------

  const fetchPage = useCallback(async (ref: ThreadRef, cursor?: { beforeId?: number; afterId?: number; aroundId?: number }) => {
    if (ref.kind === 'dm') return (await getMessages(ref.id, PAGE_SIZE, cursor)).map(fromDM);
    return (await getGroupMessages(ref.id, PAGE_SIZE, cursor)).map(fromGroup);
  }, []);

  const loadPinned = useCallback(async (ref: ThreadRef) => {
    try {
      const list = ref.kind === 'dm'
        ? (await getPinnedMessages(ref.id)).map(fromDM)
        : (await getGroupPinnedMessages(ref.id)).map(fromGroup);
      patchThread(threadKey(ref), (t) => ({ ...t, pinned: list }));
    } catch { /* старый бэкенд без эндпоинта — закрепы возьмём из ленты */ }
  }, [patchThread]);

  const loadMembers = useCallback(async (groupId: number) => {
    try {
      const d = await getGroup(groupId);
      patchThread(`group:${groupId}`, (t) => ({ ...t, members: d.members }));
    } catch { /* ignore */ }
  }, [patchThread]);

  // ---------------- Прочтение ----------------

  const markRead = useCallback((ref: ThreadRef) => {
    wsMarkRead(ref.kind, ref.id);
    if (ref.kind === 'dm') setConversations((p) => p.map((c) => (c.id === ref.id ? { ...c, unread: 0 } : c)));
    else setGroups((p) => p.map((g) => (g.id === ref.id ? { ...g, unread: 0 } : g)));
  }, []);

  /** Открыть чат: показываем кэш сразу, затем подтягиваем последнюю страницу. */
  const openThread = useCallback(async (ref: ThreadRef) => {
    const key = threadKey(ref);
    setActive(ref);
    const cached = threadsRef.current[key];
    const unread = (ref.kind === 'dm'
      ? conversations.find((c) => c.id === ref.id)?.unread
      : groups.find((g) => g.id === ref.id)?.unread) ?? 0;

    patchThread(key, (t) => ({ ...t, loading: !t.loaded, focus: null }));
    try {
      const page = await fetchPage(ref);
      patchThread(key, (t) => {
        // окно после прыжка или пустой кэш — заменяем; иначе сливаем со старой историей
        const base = !cached?.loaded || t.hasNewer ? [] : t.messages;
        const messages = mergeMessages(base, page);
        let unreadFromId: number | null = null;
        if (unread > 0) {
          let n = 0;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].sender_id !== myId && messages[i].kind !== 'call') n++;
            if (n === unread) { unreadFromId = messages[i].id; break; }
          }
        }
        return {
          ...t,
          messages,
          loaded: true,
          loading: false,
          hasOlder: base.length ? t.hasOlder : page.length >= PAGE_SIZE,
          hasNewer: false,
          unreadFromId,
          focus: unreadFromId ? { id: unreadFromId, nonce: Date.now() } : null,
        };
      });
    } catch {
      patchThread(key, (t) => ({ ...t, loading: false, loaded: true }));
    }
    loadPinned(ref);
    if (ref.kind === 'group') loadMembers(ref.id);
    markRead(ref);
  }, [conversations, groups, fetchPage, loadPinned, loadMembers, patchThread, markRead, myId]);

  const loadOlder = useCallback(async () => {
    const ref = activeRef.current;
    if (!ref) return;
    const key = threadKey(ref);
    const t = threadsRef.current[key];
    if (!t || t.loadingOlder || !t.hasOlder) return;
    const oldest = t.messages.find((m) => m.id > 0);
    if (!oldest) return;
    patchThread(key, (x) => ({ ...x, loadingOlder: true }));
    try {
      const page = await fetchPage(ref, { beforeId: oldest.id });
      patchThread(key, (x) => ({
        ...x, loadingOlder: false, hasOlder: page.length >= PAGE_SIZE,
        messages: mergeMessages(x.messages, page),
      }));
    } catch {
      patchThread(key, (x) => ({ ...x, loadingOlder: false }));
    }
  }, [fetchPage, patchThread]);

  const loadNewer = useCallback(async () => {
    const ref = activeRef.current;
    if (!ref) return;
    const key = threadKey(ref);
    const t = threadsRef.current[key];
    if (!t || t.loadingNewer || !t.hasNewer) return;
    const newest = [...t.messages].reverse().find((m) => m.id > 0);
    if (!newest) return;
    patchThread(key, (x) => ({ ...x, loadingNewer: true }));
    try {
      const page = await fetchPage(ref, { afterId: newest.id });
      patchThread(key, (x) => ({
        ...x, loadingNewer: false, hasNewer: page.length >= PAGE_SIZE,
        messages: mergeMessages(x.messages, page),
      }));
    } catch {
      patchThread(key, (x) => ({ ...x, loadingNewer: false }));
    }
  }, [fetchPage, patchThread]);

  /** Прыжок к сообщению (цитата, закреп, поиск): если его нет в ленте — грузим окно вокруг. */
  const jumpTo = useCallback(async (id: number) => {
    const ref = activeRef.current;
    if (!ref || id <= 0) return;
    const key = threadKey(ref);
    const t = threadsRef.current[key];
    if (t?.messages.some((m) => m.id === id)) {
      patchThread(key, (x) => ({ ...x, focus: { id, nonce: Date.now() } }));
      return;
    }
    patchThread(key, (x) => ({ ...x, loading: true }));
    try {
      const page = await fetchPage(ref, { aroundId: id });
      if (!page.some((m) => m.id === id)) {
        patchThread(key, (x) => ({ ...x, loading: false }));
        return;
      }
      patchThread(key, (x) => ({
        ...x, loading: false, messages: page, hasOlder: true, hasNewer: true, unreadFromId: null,
        focus: { id, nonce: Date.now() },
      }));
    } catch {
      patchThread(key, (x) => ({ ...x, loading: false }));
    }
  }, [fetchPage, patchThread]);

  /** Кнопка «вниз»: если открыто окно в середине — перезагружаем последнюю страницу. */
  const jumpToLatest = useCallback(async () => {
    const ref = activeRef.current;
    if (!ref) return;
    const key = threadKey(ref);
    const t = threadsRef.current[key];
    if (!t?.hasNewer) return;
    try {
      const page = await fetchPage(ref);
      patchThread(key, (x) => ({ ...x, messages: page, hasNewer: false, hasOlder: page.length >= PAGE_SIZE, focus: null }));
    } catch { /* ignore */ }
  }, [fetchPage, patchThread]);

  // при возврате фокуса в окно — читаем открытый чат
  useEffect(() => {
    const onFocus = () => { const r = activeRef.current; if (r) markRead(r); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [markRead]);

  // ---------------- WS-события ----------------

  const setTypingFor = useCallback((key: string, info: TypingInfo | null) => {
    const timers = typingTimers.current;
    const old = timers.get(key);
    if (old) clearTimeout(old);
    if (!info) {
      setTyping((p) => { if (!p[key]) return p; const n = { ...p }; delete n[key]; return n; });
      return;
    }
    setTyping((p) => ({ ...p, [key]: info }));
    timers.set(key, setTimeout(() => setTypingFor(key, null), 4000));
  }, []);

  /** Новое сообщение: в кэш открытой истории (если она «живая» снизу) + в список чатов. */
  const ingestMessage = useCallback((ref: ThreadRef, msg: Msg) => {
    const key = threadKey(ref);
    const mine = msg.sender_id === myId;
    const isActive = activeRef.current && threadKey(activeRef.current) === key;
    const focused = typeof document !== 'undefined' ? document.hasFocus() : true;

    patchThread(key, (t) => {
      if (!t.loaded || t.hasNewer) return t;
      if (t.messages.some((m) => m.id === msg.id)) return t;
      // подтверждение оптимистичного: первое «ожидающее» с тем же содержимым
      if (mine) {
        const idx = t.messages.findIndex((m) => m.pending && m.content === msg.content
          && (m.attachment_name || '') === (msg.attachment_name || ''));
        if (idx !== -1) {
          const next = [...t.messages];
          next[idx] = msg;
          return { ...t, messages: next };
        }
      }
      return { ...t, messages: mergeMessages(t.messages, [msg]) };
    });

    if (isActive && !mine && focused) wsMarkRead(ref.kind, ref.id);
    setTypingFor(key, null);

    const bump = !mine && !(isActive && focused) && msg.kind !== 'call' ? 1 : 0;
    if (ref.kind === 'dm') {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === ref.id);
        if (idx === -1) { refreshConversations(); return prev; }
        const next = [...prev];
        next[idx] = { ...next[idx], last_message: msg as any, unread: next[idx].unread + bump };
        return next;
      });
    } else {
      setGroups((prev) => {
        const idx = prev.findIndex((g) => g.id === ref.id);
        if (idx === -1) { refreshGroups(); return prev; }
        const next = [...prev];
        next[idx] = { ...next[idx], last_message: msg as any, unread: next[idx].unread + bump };
        return next;
      });
    }
  }, [myId, patchThread, refreshConversations, refreshGroups, setTypingFor]);

  const updateMsg = useCallback((key: string, id: number, fn: (m: Msg) => Msg) => {
    patchThread(key, (t) => ({
      ...t,
      messages: t.messages.map((m) => (m.id === id ? fn(m) : m)),
      pinned: t.pinned.map((m) => (m.id === id ? fn(m) : m)),
    }));
  }, [patchThread]);

  const handleEvent = (data: any) => {
    switch (data.type) {
      case 'presence.snapshot': {
        setOnlineIds(new Set<number>(data.user_ids || []));
        const p = new Map<number, string>();
        Object.entries(data.playing || {}).forEach(([k, v]) => p.set(Number(k), String(v)));
        setPlaying(p);
        break;
      }
      case 'presence':
        setOnlineIds((prev) => {
          const next = new Set(prev);
          if (data.online) next.add(data.user_id); else next.delete(data.user_id);
          return next;
        });
        setLastSeen((prev) => {
          const next = new Map(prev);
          if (data.online) next.delete(data.user_id);
          else if (typeof data.last_seen_at === 'string' && data.last_seen_at) next.set(data.user_id, data.last_seen_at);
          return next;
        });
        if (!data.online) setPlaying((prev) => { if (!prev.has(data.user_id)) return prev; const n = new Map(prev); n.delete(data.user_id); return n; });
        break;
      case 'presence.game':
        setPlaying((prev) => {
          const next = new Map(prev);
          if (data.game) next.set(data.user_id, data.game); else next.delete(data.user_id);
          return next;
        });
        if (data.game) setOnlineIds((prev) => (prev.has(data.user_id) ? prev : new Set(prev).add(data.user_id)));
        break;

      // ---- новые сообщения ----
      // после обрыва связи: отметка для открытого чата не дошла, а новые сообщения мы уже видим
      case '__open':
        if (activeRef.current && document.hasFocus()) wsMarkRead(activeRef.current.kind, activeRef.current.id);
        break;
      case 'chat.message':
        ingestMessage({ kind: 'dm', id: data.conversation_id }, fromDM(data.message));
        break;
      case 'group.message':
        ingestMessage({ kind: 'group', id: data.group_id }, fromGroup(data.message));
        break;

      case 'chat.rate_limited': {
        const ref: ThreadRef = data.group_id ? { kind: 'group', id: data.group_id } : { kind: 'dm', id: data.conversation_id };
        const key = threadKey(ref);
        // сообщение не сохранено: убираем самое раннее «ожидающее» (ответы идут по порядку);
        // отклонённая правка ничего не добавляла
        if (data.action !== 'edit') patchThread(key, (t) => {
          const idx = t.messages.findIndex((m) => m.pending);
          if (idx === -1) return t;
          const next = [...t.messages];
          next.splice(idx, 1);
          return { ...t, messages: next };
        });
        const wait = Math.max(3, Number(data.retry_after) || 0);
        setSendBlock({ key, message: data.error || 'Слишком часто — подождите немного', until: Date.now() + wait * 1000 });
        break;
      }

      // ---- набор текста ----
      case 'chat.typing':
        if (data.user_id !== myId) {
          const c = conversations.find((x) => x.id === data.conversation_id);
          setTypingFor(`dm:${data.conversation_id}`, { userId: data.user_id, name: c?.other_user.display_name || c?.other_user.username || '' });
        }
        break;
      case 'group.typing':
        if (data.user_id !== myId) {
          setTypingFor(`group:${data.group_id}`, { userId: data.user_id, name: data.display_name || data.username || 'Кто-то' });
        }
        break;

      // ---- прочтение ----
      case 'chat.read':
        if (data.user_id !== myId) {
          const now = new Date().toISOString();
          patchThread(`dm:${data.conversation_id}`, (t) => ({
            ...t, messages: t.messages.map((m) => (m.sender_id === myId && !m.read_at ? { ...m, read_at: now } : m)),
          }));
          setConversations((p) => p.map((c) => (c.id === data.conversation_id && c.last_message && c.last_message.sender_id === myId
            ? { ...c, last_message: { ...c.last_message, read_at: c.last_message.read_at || now } } : c)));
        } else {
          setConversations((p) => p.map((c) => (c.id === data.conversation_id ? { ...c, unread: 0 } : c)));
        }
        break;
      case 'group.read':
        patchThread(`group:${data.group_id}`, (t) => ({
          ...t, members: t.members.map((m) => (m.id === data.user_id ? { ...m, last_read_at: data.read_at } : m)),
        }));
        if (data.user_id === myId) setGroups((p) => p.map((g) => (g.id === data.group_id ? { ...g, unread: 0 } : g)));
        break;

      // ---- реакции ----
      case 'chat.reactions':
        updateMsg(`dm:${data.conversation_id}`, data.message_id, (m) => ({ ...m, reactions: (data.reactions || []) as MessageReaction[] }));
        break;
      case 'group.reactions':
        updateMsg(`group:${data.group_id}`, data.message_id, (m) => ({ ...m, reactions: (data.reactions || []) as MessageReaction[] }));
        break;

      // ---- правка / удаление / закреп ----
      case 'chat.message.updated':
      case 'group.message.updated': {
        const key = data.type === 'chat.message.updated' ? `dm:${data.conversation_id}` : `group:${data.group_id}`;
        updateMsg(key, data.message.id, (m) => ({ ...m, content: data.message.content, edited_at: data.message.edited_at }));
        break;
      }
      case 'chat.message.deleted':
      case 'group.message.deleted': {
        const dm = data.type === 'chat.message.deleted';
        const key = dm ? `dm:${data.conversation_id}` : `group:${data.group_id}`;
        const ids: number[] = data.message_ids || [];
        const now = new Date().toISOString();
        patchThread(key, (t) => ({
          ...t,
          messages: t.messages.map((m) => (ids.includes(m.id)
            ? { ...m, content: '', deleted_at: now, attachment_url: undefined, attachment_name: undefined, reactions: [], pinned_at: null }
            : m)),
          pinned: t.pinned.filter((m) => !ids.includes(m.id)),
        }));
        if (dm) {
          setConversations((p) => p.map((c) => (c.id === data.conversation_id && c.last_message && ids.includes(c.last_message.id)
            ? { ...c, last_message: { ...c.last_message, content: '', deleted_at: now } } : c)));
        } else refreshGroups();
        break;
      }
      case 'chat.message.hidden':
      case 'group.message.hidden': {
        const key = data.type === 'chat.message.hidden' ? `dm:${data.conversation_id}` : `group:${data.group_id}`;
        const ids: number[] = data.message_ids || [];
        patchThread(key, (t) => ({ ...t, messages: t.messages.filter((m) => !ids.includes(m.id)), pinned: t.pinned.filter((m) => !ids.includes(m.id)) }));
        break;
      }
      case 'chat.message.pinned':
      case 'group.message.pinned': {
        const ref: ThreadRef = data.type === 'chat.message.pinned'
          ? { kind: 'dm', id: data.conversation_id } : { kind: 'group', id: data.group_id };
        updateMsg(threadKey(ref), data.message_id, (m) => ({ ...m, pinned_at: data.pinned ? new Date().toISOString() : null }));
        loadPinned(ref);
        break;
      }

      case 'chat.conversation.deleted':
      case 'chat.conversation.hidden':
        setConversations((p) => p.filter((c) => c.id !== data.conversation_id));
        if (activeRef.current?.kind === 'dm' && activeRef.current.id === data.conversation_id) setActive(null);
        break;

      case 'group.added':
      case 'group.updated':
      case 'group.deleted':
      case 'group.member_left':
        refreshGroups();
        if (data.group_id && activeRef.current?.kind === 'group' && activeRef.current.id === data.group_id) {
          if (data.type === 'group.deleted') setActive(null);
          else loadMembers(data.group_id);
        }
        break;
    }
  };
  const handlerRef = useRef(handleEvent);
  handlerRef.current = handleEvent;

  useEffect(() => {
    connectChat();
    const off = onChatEvent((d) => handlerRef.current(d));
    return () => { off(); disconnectChat(); };
  }, []);

  // ---------------- Отправка ----------------

  const setDraft = useCallback((key: string, text: string) => {
    setDrafts((p) => {
      if ((p[key] || '') === text) return p;
      const n = { ...p };
      if (text) n[key] = text; else delete n[key];
      return n;
    });
  }, []);

  const lastTypingSent = useRef(0);
  const notifyTyping = useCallback(() => {
    const ref = activeRef.current;
    if (!ref || Date.now() - lastTypingSent.current < 2500) return;
    lastTypingSent.current = Date.now();
    if (ref.kind === 'dm') sendWS({ type: 'chat.typing', conversation_id: ref.id });
    else sendWS({ type: 'group.typing', group_id: ref.id });
  }, []);

  const appendOptimistic = useCallback((ref: ThreadRef, m: Msg) => {
    patchThread(threadKey(ref), (t) => (t.hasNewer ? t : { ...t, messages: [...t.messages, m] }));
  }, [patchThread]);

  const sendText = useCallback((text: string, replyToId?: number) => {
    const ref = activeRef.current;
    const content = text.trim();
    if (!ref || !content) return;
    const reply = replyToId && replyToId > 0 ? { reply_to_id: replyToId } : {};
    if (ref.kind === 'dm') sendWS({ type: 'chat.message', conversation_id: ref.id, content, ...reply });
    else sendWS({ type: 'group.message', group_id: ref.id, content, ...reply });
    appendOptimistic(ref, {
      id: -Date.now(), sender_id: myId, content, kind: 'text', created_at: new Date().toISOString(),
      reply_to_id: replyToId ?? null, read_at: null, pending: true,
    });
    // если читали середину истории — возвращаемся вниз к своему сообщению
    if (threadsRef.current[threadKey(ref)]?.hasNewer) jumpToLatest();
  }, [appendOptimistic, jumpToLatest, myId]);

  const editMessage = useCallback((id: number, content: string) => {
    const ref = activeRef.current;
    const text = content.trim();
    if (!ref || !text) return;
    if (ref.kind === 'dm') wsEditMessage(ref.id, id, text);
    else wsEditGroupMessage(ref.id, id, text);
    updateMsg(threadKey(ref), id, (m) => ({ ...m, content: text, edited_at: new Date().toISOString() }));
  }, [updateMsg]);

  /** Отправка файлов (по одному сообщению на файл, как в Telegram при «без группировки»). */
  const sendFiles = useCallback(async (
    files: File[],
    caption: string,
    onProgress: (p: { index: number; total: number; percent: number }) => void,
  ) => {
    const ref = activeRef.current;
    if (!ref || !files.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const att = await uploadChatAttachment(
        file,
        ref.kind === 'dm' ? { conversationId: ref.id } : { groupId: ref.id },
        (percent) => onProgress({ index: i, total: files.length, percent }),
      );
      // подпись — к последнему файлу (как в Telegram)
      const content = i === files.length - 1 ? caption.trim() : '';
      const payload = {
        content,
        attachment_key: att.key, attachment_name: att.name, attachment_mime: att.mime,
        attachment_size: att.size, attachment_kind: att.kind,
      };
      if (ref.kind === 'dm') sendWS({ type: 'chat.message', conversation_id: ref.id, ...payload });
      else sendWS({ type: 'group.message', group_id: ref.id, ...payload });
      appendOptimistic(ref, {
        id: -Date.now() - i, sender_id: myId, content, kind: att.kind, created_at: new Date().toISOString(),
        attachment_url: att.url, attachment_name: att.name, attachment_mime: att.mime, attachment_size: att.size,
        read_at: null, pending: true,
      });
    }
  }, [appendOptimistic, myId]);

  // ---------------- Действия над сообщениями ----------------

  const react = useCallback((msgId: number, emoji: string) => {
    const ref = activeRef.current;
    if (!ref || msgId <= 0) return;
    // оптимистично: переключаем свою реакцию сразу, сервер пришлёт итоговую сводку
    updateMsg(threadKey(ref), msgId, (m) => {
      const list = [...(m.reactions || [])].map((r) => ({ ...r, user_ids: [...r.user_ids] }));
      const i = list.findIndex((r) => r.emoji === emoji);
      if (i !== -1 && list[i].user_ids.includes(myId)) {
        list[i].user_ids = list[i].user_ids.filter((u) => u !== myId);
        list[i].count -= 1;
        if (list[i].count <= 0) list.splice(i, 1);
      } else if (i !== -1) {
        list[i].user_ids.push(myId);
        list[i].count += 1;
      } else {
        list.push({ emoji, count: 1, user_ids: [myId] });
      }
      return { ...m, reactions: list };
    });
    if (ref.kind === 'dm') wsReactMessage(ref.id, msgId, emoji);
    else wsReactGroupMessage(ref.id, msgId, emoji);
  }, [myId, updateMsg]);

  const pinMessage = useCallback((id: number, pinned: boolean) => {
    const ref = activeRef.current;
    if (!ref) return;
    if (ref.kind === 'dm') wsPinMessage(ref.id, id, pinned);
    else wsPinGroupMessage(ref.id, id, pinned);
  }, []);

  const deleteMessages = useCallback((ids: number[], forAll: boolean) => {
    const ref = activeRef.current;
    if (!ref || !ids.length) return;
    if (ref.kind === 'dm') wsDeleteMessages(ref.id, ids, forAll);
    else wsDeleteGroupMessages(ref.id, ids, forAll);
    if (!forAll) {
      patchThread(threadKey(ref), (t) => ({ ...t, messages: t.messages.filter((m) => !ids.includes(m.id)) }));
    }
  }, [patchThread]);

  const forwardMessages = useCallback((ids: number[], targetType: 'dm' | 'group', targetId: number) => {
    const ref = activeRef.current;
    if (!ref || !ids.length) return;
    if (ref.kind === 'dm') wsForwardDM(ref.id, ids, targetType, targetId);
    else wsForwardGroup(ref.id, ids, targetType, targetId);
  }, []);

  const deleteChat = useCallback(async (item: ChatItem, forAll: boolean) => {
    if (item.ref.kind === 'dm') {
      wsDeleteConversation(item.ref.id, forAll);
      if (!forAll) setConversations((p) => p.filter((c) => c.id !== item.ref.id));
    } else if (forAll) {
      await deleteGroup(item.ref.id);
      await refreshGroups();
    } else {
      await api.post(`/groups/${item.ref.id}/hide`);
      await refreshGroups();
    }
    if (activeRef.current && threadKey(activeRef.current) === item.key) setActive(null);
  }, [refreshGroups]);

  const togglePinChat = useCallback((key: string) => {
    setPinnedChats((p) => (p.includes(key) ? p.filter((k) => k !== key) : [key, ...p].slice(0, 10)));
  }, []);

  /** Открыть ЛС с пользователем (из ?user= / IPC / профиля участника группы). */
  const openDmWith = useCallback(async (userId: number) => {
    if (!userId || userId === myId) return;
    const convId = await getOrCreateConversation(userId);
    await refreshConversations();
    openThread({ kind: 'dm', id: convId });
  }, [myId, openThread, refreshConversations]);

  // ---------------- Поиск по чату ----------------

  const search = useCallback(async (q: string): Promise<Msg[]> => {
    const ref = activeRef.current;
    if (!ref || q.trim().length < 2) return [];
    try {
      if (ref.kind === 'dm') return (await searchMessages(ref.id, q.trim())).map(fromDM);
      return (await searchGroupMessages(ref.id, q.trim())).map(fromGroup);
    } catch { return []; }
  }, []);

  // ---------------- Производные ----------------

  const thread = activeKey ? threads[activeKey] ?? null : null;

  /** Прочитано ли моё сообщение: ЛС — read_at; группа — кто-то из участников дочитал до него. */
  const isReadByOthers = useCallback((m: Msg): boolean => {
    if (!activeRef.current) return false;
    if (activeRef.current.kind === 'dm') return !!m.read_at;
    const t = threadsRef.current[threadKey(activeRef.current)];
    const ts = new Date(m.created_at).getTime();
    return !!t?.members.some((u) => u.id !== myId && u.last_read_at && new Date(u.last_read_at).getTime() >= ts);
  }, [myId]);

  return {
    myId,
    listLoaded,
    items,
    conversations,
    groups,
    active,
    activeKey,
    activeItem,
    thread,
    onlineIds,
    playing,
    lastSeen,
    typing,
    pinnedChats,
    drafts,
    sendBlock,
    clearSendBlock: () => setSendBlock(null),
    // действия
    openThread,
    setActive,
    loadOlder,
    loadNewer,
    jumpTo,
    jumpToLatest,
    markRead,
    setDraft,
    notifyTyping,
    sendText,
    editMessage,
    sendFiles,
    react,
    pinMessage,
    deleteMessages,
    forwardMessages,
    deleteChat,
    togglePinChat,
    openDmWith,
    search,
    refreshGroups,
    refreshConversations,
    loadMembers,
    isReadByOthers,
  };
}

export type ChatController = ReturnType<typeof useChatController>;
