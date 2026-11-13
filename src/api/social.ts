import api from './index';

export interface FollowStatus {
  followers: number;
  following: number;
  is_following: boolean;
  is_self: boolean;
}

export interface Follower {
  id: number;
  username: string;
  avatar_url?: string;
  display_name?: string;
}

export async function getFollowStatus(userId: number): Promise<FollowStatus> {
  const res = await api.get(`/follows/${userId}`);
  return res.data;
}

export async function toggleFollow(userId: number): Promise<{ is_following: boolean; followers: number }> {
  const res = await api.post(`/follows/${userId}`);
  return res.data;
}

export async function getFollowers(userId: number): Promise<Follower[]> {
  const res = await api.get(`/follows/${userId}/list`);
  return res.data || [];
}

export interface WallComment {
  id: number;
  profile_id: number;
  author_id: number;
  parent_id: number;
  content: string;
  created_at: string;
  likes: number;
  liked: boolean;
  author: {
    id: number;
    username: string;
    profile?: { avatar_url?: string; display_name?: string; is_pro?: boolean };
  };
}

export async function getWallComments(profileId: number): Promise<WallComment[]> {
  const res = await api.get(`/comments/${profileId}`);
  return res.data || [];
}

export async function postWallComment(profileId: number, content: string, parentId = 0): Promise<WallComment> {
  const res = await api.post('/comments', { profile_id: profileId, content, parent_id: parentId });
  return res.data;
}

export async function toggleCommentLike(commentId: number): Promise<{ likes: number; liked: boolean }> {
  const res = await api.post(`/comments/${commentId}/like`);
  return res.data;
}

export async function deleteWallComment(commentId: number): Promise<void> {
  await api.delete(`/comments/${commentId}`);
}
