import type { SupportMessage, TicketStatus } from '../../api/support';

export const STATUS_META: Record<TicketStatus, { label: string; color: string; bg: string; border: string }> = {
  open: { label: 'Открыт', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.4)' },
  in_progress: { label: 'В работе', color: '#FFB020', bg: 'rgba(255,176,32,0.1)', border: 'rgba(255,176,32,0.4)' },
  resolved: { label: 'Решён', color: '#22C55E', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.4)' },
  closed: { label: 'Закрыт', color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)' },
};

export const CATEGORY_LABEL: Record<string, string> = {
  bug: 'Проблема с запуском игры',
  payment: 'Ошибка оплаты или магазина',
  account: 'Аккаунт и безопасность',
  other: 'Другое',
};

// Стили статусов (классы tl-* — дизайн-система страниц поддержки)
export const ticketStatusStyles: Record<string, { label: string; chip: string; dot: string }> = {
  open: { label: 'Открыто', chip: 'tl-chip ok', dot: 'bg-[var(--green2)]' },
  in_progress: { label: 'В работе', chip: 'tl-chip age', dot: 'bg-[var(--pink)]' },
  resolved: { label: 'Решено', chip: 'tl-chip common', dot: 'bg-[var(--cyan2)]' },
  closed: { label: 'Закрыто', chip: 'tl-chip warn', dot: 'bg-[#ffb020]' },
};

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
};

export const StatusChip = ({ status }: { status: TicketStatus }) => {
  const m = STATUS_META[status] || STATUS_META.open;
  const chip = ticketStatusStyles[status]?.chip || 'tl-chip';
  return <span className={`${chip} shrink-0`}>{m.label}</span>;
};

export const avatarOf = (u?: { username?: string; profile?: { avatar_url?: string } }) =>
  u?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u?.username || 'User'}`;

export const TicketThread = ({ messages }: { messages: SupportMessage[] }) => (
  <div className="space-y-3">
    {messages.map((m) => (
      <div key={m.id} className={`flex gap-3 ${m.is_staff ? '' : 'flex-row-reverse'}`}>
        <img src={avatarOf(m.author)} alt="" className="w-8 h-8 object-cover shrink-0 border border-[var(--line)] bg-black/40" />
        <div className={`max-w-[75%] px-4 py-3 border ${m.is_staff ? 'bg-[rgb(var(--violet-rgb)/.07)] border-[rgba(131,56,236,.4)]' : 'bg-[rgb(var(--accent-rgb)/.03)] border-[var(--line-2)]'}`}>
          <div className={`flex items-center gap-2 mb-1 ${m.is_staff ? '' : 'justify-end'}`}>
            <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-pearl/60">
              {m.author?.profile?.display_name || m.author?.username || 'Пользователь'}
            </span>
            {m.is_staff && <span className="tl-chip age">Поддержка</span>}
          </div>
          <p className="tl-wrap text-[12px] text-pearl/85 leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
          <p className={`tl-term text-[14px] text-[var(--muted-2)] mt-1.5 ${m.is_staff ? '' : 'text-right'}`}>
            {new Date(m.created_at).toLocaleString('ru-RU')}
          </p>
        </div>
      </div>
    ))}
  </div>
);

export const formatDate = (iso: string) => {
  try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};
