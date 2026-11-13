import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Copy, Image as ImageIcon, Check, Loader2, Phone, UserRound, Users, Video, X, FileText, Gamepad2 } from 'lucide-react';
import api from '../../../api';
import { getMiniProfile } from '../../../api/miniProfile';
import { getConversationMediaStats, type ConversationMediaKind } from '../../../api/chat';
import { FALLBACK_AVATAR, formatLastSeen } from './chatUtils';

interface PanelProfile {
  username: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  level?: number | null;
  memberSince?: string | null;
  friends?: number | null;
  lastSeenAt?: string | null;
}

interface ChatProfilePanelProps {
  open: boolean;
  username: string;
  avatarUrl?: string;
  online: boolean;
  /** last_seen_at из presence-событий (может отсутствовать — тогда берём из профиля) */
  lastSeenAt?: string | null;
  playing?: string;
  conversationId: number;
  onCall: (withVideo: boolean) => void;
  onClose: () => void;
  onOpenMedia: (kind: ConversationMediaKind) => void;
}

/**
 * Панель профиля собеседника — открывается по клику на шапку диалога.
 * Оверлей поверх окна сообщений (портал, как у SourcePickerModal), не отдельное окно.
 */
export const ChatProfilePanel = ({
  open, username, avatarUrl, online, lastSeenAt, playing, conversationId,
  onCall, onClose, onOpenMedia,
}: ChatProfilePanelProps) => {
  const [profile, setProfile] = useState<PanelProfile | null>(null);
  const [stats, setStats] = useState({ image: 0, video: 0, file: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Расширенный профиль; приватный — фолбэк на мини-профиль
      try {
        const { data } = await api.get(`/user/${encodeURIComponent(username)}`);
        setProfile({
          username: data.username,
          displayName: data.profile?.display_name || data.username,
          bio: data.profile?.bio || '',
          avatarUrl: data.profile?.avatar_url || '',
          level: data.level?.level ?? null,
          memberSince: data.member_since || null,
          friends: data.stats?.friends ?? null,
          lastSeenAt: data.last_seen_at ?? null,
        });
      } catch (e: any) {
        if (e?.response?.status === 403) {
          const mini = await getMiniProfile(username);
          setProfile({
            username: mini?.username || username,
            displayName: mini?.display_name || mini?.username || username,
            bio: mini?.bio || '',
            avatarUrl: mini?.avatar_url || '',
            level: mini?.level ?? null,
            memberSince: mini?.member_since || null,
            friends: mini?.stats?.friends ?? null,
            lastSeenAt: mini?.last_seen_at ?? null,
          });
        } else {
          throw e;
        }
      }
      setStats(await getConversationMediaStats(conversationId));
    } catch (e: any) {
      setError('Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }, [username, conversationId]);

  useEffect(() => {
    if (!open) return;
    setProfile(null);
    setStats({ image: 0, video: 0, file: 0 });
    setCopied(false);
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const lastSeen = formatLastSeen(lastSeenAt || profile?.lastSeenAt || null);
  const copyContact = async () => {
    try {
      await navigator.clipboard.writeText(`https://lustrehub.pro/profile/${username}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const row = 'flex items-center gap-3 px-5 py-2.5 text-left w-full transition-colors';
  const rowStatic = `${row} cursor-default`;
  const rowBtn = `${row} hover:bg-[rgb(var(--accent-rgb)/.10)] cursor-pointer`;

  const mediaRows: { kind: ConversationMediaKind; label: string; icon: React.ReactNode; count: number }[] = [
    { kind: 'image', label: 'Фото', icon: <ImageIcon size={15} className="text-pearl/72" />, count: stats.image },
    { kind: 'video', label: 'Видео', icon: <Video size={15} className="text-pearl/72" />, count: stats.video },
    { kind: 'file', label: 'Файлы', icon: <FileText size={15} className="text-pearl/72" />, count: stats.file },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="tl-panel w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-end px-3 pt-2">
          <button onClick={onClose} title="Закрыть" className="p-1.5 text-pearl/70 hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14 text-pearl/60"><Loader2 size={20} className="animate-spin" /></div>
        ) : error ? (
          <div className="py-14 text-center">
            <p className="tl-term text-[13px] tl-muted mb-3">{error}</p>
            <button onClick={() => void load()} className="tl-btn ghost px-4 py-2 text-[12px]">Повторить</button>
          </div>
        ) : (
          <div className="overflow-y-auto custom-scrollbar">
            {/* Шапка: аватар, ник, статус */}
            <div className="flex flex-col items-center px-5 pb-4">
              <img
                src={profile?.avatarUrl || avatarUrl || FALLBACK_AVATAR}
                className="w-24 h-24 rounded-none object-cover bg-black border border-[var(--line)]"
                alt=""
              />
              <p className="tl-head text-[13px] uppercase tracking-[0.16em] text-white mt-3 text-center">
                {profile?.displayName || username}
              </p>
              <p className="tl-term text-[13px] mt-1">
                {playing ? (
                  <span className="text-accent">Играет в {playing}</span>
                ) : online ? (
                  <span style={{ color: 'var(--green2)' }}>В сети</span>
                ) : lastSeen ? (
                  <span className="tl-muted">Был(а) {lastSeen}</span>
                ) : (
                  <span className="tl-muted">Не в сети</span>
                )}
              </p>
            </div>

            {/* Действия */}
            <div className="grid grid-cols-3 gap-2 px-5 pb-4">
              <button onClick={() => onCall(false)} className="flex flex-col items-center gap-1.5 py-2.5 border border-[var(--line)] bg-white/[0.03] hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.10)] transition-colors">
                <Phone size={15} className="text-pearl/70" />
                <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/60">Звонок</span>
              </button>
              <button onClick={() => onCall(true)} className="flex flex-col items-center gap-1.5 py-2.5 border border-[var(--line)] bg-white/[0.03] hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.10)] transition-colors">
                <Video size={15} className="text-pearl/70" />
                <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/60">Видео</span>
              </button>
              <button onClick={() => void copyContact()} className="flex flex-col items-center gap-1.5 py-2.5 border border-[var(--line)] bg-white/[0.03] hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.10)] transition-colors">
                {copied ? <Check size={15} style={{ color: 'var(--green2)' }} /> : <Copy size={15} className="text-pearl/70" />}
                <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/60">{copied ? 'Скопировано' : 'Контакт'}</span>
              </button>
            </div>

            {/* Инфо-строки */}
            <div className="border-t border-[var(--line)] divide-y divide-white/[0.04]">
              <div className={rowStatic}>
                <UserRound size={15} className="text-pearl/72 shrink-0" />
                <span className="min-w-0">
                  <span className="block tl-term text-[13px] text-pearl/85">@{username}</span>
                  <span className="block tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/65">Username</span>
                </span>
              </div>
              {profile?.bio ? (
                <div className={rowStatic}>
                  <span className="min-w-0">
                    <span className="block tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/65 mb-0.5">О себе</span>
                    <span className="tl-wrap block tl-term text-[13px] text-pearl/85 whitespace-pre-wrap">{profile.bio}</span>
                  </span>
                </div>
              ) : null}
              {profile?.level != null ? (
                <div className={rowStatic}>
                  <Gamepad2 size={15} className="text-pearl/72 shrink-0" />
                  <span className="min-w-0">
                    <span className="block tl-term text-[13px] text-pearl/85">Уровень {profile.level}</span>
                    <span className="block tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/65">Прогресс</span>
                  </span>
                </div>
              ) : null}
              {profile?.memberSince ? (
                <div className={rowStatic}>
                  <CalendarDays size={15} className="text-pearl/72 shrink-0" />
                  <span className="min-w-0">
                    <span className="block tl-term text-[13px] text-pearl/85">
                      {new Date(profile.memberSince).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    <span className="block tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/65">На Lustre с</span>
                  </span>
                </div>
              ) : null}
              {profile?.friends != null ? (
                <div className={rowStatic}>
                  <Users size={15} className="text-pearl/72 shrink-0" />
                  <span className="min-w-0">
                    <span className="block tl-term text-[13px] text-pearl/85">{profile.friends}</span>
                    <span className="block tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/65">Друзей</span>
                  </span>
                </div>
              ) : null}
            </div>

            {/* Медиа чата */}
            <div className="border-t border-[var(--line)] divide-y divide-white/[0.04]">
              <div className="px-5 pt-3 pb-1">
                <span className="tl-head text-[10px] uppercase tracking-[0.2em] text-pearl/70">Медиа чата</span>
              </div>
              {mediaRows.map((m) => (
                <button
                  key={m.kind}
                  onClick={() => { if (m.count > 0) onOpenMedia(m.kind); }}
                  disabled={m.count === 0}
                  className={`${m.count > 0 ? rowBtn : rowStatic} ${m.count === 0 ? 'opacity-40' : ''}`}
                >
                  {m.icon}
                  <span className="tl-term text-[13px] text-pearl/85">{m.label}</span>
                  <span className="ml-auto tl-num text-[13px] text-pearl/72">{m.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
