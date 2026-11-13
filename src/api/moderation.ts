import api from './index';

/** Типы контента в модерации (совпадают с бэкендом: TargetType журнала) */
export type ModerationType =
  | 'comment'
  | 'game_comment'
  | 'game_review'
  | 'community_post'
  | 'community_post_comment'
  | 'community_image'
  | 'community_workshop'
  | 'voice_message'
  | 'community';

export interface ModerationAuthor {
  id: number;
  username: string;
  role?: string;
  profile?: { display_name?: string; avatar_url?: string };
}

export interface ModerationItem {
  type: ModerationType;
  id: number;
  title?: string;
  content: string;
  image_url?: string;
  positive?: boolean;
  neutral?: boolean;
  created_at: string;
  author: ModerationAuthor;
  context_type: 'profile' | 'game' | 'community' | 'post';
  context_id: number;
  context_name: string;
  context_ref?: string;
  context_parent_id?: number;
}

export interface ModerationLogEntry {
  id: number;
  user_id: number;
  username: string;
  action: string;
  target_type: ModerationType;
  target_id: number;
  target_name: string;
  meta: string;
  created_at: string;
}

/** Лента свежего контента (от новых к старым); next_before — курсор следующей страницы */
export async function getModerationFeed(type: ModerationType | 'all', before?: string): Promise<{ items: ModerationItem[]; next_before?: string }> {
  const res = await api.get('/moderation/feed', { params: { type, ...(before ? { before } : {}) } });
  return { items: res.data?.items || [], next_before: res.data?.next_before };
}

export async function getModerationLog(): Promise<ModerationLogEntry[]> {
  const res = await api.get('/moderation/log');
  return res.data?.items || [];
}

const DELETE_PATH: Record<ModerationType, string> = {
  comment: '/comments',
  game_comment: '/game-comments',
  game_review: '/reviews',
  community_post: '/community-posts',
  community_post_comment: '/community-post-comments',
  community_image: '/community-images',
  community_workshop: '/community-workshop',
  voice_message: '/community-channel-messages',
  community: '/communities',
};

/** Удалить контент правами модератора (те же эндпоинты, что и у автора) */
export async function moderateDelete(type: ModerationType, id: number): Promise<void> {
  await api.delete(`${DELETE_PATH[type]}/${id}`);
}
