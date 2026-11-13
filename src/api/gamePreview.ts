import api from './index';

/** Сводка оценки игры: два счётчика + процент положительных */
export interface GameRatingSummary {
  positive_count: number;
  negative_count: number;
  total: number;
  /** null — отзывов ещё нет */
  percent: number | null;
}

const TTL = 5 * 60_000;
const cache = new Map<number, { at: number; data: GameRatingSummary }>();

/**
 * Оценка пользователей для всплывающей карточки в каталоге.
 * Ответ кэшируется: одна игра тянет сводку один раз за 5 минут.
 */
export async function getGameRatingSummary(gameId: number): Promise<GameRatingSummary | null> {
  if (!gameId) return null;

  const hit = cache.get(gameId);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  try {
    const res = await api.get(`/reviews/${gameId}/summary`);
    const positive = Number(res.data?.positive_count) || 0;
    const negative = Number(res.data?.negative_count) || 0;
    const total = positive + negative;
    const data: GameRatingSummary = {
      positive_count: positive,
      negative_count: negative,
      total,
      percent: total > 0 ? Math.round((positive / total) * 100) : null,
    };
    cache.set(gameId, { at: Date.now(), data });
    return data;
  } catch {
    return cache.get(gameId)?.data ?? null;
  }
}
