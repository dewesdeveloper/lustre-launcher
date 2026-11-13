import { IconTrash } from '@tabler/icons-react';
import type { CommunityImage } from '../../../api/community';

interface CommunityImageCardProps {
  image: CommunityImage;
  canDelete: boolean;
  onDelete: () => void;
}

export default function CommunityImageCard({ image, canDelete, onDelete }: CommunityImageCardProps) {
  return (
    <div className="tl-panel group relative overflow-hidden">
      <div className="aspect-video bg-[#121017]">
        <img src={image.url} alt="" className="w-full h-full object-cover" />
      </div>
      {canDelete && (
        <button
          onClick={onDelete}
          title="Удалить изображение"
          className="tl-btn ghost absolute top-3 right-3 z-[3] opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <IconTrash size={14} />
        </button>
      )}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--line)]">
        <img
          src={image.author?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${image.author_id}`}
          alt=""
          className="w-5 h-5 border border-[var(--line)] object-cover"
        />
        <span className="tl-term text-[14px] tl-muted truncate">
          {image.author?.profile?.display_name || image.author?.username || 'Игрок'}
        </span>
      </div>
    </div>
  );
}
