import type { MouseEvent } from 'react';
import { IconChevronRight, IconMessage2, IconTrash } from '@tabler/icons-react';
import ProBadge, { PRO_NICK_CLASS } from '../../../components/ProBadge';
import { UserAvatarHover } from '../../../components/UserAvatarHover';
import type { CommunityPost } from '../../../api/community';

type PostCardProps = {
  post: CommunityPost;
  canDelete: boolean;
  onDelete: () => void;
  onOpen: () => void;
  /** Число ответов, если известно */
  commentsCount?: number;
};

/** Карточка обсуждения в списке: автор, дата, заголовок, начало текста и переход к обсуждению. */
export default function PostCard({ post, canDelete, onDelete, onOpen, commentsCount }: PostCardProps) {
  const author = post.author;
  const pro = Boolean(author?.profile?.is_pro);
  const name = author?.profile?.display_name || author?.username || 'Аноним';
  const avatar = author?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_id}`;
  const date = post.CreatedAt ? new Date(post.CreatedAt).toLocaleDateString('ru-RU') : '';

  const remove = (e: MouseEvent) => {
    e.stopPropagation(); // не открывать обсуждение при удалении
    onDelete();
  };

  return (
    <article onClick={onOpen} className="tl-panel tl-gcard group p-6 text-left">
      <div className="flex items-start gap-4">
        <UserAvatarHover username={author?.username} displayName={author?.profile?.display_name} avatarUrl={author?.profile?.avatar_url}>
          <img src={avatar} alt="" className="h-10 w-10 shrink-0 border border-[var(--line-2)] object-cover" />
        </UserAvatarHover>

        <div className="min-w-0 flex-1">
          <header className="flex items-center gap-3">
            {pro && <ProBadge />}
            <span className={`tl-head text-[10px] font-bold uppercase ${pro ? PRO_NICK_CLASS : 'text-[var(--muted)]'}`}>{name}</span>
            {date && <time className="tl-term text-[15px] text-[var(--muted-2)]">{date}</time>}
          </header>
          <h3 className="tl-wrap tl-head mt-2 text-[13px] font-bold uppercase text-white transition-colors group-hover:text-accent">{post.title}</h3>
          {post.content && (
            <p className="tl-wrap mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted)]">{post.content}</p>
          )}
          <footer className="mt-3 flex items-center gap-1.5 text-[var(--muted-2)] transition-colors group-hover:text-accent">
            <IconMessage2 size={13} />
            <span className="tl-head text-[10px] font-bold uppercase">
              Обсудить{commentsCount !== undefined ? ` · ${commentsCount}` : ''}
            </span>
            <IconChevronRight size={13} className="transition-transform group-hover:translate-x-1" />
          </footer>
        </div>

        {canDelete && (
          <button type="button" title="Удалить обсуждение" onClick={remove} className="tl-btn ghost shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
            <IconTrash size={14} />
          </button>
        )}
      </div>
    </article>
  );
}
