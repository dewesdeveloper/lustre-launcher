import ProBadge, { PRO_NICK_CLASS } from '../ProBadge';
import { Trash2 } from 'lucide-react';
import type { Comment } from './types';
import { UserAvatarHover } from '../UserAvatarHover';
import AvatarFrame from '../AvatarFrame';
import { parseTags } from '../../pages/profile/constants';

interface CommentItemProps {
  comment: Comment;
  canDelete: boolean;
  onDelete: (id: number) => void;
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} дн назад`;
  return new Date(dateStr).toLocaleDateString();
}

export const CommentItem = ({ comment, canDelete, onDelete }: CommentItemProps) => {
  const profile = comment.author?.profile;
  // титулы автора — тот же JSON, что и в профиле (до 5 штук)
  const titles = parseTags(profile);
  const visibleTitles = titles.slice(0, 2);

  return (
    <div className="bg-black/20 p-3.5 rounded-xl border border-violet/5 group">
      <div className="flex items-start gap-2.5">
        <UserAvatarHover
          username={comment.author?.username}
          displayName={profile?.display_name}
          avatarUrl={profile?.avatar_url}
        >
          <AvatarFrame
            avatarUrl={profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author?.username}`}
            frameId={profile?.frame_id}
            frameUrl={profile?.avatar_frame_url}
            isPro={!!profile?.is_pro}
            size="xs"
            className="mt-0.5"
          />
        </UserAvatarHover>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[11px] font-bold text-pearl/60 flex items-center gap-1.5">
              {profile?.is_pro && <ProBadge />}
              <span className={profile?.is_pro ? PRO_NICK_CLASS : undefined}>
                {profile?.display_name || comment.author?.username || 'Аноним'}
              </span>
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
            <span className="text-[10px] text-pearl/55">
              {formatTimeAgo(comment.created_at)}
            </span>
            {canDelete && (
              <button
                onClick={() => onDelete(comment.id)}
                className="ml-auto opacity-0 group-hover:opacity-100 text-pearl/55 hover:text-red-400 transition-all"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <p className="tl-wrap text-xs text-pearl/70 leading-relaxed whitespace-pre-line">{comment.content}</p>
        </div>
      </div>
    </div>
  );
};
