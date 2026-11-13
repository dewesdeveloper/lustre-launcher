import api from './index';

/** Компактный ответ GET /user/:username/mini для карточки при наведении */
export interface MiniProfile {
  id: number;
  username: string;
  display_name?: string;
  bio?: string;
  tag?: string;
  /** JSON-массив титулов профиля (до 5) */
  tags?: string;
  tag_color?: string;
  avatar_url?: string;
  avatar_frame_url?: string;
  frame_id?: string;
  avatar_frame_scale?: number;
  banner_url?: string;
  miniprofile_background_url?: string;
  level?: number;
  xp?: number;
  level_xp?: number;
  level_goal?: number;
  is_pro?: boolean;
  online_status?: 'online' | 'away' | 'offline';
  /** Время последнего посещения; null, если скрыто приватностью show_online */
  last_seen_at?: string | null;
  member_since?: string;
  stats?: { games?: number; favorites?: number; achievements?: number; friends?: number; playtime_ms?: number };
  is_friend?: boolean;
  /** Профиль скрыт настройками приватности — показываем только имя и аватар */
  restricted?: boolean;
}

const TTL = 60_000; // повторные наведения не бьют в базу
const cache = new Map<string, { at: number; data: MiniProfile | null }>();

/**
 * Минипрофиль пользователя по нику. Ответ кэшируется на минуту,
 * приватный профиль кэшируется отдельно флагом restricted.
 */
export async function getMiniProfile(username?: string): Promise<MiniProfile | null> {
  if (!username) return null;

  const hit = cache.get(username);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const res = await api.get(`/user/${encodeURIComponent(username)}/mini`);
    const data = res.data as MiniProfile;
    cache.set(username, { at: Date.now(), data });
    return data;
  } catch (e: any) {
    const status = e?.response?.status;
    if (status === 403) {
      const data = { id: 0, username, restricted: true } as MiniProfile;
      cache.set(username, { at: Date.now(), data });
      return data;
    }
    if (status === 404) return null;
    // сеть упала — не кэшируем, попробуем при следующем наведении
    return cache.get(username)?.data ?? null;
  }
}

/** Сброс кэша (например, после редактирования профиля) */
export function invalidateMiniProfile(username?: string) {
  if (username) cache.delete(username);
  else cache.clear();
}
