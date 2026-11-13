import {
  IconSearch, IconX, IconArrowRight, IconMessage2Question,
} from '@tabler/icons-react';
import type { SupportTicket } from '../../../api/support';
import { ticketStatusStyles, CATEGORY_LABEL, PRIORITY_LABEL, avatarOf } from '../ui';

const STATUS_FILTERS: { id: string; label: string }[] = [
  { id: '', label: 'Все' },
  { id: 'open', label: 'Открытые' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'resolved', label: 'Решённые' },
  { id: 'closed', label: 'Закрытые' },
];

interface ManageTicketsListProps {
  tickets: SupportTicket[];
  loading: boolean;
  status: string;
  assigned: string;
  query: string;
  onStatusChange: (status: string) => void;
  onAssignedChange: (assigned: string) => void;
  onQueryChange: (v: string) => void;
  onOpen: (id: number) => void;
}

export const ManageTicketsList = ({
  tickets, loading, status, assigned, query,
  onStatusChange, onAssignedChange, onQueryChange, onOpen,
}: ManageTicketsListProps) => (
  <>
    {/* Фильтры */}
    <div className="tl-toolbar">
      <div className="tl-tabs">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            onClick={() => onStatusChange(f.id)}
            className={`tl-tab ${status === f.id ? 'active' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <span className="w-px h-6 bg-[var(--line)] mx-1 shrink-0" />
      <div className="tl-tabs">
        {[{ id: '', label: 'Любые' }, { id: 'me', label: 'Мои' }, { id: 'none', label: 'Неназначенные' }].map((a) => (
          <button
            key={a.id || 'any'}
            onClick={() => onAssignedChange(a.id)}
            className={`tl-tab ${assigned === a.id ? 'active' : ''}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>

    <div className="relative w-full mb-6">
      <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        data-search-hotkey="page"
        placeholder="Поиск по теме или автору..."
        className="tl-field"
        style={{ paddingLeft: 44, paddingRight: 40 }}
      />
      {query && (
        <button onClick={() => onQueryChange('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted-2)] hover:text-white transition-colors">
          <IconX size={16} />
        </button>
      )}
    </div>

    {loading ? (
      <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-24 tl-panel animate-pulse" />)}</div>
    ) : tickets.length === 0 ? (
      <div className="tl-panel p-14 text-center">
        <div className="w-16 h-16 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.05)] flex items-center justify-center mx-auto mb-5 text-[var(--muted-2)]">
          <IconMessage2Question size={28} />
        </div>
        <p className="tl-head text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Обращений нет</p>
      </div>
    ) : (
      <div className="space-y-4">
        {tickets.map(ticket => {
          const st = ticketStatusStyles[ticket.status] || ticketStatusStyles.open;
          const last = ticket.messages && ticket.messages.length ? ticket.messages[ticket.messages.length - 1] : null;
          return (
            <button
              key={ticket.id}
              onClick={() => onOpen(ticket.id)}
              className="tl-vrow w-full text-left cursor-pointer group hover:shadow-[inset_0_0_0_1px_var(--line-2)] transition-shadow"
            >
              <span className="ic overflow-hidden">
                <img src={avatarOf(ticket.author)} alt="" className="w-full h-full object-cover" />
              </span>
              <div className="vt">
                <b className="truncate">{ticket.subject}</b>
                <div className="vd truncate">
                  {ticket.author?.profile?.display_name || ticket.author?.username} · {CATEGORY_LABEL[ticket.category] || 'Другое'}
                  {last ? ` · ${last.is_staff ? 'Поддержка: ' : ''}${last.content}` : ''}
                </div>
              </div>
              {ticket.priority === 'high' && (
                <span className="tl-chip nsfw shrink-0 hidden sm:block">
                  {PRIORITY_LABEL.high}
                </span>
              )}
              <span className={`${st.chip} shrink-0`}>{st.label}</span>
              <div className="text-right shrink-0 hidden md:block">
                <p className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)]">{ticket.assignee ? 'Исполнитель' : 'Дата'}</p>
                <p className="tl-term text-[15px] text-[var(--muted)]">
                  {ticket.assignee ? (ticket.assignee.profile?.display_name || ticket.assignee.username) : new Date(ticket.created_at).toLocaleDateString('ru-RU')}
                </p>
              </div>
              <IconArrowRight size={16} className="text-[var(--muted-2)] group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0" />
            </button>
          );
        })}
      </div>
    )}
  </>
);
