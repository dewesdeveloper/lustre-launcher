import type { ReactNode } from 'react';
import { IconEdit, IconUserPlus, IconMessage, IconUserCheck, IconClock, IconUserMinus, IconLock } from '@tabler/icons-react';
import AvatarFrame from '../../../components/AvatarFrame';
import ProBadge, { PRO_NICK_CLASS } from '../../../components/ProBadge';
import type { ProfileTheme } from '../../../components/profileThemes';
import { type FriendState, type ProfileTag, levelProgress } from '../constants';

type ProfileHeaderProps = {
  profile: any;
  activeTheme: ProfileTheme;
  isOwnProfile: boolean;
  friendState: FriendState | null;
  friendBusy: boolean;
  privacyViewer: any;
  onEditProfile: () => void;
  onRemoveFriend: () => void;
  onAcceptFriendRequest: () => void;
  onSendFriendRequest: () => void;
  onMessage: () => void;
  canMessage?: boolean;
  tags?: ProfileTag[];
  memberSince?: string;
  onlineStatus?: string;
  username?: string;
  userId?: number;
  tabs?: ReactNode;
  children?: ReactNode;
};

const GRID_OVERLAY = {
  backgroundImage:
    'linear-gradient(to right, rgb(var(--accent-rgb)/.12) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--accent-rgb)/.12) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
};

export default function ProfileHeader({
  profile,
  activeTheme,
  isOwnProfile,
  friendState,
  friendBusy,
  privacyViewer,
  onEditProfile,
  onRemoveFriend,
  onAcceptFriendRequest,
  onSendFriendRequest,
  onMessage,
  canMessage = true,
  tags,
  memberSince,
  onlineStatus,
  username,
  userId,
  tabs,
  children,
}: ProfileHeaderProps) {
  const isAway = onlineStatus === 'away';
  const isOnline = onlineStatus === 'online' || isAway;
  const memberSinceText = memberSince
    ? new Date(memberSince).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const level = levelProgress(Number(profile?.xp || 0)).level;
  const handle = username || profile?.username || 'anon';
  const serial = userId ? `#${String(userId).padStart(4, '0')}` : '';

  return (
    <>
      <section className="tl-panel relative overflow-hidden" style={{ padding: '0 0 24px' }}>
        <span className="tl-spark" style={{ top: 14, right: 18, zIndex: 3 }}>
          <IconStarDecor />
        </span>

        <div className="relative h-[190px] overflow-hidden" style={{ borderBottom: '1px solid var(--line)' }}>
          {profile?.banner_url ? (
            <img src={profile.banner_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
          ) : (
            <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, rgb(var(--accent-rgb)/.38), rgba(131,56,236,.34) 55%, rgba(34,211,238,.18))' }} />
          )}
          <div className="absolute inset-0 pointer-events-none" style={GRID_OVERLAY} />
        </div>

        <div className="relative px-6 md:px-[30px] -mt-[62px] flex items-end gap-6 flex-wrap">
          <div className="relative shrink-0">
            <AvatarFrame
              avatarUrl={profile?.avatar_url}
              frameId={(profile as any)?.frame_id}
              frameUrl={(profile as any)?.avatar_frame_url}
              size="xl"
              isPro={!!profile?.is_pro}
            />
            <span className="pointer-events-none absolute -top-1 -left-1 w-2.5 h-2.5 border-l-2 border-t-2 border-accent" />
            <span className="pointer-events-none absolute -bottom-1 -right-1 w-2.5 h-2.5 border-r-2 border-b-2 border-accent" />
          </div>

          <div className="flex-1 min-w-[240px] pb-2">
            <h1 className="tl-pixel text-white text-[18px] md:text-[20px] leading-tight flex items-center gap-2.5 flex-wrap">
              <span
                className={profile?.is_pro ? PRO_NICK_CLASS : ''}
                style={profile?.is_pro ? undefined : { textShadow: 'var(--glow)' }}
              >
                {profile?.display_name || 'Новый игрок'}
              </span>
              {profile?.is_pro && <ProBadge size="md" />}
            </h1>

            <div className="tl-term text-[16px] tl-muted mt-2.5">
              @{handle}{serial ? ` · ${serial}` : ''}{memberSinceText ? ` · с ${memberSinceText}` : ''}
            </div>

            <div className="flex gap-2.5 mt-3.5 flex-wrap items-center">
              <span className={`tl-chip ${isAway ? 'warn' : isOnline ? 'ok' : ''}`}>{isAway ? 'НЕТ НА МЕСТЕ' : isOnline ? 'В СЕТИ' : 'НЕ В СЕТИ'}</span>
              <span className="tl-chip age">LVL {level}</span>
              {tags?.map((t, i) => (
                <span
                  key={`${t.text}-${i}`}
                  className="tl-chip tagpick on"
                  style={{
                    color: t.color || activeTheme.color,
                    borderColor: `${t.color || activeTheme.color}99`,
                    background: `${t.color || activeTheme.color}1f`,
                  }}
                >
                  {t.text}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-2.5 pb-2 flex-wrap">
            {isOwnProfile ? (
              <button onClick={onEditProfile} className="tl-btn">
                <IconEdit size={14} /> Редактировать
              </button>
            ) : friendState?.status === 'accepted' ? (
              <>
                <span className="tl-btn ghost cursor-default">
                  <IconUserCheck size={14} /> В друзьях
                </span>
                <button onClick={onRemoveFriend} disabled={friendBusy} className="tl-btn danger" title="Удалить из друзей">
                  <IconUserMinus size={14} /> Удалить
                </button>
              </>
            ) : friendState?.status === 'pending_out' ? (
              <span className="tl-btn ghost cursor-default">
                <IconClock size={14} /> Заявка отправлена
              </span>
            ) : friendState?.status === 'pending_in' ? (
              <button onClick={onAcceptFriendRequest} disabled={friendBusy} className="tl-btn solid">
                <IconUserCheck size={14} /> Принять заявку
              </button>
            ) : privacyViewer && privacyViewer.can_friend_request === false ? (
              <span className="tl-btn ghost cursor-default">
                <IconLock size={14} /> Заявки закрыты
              </span>
            ) : (
              <button onClick={onSendFriendRequest} disabled={friendBusy} className="tl-btn solid">
                <IconUserPlus size={14} /> Добавить в друзья
              </button>
            )}

            {!isOwnProfile && (
              <button
                onClick={onMessage}
                disabled={!canMessage}
                title={canMessage ? 'Написать сообщение' : 'Недоступно в автономном режиме'}
                className="tl-btn ghost"
              >
                <IconMessage size={14} /> Сообщение
              </button>
            )}
          </div>
        </div>
      </section>

      {tabs}

      {children}
    </>
  );
}

function IconStarDecor() {
  return (
    <span className="tl-head text-[14px]" aria-hidden>◆</span>
  );
}
