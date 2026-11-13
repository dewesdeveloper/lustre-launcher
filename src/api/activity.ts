import api from './index';

export type ActivityKind =
  | 'library_add' | 'favorite' | 'badge_earned' | 'comment'
  | 'follow' | 'group' | 'review' | 'title_equip' | 'level_up';

export interface ActivityItem {
  id: number;
  user_id: number;
  kind: ActivityKind;
  target_type: string;
  target_id: number;
  target_name: string;
  target_image: string;
  /** логин пользователя-цели (подписка, комментарий на стене) — для ссылки на профиль */
  target_username?: string;
  created_at: string;
  meta?: {
    code?: string;
    rarity?: string;
    excerpt?: string;
    positive?: boolean;
    neutral?: boolean;
    reply?: boolean;
  };
}

export interface ActivityFeed {
  items: ActivityItem[];
  next_before: number;
  has_more: boolean;
  summary_7d: Partial<Record<ActivityKind, number>>;
}

export async function getActivityFeed(params: {
  limit?: number;
  before?: number;
  kind?: ActivityKind | 'all';
} = {}): Promise<ActivityFeed> {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.before) q.set('before', String(params.before));
  if (params.kind && params.kind !== 'all') q.set('kind', params.kind);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const res = await api.get(`/activity/${suffix}`);
  return res.data;
}

export async function getUserActivity(username: string, limit = 25): Promise<ActivityFeed> {
  const res = await api.get(`/activity/user/${username}?limit=${limit}`);
  return res.data;
}
