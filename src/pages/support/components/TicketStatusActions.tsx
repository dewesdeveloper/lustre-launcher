import {
  IconCircleCheck, IconClock, IconUser, IconUserCheck,
} from '@tabler/icons-react';
import type { SupportTicket, TicketStatus } from '../../../api/support';

interface TicketStatusActionsProps {
  ticket: SupportTicket;
  currentUserId: number;
  busy: boolean;
  onClaim: () => void;
  onChangeStatus: (status: TicketStatus) => void;
}

export const TicketStatusActions = ({ ticket, currentUserId, busy, onClaim, onChangeStatus }: TicketStatusActionsProps) => (
  <div className="flex flex-wrap gap-2 mt-3">
    {ticket.assignee?.id !== currentUserId && (
      <button onClick={onClaim} disabled={busy} className="tl-btn">
        <IconUserCheck size={13} /> Принять в работу
      </button>
    )}
    <button onClick={() => onChangeStatus('in_progress')} disabled={busy || ticket.status === 'in_progress'} className="tl-btn ghost">
      <IconUser size={13} className="text-amber-400" /> В работе
    </button>
    <button onClick={() => onChangeStatus('resolved')} disabled={busy || ticket.status === 'resolved'} className="tl-btn ghost">
      <IconCircleCheck size={13} className="text-emerald-400" /> Решено
    </button>
    <button onClick={() => onChangeStatus('open')} disabled={busy || ticket.status === 'open'} className="tl-btn ghost">
      <IconClock size={13} className="text-cyan-400" /> Открыто
    </button>
    <button onClick={() => onChangeStatus('closed')} disabled={busy || ticket.status === 'closed'} className="tl-btn danger">
      Закрыть
    </button>
  </div>
);
