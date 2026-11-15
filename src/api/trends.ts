// Тренды магазина (/games/trends): что скачивают, добавляют, во что играют и что хвалят
// за сутки, неделю или месяц. Сервер кэширует ответ на 5 минут.
import api from './index';

export type TrendPeriod = 'day' | 'week' | 'month';

export type TrendGame = {
  ID: number;
  title: string;
  header_image: string;
  banner_url: string;
  age_rating: string;
  is_adult: boolean;
  developer: string;
  tags: { id: number; name: string; category?: string }[];
};

export type TrendEntry = {
  game: TrendGame;
  score: number;
  prev_score: number;
  downloads: number;
  added: number;
  players: number;
  positive: number;
  reviews: number;
};

export type Trends = {
  period: TrendPeriod;
  since: string;
  top: TrendEntry[];
  rising: TrendEntry[];
  top_rated: TrendEntry[];
  most_played: TrendEntry[];
  new_games: TrendGame[];
  tags: { id: number; name: string; score: number; games: number }[];
  totals: { downloads: number; added: number; players: number; games: number };
};

/** adult: '0' — только обычные игры, '1' — только 18+, пусто — все */
export async function getTrends(period: TrendPeriod, adult: '' | '0' | '1'): Promise<Trends> {
  const { data } = await api.get<Trends>('/games/trends', { params: adult ? { period, adult } : { period } });
  return data;
}
