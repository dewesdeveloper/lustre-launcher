import { Phone } from 'lucide-react';
import type { ActiveGroupCall } from '../../../api/groupCallPresence';
import { pluralRu } from '../model';
import { ChatAvatar } from './ui';

const MAX_AVATARS = 5;

/** Плашка над лентой группы: идёт звонок, кто в нём сидит, кнопка подключения. */
export function GroupCallBanner({ call, myId, onJoin }: {
  call: ActiveGroupCall;
  myId: number;
  onJoin: () => void;
}) {
  const people = call.participants;
  const inCall = people.some((p) => p.id === myId);
  const names = people.map((p) => (p.id === myId ? 'Вы' : p.display_name || p.username)).join(', ');
  const hidden = people.length - MAX_AVATARS;

  return (
    <div className="flex items-center gap-3 px-4 h-14 border-b border-[var(--line)] bg-[var(--panel2)] shrink-0">
      <Phone size={15} className="shrink-0 text-[var(--green2)]" />
      <div className="flex items-center gap-1 shrink-0">
        {people.slice(0, MAX_AVATARS).map((p) => (
          <ChatAvatar key={p.id} src={p.avatar_url} size={28} />
        ))}
        {hidden > 0 && <span className="tl-term text-[14px] text-pearl/72 pl-1">+{hidden}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="tl-head text-[10px] uppercase tracking-[0.1em] text-[var(--green2)]">
          Идёт звонок · {people.length} {pluralRu(people.length, 'участник', 'участника', 'участников')}
        </div>
        <div className="tl-term text-[15px] leading-tight text-pearl/85 truncate" title={names}>{names}</div>
      </div>
      {inCall ? (
        <span className="tl-head text-[10px] uppercase tracking-[0.1em] text-pearl/72 shrink-0">Вы в звонке</span>
      ) : (
        <button
          type="button"
          onClick={onJoin}
          className="tl-head text-[10px] uppercase tracking-[0.1em] px-3 h-8 shrink-0 text-[var(--green2)] border border-[rgba(52,211,153,.5)] bg-[rgba(52,211,153,.10)] hover:bg-[rgba(52,211,153,.2)] transition-colors"
        >
          Подключиться
        </button>
      )}
    </div>
  );
}
