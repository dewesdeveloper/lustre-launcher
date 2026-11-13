// Единая модель окна сообщений: личные диалоги и группы приводятся к одному виду,
// чтобы лента, шапка, поиск и действия не дублировались для двух типов чатов.

import type { ChatConversation, ChatMessage, MessageReaction } from '../../api/chat';
import type { GroupMessage, GroupSummary } from '../../api/groups';

export type ThreadKind = 'dm' | 'group';

export interface ThreadRef {
  kind: ThreadKind;
  id: number;
}

export const threadKey = (t: ThreadRef) => `${t.kind}:${t.id}`;

export function parseThreadKey(key: string): ThreadRef | null {
  const [kind, id] = key.split(':');
  const n = Number(id);
  if ((kind !== 'dm' && kind !== 'group') || !n) return null;
  return { kind, id: n };
}

/** Сообщение в ленте — общее для ЛС и групп. */
export interface Msg {
  id: number;
  sender_id: number;
  content: string;
  kind: string;
  call_status?: string;
  call_duration?: number;
  attachment_url?: string;
  attachment_name?: string;
  attachment_mime?: string;
  attachment_size?: number;
  created_at: string;
  reply_to_id?: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  pinned_at?: string | null;
  forwarded_from?: string;
  reactions?: MessageReaction[];
  /** Только ЛС: время прочтения собеседником */
  read_at?: string | null;
  /** Оптимистичное сообщение: ещё не подтверждено сервером */
  pending?: boolean;
}

export function fromDM(m: ChatMessage): Msg {
  return { ...m, kind: m.kind || 'text' };
}

export function fromGroup(m: GroupMessage): Msg {
  return { ...m, kind: m.kind || 'text' };
}

/** Элемент списка чатов. */
export interface ChatItem {
  ref: ThreadRef;
  key: string;
  title: string;
  avatarUrl: string;
  isPro?: boolean;
  /** Для ЛС — собеседник */
  peerId?: number;
  peerUsername?: string;
  last: Msg | null;
  unread: number;
  membersCount?: number;
  ownerId?: number;
  conv?: ChatConversation;
  group?: GroupSummary;
}

export function dmItem(c: ChatConversation): ChatItem {
  return {
    ref: { kind: 'dm', id: c.id },
    key: `dm:${c.id}`,
    title: c.other_user.display_name || c.other_user.username,
    avatarUrl: c.other_user.avatar_url,
    isPro: c.other_user.is_pro,
    peerId: c.other_user.id,
    peerUsername: c.other_user.username,
    last: c.last_message ? fromDM(c.last_message) : null,
    unread: c.unread,
    conv: c,
  };
}

export function groupItem(g: GroupSummary): ChatItem {
  return {
    ref: { kind: 'group', id: g.id },
    key: `group:${g.id}`,
    title: g.name,
    avatarUrl: g.avatar_url,
    last: g.last_message ? fromGroup(g.last_message) : null,
    unread: g.unread,
    membersCount: g.members_count,
    ownerId: g.owner_id,
    group: g,
  };
}

// ---------------- Время ----------------

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtClock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Время в списке чатов как в Telegram: сегодня — часы, на этой неделе — день, иначе — дата. */
export function fmtListTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return fmtClock(iso);
  const diffDays = (now.getTime() - d.getTime()) / 86400000;
  if (diffDays < 6) return d.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '');
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

/** Плашка-разделитель дня в ленте. */
export function fmtDayDivider(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return 'Сегодня';
  if (sameDay(d, new Date(now.getTime() - 86400000))) return 'Вчера';
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function fmtDuration(total: number): string {
  const sec = Math.max(0, Math.floor(total));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function fmtBytes(n?: number): string {
  if (!n || n <= 0) return '';
  const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---------------- Подписи ----------------

export function callTitle(status: string | undefined, outgoing: boolean, group = false): string {
  if (group) return status === 'ended' ? 'Групповой звонок' : 'Звонок';
  switch (status) {
    case 'canceled': return 'Отменённый звонок';
    case 'missed': return outgoing ? 'Нет ответа' : 'Пропущенный звонок';
    case 'declined': return outgoing ? 'Отклонён' : 'Отклонённый звонок';
    case 'ended': return outgoing ? 'Исходящий звонок' : 'Входящий звонок';
    default: return 'Звонок';
  }
}

/** Короткое описание сообщения — для списка чатов, цитат, закрепа и уведомлений. */
export function msgPreview(m: Msg | null | undefined, opts?: { outgoing?: boolean; group?: boolean }): string {
  if (!m) return '';
  if (m.deleted_at) return 'Сообщение удалено';
  if (m.kind === 'call') return callTitle(m.call_status, !!opts?.outgoing, opts?.group);
  const caption = m.content?.trim();
  if (m.kind === 'image') return caption ? `🖼 ${caption}` : 'Фотография';
  if (m.kind === 'video') return caption ? `🎬 ${caption}` : 'Видео';
  if (m.kind === 'file') return `📎 ${m.attachment_name || 'Файл'}`;
  return caption || 'Сообщение';
}

// Цвета имён в группах — как в Telegram (по id), но из палитры TL
const NAME_COLORS = ['#ff2d8f', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#f97316'];

export function nameColor(userId: number): string {
  return NAME_COLORS[Math.abs(userId) % NAME_COLORS.length];
}

export const FALLBACK_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Moby';
export const GROUP_FALLBACK = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Group';

// ---------------- Лента ----------------

/** Сообщения подряд от одного автора в пределах 5 минут собираются в «стопку». */
const STACK_GAP_MS = 5 * 60 * 1000;

export interface FeedRow {
  type: 'day' | 'unread' | 'msg';
  key: string;
  msg?: Msg;
  label?: string;
  /** Первое/последнее сообщение в стопке одного автора */
  first?: boolean;
  last?: boolean;
}

export function buildFeed(messages: Msg[], unreadFromId: number | null): FeedRow[] {
  const rows: FeedRow[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const d = new Date(m.created_at);
    const newDay = !prev || !sameDay(new Date(prev.created_at), d);
    if (newDay) rows.push({ type: 'day', key: `day:${m.created_at.slice(0, 10)}:${m.id}`, label: fmtDayDivider(m.created_at) });
    if (unreadFromId != null && m.id === unreadFromId) rows.push({ type: 'unread', key: 'unread' });

    const stacks = (a?: Msg, b?: Msg) =>
      !!a && !!b && a.sender_id === b.sender_id && a.kind !== 'call' && b.kind !== 'call'
      && sameDay(new Date(a.created_at), new Date(b.created_at))
      && Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < STACK_GAP_MS;

    const first = newDay || (unreadFromId != null && m.id === unreadFromId) || !stacks(prev, m);
    const nextBreaks = !next || !sameDay(new Date(next.created_at), d) || (unreadFromId != null && next.id === unreadFromId);
    const last = nextBreaks || !stacks(m, next);
    rows.push({ type: 'msg', key: `m:${m.id}`, msg: m, first, last });
  }
  return rows;
}

/** Слияние страниц истории с дедупликацией и хронологической сортировкой. */
export function mergeMessages(a: Msg[], b: Msg[]): Msg[] {
  const byId = new Map<number, Msg>();
  for (const m of a) byId.set(m.id, m);
  for (const m of b) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort((x, y) => {
    const t = new Date(x.created_at).getTime() - new Date(y.created_at).getTime();
    if (t !== 0) return t;
    // оптимистичные (отрицательный id) — после подтверждённых с тем же временем
    if (x.id < 0 !== y.id < 0) return x.id < 0 ? 1 : -1;
    return Math.abs(x.id) - Math.abs(y.id);
  });
}
