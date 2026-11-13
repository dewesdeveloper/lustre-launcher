// Персональные рекомендации (/recommendations): любимые теги пользователя, игры и косметика
// под них. Сигналы — из отзывов, избранного, библиотеки, сообществ и покупок.
import api from './index';
import { isConfirmed } from '../components/AdultGate/AdultGate';

/** Тег с весом интереса пользователя */
export type RecTag = { id: number; name: string; score: number };

export type RecGame = {
  ID: number;
  title: string;
  description?: string;
  header_image?: string;
  banner_url?: string;
  age_rating?: string;
  is_adult?: boolean;
  tags?: { id: number; name: string; category?: string }[];
};

/** Предмет магазина кастомизации */
export type RecItem = {
  id: number;
  type: string;
  name: string;
  price: number;
  rarity: string;
  scope?: string;
  image_url: string;
  payload: string;
  tags?: { id: number; name: string }[];
};

/** Сколько действий каждого вида учтено в подборке */
export type RecommendationSignals = Record<'reviews' | 'favorites' | 'library' | 'communities' | 'purchases', number>;

export type Recommendations = {
  source?: string;
  tags: RecTag[];
  games: RecGame[];
  items: RecItem[];
  signals: RecommendationSignals;
};

/** На чём строить подборку: на всём сразу или на одном виде действий */
export type RecSource = 'all' | 'reviews' | 'favorites' | 'library' | 'communities' | 'customization';

export async function getRecommendations(source?: RecSource | string): Promise<Recommendations> {
  const params = source && source !== 'all' ? { source } : {};
  const { data } = await api.get<Recommendations>('/recommendations', { params });
  // игры 18+ не попадают в подборки, пока пользователь не подтвердил возраст
  if (isConfirmed() || !Array.isArray(data?.games)) return data;
  return { ...data, games: data.games.filter((game) => !game.is_adult) };
}
