import type { ReactNode } from 'react';
import { IconChevronDown, IconLock, IconMessage2, IconUsers, IconUsersGroup } from '@tabler/icons-react';
import type { ForumItem } from '../../../api/community';

type GameForumItemProps = {
  forum: ForumItem;
  expanded: boolean;
  onToggle: () => void;
  onOpenCommunity: (id: number) => void;
  /** Показать ленту обсуждений только этой игры */
  onShowDiscussions: () => void;
};

function Metric({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="tl-term flex items-center gap-1.5 text-[15px] text-[var(--muted-2)]">{icon} {children}</span>;
}

/** Форум игры: обложка и сводка; раскрывается в список сообществ с числом обсуждений. */
export default function GameForumItem({ forum, expanded, onToggle, onOpenCommunity, onShowDiscussions }: GameForumItemProps) {
  const { game, communities } = forum;
  const cover = game.header_image || game.banner_url;
  return (
    <div className="tl-panel tl-gcard overflow-hidden">
      <div role="button" tabIndex={0} aria-expanded={expanded} onClick={onToggle} onKeyDown={(e) => e.key === 'Enter' && onToggle()} className="flex cursor-pointer items-stretch">
        <div className="relative w-44 shrink-0 overflow-hidden border-r border-[var(--line)] bg-[#121017]">
          {cover
            ? <img src={cover} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            : <div className="absolute inset-0 bg-gradient-to-br from-violet/30 via-[#121017] to-accent/20" />}
          {game.is_adult && <span className="tl-chip nsfw absolute left-2 top-2">18+</span>}
        </div>
        <div className="min-w-0 flex-1 px-5 py-4">
          <h3 className="truncate">{game.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Metric icon={<IconUsersGroup size={12} />}>{forum.community_count} сообществ</Metric>
            <Metric icon={<IconMessage2 size={12} />}>{forum.discussions} обсуждений</Metric>
            <Metric icon={<IconUsers size={12} />}>{forum.members} участников</Metric>
          </div>
        </div>
        <span className="flex items-center gap-1.5 px-5 tl-head text-[10px] font-bold uppercase text-[var(--muted)]">
          {expanded ? 'Свернуть' : 'Открыть'}
          <IconChevronDown size={14} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-[var(--line)] px-5 pb-4 pt-3">
          {communities.map((c) => (
            <div key={c.id} role="link" tabIndex={0} onClick={() => onOpenCommunity(c.id)} onKeyDown={(e) => e.key === 'Enter' && onOpenCommunity(c.id)} className="tl-vrow group cursor-pointer">
              <div className="ic">{c.is_private ? <IconLock size={15} /> : <IconMessage2 size={15} />}</div>
              <div className="vt min-w-0">
                <b className="truncate">{c.name}</b>
                <div className="vd truncate">{[c.theme_name, `${c.members_count} участн.`].filter(Boolean).join(' · ')}</div>
              </div>
              <span className="tl-term shrink-0 text-[16px] text-accent" title="Обсуждений">{c.discussions}</span>
            </div>
          ))}
          {forum.discussions > 0 && (
            <button type="button" onClick={onShowDiscussions} className="tl-btn ghost mt-1">
              <IconMessage2 size={12} /> Все обсуждения по игре
            </button>
          )}
        </div>
      )}
    </div>
  );
}
