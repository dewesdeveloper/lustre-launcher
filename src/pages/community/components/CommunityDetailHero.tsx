import { IconLock, IconUsers } from '@tabler/icons-react';
import type { Community } from '../../../api/community';

type CommunityDetailHeroProps = { community: Community; creatorName: string; creatorAvatar: string };

/** Обложка сообщества: метки, название, описание; ниже — владелец и число участников. */
export default function CommunityDetailHero({ community: c, creatorName, creatorAvatar }: CommunityDetailHeroProps) {
  const cover = c.cover_url || c.game?.header_image || c.game?.banner_url;
  return (
    <section className="tl-panel mb-8 overflow-hidden">
      <div className="relative h-64 bg-[#121017]">
        {cover
          ? <img src={cover} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-violet/30 via-[#121017] to-accent/20" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060309] via-[#060309]/50 to-transparent" />
        <div className="absolute bottom-6 left-8 right-8 z-[2]">
          <div className="mb-3 flex flex-wrap gap-2">
            {c.game?.title && <span className="tl-chip age">{c.game.title}</span>}
            {c.theme?.name && <span className="tl-chip rare">{c.theme.name}</span>}
            {c.is_private && <span className="tl-chip warn inline-flex items-center gap-1.5"><IconLock size={10} /> Приватное</span>}
          </div>
          <h1 className="tl-wrap text-[28px] leading-tight text-white" style={{ textShadow: 'var(--glow)' }}>{c.name}</h1>
          {c.description && <p className="tl-wrap tl-muted mt-2 max-w-2xl text-[13px] leading-relaxed">{c.description}</p>}
        </div>
      </div>
      <footer className="flex items-center gap-3 border-t border-[var(--line)] px-8 py-4">
        <img src={creatorAvatar} alt="" className="h-7 w-7 border border-[var(--line-2)] object-cover" />
        <div>
          <p className="tl-head tl-muted text-[10px] font-bold uppercase tracking-[.2em]">Владелец</p>
          <p className="tl-head mt-0.5 text-[11px] font-bold text-white">{creatorName}</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-[var(--muted)]" title="Участников">
          <IconUsers size={16} />
          <span className="tl-term text-[16px] text-accent">{c.members_count}</span>
        </span>
      </footer>
    </section>
  );
}
