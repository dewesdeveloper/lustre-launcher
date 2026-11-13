import { getPresence, presenceLabel } from '../../../api/presence';
import GameMiniCover from '../../../components/GameMiniCover';

/** Друг из /friends/list */
export type FriendEntry = {
  id: number;
  online_status: 'online' | 'away' | 'offline';
  friend_details: {
    id: number;
    username: string;
    profile: { display_name: string; avatar_url: string; tag: string };
  };
};

/** Цвет точки статуса: играет — розовый, отошёл — жёлтый, в сети — зелёный */
const dotColor = (playing: boolean, away: boolean) => (playing ? 'bg-[var(--pink)]' : away ? 'bg-[#fbbf24]' : 'bg-[var(--green2)]');

/** Строка друга в окне «Друзья»; клик (если задан onOpen) открывает чат с ним. */
export const StandaloneFriendRow = ({ friend, onOpen }: { friend: FriendEntry; onOpen?: (userId: number) => void }) => {
  const { id, username, profile } = friend.friend_details;
  const presence = getPresence(id);
  const online = !!presence;
  const playing = !!presence?.playing;
  const frame = playing ? 'border-[var(--pink)]' : online ? 'border-[var(--line-2)]' : 'border-[var(--line)] grayscale';

  return (
    <div
      title={onOpen ? 'Открыть чат' : undefined}
      onClick={() => onOpen?.(id)}
      className={`flex cursor-pointer items-center gap-3 border border-transparent p-2.5 transition-all hover:border-[var(--line)] hover:bg-[rgb(var(--accent-rgb)/.05)] ${online ? '' : 'opacity-50'}`}
    >
      <div className="relative h-9 w-9 shrink-0">
        <img src={profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`} alt="" className={`h-full w-full border bg-black object-cover ${frame}`} />
        {online && <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 border border-main-bg ${dotColor(playing, !!presence?.away)}`} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={`tl-head truncate text-[11px] font-bold uppercase leading-none ${online ? 'text-white' : 'text-[var(--muted)]'}`}>{profile.display_name}</span>
        <span className={`mt-1 truncate ${playing ? 'tl-term text-[14px] text-[var(--pink)]' : 'tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)]'}`}>
          {presenceLabel(presence).text}
        </span>
      </div>
      <GameMiniCover presence={presence} size="xs" clickable={false} />
    </div>
  );
};
