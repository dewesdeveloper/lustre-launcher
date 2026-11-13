import api from './index';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

/** Лимиты Pro-подписки для текущего пользователя. */
export interface ProUserLimits {
  groups: number;
  group_members: number;
  showcases: number;
  favorites: number;
  collections: number;
  upload_mb: number;
  coin_limit: number;
  daily_bonus: number;
  plan: string;
  gift_per_month: number;
  /** Длина сообщения в чате: 4096, с Pro — 32 768 */
  message_len: number;
  is_pro: boolean;
}

const FALLBACK: ProUserLimits = {
  groups: 5, group_members: 10, showcases: 3, favorites: 5, collections: 10,
  upload_mb: 10, coin_limit: 100000, daily_bonus: 250, plan: '', gift_per_month: 0,
  message_len: 4096, is_pro: false,
};

export async function getProLimits(): Promise<ProUserLimits> {
  try {
    const res = await api.get('/subscriptions/');
    return { ...FALLBACK, ...(res.data?.limits || {}), is_pro: !!res.data?.is_pro };
  } catch {
    return FALLBACK;
  }
}

/** Хук: лимиты подписки для UI (витрины, избранное, коллекции, загрузки). */
export function useProLimits(): ProUserLimits {
  const { user } = useAuth();
  const [limits, setLimits] = useState<ProUserLimits>(FALLBACK);

  useEffect(() => {
    let alive = true;
    if (!user?.id) return;
    getProLimits().then((l) => { if (alive) setLimits(l); });
    return () => { alive = false; };
  }, [user?.id]);

  return limits;
}
