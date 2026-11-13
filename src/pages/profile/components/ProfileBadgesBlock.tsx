import { IconAward } from '@tabler/icons-react';
import BadgeEmblem from '../../../components/BadgeEmblem';
import type { UserBadge } from '../../../api/badges';

type ProfileBadgesBlockProps = {
  profileBadges: UserBadge[];
  isOwnProfile: boolean;
  onViewAll: () => void;
};

export default function ProfileBadgesBlock({ profileBadges, isOwnProfile, onViewAll }: ProfileBadgesBlockProps) {
  if (profileBadges.length === 0) return null;

  return (
    <div className="tl-panel p-[22px]">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>
          <span className="inline-flex items-center gap-2"><IconAward size={14} className="text-accent" /> ЗНАЧКИ <span className="tl-term text-[14px] tl-muted">({profileBadges.length})</span></span>
        </h3>
        {isOwnProfile && (
          <button
            onClick={onViewAll}
            className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted hover:text-white transition-colors"
          >
            Все →
          </button>
        )}
      </div>
      <div className="flex gap-2.5 flex-wrap">
        {profileBadges.map(ub => (
          <div
            key={ub.ID}
            title={`${ub.badge?.name} — ${ub.badge?.description}${typeof ub.holders_percent === 'number' ? ` · есть у ${ub.holders_percent}%` : ''}`}
            className="cursor-default hover:scale-110 transition-transform"
          >
            <BadgeEmblem code={ub.badge?.code} rarity={ub.badge?.rarity} size={52} />
          </div>
        ))}
      </div>
    </div>
  );
}
