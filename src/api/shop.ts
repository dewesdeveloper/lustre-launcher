import api from './index';
import { CACHE_POLICY, RESOURCE_KEYS, currentUserId, invalidateShop, makeResourceFetcher, readResource, refreshResource } from './catalog';
import { notifyShopChanged } from '../utils/shopEvents';
import { mutateResource } from '../utils/resourceCache';

export type ShopItemType = 'avatar' | 'frame' | 'banner' | 'theme' | 'tag' | 'background' | 'miniprofile_bg';
export type ShopRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type ShopScope = 'profile' | 'launcher';

export interface ShopTag {
  id: number;
  name: string;
  category?: string;
}

export interface ShopItem {
  id: number;
  type: ShopItemType;
  name: string;
  price: number;
  rarity: ShopRarity;
  scope?: ShopScope; // для тем: профиль или весь лаунчер
  image_url: string;
  payload: string;
  tags?: ShopTag[];
  /** Только для подписчиков Lustre Pro */
  pro_only?: boolean;
  /** Анимированная рамка/аватар */
  animated?: boolean;
  is_video?: boolean;
  /** Ранний доступ Pro за N дней до открытия для всех */
  early_days?: number;
  /** Заблокирован без подписки */
  locked?: boolean;
  /** Скрыт: ранний доступ ещё не открылся */
  hidden?: boolean;
  /** Уже куплен (приходит прямо в карточке — источник истины для статуса) */
  owned?: boolean;
}

export interface ShopLimits {
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
}

export interface ShopData {
  items: ShopItem[];
  owned: number[];
  coins: number;
  is_pro?: boolean;
  pro_plan?: string;
  frame_id: string;
  avatar_frame_scale?: number;
  launcher_theme_id?: string;
  bonus_ready: boolean;
  next_bonus_at: string | null;
  limits?: ShopLimits;
}

const shopFetcher = makeResourceFetcher<ShopData>('/shop/');

/** Ключ кэша витрины для пользователя — общий для магазина, навбара и внешнего вида. */
export function shopResourceKey(userId: number | string): string {
  return RESOURCE_KEYS.shop(userId);
}

/** Загрузчик витрины — чтобы страницы читали тот же кэш, а не свой снимок. */
export function shopResourceFetcher() {
  return shopFetcher;
}

/**
 * Каталог + инвентарь. Данные берутся из кэша мгновенно, обновляются в фоне.
 * TTL 30 c и кулдаун 15 c не дают спамить сервер при переходах между страницами,
 * а ETag превращает повторный запрос в дешёвый 304.
 */
export async function getShop(): Promise<ShopData> {
  const uid = currentUserId();
  if (!uid) {
    const res = await api.get('/shop/');
    return res.data;
  }
  const result = readResource(RESOURCE_KEYS.shop(uid), shopFetcher, CACHE_POLICY.shop);
  if (result.promise) await result.promise;
  return readResource(RESOURCE_KEYS.shop(uid), shopFetcher, CACHE_POLICY.shop).data as ShopData;
}

/** Принудительное обновление каталога (используется после админ-правок). */
export async function reloadShop(): Promise<ShopData> {
  const uid = currentUserId();
  if (!uid) return getShop();
  const p = refreshResource(RESOURCE_KEYS.shop(uid), shopFetcher, CACHE_POLICY.shop);
  if (p) await p;
  return readResource(RESOURCE_KEYS.shop(uid), shopFetcher, CACHE_POLICY.shop).data as ShopData;
}

/** Любое изменение состояния магазина сразу помечает кэш устаревшим. */
function touchShop() {
  invalidateShop(currentUserId() ?? undefined);
  // Сообщаем навигации, что баланс/владение изменились — она перечитает
  // /shop/ сразу, а не по поллеру раз в минуту.
  notifyShopChanged();
}

/** Ответ покупки: новый баланс, id предмета, применён ли он сразу и обновлённый профиль */
export async function buyItem(itemId: number): Promise<{ coins: number; owned_item_id: number; equipped: boolean; profile: any }> {
  const res = await api.post('/shop/buy', { item_id: itemId });
  touchShop();
  return res.data;
}

// Возвращает обновлённый профиль (надетый предмет уже применён)
export async function equipItem(itemId: number): Promise<any> {
  const res = await api.post('/shop/equip', { item_id: itemId });
  touchShop();
  return res.data.profile;
}

// Снять предмет слота (вернуть дефолт). type: theme | launcher_theme | frame | avatar | banner
export async function unequipSlot(type: string, itemId?: number): Promise<any> {
  const res = await api.post('/shop/unequip', { type, ...(itemId ? { item_id: itemId } : {}) });
  touchShop();
  return res.data.profile;
}

export async function claimDailyBonus(): Promise<{ coins: number; amount: number }> {
  const res = await api.post('/shop/bonus');
  // Сразу отражаем результат в общем кэше (кнопка бонуса, баланс в навбаре и кассе),
  // не дожидаясь перечитывания /shop/; touchShop следом сверит данные с сервером
  const uid = currentUserId();
  if (uid) {
    mutateResource<ShopData>(RESOURCE_KEYS.shop(uid), (prev) => prev && {
      ...prev,
      bonus_ready: false,
      next_bonus_at: new Date().toISOString(),
      coins: typeof res.data?.coins === 'number' ? res.data.coins : prev.coins,
    }, CACHE_POLICY.shop.persist);
  }
  touchShop();
  return res.data;
}

// --- Админ ---

export async function createShopItem(payload: {
  type: string; name: string; price: number; rarity: string; scope?: string; image_url?: string; payload: string; tag_ids?: number[];
  pro_only?: boolean; animated?: boolean; is_video?: boolean; early_days?: number;
}): Promise<ShopItem> {
  const res = await api.post('/shop/create', payload);
  invalidateShop();
  return res.data.item;
}

export async function updateShopItem(id: number, payload: {
  type: string; name: string; price: number; rarity: string; scope?: string; image_url?: string; payload: string; tag_ids?: number[];
  pro_only?: boolean; animated?: boolean; is_video?: boolean; early_days?: number;
}): Promise<ShopItem> {
  const res = await api.put(`/shop/${id}`, payload);
  invalidateShop();
  return res.data.item;
}

export async function deleteShopItem(id: number): Promise<void> {
  await api.delete(`/shop/${id}`);
  invalidateShop();
}
