import api from './index';

export interface LauncherBackgroundItem {
  id: number;
  name: string;
  payload: string;
  image_url: string;
  is_video: boolean;
  rarity: string;
  pro_only: boolean;
}

export interface LauncherBackgroundState {
  url: string;
  is_video: boolean;
  item_id: number;
  scale: number;
  blur: number;
  opacity: number;
  offset_x: number;
  offset_y: number;
  is_pro: boolean;
  can_custom: boolean;
  owned_items: LauncherBackgroundItem[];
}

export interface BackgroundEdits {
  scale?: number;
  blur?: number;
  opacity?: number;
  offset_x?: number;
  offset_y?: number;
}

export async function getLauncherBackground(): Promise<LauncherBackgroundState> {
  const res = await api.get('/launcher/background');
  return res.data;
}

/** Установить фон: item_id — предмет магазина; url — свой (только Pro);
 *  пусто — сетка; только поля правки (scale/blur/opacity/offset) — меняют
 *  настройки текущего фона, не трогая его выбор. */
export async function setLauncherBackground(
  payload: { item_id?: number; url?: string; is_video?: boolean } & BackgroundEdits,
): Promise<any> {
  const res = await api.post('/launcher/background', payload);
  return res.data.profile;
}

export async function resetLauncherBackground(): Promise<any> {
  const res = await api.post('/launcher/background', {});
  return res.data.profile;
}
