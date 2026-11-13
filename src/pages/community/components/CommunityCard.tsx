import type { MouseEvent, ReactNode } from 'react';
import { IconLink, IconLock, IconTrash, IconUsers } from '@tabler/icons-react';
import type { Community } from '../../../api/community';

type CommunityCardItemProps = {
  community: Community;
  /** Владелец: может скопировать ссылку-приглашение приватного сообщества */
  isOwner: boolean;
  /** Владелец или модератор: может удалить сообщество */
  canDelete: boolean;
  onDelete: () => void;
  onInvite: () => void;
  onOpen: () => void;
};

/** Метка поверх обложки (игра, тематика, «приватное») */
function CoverTag({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase shadow-lg backdrop-blur ${tone}`}>{children}</span>;
}

/** Кнопка действия в углу обложки */
function CoverAction({ title, hover, onClick, children }: { title: string; hover: string; onClick: () => void; children: ReactNode }) {
  const click = (e: MouseEvent) => {
    e.stopPropagation(); // действие не должно открывать сообщество
    onClick();
  };
  return (
    <button
      type="button"
      title={title}
      onClick={click}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/60 backdrop-blur transition-all ${hover}`}
    >
      {children}
    </button>
  );
}

/** Карточка сообщества в списке: обложка с метками, название, описание, создатель и участники. */
export function CommunityCardItem({ community: c, isOwner, canDelete, onDelete, onInvite, onOpen }: CommunityCardItemProps) {
  const cover = c.cover_url || c.game?.header_image || c.game?.banner_url;
  const creator = c.creator?.profile?.display_name || c.creator?.username || 'Игрок';
  const creatorAvatar = c.creator?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.creator_id}`;

  return (
    <article
      onClick={onOpen}
      className="group cursor-pointer overflow-hidden rounded-[2rem] border border-white/5 bg-[#09070c] shadow-xl transition-all duration-500 hover:border-accent/30"
    >
      <div className="relative aspect-video overflow-hidden bg-[#121017]">
        {cover
          ? <img src={cover} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full bg-gradient-to-br from-violet/30 via-[#121017] to-accent/20" />}

        <div className="absolute left-4 top-4 flex gap-2">
          <CoverTag tone="bg-violet/80 text-white">{c.game?.title}</CoverTag>
          <CoverTag tone="bg-accent/80 text-white">{c.theme?.name}</CoverTag>
          {c.is_private && <CoverTag tone="border border-violet/40 bg-black/70 text-violet"><IconLock size={9} /> Приватное</CoverTag>}
        </div>

        {canDelete && (
          <div className="absolute right-4 top-4 flex gap-2 opacity-0 transition-all group-hover:opacity-100">
            {isOwner && c.is_private && (
              <CoverAction title="Ссылка-приглашение" hover="hover:border-accent/40 hover:text-accent" onClick={onInvite}>
                <IconLink size={14} />
              </CoverAction>
            )}
            <CoverAction title="Удалить сообщество" hover="hover:border-red-400/40 hover:text-red-400" onClick={onDelete}>
              <IconTrash size={14} />
            </CoverAction>
          </div>
        )}
      </div>

      <div className="p-6 text-left">
        <h3 className="tl-wrap mb-2 line-clamp-1 text-base font-black uppercase tracking-tight text-white transition-colors group-hover:text-accent">{c.name}</h3>
        {c.description && <p className="tl-wrap mb-4 line-clamp-2 text-xs font-medium text-pearl/70">{c.description}</p>}
        <div className="flex items-center gap-3">
          <img src={creatorAvatar} alt="" className="h-6 w-6 rounded-full object-cover" />
          <span className="text-[10px] font-black uppercase tracking-widest text-pearl/70">{creator}</span>
          <span className="ml-auto flex items-center gap-1.5 text-pearl/60" title="Участников">
            <IconUsers size={14} />
            <span className="text-[10px] font-bold">{c.members_count}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
