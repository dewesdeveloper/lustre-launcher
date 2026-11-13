import type { ReactNode, RefObject } from 'react';
import {
  IconChevronLeft, IconHeadset, IconLoader2, IconSend,
} from '@tabler/icons-react';
import type { SupportTicket } from '../../../api/support';
import { ticketStatusStyles, CATEGORY_LABEL, avatarOf } from '../ui';

interface TicketChatProps {
  ticket: SupportTicket | null;
  loading: boolean;
  isStaff: boolean;
  currentUserId?: number;
  backLabel: string;
  onBack: () => void;
  draft: string;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  onClose?: () => void;
  statusActions?: ReactNode;
  bottomRef: RefObject<HTMLDivElement | null>;
}

export const TicketChat = ({
  ticket, loading, isStaff, backLabel, onBack,
  draft, onDraftChange, onSend, busy, onClose, statusActions, bottomRef,
}: TicketChatProps) => (
  <div className="h-full flex flex-col max-w-3xl mx-auto p-8 text-left">
    <div className="shrink-0">
      <button
        onClick={onBack}
        className="tl-btn ghost mb-4 group"
      >
        <IconChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> {backLabel}
      </button>

      {loading || !ticket ? (
        <div className="h-40 flex items-center justify-center"><IconLoader2 className="animate-spin text-accent" size={32} /></div>
      ) : (
        <>
          {isStaff ? (
            <div className="tl-panel p-5 flex items-center gap-4">
              <span className="w-11 h-11 border border-[rgba(131,56,236,.4)] bg-[rgb(var(--violet-rgb)/.10)] flex items-center justify-center text-violet shrink-0">
                <IconHeadset size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <h1 className="tl-head text-[13px] font-bold uppercase tracking-[0.1em] text-white truncate">{ticket.subject}</h1>
                <p className="tl-term text-[15px] text-[var(--muted)] mt-0.5">
                  {ticket.author?.profile?.display_name || ticket.author?.username} · {ticket.email || 'без email'}
                  {' · '}{CATEGORY_LABEL[ticket.category] || 'Другое'}
                  {ticket.priority === 'high' && <span className="text-[#ff5b8a]"> · высокий приоритет</span>}
                </p>
              </div>
              <span className={`${(ticketStatusStyles[ticket.status] || ticketStatusStyles.open).chip} shrink-0`}>
                {(ticketStatusStyles[ticket.status] || ticketStatusStyles.open).label}
              </span>
            </div>
          ) : (
            <div className="tl-panel p-5 flex items-center gap-4">
              <span className="w-11 h-11 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.08)] flex items-center justify-center text-accent shrink-0">
                <IconHeadset size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <h1 className="tl-head text-[13px] font-bold uppercase tracking-[0.1em] text-white truncate">{ticket.subject}</h1>
                <p className="tl-term text-[15px] text-[var(--muted)] mt-0.5">Личный диалог с поддержкой Lustre</p>
              </div>
              <span className={`${(ticketStatusStyles[ticket.status] || ticketStatusStyles.open).chip} shrink-0`}>
                {(ticketStatusStyles[ticket.status] || ticketStatusStyles.open).label}
              </span>
            </div>
          )}
          {statusActions}
        </>
      )}
    </div>

    {!loading && ticket && (
      <>
        <div className="flex-1 overflow-y-auto custom-scrollbar my-5 space-y-3 pr-1">
          {(ticket.messages || []).map((m) => {
            const mine = isStaff ? m.is_staff : !m.is_staff;
            const authorName = m.author?.profile?.display_name || m.author?.username || (m.is_staff ? 'Поддержка' : (isStaff ? 'Пользователь' : 'Вы'));
            return (
              <div key={m.id} className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
                <img src={avatarOf(m.author)} alt="" className="w-8 h-8 object-cover shrink-0 border border-[var(--line)]" />
                <div className={`max-w-[75%] flex flex-col ${mine ? 'items-end text-right' : ''}`}>
                  <div className="flex items-center gap-2 mb-1" style={{ flexDirection: mine ? 'row-reverse' : 'row' }}>
                    <span className={`tl-head text-[10px] font-bold uppercase tracking-[0.14em] ${m.is_staff ? 'text-violet' : 'text-[var(--muted)]'}`}>
                      {m.is_staff ? 'Поддержка' : authorName}
                    </span>
                    <span className="tl-term text-[14px] text-[var(--muted-2)]">
                      {new Date(m.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`tl-wrap px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap text-left border ${
                    m.is_staff
                      ? 'bg-[rgb(var(--violet-rgb)/.07)] border-[rgba(131,56,236,.4)] text-pearl/80'
                      : 'bg-[rgb(var(--accent-rgb)/.03)] border-[var(--line-2)] text-pearl/80'
                  }`}>
                    {m.content}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0">
          {isStaff ? (
            <>
              <div className="flex gap-3">
                <textarea
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                  rows={2}
                  placeholder="Ответить пользователю..."
                  className="flex-1 tl-field resize-none"
                />
                <button
                  onClick={onSend}
                  disabled={busy || !draft.trim()}
                  className="tl-btn solid"
                >
                  {busy ? <IconLoader2 size={18} className="animate-spin" /> : <IconSend size={18} />}
                </button>
              </div>
              <p className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-2)] mt-2">Enter — отправить · Shift+Enter — новая строка</p>
            </>
          ) : ticket.status === 'closed' ? (
            <div className="tl-panel p-4 text-center">
              <span className="tl-chip warn">Обращение закрыто</span>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <textarea
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                  rows={2}
                  placeholder="Написать в поддержку..."
                  className="flex-1 tl-field resize-none"
                />
                <button
                  onClick={onSend}
                  disabled={busy || !draft.trim()}
                  className="tl-btn solid"
                >
                  {busy ? <IconLoader2 size={18} className="animate-spin" /> : <IconSend size={18} />}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                <p className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted-2)]">Enter — отправить · Shift+Enter — новая строка</p>
                <button onClick={onClose} className="tl-btn danger">Закрыть обращение</button>
              </div>
            </>
          )}
        </div>
      </>
    )}
  </div>
);
