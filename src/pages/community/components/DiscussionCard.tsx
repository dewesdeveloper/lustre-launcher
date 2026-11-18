import { IconLock, IconMessage2, IconMessages } from '@tabler/icons-react';
import type { CommunityFormat, DiscussionItem } from '../../../api/community';
import { formatOf } from '../formats';
import UserLink from '../../../components/UserLink';

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(iso).toLocaleDateString('ru-RU');
};

/** Обсуждение в ленте: сообщество и игра, заголовок, начало текста, автор, ответы и последняя активность. */
export default function DiscussionCard({ item, onOpen, onCommunity }: { item: DiscussionItem; onOpen: () => void; onCommunity: () => void }) {
  const { post, community } = item;
  const author = post.author;
  const name = author?.profile?.display_name || author?.username || 'Игрок';
  const fmt = formatOf({ format: community.format as CommunityFormat });
  const last = item.last_comment_at || post.CreatedAt;
  return (
    <article
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="tl-panel tl-gcard group flex cursor-pointer items-stretch overflow-hidden"
    >
      <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-r border-[var(--line)] bg-[rgb(var(--accent-rgb)/.04)] px-2">
        <IconMessages size={16} className={item.comments_count ? 'text-accent' : 'text-[var(--muted-2)]'} />
        <span className="tl-num text-[18px] leading-none text-white">{item.comments_count}</span>
        <span className="tl-head text-[8px] font-bold uppercase tracking-[.14em] text-[var(--muted)]">ответов</span>
      </div>

      <div className="min-w-0 flex-1 px-5 py-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCommunity(); }}
            className="tl-chip rare max-w-[220px] truncate hover:text-white"
            title="Открыть сообщество"
          >
            {community.is_private && <IconLock size={10} className="mr-1 inline align-[-1px]" />}
            {community.name}
          </button>
          <span className={`tl-chip ${community.is_adult ? 'nsfw' : 'age'} max-w-[200px] truncate`}>
            <fmt.Icon size={10} className="mr-1 inline align-[-1px]" />
            {community.game_title || fmt.label}
          </span>
        </div>
        <h3 className="truncate !text-[13px] transition-colors group-hover:text-accent">{post.title}</h3>
        {post.content && <p className="tl-term mt-1 line-clamp-2 text-[15px] text-pearl/70">{post.content}</p>}
      </div>

      <div className="flex w-44 shrink-0 flex-col items-end justify-center gap-1.5 px-5 text-right">
        <UserLink username={author?.username} displayName={author?.profile?.display_name} avatarUrl={author?.profile?.avatar_url} className="flex max-w-full items-center gap-2 hover:no-underline">
          <span className="tl-head truncate text-[10px] font-bold uppercase text-[var(--muted)] hover:text-white">{name}</span>
          <img
            src={author?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_id}`}
            alt=""
            className="h-7 w-7 shrink-0 border border-[var(--line)] object-cover"
          />
        </UserLink>
        {last && (
          <span className="tl-term flex items-center gap-1 text-[14px] text-[var(--muted-2)]" title={item.last_comment_at ? 'Последний ответ' : 'Создано'}>
            <IconMessage2 size={11} /> {ago(last)}
          </span>
        )}
      </div>
    </article>
  );
}
