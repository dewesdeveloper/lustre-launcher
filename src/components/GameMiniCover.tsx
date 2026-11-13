import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserPresence } from '../api/presence';

/**
 * Мини-обложка игры, в которую сейчас играет друг. Показывается, только если
 * игра из каталога Lustre (сервер прислал обложку). Клик открывает страницу игры,
 * если передан clickable (в отдельных окнах без шелла лаунчера клик отключён).
 */
export default function GameMiniCover({
  presence, size = 'sm', clickable = true, className = '',
}: {
  presence?: UserPresence;
  size?: 'xs' | 'sm' | 'md';
  clickable?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const cover = presence?.playingCover;
  if (!presence?.playing || !cover || failed) return null;

  const w = size === 'xs' ? 'w-[38px]' : size === 'md' ? 'w-[86px]' : 'w-[56px]';
  const id = presence.playingId;
  const canOpen = clickable && !!id;

  return (
    <span
      role={canOpen ? 'link' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      title={presence.playing}
      onClick={canOpen ? (e) => { e.stopPropagation(); navigate(`/games/${id}`); } : undefined}
      onKeyDown={canOpen ? (e) => { if (e.key === 'Enter') { e.stopPropagation(); navigate(`/games/${id}`); } } : undefined}
      className={`fx-mini-cover relative inline-block shrink-0 aspect-[460/215] overflow-hidden border border-[var(--pink)] ${w} ${canOpen ? 'cursor-pointer' : ''} ${className}`}
    >
      <img src={cover} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} className="w-full h-full object-cover" />
      <span className="fx-mini-cover-live" aria-hidden="true" />
    </span>
  );
}
