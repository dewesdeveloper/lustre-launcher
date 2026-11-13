import { useEffect, useMemo, useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import api from '../../api';
import { onChatEvent } from '../../api/chat';
import { getPresence, usePresenceVersion } from '../../api/presence';
import { inviteToVoiceChannel } from '../../api/voiceChannel';

interface Friend {
  id: number;
  name: string;
  avatar?: string;
}

type InviteStatus = { state: 'pending' | 'sent' } | { state: 'failed'; error: string };

/** Приглашение друзей в голосовой канал: у приглашённого появится окно «Присоединиться». */
export function VoiceInviteDialog({ channelId, channelName, memberIds, onClose }: {
  channelId: number;
  channelName: string;
  memberIds: number[];
  onClose: () => void;
}) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Record<number, InviteStatus>>({});
  usePresenceVersion();

  useEffect(() => {
    api.get('/friends/list')
      .then((res) => {
        const list: any[] = Array.isArray(res.data) ? res.data : [];
        setFriends(list.map((f) => ({
          id: f.ID ?? f.id,
          name: f.profile?.display_name || f.username,
          avatar: f.profile?.avatar_url,
        })));
      })
      .catch(() => setFriends([]));
  }, []);

  useEffect(() => onChatEvent((d: any) => {
    if (d.type === 'voice.invite.sent') {
      setStatus((p) => ({ ...p, [d.target_user_id]: { state: 'sent' } }));
    } else if (d.type === 'voice.invite.failed') {
      setStatus((p) => ({ ...p, [d.target_user_id]: { state: 'failed', error: d.error || 'Не удалось пригласить' } }));
    }
  }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const presenceRank = (id: number) => (getPresence(id)?.online ? 0 : 1);
  const visible = useMemo(() => (friends ?? [])
    .filter((f) => !memberIds.includes(f.id) && (!q || f.name.toLowerCase().includes(q)))
    .sort((a, b) => presenceRank(a.id) - presenceRank(b.id) || a.name.localeCompare(b.name, 'ru')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [friends, memberIds, q]);

  const invite = (id: number) => {
    if (inviteToVoiceChannel(channelId, id)) setStatus((p) => ({ ...p, [id]: { state: 'pending' } }));
    else setStatus((p) => ({ ...p, [id]: { state: 'failed', error: 'Нет соединения с сервером' } }));
  };

  return (
    <div className="fixed inset-0 z-[320] bg-black/80 flex items-center justify-center p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Пригласить друзей в канал"
        className="w-full max-w-md tl-panel !p-0 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--line)] shrink-0">
          <UserPlus size={16} className="text-accent shrink-0" />
          <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-white truncate flex-1">Пригласить в «{channelName}»</span>
          <button type="button" onClick={onClose} title="Закрыть" aria-label="Закрыть" className="text-pearl/70 hover:text-white"><X size={16} /></button>
        </div>

        <div className="p-3 border-b border-[var(--line)] shrink-0">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск среди друзей…"
            aria-label="Поиск среди друзей"
            className="tl-field"
            autoFocus
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2">
          {friends === null && <p className="tl-term text-[15px] tl-muted text-center py-6">Загрузка…</p>}
          {friends !== null && visible.length === 0 && (
            <p className="tl-term text-[15px] tl-muted text-center py-6">{q ? 'Никого не найдено' : 'Некого пригласить'}</p>
          )}
          {visible.map((f) => {
            const st = status[f.id];
            const online = !!getPresence(f.id)?.online;
            return (
              <div key={f.id} className="px-2 py-1.5 hover:bg-white/[0.035]">
                <div className="flex items-center gap-3">
                  <img src={f.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.id}`} alt="" className="w-8 h-8 object-cover border border-[var(--line)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="tl-term text-[16px] text-white truncate">{f.name}</div>
                    <div className={`tl-term text-[13px] ${online ? 'text-[var(--green2)]' : 'text-pearl/60'}`}>{online ? 'В сети' : 'Не в сети'}</div>
                  </div>
                  {st?.state === 'sent' ? (
                    <span className="flex items-center gap-1 tl-head text-[10px] uppercase text-[var(--green2)] shrink-0"><Check size={13} /> Отправлено</span>
                  ) : (
                    <button type="button" onClick={() => invite(f.id)} disabled={st?.state === 'pending'} className="tl-btn ghost !py-1.5 shrink-0">
                      Пригласить
                    </button>
                  )}
                </div>
                {st?.state === 'failed' && <p className="tl-term text-[14px] text-[#ff5b8a] mt-1">{st.error}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
