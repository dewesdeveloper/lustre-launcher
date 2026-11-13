import api from './index';
import { historyQuery, type HistoryCursor, type MessageReaction } from './chat';

export interface GroupSummary {
  id: number;
  name: string;
  avatar_url: string;
  owner_id: number;
  members_count: number;
  last_message: GroupMessage | null;
  unread: number;
}

export interface GroupMessage {
  id: number;
  group_id: number;
  sender_id: number;
  content: string;
  kind?: 'text' | 'call' | 'image' | 'video' | 'file' | string;
  call_status?: string;
  call_duration?: number;
  attachment_url?: string;
  attachment_name?: string;
  attachment_mime?: string;
  attachment_size?: number;
  created_at: string;
  // Редактирование / удаление / закреп / пересылка
  reply_to_id?: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  pinned_at?: string | null;
  forwarded_from?: string;
  reactions?: MessageReaction[];
}

export interface GroupMember {
  is_pro?: boolean;
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_owner?: boolean;
  /** До какого момента участник прочитал группу (для «двух галочек») */
  last_read_at?: string | null;
}

export interface GroupDetails {
  id: number;
  name: string;
  avatar_url: string;
  owner_id: number;
  members: GroupMember[];
}

export async function createGroup(payload: { name: string; avatar_url?: string; member_ids: number[] }): Promise<{ id: number }> {
  const res = await api.post('/groups/', payload);
  return res.data;
}

export async function getGroups(): Promise<GroupSummary[]> {
  const res = await api.get('/groups/');
  return res.data || [];
}

export async function getGroup(id: number): Promise<GroupDetails> {
  const res = await api.get(`/groups/${id}`);
  return res.data;
}

export async function getGroupMessages(groupId: number, limit = 50, cursor?: HistoryCursor): Promise<GroupMessage[]> {
  const res = await api.get(`/groups/${groupId}/messages?${historyQuery(limit, cursor)}`);
  return res.data || [];
}

export async function getGroupPinnedMessages(groupId: number): Promise<GroupMessage[]> {
  const res = await api.get(`/groups/${groupId}/pinned`);
  return res.data || [];
}

export async function searchGroupMessages(groupId: number, q: string): Promise<GroupMessage[]> {
  const res = await api.get(`/groups/${groupId}/search`, { params: { q } });
  return res.data || [];
}

export async function addGroupMembers(groupId: number, userIds: number[]): Promise<void> {
  await api.post(`/groups/${groupId}/members`, { user_ids: userIds });
}

export async function removeGroupMember(groupId: number, userId: number): Promise<void> {
  await api.delete(`/groups/${groupId}/members/${userId}`);
}

export async function updateGroup(groupId: number, payload: { name?: string; avatar_url?: string }): Promise<void> {
  await api.put(`/groups/${groupId}`, payload);
}

export async function deleteGroup(groupId: number): Promise<void> {
  await api.delete(`/groups/${groupId}`);
}
