export interface Comment {
  id: number;
  game_id: number;
  user_id: number;
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
