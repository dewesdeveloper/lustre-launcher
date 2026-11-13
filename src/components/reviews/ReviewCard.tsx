import { ThumbsUp, ThumbsDown, Meh, Trash2 } from 'lucide-react';
import type { Review } from './types';
import { UserAvatarHover } from '../UserAvatarHover';
import AvatarFrame from '../AvatarFrame';
import { parseTags } from '../../pages/profile/constants';

interface ReviewCardProps {
  review: Review;
  canDelete: boolean;
  onDelete: (id: number) => void;
}

export const ReviewCard = ({ review, canDelete, onDelete }: ReviewCardProps) => {
  const profile = review.author?.profile;
  // титулы автора — тот же JSON, что и в профиле
  const titles = parseTags(profile);
  const visibleTitles = titles.slice(0, 2);

  return (
    <div className="bg-black/20 p-4 rounded-2xl border border-violet/5">
      <div className="flex items-start gap-3">
        <UserAvatarHover
          username={review.author?.username}
          displayName={profile?.display_name}
          avatarUrl={profile?.avatar_url}
        >
          <AvatarFrame
            avatarUrl={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${review.author?.username}`}
            frameId={profile?.frame_id}
            frameUrl={profile?.avatar_frame_url}
            isPro={!!profile?.is_pro}
            size="xs"
          />
        </UserAvatarHover>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold text-pearl/70">
              {profile?.display_name || review.author?.username || 'Пользователь'}
            </span>
            {visibleTitles.map((t) => {
              const color = t.color || '#FF006E';
              return (
                <span
                  key={`${t.item_id}-${t.text}`}
                  className="max-w-[86px] truncate px-1.5 py-px rounded border text-[10px] font-black uppercase tracking-wider shrink-0"
                  style={{ color, borderColor: `${color}55`, background: `${color}1a` }}
                >
                  {t.text}
                </span>
              );
            })}
            {titles.length > visibleTitles.length && (
              <span className="text-[10px] font-bold text-pearl/60 shrink-0">
                +{titles.length - visibleTitles.length}
              </span>
            )}
            {review.neutral ? (
              <span title="Нейтральный"><Meh size={11} className="text-amber-300" /></span>
            ) : review.positive ? (
              <ThumbsUp size={11} className="text-green-400 fill-green-400" />
            ) : (
              <ThumbsDown size={11} className="text-red-400 fill-red-400" />
            )}
            <span className="text-[10px] text-pearl/55">
              {new Date(review.created_at).toLocaleDateString()}
            </span>
            {canDelete && (
              <button
                onClick={() => onDelete(review.id)}
                className="ml-auto text-pearl/55 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {review.content && (
            <p className="tl-wrap text-xs text-pearl/72 leading-relaxed">{review.content}</p>
          )}
        </div>
      </div>
    </div>
  );
};
