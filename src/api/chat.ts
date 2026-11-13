import api from './index';
import { WS_BASE } from './config';

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  kind?: 'text' | 'call' | 'image' | 'video' | 'file' | string;
  call_status?: 'canceled' | 'missed' | 'declined' | 'ended' | '' | string;
  call_duration?: number;
  // Вложение
  attachment_url?: string;
  attachment_name?: string;
  attachment_mime?: string;
  attachment_size?: number;
  read_at: string | null;
  created_at: string;
  // Редактирование / удаление / закреп / пересылка
  reply_to_id?: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  pinned_at?: string | null;
  forwarded_from?: string;
  /** Реакции (сводка по эмодзи) — см. backend controllers/chat_history.go */
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  emoji: string;
  count: number;
  user_ids: number[];
}

/** Курсор истории: подгрузка вверх (before), вниз (after) или окно вокруг сообщения (around). */
export interface HistoryCursor {
  beforeId?: number;
  afterId?: number;
  aroundId?: number;
}

/** Быстрые реакции — тот же набор, что принимает сервер (allowedReactions). */
export const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😁', '🎉', '🤔', '😢', '👀'];
export const ALL_REACTIONS = [
  '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔', '🤯', '😱', '😢', '🎉',
  '🤩', '🙏', '👌', '💯', '🤣', '⚡', '🏆', '💔', '😐', '👀', '🎮', '💀',
];

export function historyQuery(limit: number, cursor?: HistoryCursor): string {
  const q = new URLSearchParams({ limit: String(limit) });
  if (cursor?.beforeId) q.set('before_id', String(cursor.beforeId));
  if (cursor?.afterId) q.set('after_id', String(cursor.afterId));
  if (cursor?.aroundId) q.set('around_id', String(cursor.aroundId));
  return q.toString();
}

export type ChatAttachmentKind = 'image' | 'video' | 'file';

export interface ChatAttachment {
  key: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  kind: ChatAttachmentKind;
}

export interface ChatConversation {
  id: number;
  other_user: { id: number; username: string; display_name?: string; avatar_url: string; is_pro?: boolean };
  last_message: ChatMessage | null;
  unread: number;
}

export async function getConversations(): Promise<ChatConversation[]> {
  const res = await api.get('/chat/conversations');
  return res.data || [];
}

export async function getOrCreateConversation(userId: number): Promise<number> {
  const res = await api.post(`/chat/conversation/${userId}`);
  return res.data.conversation_id;
}

export async function getMessages(conversationId: number, limit = 50, cursor?: HistoryCursor): Promise<ChatMessage[]> {
  const res = await api.get(`/chat/messages/${conversationId}?${historyQuery(limit, cursor)}`);
  return res.data || [];
}

/** Все закреплённые сообщения диалога (новые первыми). */
export async function getPinnedMessages(conversationId: number): Promise<ChatMessage[]> {
  const res = await api.get(`/chat/messages/${conversationId}/pinned`);
  return res.data || [];
}

/** Поиск по диалогу (сервер расшифровывает последние ~5000 сообщений). */
export async function searchMessages(conversationId: number, q: string): Promise<ChatMessage[]> {
  const res = await api.get(`/chat/messages/${conversationId}/search`, { params: { q } });
  return res.data || [];
}

// --- Медиа диалога (панель профиля → галерея) ---

export interface ConversationMediaStats {
  image: number;
  video: number;
  file: number;
}

export async function getConversationMediaStats(conversationId: number): Promise<ConversationMediaStats> {
  const res = await api.get(`/chat/conversations/${conversationId}/media/stats`);
  return res.data || { image: 0, video: 0, file: 0 };
}

export type ConversationMediaKind = 'image' | 'video' | 'file';

export async function getConversationMedia(
  conversationId: number,
  kind: ConversationMediaKind,
  limit = 50,
  offset = 0,
): Promise<{ list: ChatMessage[]; total: number }> {
  const res = await api.get(`/chat/conversations/${conversationId}/media?kind=${kind}&limit=${limit}&offset=${offset}`);
  const total = Number(res.headers?.['x-total-count'] || 0);
  return { list: res.data || [], total };
}

export async function getUnreadTotal(): Promise<number> {
  const res = await api.get('/chat/unread');
  return res.data?.total || 0;
}

/** «Прочитать все»: помечает все входящие сообщения прочитанными на сервере. */
export async function markAllRead(): Promise<number> {
  const res = await api.post('/chat/read-all');
  return res.data?.unread ?? 0;
}

/** Загрузка вложения в чат (диалог или группа) в приватный бакет. */
export async function uploadChatAttachment(
  file: File,
  target: { conversationId?: number; groupId?: number },
  onProgress?: (percent: number) => void,
): Promise<ChatAttachment> {
  const fd = new FormData();
  fd.append('file', file);
  const qs = target.groupId ? `group_id=${target.groupId}` : `conversation_id=${target.conversationId}`;
  const res = await api.post(`/upload/chat?${qs}`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return res.data as ChatAttachment;
}

/** Обновляет протухшую presigned-ссылку на вложение. */
export async function signChatAttachment(key: string): Promise<string> {
  const res = await api.get('/chat/attachments/sign', { params: { key } });
  return res.data?.url || '';
}

// --- WebSocket ---

type ChatEventHandler = (data: any) => void;

let ws: WebSocket | null = null;
let keepalive: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connecting = false;
const handlers = new Set<ChatEventHandler>();
// Важные сигналы (звонки), отправленные без соединения: уходят сразу после переподключения
const OUTBOX_TTL = 30_000;
let outbox: { payload: Record<string, unknown>; at: number }[] = [];

export function onChatEvent(handler: ChatEventHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

function emit(data: any) {
  handlers.forEach((h) => {
    try { h(data); } catch (e) { console.error('[chat] handler error', e); }
  });
}

export function connectChat() {
  if (connecting || (ws && ws.readyState <= WebSocket.OPEN)) return;
  connecting = true;

  api.get('/chat/ws-ticket')
    .then(({ data }) => {
      connecting = false;
      ws = new WebSocket(`${WS_BASE}?ticket=${data.ticket}`);

      ws.onopen = () => {
        const pending = outbox.filter((m) => Date.now() - m.at < OUTBOX_TTL);
        outbox = [];
        pending.forEach((m) => ws?.send(JSON.stringify(m.payload)));
        // внутреннее событие: модули (голосовые каналы) переподписываются после реконнекта
        emit({ type: '__open' });
        keepalive = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
      };

      ws.onmessage = (e) => {
        try { emit(JSON.parse(e.data)); } catch { /* ignore */ }
      };

      ws.onclose = () => {
        if (keepalive) clearInterval(keepalive);
        ws = null;
        // внутреннее событие: звонок показывает «нет связи с сервером»
        emit({ type: '__close' });
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectChat, 3000);
      };

      ws.onerror = () => ws?.close();
    })
    .catch(() => {
      connecting = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectChat, 5000);
    });
}

export function disconnectChat() {
  if (keepalive) clearInterval(keepalive);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
  ws = null;
}

/** queue: не терять сигнал при обрыве — отправить после переподключения (до 30 с) */
export function sendWS(payload: Record<string, unknown>, opts?: { queue?: boolean }): boolean {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  if (opts?.queue) {
    outbox.push({ payload, at: Date.now() });
    connectChat();
  }
  return false;
}

// --- Действия над сообщениями (см. backend controllers/chat_actions.go) ---

export function wsEditMessage(conversationId: number, messageId: number, content: string) {
  sendWS({ type: 'chat.edit', conversation_id: conversationId, message_id: messageId, content });
}

export function wsDeleteMessages(conversationId: number, messageIds: number[], forAll: boolean) {
  sendWS({ type: 'chat.delete', conversation_id: conversationId, message_ids: messageIds, for_all: forAll });
}

export function wsPinMessage(conversationId: number, messageId: number, pinned: boolean) {
  sendWS({ type: 'chat.pin', conversation_id: conversationId, message_id: messageId, pinned });
}

export function wsForwardDM(sourceConversationId: number, messageIds: number[], targetType: 'dm' | 'group', targetId: number) {
  sendWS({ type: 'chat.forward', conversation_id: sourceConversationId, message_ids: messageIds, target_type: targetType, target_id: targetId });
}

/** Поставить/снять реакцию (повторное нажатие снимает). */
export function wsReactMessage(conversationId: number, messageId: number, emoji: string) {
  sendWS({ type: 'chat.react', conversation_id: conversationId, message_id: messageId, emoji });
}

export function wsReactGroupMessage(groupId: number, messageId: number, emoji: string) {
  sendWS({ type: 'group.react', group_id: groupId, message_id: messageId, emoji });
}

/** Отметить прочитанным: ЛС — chat.read, группа — group.read (двигает last_read_at). */
export function wsMarkRead(kind: 'dm' | 'group', id: number) {
  // queue: чат часто открывают раньше, чем поднялось соединение, — иначе отметка терялась
  // и сообщение считалось непрочитанным до повторного входа в диалог
  if (kind === 'dm') sendWS({ type: 'chat.read', conversation_id: id }, { queue: true });
  else sendWS({ type: 'group.read', group_id: id }, { queue: true });
}

export function wsDeleteConversation(conversationId: number, forAll: boolean) {
  sendWS({ type: 'chat.conversation.delete', conversation_id: conversationId, for_all: forAll });
}

export function wsEditGroupMessage(groupId: number, messageId: number, content: string) {
  sendWS({ type: 'group.edit', group_id: groupId, message_id: messageId, content });
}

export function wsDeleteGroupMessages(groupId: number, messageIds: number[], forAll: boolean) {
  sendWS({ type: 'group.delete', group_id: groupId, message_ids: messageIds, for_all: forAll });
}

export function wsPinGroupMessage(groupId: number, messageId: number, pinned: boolean) {
  sendWS({ type: 'group.pin', group_id: groupId, message_id: messageId, pinned });
}

export function wsForwardGroup(sourceGroupId: number, messageIds: number[], targetType: 'dm' | 'group', targetId: number) {
  sendWS({ type: 'group.forward', group_id: sourceGroupId, message_ids: messageIds, target_type: targetType, target_id: targetId });
}
