import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Check, X, UserPlus, MessageSquare, MessageCircle, Gift } from 'lucide-react';
import type { ChatConversation } from '../../api/chat';
import CaratIcon from '../icons/CaratIcon';
import { NotificationSection } from './NotificationSection';
import { NotificationRow, Avatar, avatarUrl } from './NotificationRow';

export interface PendingRequest {
  id: number;
  sender_details: {
    id: number;
    username: string;
    profile: { display_name: string; avatar_url: string };
  };
}

export interface ProfileComment {
  id: number;
  content: string;
  created_at: string;
  author: {
    id: number;
    username: string;
    profile: { display_name: string; avatar_url: string };
  };
}

interface NotificationDropdownProps {
  open: boolean;
  onClose: () => void;
  total: number;
  /** Есть что отмечать: заявки в друзья «прочитать» нельзя, на них нужно ответить */
  canMarkRead: boolean;
  bonusReady: boolean;
  onOpenCosmetics: () => void;
  requests: PendingRequest[];
  busyReq: number | null;
  onAcceptRequest: (req: PendingRequest) => void;
  onDeclineRequest: (req: PendingRequest) => void;
  unread: number;
  unreadConvs: ChatConversation[];
  onOpenChat: (userId: number) => void;
  newComments: ProfileComment[];
  onOpenProfile: () => void;
  /** «Прочитать все»: снимает счётчики чата, комментариев и напоминание о бонусе */
  onMarkAllRead?: () => void;
}

export const NotificationDropdown = ({
  open, onClose, total, canMarkRead, bonusReady, onOpenCosmetics,
  requests, busyReq, onAcceptRequest, onDeclineRequest,
  unread, unreadConvs, onOpenChat, newComments, onOpenProfile,
  onMarkAllRead,
}: NotificationDropdownProps) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -4, scale: 0.98 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className="absolute right-0 top-full mt-2 w-[340px] max-h-[70vh] overflow-y-auto custom-scrollbar rounded-2xl bg-[#0d0b13] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.8)] z-[300]"
      >
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-2 sticky top-0 bg-[#0d0b13] z-10">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">Уведомления</span>
          <div className="flex items-center gap-2">
            {canMarkRead && onMarkAllRead && (
              <button
                onClick={onMarkAllRead}
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-pearl/70 hover:text-accent transition-colors flex items-center gap-1 cursor-pointer"
                title="Отметить всё прочитанным"
              >
                <Check size={11} /> Прочитать все
              </button>
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-pearl/72 hover:text-pearl hover:bg-white/10 transition-all cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {total === 0 && (
          <div className="py-10 text-center">
            <Bell size={28} className="text-pearl/55 mx-auto mb-3" />
            <p className="text-pearl/60 text-xs uppercase font-bold tracking-widest">Пока нет уведомлений</p>
          </div>
        )}

        {/* Системные */}
        {bonusReady && (
          <NotificationSection icon={<Gift size={12} />} title="Системные">
            <NotificationRow
              onClick={() => { onClose(); onOpenCosmetics(); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center shrink-0">
                <CaratIcon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-pearl truncate">Ежедневный бонус готов</p>
                <p className="text-[10px] text-pearl/60">+250 плодов изгнания ждут тебя в магазине</p>
              </div>
              <span className="w-2 h-2 rounded-full bg-accent shrink-0 shadow-[0_0_6px_rgb(var(--accent-rgb)_/_0.8)]" />
            </NotificationRow>
          </NotificationSection>
        )}

        {/* Заявки в друзья */}
        {requests.length > 0 && (
          <NotificationSection icon={<UserPlus size={12} />} count={requests.length} title="Заявки в друзья">
            {requests.map((r) => (
              <NotificationRow key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors">
                <Avatar src={avatarUrl(r.sender_details?.profile || {})} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-pearl truncate">{r.sender_details?.profile?.display_name || r.sender_details?.username}</p>
                  <p className="text-[10px] text-pearl/60 truncate">хочет добавить вас в друзья</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onAcceptRequest(r)}
                    disabled={busyReq === r.id}
                    title="Принять"
                    className="w-7 h-7 rounded-lg bg-green-500/10 border border-green-500/40 text-green-400 hover:bg-green-500/20 transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={() => onDeclineRequest(r)}
                    disabled={busyReq === r.id}
                    title="Отклонить"
                    className="w-7 h-7 rounded-lg bg-white/5 border border-red-500/40 text-red-400/80 hover:bg-red-500/10 transition-all flex items-center justify-center cursor-pointer disabled:opacity-40"
                  >
                    <X size={13} />
                  </button>
                </div>
              </NotificationRow>
            ))}
          </NotificationSection>
        )}

        {/* Сообщения */}
        {unread > 0 && (
          <NotificationSection icon={<MessageSquare size={12} />} count={unread} title="Сообщения">
            {unreadConvs.length === 0 && (
              <p className="px-4 py-2 text-[10px] text-pearl/60">Непрочитанные сообщения...</p>
            )}
            {unreadConvs.map((c) => (
              <NotificationRow
                key={c.id}
                onClick={() => { onClose(); onOpenChat(c.other_user.id); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left cursor-pointer"
              >
                <Avatar src={avatarUrl(c.other_user)} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-pearl truncate">{c.other_user.display_name || c.other_user.username}</p>
                  <p className="text-[10px] text-pearl/60 truncate">{c.last_message?.content || 'Новое сообщение'}</p>
                </div>
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] font-black flex items-center justify-center shrink-0">
                  {c.unread > 9 ? '9+' : c.unread}
                </span>
              </NotificationRow>
            ))}
          </NotificationSection>
        )}

        {/* Комментарии */}
        {newComments.length > 0 && (
          <NotificationSection icon={<MessageCircle size={12} />} count={newComments.length} title="Комментарии">
            {newComments.map((c) => (
              <NotificationRow
                key={c.id}
                onClick={() => { onClose(); onOpenProfile(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left cursor-pointer"
              >
                <Avatar src={avatarUrl(c.author?.profile ? { ...c.author.profile, username: c.author.username } : {})} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-pearl truncate">
                    {c.author?.profile?.display_name || c.author?.username} оставил комментарий
                  </p>
                  <p className="text-[10px] text-pearl/60 truncate">{c.content}</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-accent shrink-0 shadow-[0_0_6px_rgb(var(--accent-rgb)_/_0.8)]" />
              </NotificationRow>
            ))}
          </NotificationSection>
        )}
      </motion.div>
    )}
  </AnimatePresence>
);
