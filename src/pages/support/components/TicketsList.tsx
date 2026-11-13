import {
  IconMessages, IconSearch, IconX, IconArrowRight,
} from '@tabler/icons-react';
import type { SupportTicket } from '../../../api/support';
import { ticketStatusStyles } from '../ui';

interface TicketsListProps {
  tickets: SupportTicket[];
  loading: boolean;
  query: string;
  onQueryChange: (v: string) => void;
  onOpen: (id: number) => void;
}

export const TicketsList = ({ tickets, loading, query, onQueryChange, onOpen }: TicketsListProps) => (
  <>
    <div className="tl-toolbar">
      <div className="relative flex-1 min-w-[220px]">
        <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          data-search-hotkey="page"
          placeholder="Поиск по теме или тексту обращения..."
          className="tl-field"
          style={{ paddingLeft: 44, paddingRight: 40 }}
        />
        {query && (
          <button onClick={() => onQueryChange('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--muted-2)] hover:text-white transition-colors">
            <IconX size={16} />
          </button>
        )}
      </div>
    </div>

    {loading ? (
      <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="h-24 tl-panel animate-pulse" />)}</div>
    ) : tickets.length === 0 ? (
      <div className="tl-panel p-14 text-center">
        <div className="w-16 h-16 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.05)] flex items-center justify-center mx-auto mb-5 text-[var(--muted-2)]">
          <IconMessages size={28} />
        </div>
        <p className="tl-head text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
          {query ? 'Ничего не найдено' : 'У вас пока нет обращений'}
        </p>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-2">
          {query ? 'Попробуйте изменить поисковый запрос' : 'Если возникнет проблема — мы всегда на связи'}
        </p>
      </div>
    ) : (
      <div className="space-y-4">
        {tickets.map(ticket => {
          const st = ticketStatusStyles[ticket.status] || ticketStatusStyles.open;
          const last = ticket.messages && ticket.messages.length ? ticket.messages[ticket.messages.length - 1] : null;
          const hasStaffReply = !!last?.is_staff;
          return (
            <button
              key={ticket.id}
              onClick={() => onOpen(ticket.id)}
              className="tl-vrow w-full text-left cursor-pointer group hover:shadow-[inset_0_0_0_1px_var(--line-2)] transition-shadow"
            >
              <span className="ic">
                <IconMessages size={16} />
              </span>
              <div className="vt">
                <b className="truncate">{ticket.subject}</b>
                <div className="vd truncate">{last?.content || 'Нет сообщений'}</div>
              </div>
              {hasStaffReply && (
                <span className="tl-chip ok shrink-0 hidden sm:block">
                  Есть ответ
                </span>
              )}
              <span className={`${st.chip} shrink-0`}>{st.label}</span>
              <div className="text-right shrink-0 hidden md:block">
                <p className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)]">Дата</p>
                <p className="tl-term text-[15px] text-[var(--muted)]">{new Date(ticket.created_at).toLocaleDateString('ru-RU')}</p>
              </div>
              <IconArrowRight size={16} className="text-[var(--muted-2)] group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0" />
            </button>
          );
        })}
      </div>
    )}
  </>
);
