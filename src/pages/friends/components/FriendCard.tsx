import { Phone } from 'lucide-react';
import GameMiniCover from '../../../components/GameMiniCover';
import { IconMessage, IconUserMinus, IconPlayerPlay, IconClock } from '@tabler/icons-react';
import { usePresence, presenceLabel } from '../../../api/presence';
import ProBadge, { PRO_NICK_CLASS } from '../../../components/ProBadge';
import { UserAvatarHover } from '../../../components/UserAvatarHover';

// Живой статус друга: «В сети» / «Играет в …» / «Не в сети»
export const PresenceLine = ({ id }: { id: number }) => {
  const p = usePresence(id);
  const label = presenceLabel(p);
  return (
    <span className={`tl-st ${p ? 'ok' : 'no'}`}>
      <span className="led" />
      {label.text}
    </span>
  );
};

interface FriendCardProps {
  friend: any;
  onOpenProfile: () => void;
  onMessage: () => void;
  onCall: () => void;
  onRemove: () => void;
}

// Карточка друга:
// аватар с LED-точкой статуса, ник, LVL, строка «сейчас», действия.
export const FriendCard = ({ friend: f, onOpenProfile, onMessage, onCall, onRemove }: FriendCardProps) => {
  const p = usePresence(f.friend_details.id);
  const online = !!p;
  const away = online && !!p?.away;
  const playing = p?.playing || null;
  const profile = f.friend_details.profile || {};
  const level = profile.level;

  const nowText = playing ? `Играет: ${playing}` : away ? 'Отошёл' : online ? 'В лаунчере' : 'Не в сети';

  return (
    <div className="tl-panel p-4 flex flex-col gap-3 group">
      <div className="flex items-center gap-3">
        <div
          className={`relative w-[54px] h-[54px] shrink-0 border-2 p-[2px] ${online ? 'border-[var(--line-2)]' : 'border-[var(--line)]'} ${online && !away ? `fx-presence online ${playing ? 'ingame' : ''}` : ''}`}
        >
          <UserAvatarHover
            username={f.friend_details.username}
            avatarUrl={profile.avatar_url}
            displayName={profile.display_name}
            online={online}
            className="block w-full h-full"
          >
            <img
              src={profile.avatar_url}
              alt=""
              className="w-full h-full object-cover"
              style={online ? undefined : { filter: 'grayscale(.65) contrast(1.05)', opacity: 0.8 }}
            />
          </UserAvatarHover>
          <span
            className={`absolute -right-1 -bottom-1 w-[10px] h-[10px] border-2 border-[var(--panel)] ${
              away ? 'bg-[#fbbf24] shadow-[0_0_6px_#fbbf24]' : online ? 'bg-[var(--green2)] shadow-[0_0_6px_var(--green2)]' : 'bg-[var(--muted-2)]'
            }`}
          />
        </div>

        <button type="button" onClick={onOpenProfile} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5 min-w-0">
            {profile.is_pro && <ProBadge />}
            <span className={`tl-head text-[11px] font-bold uppercase tracking-[.1em] truncate ${profile.is_pro ? PRO_NICK_CLASS : 'text-white'}`}>
              {profile.display_name}
            </span>
          </span>
          <span className="block tl-term text-[15px] text-[var(--muted-2)] truncate">
            @{f.friend_details.username}
          </span>
        </button>

        {level != null && <span className="tl-chip age shrink-0">LVL {level}</span>}
      </div>

      <span className={`tl-st ${away ? 'away' : online ? 'ok' : 'no'}`}>
        <span className="led" />
        {away ? 'Нет на месте' : online ? 'В сети' : 'Не в сети'}
      </span>

      <div
        className={`flex items-center gap-2 px-2.5 py-2 border border-dashed tl-term text-[15px] ${
          playing
            ? 'border-[rgb(var(--accent-rgb)/.18)] bg-[rgb(var(--accent-rgb)/.03)] text-[var(--muted)]'
            : 'border-white/10 text-[var(--muted-2)]'
        }`}
      >
        {playing && p?.playingCover ? (
          <GameMiniCover presence={p} size="sm" />
        ) : playing ? (
          <IconPlayerPlay size={14} className="text-accent shrink-0" />
        ) : (
          <IconClock size={14} className={`shrink-0 ${online ? 'text-accent' : ''}`} />
        )}
        <span className="truncate">{nowText}</span>
      </div>

      <div className="flex gap-2">
        <button onClick={onMessage} className="tl-btn flex-1">
          <IconMessage size={14} /> Чат
        </button>
        <button
          onClick={onCall}
          title="Позвонить"
          className="tl-btn ghost"
          style={{ width: 34, padding: 0 }}
        >
          <Phone size={14} />
        </button>
        <button
          onClick={onRemove}
          title="Удалить из друзей"
          className="tl-btn ghost"
          style={{ width: 34, padding: 0 }}
        >
          <IconUserMinus size={14} />
        </button>
      </div>
    </div>
  );
};
