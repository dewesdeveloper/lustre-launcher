import { ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MenuEntry } from './menuItems';
import { DropMenu } from './DropMenu';
import { iconVariants } from './menuMotion';
import Tooltip from '../../../components/Tooltip';
import AvatarFrame from '../../../components/AvatarFrame';
import ProBadge, { PRO_NICK_CLASS } from '../../../components/ProBadge';
import { levelProgress } from '../../profile/constants';

interface ProfileMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  user: any;
  items: MenuEntry[];
}

export const ProfileMenu = ({ isOpen, onToggle, onClose, user, items }: ProfileMenuProps) => {
  const profile = (user as any)?.profile;
  const xp = Number(profile?.xp || 0);
  const progress = levelProgress(xp);
  // В навигации показываем никнейм (display_name); логин — запасной вариант
  const profileName = profile?.display_name || user?.username || 'Гость';
  const isPro = !!profile?.is_pro;
  // Рамка показывается, если надета своя (картинка или CSS-ид), либо у Pro
  // — для них AvatarFrame сам подставляет эксклюзивную Pro-рамку.
  const hasFrame = !!profile?.avatar_frame_url ||
    (!!profile?.frame_id && profile.frame_id !== 'none') ||
    isPro;

  return (
  <>
    <Tooltip
      label={profileName}
      hint={`Уровень ${progress.level} · ${progress.current} / ${progress.goal} XP`}
      align="right"
    >
      <motion.button
        animate={isOpen ? "open" : "closed"}
        onClick={onToggle}
        className={`flex items-center gap-2 px-3 max-sm:px-2 h-7 border transition-all cursor-pointer outline-none ${
          isOpen
            ? 'bg-accent/10 border-[var(--line-2)]'
            : 'bg-transparent border-transparent hover:bg-accent/10'
        }`}
      >
        {hasFrame ? (
          <AvatarFrame
            avatarUrl={profile?.avatar_url}
            frameId={profile?.frame_id}
            frameUrl={profile?.avatar_frame_url}
            size="xxs"
            isPro={isPro}
          />
        ) : (
          <img
            src={user?.profile?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=Guest"}
            className="w-4 h-4 border border-[var(--line-2)] object-cover"
            alt="Аватар"
          />
        )}
        <span className="tl-head text-[10px] tracking-wide flex items-center gap-1.5">
          <span className={`max-sm:hidden ${isPro ? PRO_NICK_CLASS : 'text-pearl/80'}`}>{profileName}</span>
          {isPro && <ProBadge />}
          <motion.span variants={iconVariants}>
            <ChevronDown size={10} className="text-pearl/60" />
          </motion.span>
        </span>
      </motion.button>
    </Tooltip>

    <DropMenu open={isOpen} entries={items} onClose={onClose} place="right-0 mt-1 w-56 z-[110]" />
  </>
  );
};
