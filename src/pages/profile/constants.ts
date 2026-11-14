export const RARITY_COLOR: Record<string, string> = { common: '#9CA3AF', rare: '#3B82F6', epic: '#8338EC', legendary: '#FFB020' };
export const RARITY_LABEL: Record<string, string> = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };
export const COSMETIC_SECTIONS: { type: string; title: string }[] = [
  { type: 'avatar', title: 'Аватары' },
  { type: 'frame', title: 'Рамки аватара' },
  { type: 'banner', title: 'Фоны профиля' },
  { type: 'theme', title: 'Темы' },
];
export const isImageUrl = (p: string) => /^(https?:\/\/|data:)/i.test(p);

export type FriendState = { status: 'none' | 'self' | 'accepted' | 'pending_in' | 'pending_out'; request_id: number };

/** Эры аккаунта по уровню: с какого уровня начинается, название и цвет */
export const ERAS = [
  { from: 1, name: 'Новичок', color: '#9CA3AF' },
  { from: 3, name: 'Искатель', color: '#34D399' },
  { from: 5, name: 'Странник', color: '#22D3EE' },
  { from: 8, name: 'Хранитель', color: '#3A86FF' },
  { from: 12, name: 'Мастер', color: '#A78BFA' },
  { from: 18, name: 'Легенда', color: '#FFB020' },
  { from: 25, name: 'Миф', color: '#FF4D6D' },
  // звания после Мифа — до 150 уровня
  { from: 35, name: 'Титан', color: '#FB923C' },
  { from: 45, name: 'Вестник', color: '#2DD4BF' },
  { from: 60, name: 'Архонт', color: '#E879F9' },
  { from: 75, name: 'Полубог', color: '#FACC15' },
  { from: 90, name: 'Бессмертный', color: '#F43F5E' },
  { from: 110, name: 'Абсолют', color: '#F1F5F9' },
  { from: 130, name: 'Вечный', color: '#60A5FA' },
  { from: 150, name: 'Сияние Lustre', color: '#FF2D8F' },
] as const;

/** Звание (эра) по уровню (шкала Lustre, 30 XP на уровень); tier — 0 (Новичок) … 14 (Сияние Lustre, 150 уровень) */
export function eraForLevel(level: number): { name: string; color: string; tier: number } {
  const l = level || 1;
  let tier = 0;
  ERAS.forEach((e, i) => { if (l >= e.from) tier = i; });
  return { name: ERAS[tier].name, color: ERAS[tier].color, tier };
}

/** Прогресс до следующего уровня (шкала 30 XP на уровень) */
export const XP_PER_LEVEL = 30;

/** Уровень по накопленному опыту: каждые 30 XP — новый уровень */
export function levelFromXp(xp: number): number {
  const value = Math.max(0, Math.floor(xp || 0));
  return Math.floor(value / XP_PER_LEVEL) + 1;
}

/** Сколько всего XP нужно для указанного уровня */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level || 1));
  return (l - 1) * XP_PER_LEVEL;
}

/** Прогресс внутри текущего уровня: шаг — 30 XP */
export function levelProgress(xp: number): { level: number; current: number; goal: number; percent: number; xp: number } {
  const value = Math.max(0, Math.floor(xp || 0));
  const level = levelFromXp(value);
  const current = value - xpForLevel(level);
  return { level, current, goal: XP_PER_LEVEL, percent: Math.round((current * 100) / XP_PER_LEVEL), xp: value };
}

export type Showcase = { type: string; data: string };

export const MAX_SHOWCASES = 3;

export const MAX_TAGS = 5;
export const MAX_CUSTOM_TAGS = 1;
export const MAX_SHOP_TAGS = 4;

export type ProfileTag = { text: string; color: string; custom: boolean; item_id: number };

/** Разбирает титулы профиля: JSON-массив, либо legacy-поле tag */
export function parseTags(profile: any): ProfileTag[] {
  const clean = (arr: any[]): ProfileTag[] =>
    arr
      .filter((t) => t && typeof t.text === 'string' && t.text.trim())
      .map((t) => ({
        text: String(t.text),
        color: typeof t.color === 'string' ? t.color : '',
        custom: !!t.custom,
        item_id: Number(t.item_id) || 0,
      }))
      .slice(0, MAX_TAGS);

  try {
    const raw = profile?.tags;
    if (Array.isArray(raw)) return clean(raw);
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return clean(parsed);
    }
  } catch { /* ignore */ }

  if (profile?.tag) {
    return [{ text: String(profile.tag), color: profile.tag_color || '', custom: true, item_id: 0 }];
  }
  return [];
}

/** Разбирает витрины из профиля: новый JSON-массив, либо legacy-поля (одиночная витрина) */
export function parseShowcases(profile: any): Showcase[] {
  const clean = (arr: any[]): Showcase[] =>
    arr
      .filter((s) => s && typeof s.type === 'string' && s.type && s.type !== 'none')
      .map((s) => ({ type: s.type, data: String(s.data ?? '') }))
      .slice(0, MAX_SHOWCASES);

  try {
    const raw = profile?.showcases;
    if (Array.isArray(raw)) return clean(raw);
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return clean(parsed);
    }
  } catch { /* ignore */ }

  // Совместимость со старой одиночной витриной
  if (profile?.showcase_type && profile.showcase_type !== 'none') {
    return [{ type: profile.showcase_type, data: String(profile.showcase_data || '') }];
  }
  return [];
}

export type EditProfileForm = {
  display_name: string;
  bio: string;
  tags: ProfileTag[];
  avatar_url: string;
  avatar_frame_url: string;
  banner_url: string;
  frame_id: string;
  theme_id: string;
  showcases: Showcase[];
};

// Аватар и баннер профиля (useProfileImages, ProfileImageField)
export type ImageKind = 'avatar' | 'banner';
export const PROFILE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
