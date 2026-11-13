export interface Review {
  id: number;
  game_id: number;
  user_id: number;
  positive: boolean;
  /** Нейтральный отзыв: positive=false, neutral=true */
  neutral?: boolean;
  content: string;
  created_at: string;
  author: {
    username: string;
    /** Сервер отдаёт профиль целиком — рамка, титулы и остальное здесь */
    profile?: {
      avatar_url: string;
      display_name: string;
      is_pro?: boolean;
      frame_id?: string;
      avatar_frame_url?: string;
      avatar_frame_scale?: number;
      tags?: string;
      tag?: string;
      tag_color?: string;
    };
  };
}

export interface ReviewsResponse {
  reviews: Review[];
  positive_count: number;
  negative_count: number;
  neutral_count?: number;
}

export type ReviewRating = 'positive' | 'neutral' | 'negative';

export const reviewRating = (r: Pick<Review, 'positive' | 'neutral'>): ReviewRating =>
  r.neutral ? 'neutral' : r.positive ? 'positive' : 'negative';
