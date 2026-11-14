import api from '.';
import { onChatEvent } from './chat';
import { nativeNotify } from '../utils/nativeNotify';

// «Друг запустил игру» — только всплывающее уведомление (как в Steam), в колокольчик не попадает.
// Сервер рассылает presence.game всем подключённым — здесь оставляем только друзей.

type FriendInfo = { name: string; username: string; avatar: string };

const FRIENDS_TTL = 5 * 60 * 1000;
const REPEAT_GAP = 10 * 60 * 1000; // одна и та же игра у друга — не чаще раза в 10 минут

let friends = new Map<number, FriendInfo>();
let loadedAt = 0;
let loading: Promise<void> | null = null;
const lastShown = new Map<string, number>();

function loadFriends(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < FRIENDS_TTL) return Promise.resolve();
  if (loading) return loading;
  loading = api.get('/friends/list')
    .then(({ data }) => {
      const next = new Map<number, FriendInfo>();
      for (const f of data || []) {
        const d = f?.friend_details;
        if (!d?.id) continue;
        next.set(Number(d.id), {
          name: d.profile?.display_name || d.username || 'Друг',
          username: d.username || '',
          avatar: d.profile?.avatar_url || '',
        });
      }
      friends = next;
      loadedAt = Date.now();
    })
    .catch(() => { /* следующая попытка — при следующем событии */ })
    .finally(() => { loading = null; });
  return loading;
}

export function initFriendActivity(myId: number): () => void {
  void loadFriends(true);
  return onChatEvent((data: any) => {
    if (data?.type !== 'presence.game') return;
    const uid = Number(data.user_id);
    const game = String(data.game || '').trim();
    if (!game || !uid || uid === myId) return;
    void loadFriends().then(() => {
      const f = friends.get(uid);
      if (!f) return;
      const key = `${uid}:${game}`;
      const prev = lastShown.get(key) || 0;
      if (Date.now() - prev < REPEAT_GAP) return;
      lastShown.set(key, Date.now());
      nativeNotify({
        title: f.name,
        body: `Играет в ${game}`,
        tag: `lh-friend-game-${uid}`,
        silent: true,
        kind: 'game',
        icon: f.avatar,
        payload: f.username ? { type: 'profile', username: f.username } : { type: 'friends' },
        category: 'friendGame',
      });
    });
  });
}
