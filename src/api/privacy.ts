import api from './index';

export type OnlineStatus = 'online' | 'away' | 'invisible' | 'offline';

export interface PrivacySettings {
  profile_visibility: 'public' | 'friends' | 'private';
  friends_visibility: 'public' | 'friends' | 'private';
  /** Кто видит ленту активности в профиле */
  activity_visibility: 'public' | 'friends' | 'private';
  friend_requests: 'everyone' | 'nobody';
  /** pro — друзья и пользователи с Lustre Pro (выбрать можно и без своей подписки) */
  dms: 'everyone' | 'pro' | 'friends';
  calls: 'everyone' | 'pro' | 'friends';
  /** В сети / Нет на месте / Невидимка (для всех не в сети) / Не в сети (ещё и без звонков) */
  online_status: OnlineStatus;
  /** Устаревшее: true — online/away, false — invisible/offline */
  show_online: boolean;
}

export async function getPrivacy(): Promise<PrivacySettings> {
  const res = await api.get('/privacy/');
  return res.data;
}

export async function updatePrivacy(patch: Partial<PrivacySettings>): Promise<PrivacySettings> {
  const res = await api.put('/privacy/', patch);
  return res.data;
}
