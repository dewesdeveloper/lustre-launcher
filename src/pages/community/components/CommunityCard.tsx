import type { MouseEvent, ReactNode } from 'react';
import { IconLink, IconLock, IconTrash, IconUsers } from '@tabler/icons-react';
import type { Community } from '../../../api/community';
import { formatOf } from '../formats';
import VerifiedBadge from '../../../components/VerifiedBadge';

type CommunityCardItemProps = {
  community: Community;
  /** Владелец: может скопировать ссылку-приглашение приватного сообщества */
  isOwner: boolean;
  /** Владелец или модератор: может удалить сообщество */
  canDelete: boolean;
  onDelete: () => void;
  onInvite: () => void;
  onOpen: () => void;
  /** Крупная карточка «Сообщество дня» */
  featured?: boolean;
};

/** Кнопка действия на обложке */
function CoverAction({ title, hover, onClick, children }: { title: string; hover: string; onClick: () => void; children: ReactNode }) {
  const click = (e: MouseEvent) => {
    e.stopPropagation(); // действие не должно открывать сообщество
    onClick();
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={click}
      className={`flex h-8 w-8 items-center justify-center border border-white/15 bg-black/60 text-white/70 backdrop-blur transition-colors ${hover}`}
    >
      {children}
    </button>
  );
}

/** Карточка сообщества: обложка с форматом/игрой, название, описание, создатель и участники. */
export function CommunityCardItem({ community: c, isOwner, canDelete, onDelete, onInvite, onOpen, featured = false }: CommunityCardItemProps) {
  const fmt = formatOf(c);
  const cover = c.cover_url || c.game?.header_image || c.game?.banner_url;
  const creator = c.creator?.profile?.display_name || c.creator?.username || 'Игрок';
  const creatorAvatar = c.creator?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.creator_id}`;

  return (
    <article
      onClick={onOpen}
      className={`group relative flex cursor-pointer overflow-hidden border border-[var(--line)] bg-[#0b0812] transition-all duration-300 hover:-translate-y-0.5 hover:border-[rgb(var(--accent-rgb)/.55)] hover:shadow-[0_10px_30px_rgb(var(--accent-rgb)/.15)] ${featured ? 'flex-col lg:flex-row' : 'flex-col'}`}
    >
      <div className={`relative overflow-hidden bg-[#121017] ${featured ? 'aspect-video lg:aspect-auto lg:w-[58%] lg:min-h-[260px]' : 'aspect-[16/8]'}`}>
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_20%,rgb(var(--accent-rgb)/.28),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(131,56,236,.3),transparent_60%)]">
            <fmt.Icon size={featured ? 64 : 44} className="text-white/25" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0812] via-transparent to-transparent opacity-80" />

        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 border border-white/15 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
            <fmt.Icon size={12} className={fmt.tone} /> {c.game?.title || fmt.label}
          </span>
          {c.is_private && (
            <span className="inline-flex items-center gap-1 border border-violet/40 bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-violet backdrop-blur">
              <IconLock size={11} /> Приватное
            </span>
          )}
        </div>

        {(canDelete || (isOwner && c.is_private)) && (
          <div className="absolute right-3 top-3 flex gap-1.5">
            {isOwner && c.is_private && (
              <CoverAction title="Пригласить по ссылке" hover="hover:border-accent/50 hover:text-accent" onClick={onInvite}>
                <IconLink size={14} />
              </CoverAction>
            )}
            {canDelete && (
              <span className="opacity-0 transition-opacity group-hover:opacity-100">
                <CoverAction title="Удалить сообщество" hover="hover:border-red-400/50 hover:text-red-400" onClick={onDelete}>
                  <IconTrash size={14} />
                </CoverAction>
              </span>
            )}
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col p-5 text-left ${featured ? 'lg:justify-center lg:p-8' : ''}`}>
        {featured && <p className="tl-head mb-2 text-[10px] font-bold uppercase tracking-[.25em] text-accent">★ Самое большое сообщество</p>}
        <h3 className={`tl-wrap line-clamp-1 font-black uppercase tracking-tight text-white transition-colors group-hover:text-accent ${featured ? 'text-2xl' : 'text-[15px]'}`}>{c.name}{c.verified && <VerifiedBadge kind="community" size={featured ? 20 : 14} className="ml-1.5" />}</h3>
        {c.theme?.name && <p className="tl-head mt-1 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">{c.theme.name}</p>}
        <p className={`tl-wrap mt-3 text-pearl/70 ${featured ? 'line-clamp-4 text-sm' : 'line-clamp-2 min-h-[2.5em] text-xs'}`}>
          {c.description || 'Без описания'}
        </p>
        <div className="mt-auto flex items-center gap-2.5 pt-4">
          <img src={creatorAvatar} alt="" className="h-6 w-6 border border-[var(--line)] object-cover" />
          <span className="truncate text-[10px] font-bold uppercase tracking-widest text-pearl/70">{creator}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-pearl/70" title="Участников">
            <IconUsers size={14} />
            <span className="tl-term text-[15px]">{c.members_count}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
