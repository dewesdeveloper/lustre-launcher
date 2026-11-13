// Значки (достижения): каталог со статусом «получен», значки пользователя и сводка
// для профиля. Каталог и личный список читаются через общий кэш ресурсов (api/catalog).
import api from './index';
import {
  CACHE_POLICY, RESOURCE_KEYS, currentUserId, invalidateBadges, makeResourceFetcher, readResource,
} from './catalog';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type BadgeCategory = 'launcher' | 'game' | 'community';

export type Badge = {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
  category: BadgeCategory;
  /** Скрытый значок: условия не показываются, пока он не получен */
  secret?: boolean;
};

/** Значок каталога с отметкой, получен ли он текущим пользователем */
export type BadgeWithStatus = Badge & {
  earned: boolean;
  awarded_at: string | null;
  /** Доля игроков, у которых он есть (%) */
  holders_percent?: number;
};

/** Запись «значок у пользователя» */
export type UserBadge = {
  ID: number;
  user_id: number;
  badge_id: number;
  badge: Badge;
  CreatedAt?: string;
  holders_percent?: number;
};

export type BadgeSummaryItem = { badge: Badge; awarded_at: string; holders_percent: number };

/** Сводка для профиля: счёт трофеев, ранг и показательные значки */
export type BadgeSummary = {
  earned: number;
  total_badges: number;
  trophy_score: number;
  percentile: number;
  rank: string;
  next_rank_at: number;
  rarest: BadgeSummaryItem[];
  last: BadgeSummaryItem[];
};

const fetchMine = makeResourceFetcher<BadgeWithStatus[]>('/badges/');
const fetchCatalog = makeResourceFetcher<Badge[]>('/badges/catalog');

/** Дождаться кэшированного ресурса: при первом обращении — загрузки, потом — сразу из кэша */
async function readCached<T>(key: string, fetcher: Parameters<typeof readResource>[1], policy: Parameters<typeof readResource>[2]): Promise<T> {
  const pending = readResource(key, fetcher, policy).promise;
  if (pending) await pending;
  return readResource(key, fetcher, policy).data as T;
}

/** Каталог значков со статусом для текущего пользователя (гостю — без кэша) */
export async function getBadges(): Promise<BadgeWithStatus[]> {
  const uid = currentUserId();
  if (!uid) return (await api.get<BadgeWithStatus[]>('/badges/')).data;
  return readCached<BadgeWithStatus[]>(RESOURCE_KEYS.badges(uid), fetchMine, CACHE_POLICY.badges);
}

/** Общий каталог значков без личных данных */
export function getBadgesCatalog(): Promise<Badge[]> {
  return readCached<Badge[]>(RESOURCE_KEYS.badgesCatalog, fetchCatalog, CACHE_POLICY.catalog);
}

export async function getUserBadges(userId: number): Promise<UserBadge[]> {
  return (await api.get<UserBadge[]>(`/badges/user/${userId}`)).data;
}

export async function getBadgeSummary(userId: number): Promise<BadgeSummary> {
  return (await api.get<BadgeSummary>(`/badges/summary/${userId}`)).data;
}

/** Значок выдан — кэш значков пользователя устарел */
export function touchBadges(userId?: number) {
  invalidateBadges(userId);
}

// ---- Оформление редкости и названия категорий ----

type RarityStyle = { label: string; chip: string; border: string; glow: string };

// Классы Tailwind пишутся целиком: сборщик стилей находит только полные строки
export const rarityStyles: Record<BadgeRarity, RarityStyle> = {
  common: {
    label: 'Обычный',
    chip: 'text-pearl/50 bg-white/5 border-white/10',
    border: 'border-white/10',
    glow: '',
  },
  rare: {
    label: 'Редкий',
    chip: 'text-cyan bg-cyan/10 border-cyan/20',
    border: 'border-cyan/30',
    glow: 'shadow-[0_0_22px_rgba(34,211,238,0.12)]',
  },
  epic: {
    label: 'Эпический',
    chip: 'text-violet bg-violet/10 border-violet/20',
    border: 'border-violet/30',
    glow: 'shadow-[0_0_22px_rgba(131,56,236,0.18)]',
  },
  legendary: {
    label: 'Легендарный',
    chip: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    border: 'border-amber-400/40',
    glow: 'shadow-[0_0_26px_rgba(245,158,11,0.22)]',
  },
};

export const categoryLabels: Record<BadgeCategory, string> = {
  launcher: 'Лаунчер',
  game: 'Игры',
  community: 'Сообщества',
};
