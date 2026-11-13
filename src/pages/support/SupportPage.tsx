import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import {
  createTicket, getMyTickets, getTicket, addTicketMessage, closeTicket,
} from '../../api/support';
import type { SupportTicket } from '../../api/support';
import { SupportHub } from './components/SupportHub';
import { TicketForm, TOPICS } from './components/TicketForm';
import { TicketsList } from './components/TicketsList';
import { TicketChat } from './components/TicketChat';

export default function SupportPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dlg = useDialog();
  const role = (user as any)?.role;
  const isStaff = role === 'admin' || role === 'manager';

  // --- форма ---
  const [topic, setTopic] = useState(TOPICS[0].label);
  const [topicOpen, setTopicOpen] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');
  const topicRef = useRef<HTMLDivElement>(null);

  // --- список и диалог ---
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (topicRef.current && !topicRef.current.contains(e.target as Node)) setTopicOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const loadList = async () => {
    try { setTickets(await getMyTickets()); } catch { setTickets([]); } finally { setListLoading(false); }
  };
  useEffect(() => { loadList(); }, []);

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
    loadList();
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!email.trim()) { setFormError('Укажите email для ответа'); return; }
    if (message.trim().length < 10) { setFormError('Опишите проблему подробнее (минимум 10 символов)'); return; }
    setSending(true);
    try {
      const cat = TOPICS.find(t => t.label === topic)?.category || 'other';
      const t = await createTicket({ subject: topic, email: email.trim(), category: cat, message: message.trim() });
      setSent(true);
      setMessage('');
      await loadList();
      setTimeout(() => openTicket(t.id), 600);
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Не удалось отправить обращение');
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!detail || !draft.trim()) return;
    setReplyBusy(true);
    try {
      await addTicketMessage(detail.id, draft.trim());
      setDraft('');
      await refreshDetail();
    } catch (e: any) {
      dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось отправить сообщение', danger: true });
    } finally {
      setReplyBusy(false);
    }
  };

  const doClose = async () => {
    if (!detail) return;
    const ok = await dlg.confirm({ title: 'Закрыть обращение', message: 'Обращение будет закрыто. Продолжить?', confirmText: 'Закрыть', danger: true });
    if (!ok) return;
    try { await closeTicket(detail.id); await refreshDetail(); } catch { /* ignore */ }
  };

  const filtered = query.trim()
    ? tickets.filter(t => (t.subject + ' ' + (t.messages?.[t.messages.length - 1]?.content || '')).toLowerCase().includes(query.trim().toLowerCase()))
    : tickets;

  /* ===================== ДИАЛОГ ===================== */
  if (openId !== null) {
    return (
      <TicketChat
        ticket={detail}
        loading={detailLoading}
        isStaff={isStaff}
        currentUserId={user?.id ?? 0}
        backLabel="Мои обращения"
        onBack={() => { setOpenId(null); setDetail(null); }}
        draft={draft}
        onDraftChange={setDraft}
        onSend={sendReply}
        busy={replyBusy}
        onClose={doClose}
        bottomRef={bottomRef}
      />
    );
  }

  /* ===================== ХАБ ===================== */
  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-700 text-left">
      <SupportHub
        isStaff={isStaff}
        onBack={() => navigate(-1)}
        onManage={() => navigate('/support/manage')}
      />

      <TicketForm
        topic={topic}
        topicOpen={topicOpen}
        onTopicToggle={() => setTopicOpen(o => !o)}
        onTopicOpenChange={setTopicOpen}
        onTopicChange={setTopic}
        email={email}
        onEmailChange={setEmail}
        message={message}
        onMessageChange={setMessage}
        sending={sending}
        sent={sent}
        onResetSent={() => setSent(false)}
        formError={formError}
        onSubmit={handleSubmit}
        topicRef={topicRef}
      />

      {/* Мои обращения */}
      <div className="tl-sec-head">
        <span className="bar" />
        <h2 className="tl-caps">
          Мои <span className="text-accent">обращения</span>
        </h2>
        <span className="line" />
        <span className="tag">TICKETS</span>
      </div>

      <TicketsList
        tickets={filtered}
        loading={listLoading}
        query={query}
        onQueryChange={setQuery}
        onOpen={openTicket}
      />
    </div>
  );
}
