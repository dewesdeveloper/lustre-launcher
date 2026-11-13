import { useNavigate } from 'react-router-dom';
import { IconShieldCheck, IconCrown } from '@tabler/icons-react';
import AvatarFrame from './AvatarFrame';
import type { MiniProfile } from '../api/miniProfile';
import { parseTags } from '../pages/profile/constants';

interface MiniProfileCardProps {
  data: MiniProfile | null;
  username: string;
  /** известные данные — показываем сразу, не дожидаясь ответа */
  displayName?: string;
  avatarUrl?: string;
  online?: boolean;
  /** фон карточки: предмет магазина miniprofile_bg либо значение из профиля */
  backgroundUrl?: string;
  onOpen?: () => void;
  /** статичное превью в магазине — без перехода */
  preview?: boolean;
  className?: string;
}

const FALLBACK_BG = 'linear-gradient(135deg, rgb(var(--accent-rgb)/0.35), rgba(131,56,236,0.3) 55%, #0b0a0f)';

/**
 * Карточка минипрофиля: появляется при наведении на аватар другого пользователя.
 * Фон карточки — предмет магазина miniprofile_bg.
 */
export function MiniProfileCard({
  data, username, displayName, avatarUrl, online, backgroundUrl, onOpen, preview, className = '',
}: MiniProfileCardProps) {
  const navigate = useNavigate();

  const name = data?.display_name || displayName || username;
  const avatar = data?.avatar_url || avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
  const bg = data?.miniprofile_background_url || backgroundUrl || '';
  const isAway = data?.online_status === 'away';
  const isOnline = online ?? (data?.online_status === 'online' || isAway);
  const restricted = !!data?.restricted;
  // титулы из JSON (до 5), если массив пуст — откат к legacy-полю tag
  const titles = parseTags(data);
  const goal = data?.level_goal || 30;
  const current = data?.level_xp ?? 0;
  const pct = Math.max(0, Math.min(100, Math.round((current / goal) * 100)));

  const open = () => {
    if (preview) return;
    (onOpen || (() => navigate(`/profile/${username}`)))();
  };

  return (
    <div
      className={`w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0a0f] shadow-[0_25px_60px_rgba(0,0,0,0.7)] ${className}`}
    >
      {/* Шапка с фоном-предметом магазина */}
      <div className="relative h-[92px]">
        <div className="absolute inset-0" style={bg ? undefined : { background: FALLBACK_BG }} />
        {bg && (
          <img
            src={bg}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="absolute inset-0 bg-linear-to-b from-black/10 via-black/30 to-[#0b0a0f]" />
        {!restricted && (
          <div className="absolute -bottom-6 left-4">
            <div className="relative">
              <AvatarFrame
                avatarUrl={avatar}
                frameId={data?.frame_id}
                frameUrl={data?.avatar_frame_url}
                size="medium"
                isPro={!!data?.is_pro}
                className="ring-2 ring-[#0b0a0f]"
              />
              <span
                className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0b0a0f] ${
                  isAway ? 'bg-amber-400' : isOnline ? 'bg-green-400' : 'bg-pearl/30'
                }`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pt-9 pb-3.5 space-y-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[13px] font-black text-white truncate">{name}</p>
            {data?.is_pro && <IconCrown size={13} className="text-amber-400 shrink-0" />}
            {data?.is_friend && <IconShieldCheck size={13} className="text-cyan shrink-0" />}
          </div>
          <p className="text-[10px] text-pearl/70 font-mono truncate">@{username}</p>
        </div>

        {restricted ? (
          <p className="text-[10px] text-pearl/65 leading-relaxed">
            Профиль скрыт настройками приватности.
          </p>
        ) : (
          <>
            {titles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {titles.map((t) => {
                  const color = t.color || 'rgb(255, 0, 110)';
                  return (
                    <span
                      key={`${t.item_id}-${t.text}`}
                      className="max-w-[130px] truncate px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-widest"
                      style={{ color, borderColor: `${color}55`, background: `${color}1a` }}
                    >
                      {t.text}
                    </span>
                  );
                })}
              </div>
            ) : (
              data?.tag && (
                <span
                  className="inline-flex max-w-full items-center px-2 py-0.5 rounded-md border text-[10px] font-black uppercase tracking-widest"
                  style={{
                    color: data.tag_color || 'rgb(255, 0, 110)',
                    borderColor: (data.tag_color || '#FF006E') + '55',
                    background: (data.tag_color || '#FF006E') + '1a',
                  }}
                >
                  <span className="truncate">{data.tag}</span>
                </span>
              )
            )}

            {typeof data?.level === 'number' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-pearl/65">
                    Уровень {data.level}
                  </span>
                  <span className="text-[10px] font-mono text-pearl/65 tabular-nums">
                    {current}/{goal} XP
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-[#FF006E] to-[#8338EC] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] text-pearl/65">
              <span>{data?.stats?.games ?? 0} игр</span>
              <span>{data?.stats?.achievements ?? 0} значков</span>
              <span>{data?.stats?.friends ?? 0} друзей</span>
            </div>
          </>
        )}

        {!preview && (
          <button
            onClick={open}
            className="w-full py-2 rounded-lg bg-accent text-white text-[10px] font-black uppercase tracking-widest hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Открыть профиль
          </button>
        )}
      </div>
    </div>
  );
}

export default MiniProfileCard;
