import { Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
import AvatarFrame from '../../../components/AvatarFrame';
import ProBadge, { PRO_NICK_CLASS } from '../../../components/ProBadge';
import { PROFILE_THEMES } from '../../../components/profileThemes';
import { parseTags } from '../constants';

type ProfilePreviewCardProps = {
  profile: any;
  onAvatarClick?: () => void;
  onBannerClick?: () => void;
  uploadingAvatar?: boolean;
  uploadingBanner?: boolean;
};

const GRID_OVERLAY = {
  backgroundImage:
    'linear-gradient(to right, rgb(var(--accent-rgb)/.12) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--accent-rgb)/.12) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

export default function ProfilePreviewCard({ profile, onAvatarClick, onBannerClick, uploadingAvatar, uploadingBanner }: ProfilePreviewCardProps) {
  const activeTheme = PROFILE_THEMES.find(t => t.id === profile?.theme_id) || PROFILE_THEMES[0];
  const tags = parseTags(profile);

  return (
    <div className="tl-panel w-full overflow-hidden">
      <div className="relative h-28 overflow-hidden group cursor-pointer" onClick={onBannerClick}>
        {profile.banner_url ? (
          <img src={profile.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
        ) : (
          <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, rgb(var(--accent-rgb)/.38), rgba(131,56,236,.34) 55%, rgba(34,211,238,.18))' }} />
        )}
        <div className="absolute inset-0 pointer-events-none" style={GRID_OVERLAY} />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          {uploadingBanner ? (
            <Loader2 size={20} className="text-white animate-spin" />
          ) : (
            <span className="flex items-center gap-2 bg-black/60 px-4 py-2 text-white tl-head text-[10px] font-bold uppercase tracking-[0.14em]">
              <ImageIcon size={14} /> Сменить фон
            </span>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 -mt-10 relative">
        <div className="relative inline-block group cursor-pointer" onClick={onAvatarClick}>
          <AvatarFrame
            avatarUrl={profile.avatar_url}
            frameId={profile.frame_id}
            frameUrl={profile.avatar_frame_url}
            size="large"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 z-30">
            {uploadingAvatar ? (
              <Loader2 size={18} className="text-white animate-spin" />
            ) : (
              <Camera size={18} className="text-white" />
            )}
          </div>
        </div>

        <h4 className="tl-pixel text-white text-[13px] mt-3 flex items-center gap-2 flex-wrap">
          <span
            className={profile?.is_pro ? PRO_NICK_CLASS : ''}
            style={profile?.is_pro ? undefined : { textShadow: 'var(--glow)' }}
          >
            {profile.display_name || 'Новый игрок'}
          </span>
          {profile?.is_pro && <ProBadge size="md" />}
        </h4>
        <div className="tl-term text-[16px] tl-muted mt-1.5">
          @{profile?.username || 'anon'}
        </div>

        <div className="flex gap-2 flex-wrap mt-3 items-center">
          <span className="tl-chip age">LVL {profile.level || 1}</span>
          {tags.map((t, i) => (
            <span
              key={`${t.text}-${i}`}
              className="tl-chip"
              style={{
                color: t.color || activeTheme.color,
                backgroundColor: `${t.color || activeTheme.color}1f`,
                borderColor: `${t.color || activeTheme.color}99`,
              }}
            >
              {t.text}
            </span>
          ))}
        </div>

        <p className="tl-wrap tl-term text-[15px] tl-muted leading-relaxed mt-3 break-words">
          {profile.bio || 'Пока ничего не рассказано о себе.'}
        </p>

        <div className="mt-4">
          <div className="flex items-center justify-between tl-term text-[14px] tl-muted mb-1">
            <span>УРОВЕНЬ {profile.level || 1}</span>
            <span>{Number(profile.xp || 0).toLocaleString('ru-RU')} XP</span>
          </div>
          <div className="tl-prog">
            <div className="t">
              <div className="f" style={{ width: '45%', background: activeTheme.color }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
