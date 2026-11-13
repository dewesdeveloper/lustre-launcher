import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft, IconInbox, IconShieldOff } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import {
  getManageTickets, getTicket, claimTicket, setTicketStatus, addTicketMessage,
} from '../../api/support';
import type { SupportTicket, TicketStatus } from '../../api/support';
import { TicketChat } from './components/TicketChat';
import { TicketStatusActions } from './components/TicketStatusActions';
import { ManageTicketsList } from './components/ManageTicketsList';

export default function SupportManagePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dlg = useDialog();
  const role = (user as any)?.role;
  const isStaff = role === 'admin' || role === 'manager';

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [assigned, setAssigned] = useState('');
  const [query, setQuery] = useState('');

  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!isStaff) { setLoading(false); return; }
    setLoading(true);
    try {
      setTickets(await getManageTickets({ status: status || undefined, assigned: assigned || undefined }));
    } catch (e: any) {
      if (e?.response?.status !== 403) dlg.alert({ title: 'Ошибка', message: 'Не удалось загрузить обращения', danger: true });
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status, assigned, isStaff]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [detail?.messages?.length, detailLoading]);

  const openTicket = async (id: number) => {
    setOpenId(id);
    setDetailLoading(true);
    setDetail(null);
    try { setDetail(await getTicket(id)); }
    catch { dlg.alert({ title: 'Ошибка', message: 'Не удалось открыть обращение', danger: true }); setOpenId(null); }
    finally { setDetailLoading(false); }
  };

  const refreshDetail = async () => {
    if (openId === null) return;
    setDetail(await getTicket(openId));
    load();
  };

  const claim = async () => {
    if (!detail) return;
    setBusy(true);
    try { await claimTicket(detail.id); await refreshDetail(); } catch { /* ignore */ } finally { setBusy(false); }
  };

  const changeStatus = async (s: TicketStatus) => {
    if (!detail) return;
    setBusy(true);
    try { await setTicketStatus(detail.id, s); await refreshDetail(); } catch { /* ignore */ } finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!detail || !draft.trim()) return;
    setBusy(true);
    try {
      await addTicketMessage(detail.id, draft.trim());
      setDraft('');
      await refreshDetail();
    } catch (e: any) {
      dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось отправить', danger: true });
    } finally {
      setBusy(false);
    }
  };

  if (!isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center text-left">
        <div className="tl-panel p-12 text-center max-w-sm">
          <IconShieldOff className="text-[var(--muted-2)] mx-auto mb-4" size={40} />
          <h2 className="tl-head text-[15px] font-bold uppercase tracking-[0.14em] text-white mb-2">Нет доступа</h2>
          <p className="tl-term text-[15px] tl-muted leading-relaxed">
            Рабочее место поддержки доступно только менеджерам и администраторам
          </p>
        </div>
      </div>
    );
  }

  /* ===================== ДИАЛОГ ===================== */
  if (openId !== null) {
    return (
      <TicketChat
        ticket={detail}
        loading={detailLoading}
        isStaff={true}
        currentUserId={(user as any)?.id ?? 0}
        backLabel="Входящие обращения"
        onBack={() => { setOpenId(null); setDetail(null); }}
        draft={draft}
        onDraftChange={setDraft}
        onSend={sendReply}
        busy={busy}
        statusActions={detail ? (
          <TicketStatusActions
            ticket={detail}
            currentUserId={(user as any)?.id ?? 0}
            busy={busy}
            onClaim={claim}
            onChangeStatus={changeStatus}
          />
        ) : null}
        bottomRef={bottomRef}
      />
    );
  }

  /* ===================== СПИСОК ===================== */
  const filtered = query.trim()
    ? tickets.filter(t => (t.subject + ' ' + (t.author?.username || '')).toLowerCase().includes(query.trim().toLowerCase()))
    : tickets;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-700 text-left">
      <button onClick={() => navigate('/support')} className="tl-btn ghost mb-4 group">
        <IconChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> В поддержку
      </button>

      <header className="mb-8">
        <div className="tl-sec-head">
          <span className="bar" />
          <h2 className="tl-caps">
            <IconInbox size={15} className="text-accent" /> Входящие <span className="text-accent">обращения</span>
          </h2>
          <span className="line" />
          <span className="tag">INBOX</span>
        </div>
        <p className="tl-term tl-muted text-[15px]">
          Приём, обработка и ответы на обращения пользователей
        </p>
      </header>

      <ManageTicketsList
        tickets={filtered}
        loading={loading}
        status={status}
        assigned={assigned}
        query={query}
        onStatusChange={setStatus}
        onAssignedChange={setAssigned}
        onQueryChange={setQuery}
        onOpen={openTicket}
      />
    </div>
  );
}
