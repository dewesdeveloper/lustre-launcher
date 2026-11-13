import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { onChatEvent, getUnreadTotal, getConversations, markAllRead as markAllReadApi } from '../api/chat';
import type { ChatConversation } from '../api/chat';
import api from '../api';
import { getShop } from '../api/shop';
import { openChatWindow } from '../utils/openChat';
import { BELL_REFRESH_EVENT } from '../utils/bell';
import { nativeNotify } from '../utils/nativeNotify';
import { getNotifyPrefs, playNotifSound } from '../utils/notifyPrefs';
import Tooltip from './Tooltip';
import { NotificationDropdown } from './chatbell/NotificationDropdown';
import type { PendingRequest, ProfileComment } from './chatbell/NotificationDropdown';

const HEARTBEAT_KEY = 'lh_active_chat';

// Какой диалог сейчас открыт в окне чата (fresh heartbeat < 15с)
function activeChatConv(): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(HEARTBEAT_KEY) || 'null');
    if (v && typeof v.conv === 'number' && Date.now() - v.ts < 15000) return v.conv;
  } catch { /* ignore */ }
  return null;
}

// Какая группа сейчас открыта в окне чата — по ней тосты не нужны
function activeChatGroup(): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(HEARTBEAT_KEY) || 'null');
    if (v && typeof v.group === 'number' && Date.now() - v.ts < 15000) return v.group;
  } catch { /* ignore */ }
  return null;
}

/** Колокольчик покачивается при наведении: амплитуда затухает к нулю */
const SWING = [0, 10, -10, 5, -5, 2, 0];
const bellVariants: Variants = { ring: { rotate: SWING, transition: { duration: 0.9, ease: 'easeInOut' } } };

const seenKey = (userId: number) => `lh_seen_comments_ts_${userId}`;
const bonusSeenKey = (userId: number) => `lh_seen_bonus_${userId}`;

export const ChatBell = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [comments, setComments] = useState<ProfileComment[]>([]);
  const [bonusReady, setBonusReady] = useState(false);
  const [busyReq, setBusyReq] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // id уже виденных входящих заявок (для системных уведомлений); null — ещё не грузили
  const seenReqIds = useRef<Set<number> | null>(null);
  // Метка текущего бонуса: «Прочитать все» скрывает его до следующего дня или следующего бонуса
  const bonusStamp = useRef('');
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  // Заявки в друзья: обновляем отдельно от выпадашки, чтобы системный тост
  // приходил и когда приложение свёрнуто (WS-события на заявки нет)
  const pollFriendRequests = useCallback(async () => {
    if (!user?.id) return;
    try {
      const r = await api.get('/friends/pending');
      const incoming: PendingRequest[] = r.data?.incoming || [];
      const prev = seenReqIds.current;
      if (prev) {
        for (const req of incoming) {
          if (!prev.has(req.id)) {
            nativeNotify({
              title: 'Заявка в друзья',
              body: `${req.sender_details?.profile?.display_name || req.sender_details?.username || 'Пользователь'} хочет добавить вас в друзья`,
              tag: `lh-req-${req.id}`,
              payload: { type: 'friends' },
              category: 'friends',
            });
          }
        }
      }
      seenReqIds.current = new Set(incoming.map((x) => x.id));
      setRequests(incoming);
    } catch { /* ignore */ }
  }, [user?.id]);

  const seenTs = () => {
    try { return localStorage.getItem(seenKey(user?.id || 0)) || ''; } catch { return ''; }
  };
  const newComments = comments.filter((c) => !seenTs() || new Date(c.created_at) > new Date(seenTs()));

  const refresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      getUnreadTotal().then(setUnread).catch(() => {});
    }, 250);
  }, []);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    getUnreadTotal().then(setUnread).catch(() => {});
    await pollFriendRequests();
    try { setConvs((await getConversations()) || []); } catch { /* ignore */ }
    try {
      const c = await api.get(`/comments/${user.id}`);
      setComments((c.data || []).filter((x: any) => !x.parent_id).slice(-6).reverse());
    } catch { /* ignore */ }
    try {
      const s = await getShop();
      bonusStamp.current = `${s.next_bonus_at || ''}|${new Date().toDateString()}`;
      let seen = '';
      try { seen = localStorage.getItem(bonusSeenKey(user.id)) || ''; } catch { /* ignore */ }
      setBonusReady(!!s.bonus_ready && seen !== bonusStamp.current);
    } catch { /* ignore */ }
  }, [user?.id, pollFriendRequests]);

  const markCommentsSeen = useCallback(() => {
    // Через ref: зависимость от comments зацикливала запросы, пока открыта выпадашка
    // (loadAll → новые comments → новый колбэк → эффект снова зовёт loadAll)
    const list = commentsRef.current;
    if (!list.length) return;
    const latest = list.reduce((a, b) => (a.created_at > b.created_at ? a : b)).created_at;
    try { localStorage.setItem(seenKey(user?.id || 0), latest); } catch { /* ignore */ }
  }, [user?.id]);

  // Лёгкое обновление списка диалогов (без перезапроса друзей/комментариев/магазина)
  const refreshConvs = useCallback(() => {
    getConversations().then((d) => setConvs(d || [])).catch(() => { /* ignore */ });
  }, []);

  // «Прочитать все»: помечаем на сервере и гасим счётчики сразу,
  // не дожидаясь повторного открытия выпадашки.
  const markAllReadNow = useCallback(async () => {
    try { await markAllReadApi(); } catch { /* ignore */ }
    setUnread(0);
    setConvs((prev) => prev.map((c) => ({ ...c, unread: 0 })));
    markCommentsSeen();
    try { localStorage.setItem(bonusSeenKey(user?.id || 0), bonusStamp.current); } catch { /* ignore */ }
    setBonusReady(false);
    // comments не трогаем — newComments пересчитывается от seenTs() в localStorage
    setComments((prev) => (prev.length ? [...prev] : prev));
  }, [markCommentsSeen, user?.id]);

  // Полное обновление по фокусу/видимости — с троттлингом, чтобы не дёргать
  // 5 запросов на каждый alt+tab
  const lastForcedLoad = useRef(0);
  const loadAllThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastForcedLoad.current < 5000) return;
    lastForcedLoad.current = now;
    loadAll();
  }, [loadAll]);

  // Открытие/закрытие + клик мимо + Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) loadAll();
    else markCommentsSeen();
  }, [open, loadAll, markCommentsSeen]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    getUnreadTotal()
      .then((v) => { if (!cancelled) setUnread(v); })
      .catch(() => {});

    const off = onChatEvent((data) => {
      if (data.type === 'chat.message') {
        const msg = data.message;
        if (msg?.sender_id === user.id) return;
        refresh();
        if (open) loadAll();

        // Системное уведомление Windows: окно не в фокусе и этот диалог не открыт в окне чата
        const viewingConv = activeChatConv() === data.conversation_id;
        if (!document.hasFocus() && !viewingConv) {
          const name = data.sender?.display_name || data.sender?.username || 'Новое сообщение';
          const shown = nativeNotify({
            title: name,
            // текст скрывается настройкой «Показывать текст сообщений»
            body: getNotifyPrefs().preview ? (msg?.content || 'Вложение').slice(0, 140) : 'Новое сообщение',
            tag: `lh-msg-${data.conversation_id}`,
            silent: true,
            payload: { type: 'chat', userId: msg?.sender_id },
            category: 'messages',
          });
          if (shown) playNotifSound();
        }
        // Если выпадашка закрыта — хотя бы обновляем список диалогов,
        // чтобы при открытии не показывать устаревшие счётчики.
        if (!open) refreshConvs();
      } else if (data.type === 'group.message') {
        // Сообщение в группе — раньше системных уведомлений о них не было вовсе
        const msg = data.message;
        if (msg?.sender_id === user.id || document.hasFocus() || activeChatGroup() === data.group_id) return;
        const who = data.sender?.display_name || data.sender?.username || 'Участник';
        const shown = nativeNotify({
          title: 'Сообщение в группе',
          body: getNotifyPrefs().preview ? `${who}: ${(msg?.content || 'Вложение').slice(0, 120)}` : `${who}: новое сообщение`,
          tag: `lh-group-${data.group_id}`,
          silent: true,
          payload: { type: 'group', groupId: data.group_id },
          category: 'groups',
        });
        if (shown) playNotifSound();
      } else if (data.type === 'chat.read') {
        refresh();
        if (open) loadAll();
        else refreshConvs();
      }
    });

    // Возврат в окно/появление на экране: обновляем всё сразу, без клика по колокольчику
    const onFocus = () => { refresh(); loadAllThrottled(); };
    const onVisible = () => {
      if (document.visibilityState === 'visible') { refresh(); loadAllThrottled(); }
    };
    const onBellRefresh = () => { loadAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(BELL_REFRESH_EVENT, onBellRefresh);
    const poll = setInterval(() => { refresh(); if (open) loadAll(); }, 60000);

    // Заявки в друзья опрашиваем всегда (для системных уведомлений Windows)
    void pollFriendRequests();
    const reqPoll = setInterval(() => void pollFriendRequests(), 60000);

    // Веб: запрос разрешения на уведомления по первому клику
    let unlistenClick: (() => void) | null = null;
    const isElectron = !!(window as any).electron;
    if (!isElectron && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const ask = () => {
        Notification.requestPermission();
        window.removeEventListener('pointerdown', ask);
      };
      window.addEventListener('pointerdown', ask);
      unlistenClick = () => window.removeEventListener('pointerdown', ask);
    }

    return () => {
      cancelled = true;
      off();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(BELL_REFRESH_EVENT, onBellRefresh);
      clearInterval(poll);
      clearInterval(reqPoll);
      unlistenClick?.();
    };
  }, [user?.id, refresh, loadAll, loadAllThrottled, refreshConvs, open, pollFriendRequests]);

  const acceptRequest = async (req: PendingRequest) => {
    setBusyReq(req.id);
    try {
      await api.post('/friends/accept', { request_id: req.id });
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch { /* ignore */ } finally {
      setBusyReq(null);
    }
  };

  const declineRequest = async (req: PendingRequest) => {
    setBusyReq(req.id);
    try {
      await api.delete('/friends/request', { data: { request_id: req.id } });
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch { /* ignore */ } finally {
      setBusyReq(null);
    }
  };

  const total =
    unread +
    requests.length +
    newComments.length +
    (bonusReady ? 1 : 0);

  const unreadConvs = convs.filter((c) => c.unread > 0).slice(0, 4);

  return (
    <div className="relative" ref={wrapRef}>
      <Tooltip
        label="Уведомления"
        hint={total > 0 ? `Непрочитанных: ${total}` : 'Всё прочитано'}
        align="right"
      >
      <motion.button
        whileHover="ring"
        whileTap={{ scale: 0.85 }}
        onClick={() => setOpen((v) => !v)}
        className={`relative w-8 h-7 flex items-center justify-center rounded transition-colors cursor-pointer outline-none ${
          total > 0 ? 'text-accent' : 'text-pearl/60 hover:text-violet'
        }`}
      >
        <motion.div variants={bellVariants} style={{ originY: 0 }}>
          <Bell size={14} />
        </motion.div>
        {total > 0 && (
          <span className="absolute -top-1 right-0 min-w-[14px] h-[14px] px-0.5 rounded-full bg-accent text-white text-[10px] font-black flex items-center justify-center border border-[#0a0a0c] shadow-[0_0_8px_rgb(var(--accent-rgb)_/_0.5)]">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </motion.button>
      </Tooltip>

      <NotificationDropdown
        open={open}
        onClose={() => setOpen(false)}
        total={total}
        canMarkRead={unread + newComments.length + (bonusReady ? 1 : 0) > 0}
        bonusReady={bonusReady}
        onOpenCosmetics={() => navigate('/cosmetics')}
        requests={requests}
        busyReq={busyReq}
        onAcceptRequest={acceptRequest}
        onDeclineRequest={declineRequest}
        unread={unread}
        unreadConvs={unreadConvs}
        onOpenChat={openChatWindow}
        newComments={newComments}
        onOpenProfile={() => navigate(`/profile/${user?.username}`)}
        onMarkAllRead={markAllReadNow}
      />
    </div>
  );
};
