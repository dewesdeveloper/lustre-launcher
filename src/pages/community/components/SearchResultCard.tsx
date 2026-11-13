import { IconMessage2 } from '@tabler/icons-react';
import type { Community, CommunityPost } from '../../../api/community';

/** Найденное обсуждение: где оно (сообщество и игра), заголовок, автор и дата. */
export default function SearchResultCard({ post, community, onOpen }: { post: CommunityPost; community: Community; onOpen: () => void }) {
  const author = post.author;
  return (
    <div role="link" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className="tl-panel tl-gcard group flex items-center gap-4 px-5 py-4">
      <img
        src={author?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_id}`}
        alt=""
        className="h-9 w-9 shrink-0 border border-[var(--line)] object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="tl-chip rare max-w-[180px] truncate">{community.name}</span>
          <span className="tl-chip age max-w-[180px] truncate">{community.game?.title}</span>
        </div>
        <h3 className="truncate transition-colors group-hover:text-accent">{post.title}</h3>
        {post.content && <p className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{post.content}</p>}
      </div>
      <div className="shrink-0 text-right">
        <span className="block tl-head text-[10px] font-bold uppercase text-[var(--muted)]">{author?.profile?.display_name || author?.username || 'Игрок'}</span>
        {post.CreatedAt && <time className="tl-term mt-0.5 block text-[15px] text-[var(--muted-2)]">{new Date(post.CreatedAt).toLocaleDateString('ru-RU')}</time>}
      </div>
      <IconMessage2 size={16} className="shrink-0 text-[var(--muted-2)] transition-colors group-hover:text-accent" />
    </div>
  );
}
