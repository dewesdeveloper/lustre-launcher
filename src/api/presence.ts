// Общий стор присутствия: кто онлайн и во что играет (WS-события чата)
import { useEffect, useState } from 'react';
import { onChatEvent } from './chat';

export interface UserPresence {
  online: boolean;
  playing: string | null;
  /** Игра из каталога Lustre: id и обложка (для мини-превью у друзей) */
  playingId?: number;
  playingCover?: string;
  /** «Нет на месте» — в сети, но отошёл (режим присутствия в настройках приватности) */
  away?: boolean;
}

const store = new Map<number, UserPresence>();
const listeners = new Set<() => void>();
let initialized = false;

function emit() {
  listeners.forEach((l) => l());
}

export function getPresence(userId: number): UserPresence | undefined {
  return store.get(userId);
}

export function subscribePresence(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Подписка на события presence (идемпотентно)
export function initPresence() {
  if (initialized) return () => {};
  initialized = true;

  const off = onChatEvent((data) => {
    switch (data.type) {
      case 'presence.snapshot': {
        store.clear();
        const playing: Record<string, string> = data.playing || {};
        const info: Record<string, { game_id?: number; cover?: string }> = data.playing_info || {};
        const statuses: Record<string, string> = data.statuses || {};
        (data.user_ids || []).forEach((id: number) => {
          const gi = info[String(id)];
          store.set(id, {
            online: true,
            playing: playing[String(id)] || null,
            playingId: gi?.game_id || undefined,
            playingCover: gi?.cover || undefined,
            away: statuses[String(id)] === 'away',
          });
        });
        emit();
        break;
      }
      case 'presence': {
        if (data.online) {
          const away = data.status === 'away';
          const cur = store.get(data.user_id);
          if (!cur) {
            store.set(data.user_id, { online: true, playing: null, away });
            emit();
          } else if (!!cur.away !== away) {
            // «в сети» ↔ «нет на месте»
            store.set(data.user_id, { ...cur, away });
            emit();
          }
        } else if (store.delete(data.user_id)) {
          emit();
        }
        break;
      }
      case 'presence.game': {
        const game: string | null = data.game || null;
        const playingId: number | undefined = (game && Number(data.game_id)) || undefined;
        const playingCover: string | undefined = (game && data.cover) || undefined;
        const cur = store.get(data.user_id);
        if (!cur) {
          if (game) {
            store.set(data.user_id, { online: true, playing: game, playingId, playingCover });
            emit();
          }
        } else if ((cur.playing || null) !== game || cur.playingCover !== playingCover) {
          store.set(data.user_id, { ...cur, playing: game, playingId, playingCover });
          emit();
        }
        break;
      }
    }
  });

  return () => {
    off();
    initialized = false;
    store.clear();
  };
}

// Перерисовка при любом изменении присутствия (для списков)
export function usePresenceVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => subscribePresence(() => setV((x) => x + 1)), []);
  return v;
}

// Присутствие конкретного пользователя
export function usePresence(userId?: number): UserPresence | undefined {
  const [, setV] = useState(0);
  useEffect(() => {
    if (userId == null) return;
    const update = () => setV((x) => x + 1);
    update();
    return subscribePresence(update);
  }, [userId]);
  return userId != null ? store.get(userId) : undefined;
}

export function presenceLabel(p?: UserPresence): { text: string; cls: string } {
  if (!p) return { text: 'Не в сети', cls: 'text-pearl/30' };
  if (p.playing) return { text: `Играет в ${p.playing}`, cls: 'text-accent' };
  return { text: 'В сети', cls: 'text-green-400' };
}
