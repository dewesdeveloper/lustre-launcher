import { useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { onChatEvent } from '../../api/chat';
import { deleteVoiceChatMessage, getVoiceChatHistory, sendVoiceChat, type VoiceChatMessage } from '../../api/voiceChannel';
import { useAuth } from '../../context/AuthContext';
import { canModerate } from '../../utils/roles';
import { RichText } from '../../pages/chat/components/ui';

const MAX_LENGTH = 2000;

/** Текстовый чат голосового канала: виден всем, кому доступен канал, даже не подключённым к голосу. */
export function VoiceChatPanel({ channelId, canManage }: { channelId: number; canManage: boolean }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<VoiceChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const canDeleteAny = canManage || canModerate(user?.role);

  useEffect(() => {
    let alive = true;
    const load = () => getVoiceChatHistory(channelId)
      .then((list) => { if (alive) setMessages(list); })
      .catch(() => { if (alive) setError('Не удалось загрузить сообщения'); })
      .finally(() => { if (alive) setLoading(false); });

    setLoading(true);
    setMessages([]);
    setError('');
    stickToBottom.current = true;
    void load();

    const off = onChatEvent((d: any) => {
      // пока не было связи, сообщения могли прийти мимо нас
      if (d.type === '__open') { void load(); return; }
      if (d.channel_id !== channelId) return;
      if (d.type === 'voice.chat') {
        setMessages((prev) => (prev.some((m) => m.ID === d.message.ID) ? prev : [...prev, d.message]));
      } else if (d.type === 'voice.chat.deleted') {
        setMessages((prev) => prev.filter((m) => m.ID !== d.message_id));
      } else if (d.type === 'chat.rate_limited') {
        setError(d.error || 'Слишком часто — подождите немного');
      }
    });
    return () => { alive = false; off(); };
  }, [channelId]);

  useEffect(() => {
    const box = listRef.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [messages]);

  const submit = () => {
    const content = text.trim();
    if (!content) return;
    if (!sendVoiceChat(channelId, content)) {
      setError('Нет соединения с сервером');
      return;
    }
    setText('');
    setError('');
    stickToBottom.current = true;
  };

  const remove = (id: number) => {
    deleteVoiceChatMessage(id).catch((e: any) => setError(e?.response?.data?.error || 'Не удалось удалить сообщение'));
  };

  return (
    <aside className="w-[300px] shrink-0 flex flex-col min-h-0 border-l border-[var(--line)] bg-[var(--panel)]">
      <div className="px-3 h-9 flex items-center border-b border-[var(--line)] shrink-0">
        <span className="tl-head text-[10px] uppercase tracking-[0.2em] text-pearl/72">Чат канала</span>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const b = e.currentTarget;
          stickToBottom.current = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
        }}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-2 space-y-3"
      >
        {!loading && messages.length === 0 && (
          <p className="tl-term text-[15px] tl-muted text-center py-6">Сообщений пока нет — напишите первым</p>
        )}
        {messages.map((m) => {
          const name = m.author?.profile?.display_name || m.author?.username || 'Игрок';
          return (
            <div key={m.ID} className="group/msg flex gap-2 min-w-0">
              <img
                src={m.author?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.author_id}`}
                alt=""
                className="w-7 h-7 shrink-0 object-cover border border-[var(--line)]"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="tl-head text-[10px] text-white truncate">{name}</span>
                  <span className="tl-term text-[13px] text-pearl/60 shrink-0">
                    {new Date(m.CreatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {(m.author_id === user?.id || canDeleteAny) && (
                    <button
                      type="button"
                      onClick={() => remove(m.ID)}
                      title="Удалить сообщение"
                      aria-label="Удалить сообщение"
                      className="ml-auto opacity-0 group-hover/msg:opacity-100 focus:opacity-100 text-pearl/70 hover:text-accent"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="tl-term text-[15px] leading-snug text-pearl/90 whitespace-pre-wrap break-words">
                  <RichText text={m.content} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="px-3 py-1.5 tl-term text-[14px] text-[#ff5b8a] border-t border-[var(--line)]">{error}</p>}

      <div className="flex items-end gap-2 p-2 border-t border-[var(--line)] shrink-0">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder="Написать в канал…"
          aria-label="Сообщение в чат канала"
          className="tl-field resize-none flex-1 min-w-0 max-h-24"
        />
        <button type="button" onClick={submit} disabled={!text.trim()} title="Отправить" aria-label="Отправить" className="tl-btn solid !px-2.5 shrink-0">
          <Send size={14} />
        </button>
      </div>
    </aside>
  );
}
