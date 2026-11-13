import api from './index';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportMessage {
  id: number;
  ticket_id: number;
  user_id: number;
  content: string;
  is_staff: boolean;
  created_at: string;
  author?: { id: number; username: string; profile?: { display_name?: string; avatar_url?: string } };
}

export interface SupportTicket {
  id: number;
  user_id: number;
  subject: string;
  email?: string;
  category: string;
  status: TicketStatus;
  priority: string;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
  author?: { id: number; username: string; profile?: { display_name?: string; avatar_url?: string } };
  assignee?: { id: number; username: string; profile?: { display_name?: string; avatar_url?: string } } | null;
  messages?: SupportMessage[];
}

export async function createTicket(payload: { subject: string; email?: string; category: string; priority?: string; message: string }): Promise<SupportTicket> {
  const res = await api.post('/support/tickets', payload);
  return res.data;
}

export async function getMyTickets(): Promise<SupportTicket[]> {
  const res = await api.get('/support/tickets');
  return res.data || [];
}

export async function getTicket(id: number): Promise<SupportTicket> {
  const res = await api.get(`/support/tickets/${id}`);
  return res.data;
}

export async function addTicketMessage(id: number, content: string): Promise<SupportMessage> {
  const res = await api.post(`/support/tickets/${id}/messages`, { content });
  return res.data;
}

export async function closeTicket(id: number): Promise<SupportTicket> {
  const res = await api.post(`/support/tickets/${id}/close`);
  return res.data;
}

// --- Рабочее место поддержки (manager/admin) ---

export async function getManageTickets(params?: { status?: string; assigned?: string }): Promise<SupportTicket[]> {
  const res = await api.get('/support/manage/tickets', { params });
  return res.data || [];
}

export async function claimTicket(id: number): Promise<SupportTicket> {
  const res = await api.post(`/support/manage/tickets/${id}/claim`);
  return res.data;
}

export async function setTicketStatus(id: number, status: TicketStatus): Promise<SupportTicket> {
  const res = await api.post(`/support/manage/tickets/${id}/status`, { status });
  return res.data;
}
