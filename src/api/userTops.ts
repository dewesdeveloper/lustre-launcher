// Топы пользователей: уровень, время в играх, значки, отзывы (GET /users/top).
// В рейтинг попадают только открытые профили; сервер пересчитывает списки раз в 10 минут.
import api from './index';

export type TopBoard = 'level' | 'playtime' | 'badges' | 'reviews';

export type TopEntry = {
  rank: number;
  value: number;
  user: {
    id: number;
    username: string;
    display_name: string;
    avatar_url: string;
    avatar_frame_url: string;
    frame_id: string;
    level: number;
    is_pro: boolean;
  };
};

export type TopResult = {
  board: TopBoard;
  updated_at: string;
  entries: TopEntry[];
  /** только для вошедшего: rank = 0 — вне топа */
  me?: { rank: number; value: number };
};

export const getUserTop = async (board: TopBoard) => (await api.get<TopResult>('/users/top', { params: { board } })).data;

/** Значение в рейтинге — человеческим языком */
export function formatTopValue(board: TopBoard, value: number): string {
  switch (board) {
    case 'level': {
      const level = Math.floor(value / 1_000_000);
      return `${level} ур.`;
    }
    case 'playtime': {
      const h = value / 3_600_000;
      return h >= 10 ? `${Math.round(h).toLocaleString('ru-RU')} ч` : `${h.toFixed(1)} ч`;
    }
    case 'badges':
      return `${value} ${plural(value, 'значок', 'значка', 'значков')}`;
    case 'reviews':
      return `${value} ${plural(value, 'отзыв', 'отзыва', 'отзывов')}`;
  }
}

/** Опыт внутри уровня (для подписи под уровнем) */
export const topLevelXp = (value: number) => value % 1_000_000;

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
