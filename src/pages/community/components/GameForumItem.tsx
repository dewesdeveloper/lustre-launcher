import type { ReactNode } from 'react';
import { IconChevronDown, IconMessage2, IconUsers, IconUsersGroup } from '@tabler/icons-react';
import type { CommunityPost } from '../../../api/community';
import type { GameForum } from '../types';

type GameForumItemProps = {
  forum: GameForum;
  expanded: boolean;
  onToggle: () => void;
  onOpenCommunity: (id: number) => void;
  postsByCommunity: Record<number, CommunityPost[]>;
};

function Metric({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="tl-term flex items-center gap-1.5 text-[15px] text-[var(--muted-2)]">{icon} {children}</span>;
}

/** Форум игры: обложка и сводка; раскрывается в список сообществ с числом обсуждений. */
export default function GameForumItem({ forum, expanded, onToggle, onOpenCommunity, postsByCommunity }: GameForumItemProps) {
  const { game, communities } = forum;
  return (
    <div className="tl-panel tl-gcard overflow-hidden">
      <div role="button" tabIndex={0} aria-expanded={expanded} onClick={onToggle} onKeyDown={(e) => e.key === 'Enter' && onToggle()} className="flex cursor-pointer items-stretch">
        <div className="relative w-40 shrink-0 overflow-hidden border-r border-[var(--line)] bg-[#121017]">
          {game.header_image
            ? <img src={game.header_image} alt="" className="absolute inset-0 h-full w-full object-cover" />
            : <div className="absolute inset-0 bg-gradient-to-br from-violet/30 via-[#121017] to-accent/20" />}
        </div>
        <div className="min-w-0 flex-1 px-5 py-4">
          <h3 className="truncate">{game.title}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Metric icon={<IconUsersGroup size={12} />}>{forum.communityCount} сообществ</Metric>
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
          {communities.length === 0 && <p className="tl-head tl-muted py-1.5 text-[10px] font-bold uppercase">Пока нет сообществ по этой игре</p>}
          {communities.map((c) => (
            <div key={c.ID} role="link" tabIndex={0} onClick={() => onOpenCommunity(c.ID)} onKeyDown={(e) => e.key === 'Enter' && onOpenCommunity(c.ID)} className="tl-vrow group cursor-pointer">
              <div className="ic"><IconMessage2 size={15} /></div>
              <div className="vt min-w-0">
                <b className="truncate">{c.name}</b>
                <div className="vd truncate">{c.theme?.name}</div>
              </div>
              <span className="tl-term shrink-0 text-[16px] text-accent" title="Обсуждений">{postsByCommunity[c.ID]?.length ?? 0}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
