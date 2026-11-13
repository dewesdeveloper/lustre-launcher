import api from './index';
import {
  readResource, refreshResource, invalidate, invalidateWhere, clearResourceCache,
  type Fetcher, type ResourceOptions,
} from '../utils/resourceCache';
import type { BadgeWithStatus, UserBadge, BadgeSummary, Badge } from './badges';
import type { ShopData } from './shop';
import { secureStorage } from './secureStorage';

export { readResource, refreshResource, invalidate, invalidateWhere, clearResourceCache };

/** Ключи кэша — собраны в одном месте, чтобы инвалидация была предсказуемой. */
export const RESOURCE_KEYS = {
  badgesCatalog: 'badges:catalog',
  badges: (uid: number | string) => `badges:user:${uid}`,
  userBadges: (uid: number | string) => `badges:owned:${uid}`,
  badgeSummary: (uid: number | string) => `badges:summary:${uid}`,
  shop: (uid: number | string) => `shop:user:${uid}`,
} as const;

/**
 * Политики кэша.
 * ttl — как часто данные считаются устаревшими;
 * cooldown — минимальный интервал между сетевыми запросами (защита от спама);
 * persist — зеркалировать в localStorage, чтобы статика рисовалась мгновенно на старте.
 */
export const CACHE_POLICY = {
  catalog: { ttl: 10 * 60_000, cooldown: 60_000, persist: true },
  badges: { ttl: 60_000, cooldown: 20_000, persist: true },
  summary: { ttl: 60_000, cooldown: 30_000, persist: true },
  shop: { ttl: 30_000, cooldown: 15_000, persist: true },
} as const satisfies Record<string, ResourceOptions>;

type AxiosLike<T> = { status: number; data: T; headers: Record<string, string> };

/** Axios-адаптер: сам кэш отдаёт ETag, а 304 превращается в notModified. */
function axiosFetcher<T>(url: string, config: Record<string, unknown> = {}): Fetcher<T> {
  return async ({ etag }) => {
    const res = (await api.get(url, {
      ...config,
      ...(etag ? { headers: { ...(config.headers as object || {}), 'If-None-Match': etag } } : {}),
      validateStatus: (s: number) => s === 200 || s === 304,
    } as never)) as unknown as AxiosLike<T>;

    if (res.status === 304) return { data: null as T, etag, notModified: true };
    return {
      data: res.data,
      etag: (res.headers?.etag as string) || null,
      notModified: false,
    };
  };
}

/** Готовый fetcher для useCachedResource: сам подставляет ETag и обрабатывает 304. */
export function makeResourceFetcher<T>(url: string): Fetcher<T> {
  return axiosFetcher<T>(url);
}

// --- Значки ---

export function getBadgesCatalog(opts?: { refresh?: boolean }) {
  const key = RESOURCE_KEYS.badgesCatalog;
  const fetcher = axiosFetcher<Badge[]>(`/badges/catalog`);
  if (opts?.refresh) return refreshResource(key, fetcher, CACHE_POLICY.catalog);
  return readResource(key, fetcher, CACHE_POLICY.catalog);
}

export function getBadgesCached(userId: number) {
  const key = RESOURCE_KEYS.badges(userId);
  const fetcher = axiosFetcher<BadgeWithStatus[]>('/badges/');
  return readResource(key, fetcher, CACHE_POLICY.badges);
}

export function getUserBadgesCached(userId: number) {
  const key = RESOURCE_KEYS.userBadges(userId);
  const fetcher = axiosFetcher<UserBadge[]>(`/badges/user/${userId}`);
  return readResource(key, fetcher, CACHE_POLICY.badges);
}

export function getBadgeSummaryCached(userId: number) {
  const key = RESOURCE_KEYS.badgeSummary(userId);
  const fetcher = axiosFetcher<BadgeSummary>(`/badges/summary/${userId}`);
  return readResource(key, fetcher, CACHE_POLICY.summary);
}

// --- Магазин ---

export function getShopCached(userId: number) {
  const key = RESOURCE_KEYS.shop(userId);
  const fetcher = axiosFetcher<ShopData>('/shop/');
  return readResource(key, fetcher, CACHE_POLICY.shop);
}

/** id текущего пользователя из защищённого хранилища (для ключей кэша) */
export function currentUserId(): number | null {
  try {
    const saved = secureStorage.getItem('user');
    const id = Number(saved?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

// --- Инвалидация: вызывается сразу после изменений, чтобы данные обновились без ожидания TTL ---

export function invalidateBadges(userId?: number) {
  invalidate(RESOURCE_KEYS.badgesCatalog);
  if (userId != null) {
    invalidate(RESOURCE_KEYS.badges(userId));
    invalidate(RESOURCE_KEYS.userBadges(userId));
    invalidate(RESOURCE_KEYS.badgeSummary(userId));
  } else {
    invalidateWhere('badges:user:');
    invalidateWhere('badges:owned:');
    invalidateWhere('badges:summary:');
  }
}

export function invalidateShop(userId?: number) {
  if (userId != null) invalidate(RESOURCE_KEYS.shop(userId));
  else invalidateWhere('shop:user:');
}

/** Полный сброс (выход из аккаунта, смена пользователя). */
export function resetCaches() {
  clearResourceCache();
}
