import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Volume2 } from 'lucide-react';
import { acceptVoiceInvite, declineVoiceInvite } from '../../api/voiceChannel';
import { nativeNotify } from '../../utils/nativeNotify';
import { useVoice } from './useVoice';

const INVITE_TTL = 60000;

/** Входящее приглашение в голосовой канал (живёт в главном окне, как и подключение к каналам). */
export default function VoiceInviteToast() {
  const { invite } = useVoice();
  const navigate = useNavigate();
  const key = invite ? `${invite.channel.id}:${invite.by?.id}:${invite.at}` : '';

  useEffect(() => {
    if (!invite) return;
    const who = invite.by?.display_name || invite.by?.username || 'Друг';
    if (!document.hasFocus()) {
      nativeNotify({
        title: 'Приглашение в голосовой канал',
        body: `${who} зовёт вас в «${invite.channel.name}»`,
        tag: `lh-voice-invite-${invite.channel.id}`,
        category: 'messages',
      });
    }
    const timer = setTimeout(declineVoiceInvite, INVITE_TTL);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!invite) return null;
  const who = invite.by?.display_name || invite.by?.username || 'Друг';

  const accept = () => {
    navigate(`/community/${invite.community_id}`, { state: { tab: 'voice', channelId: invite.channel.id } });
    void acceptVoiceInvite();
  };

  return (
    <div role="alertdialog" aria-label="Приглашение в голосовой канал" className="fixed top-12 right-4 z-[310] w-[340px] bg-[#0d0a14] border border-[var(--line-2)] shadow-[var(--glow)] vc-pop">
      <div className="flex items-start gap-3 p-4">
        <span className="w-9 h-9 shrink-0 flex items-center justify-center border border-[var(--line-2)] text-[var(--green2)]"><Volume2 size={18} /></span>
        <div className="min-w-0">
          <p className="tl-head text-[10px] uppercase tracking-[0.14em] text-white">Приглашение в канал</p>
          <p className="tl-term text-[16px] leading-snug text-pearl/90 mt-1 break-words">
            {who} зовёт вас в «{invite.channel.name}» сообщества «{invite.community_name}»
          </p>
        </div>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <button type="button" onClick={accept} className="tl-btn solid flex-1">Присоединиться</button>
        <button type="button" onClick={declineVoiceInvite} className="tl-btn ghost flex-1">Отклонить</button>
      </div>
    </div>
  );
}
