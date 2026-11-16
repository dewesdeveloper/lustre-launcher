// Заглушённые собеседники: их личные сообщения приходят без звука (всплывашка остаётся).
// Список хранится на сервере — общий для лаунчера и телефона; здесь — кэш в localStorage,
// чтобы колокольчик главного окна сразу видел изменение, сделанное в окне чата.
import { useEffect, useState } from 'react';
import api from './index';

const KEY = 'lh_chat_mutes';
const EVENT = 'lh-chat-mutes';

function read(): Set<number> {
  try { return new Set((JSON.parse(localStorage.getItem(KEY) || '[]') as number[]).map(Number)); } catch { return new Set(); }
}
function write(ids: Set<number>) {
  try { localStorage.setItem(KEY, JSON.stringify([...ids])); } catch { /* приватный режим */ }
  window.dispatchEvent(new Event(EVENT));
}

export const isChatMuted = (userId: number | undefined | null) => !!userId && read().has(Number(userId));

/** Подтянуть список с сервера (при старте и возврате в окно) */
export async function syncChatMutes(): Promise<void> {
  try {
    const { data } = await api.get<{ user_ids: number[] }>('/chat/mutes');
    write(new Set((data?.user_ids || []).map(Number)));
  } catch { /* офлайн — остаётся кэш */ }
}

export async function setChatMuted(userId: number, muted: boolean): Promise<void> {
  if (muted) await api.put(`/chat/mutes/${userId}`);
  else await api.delete(`/chat/mutes/${userId}`);
  const ids = read();
  if (muted) ids.add(userId); else ids.delete(userId);
  write(ids);
}

/** Хук: заглушён ли собеседник, с перерисовкой при изменении в любом окне */
export function useChatMuted(userId: number | undefined | null): boolean {
  const [muted, setMuted] = useState(() => isChatMuted(userId));
  useEffect(() => {
    const sync = () => setMuted(isChatMuted(userId));
    sync();
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);
  return muted;
}
