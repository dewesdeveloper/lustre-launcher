// Сообщества: сами сообщества и приглашения, галерея изображений, обсуждения с ответами,
// мастерская и общие ленты раздела «Сообщество» (скриншоты, мастерская, трансляции).
import api from './index';

// ---- Небольшие обёртки: ответ сервера сразу как данные ----

const read = async <T>(url: string, params?: Record<string, unknown>): Promise<T> => (await api.get<T>(url, { params })).data;
const send = async <T>(url: string, body?: unknown): Promise<T> => (await api.post<T>(url, body)).data;
const drop = async (url: string): Promise<void> => {
  await api.delete(url);
};
/** Параметр постраничной ленты: записи старше указанного ID */
const olderThan = (beforeId?: number) => (beforeId ? { before_id: beforeId } : undefined);

// ---- Типы ----

export type CommunityTheme = { id: number; name: string };

/** Автор (создатель сообщества, поста, изображения) с данными для аватара */
export type CommunityCreator = {
  id: number;
  username: string;
  profile?: {
    display_name?: string;
    avatar_url?: string;
    avatar_frame_url?: string;
    frame_id?: string;
    avatar_frame_scale?: number;
    is_pro?: boolean;
  };
};

/** Игра, к которой привязано сообщество */
export type CommunityGame = { ID: number; title: string; header_image?: string; banner_url?: string; is_adult?: boolean };

export type Community = {
  ID: number;
  name: string;
  description: string;
  cover_url: string;
  is_private: boolean;
  invite_code?: string;
  game_id: number;
  game: CommunityGame;
  theme_id: number;
  theme: CommunityTheme;
  creator_id: number;
  creator: CommunityCreator;
  members_count: number;
  CreatedAt?: string;
};

export type CreateCommunityPayload = Pick<Community, 'name' | 'description' | 'cover_url' | 'game_id' | 'theme_id' | 'is_private'>;

/** Что видно по ссылке-приглашению до вступления */
export type InvitePreview = { id: number; name: string; game_title: string; theme_name: string; is_private: boolean };

type Authored = { ID: number; author_id: number; author?: CommunityCreator; CreatedAt?: string };

/** Изображение в галерее сообщества */
export type CommunityImage = Authored & { community_id: number; url: string };

/** Тема обсуждения */
export type CommunityPost = Authored & { community_id: number; title: string; content: string };

/** Ответ в обсуждении */
export type CommunityPostComment = Authored & { post_id: number; content: string };

export type CommunityDetails = { community: Community; is_member: boolean };

/** Живые цифры платформы для блока «Активность Lustre» */
export type CommunityStats = { communities: number; discussions: number; members: number; online_users: number };

/** Ссылка на сообщество в общих лентах */
export type FeedCommunityRef = { id: number; name: string; is_adult: boolean };

export type FeedScreenshot = CommunityImage & { community: FeedCommunityRef };

/** Мод или дополнение в мастерской сообщества */
export type WorkshopItem = Authored & { community_id: number; title: string; description: string; url: string; image_url: string };

export type FeedWorkshopItem = WorkshopItem & { community: FeedCommunityRef };

/** Идущая сейчас трансляция в голосовом канале */
export type BroadcastItem = {
  user: { id: number; username: string; display_name?: string; avatar_url?: string };
  channel: { id: number; name: string };
  community: FeedCommunityRef;
  started_at: string;
};

// ---- Сообщества ----

export const getCommunityStats = () => read<CommunityStats>('/stats/community');
export const getCommunities = () => read<Community[]>('/communities/');
/** Сообщество и то, состоит ли в нём текущий пользователь */
export const getCommunity = (id: number) => read<CommunityDetails>(`/communities/${id}`);
export const createCommunity = (payload: CreateCommunityPayload) => send<Community>('/communities/', payload);
export const deleteCommunity = (id: number) => drop(`/communities/${id}`);
/** Словарь тематик сообществ */
export const getCommunityThemes = () => read<CommunityTheme[]>('/themes/');
/** Игры каталога, к которым можно привязать сообщество */
export const getCommunityGames = () => read<CommunityGame[]>('/games/');

// ---- Приглашения (приватные сообщества) ----

/**
 * Ссылка-приглашение всегда ведёт на сайт: в лаунчере адрес страницы — file://,
 * такую ссылку никто другой не откроет.
 */
export function buildInviteLink(code: string): string {
  return `https://lustrehub.pro/community/invite/${code}`;
}

/** Код приглашения (виден только владельцу) */
export async function getCommunityInvite(id: number): Promise<string> {
  return (await read<{ invite_code: string }>(`/communities/${id}/invite`)).invite_code;
}

export const previewInvite = (code: string) => read<InvitePreview>(`/community-invites/${code}`);
export const joinByInvite = (code: string) => send<Community>(`/community-invites/${code}`);

// ---- Общие ленты ----

export const getScreenshotsFeed = (beforeId?: number) => read<FeedScreenshot[]>('/communities/screenshots', olderThan(beforeId));
export const getWorkshopFeed = (beforeId?: number) => read<FeedWorkshopItem[]>('/communities/workshop', olderThan(beforeId));
export const getBroadcasts = () => read<BroadcastItem[]>('/communities/broadcasts');

// ---- Мастерская ----

export const addWorkshopItem = (communityId: number, item: Pick<WorkshopItem, 'title' | 'description' | 'url' | 'image_url'>) =>
  send<WorkshopItem>(`/communities/${communityId}/workshop`, item);
export const deleteWorkshopItem = (id: number) => drop(`/community-workshop/${id}`);

// ---- Галерея ----

export const getCommunityImages = (communityId: number) => read<CommunityImage[]>(`/communities/${communityId}/images`);
export const addCommunityImage = (communityId: number, url: string) => send<CommunityImage>(`/communities/${communityId}/images`, { url });
export const deleteCommunityImage = (imageId: number) => drop(`/community-images/${imageId}`);

// ---- Обсуждения и ответы ----

export const getCommunityPosts = (communityId: number) => read<CommunityPost[]>(`/communities/${communityId}/posts`);
export const createCommunityPost = (communityId: number, post: Pick<CommunityPost, 'title' | 'content'>) =>
  send<CommunityPost>(`/communities/${communityId}/posts`, post);
export const deleteCommunityPost = (postId: number) => drop(`/community-posts/${postId}`);
/** Обсуждение вместе с сообществом, в котором оно идёт */
export const getCommunityPost = (postId: number) => read<{ post: CommunityPost; community: Community }>(`/community-posts/${postId}`);

export const getPostComments = (postId: number) => read<CommunityPostComment[]>(`/community-posts/${postId}/comments`);
export const addPostComment = (postId: number, content: string) => send<CommunityPostComment>(`/community-posts/${postId}/comments`, { content });
export const deletePostComment = (commentId: number) => drop(`/community-post-comments/${commentId}`);
