import { Heart, Trash2 } from 'lucide-react';
import type { LibraryEntry } from '../types';
import { startCoverFlight } from '../../../utils/coverFlight';

interface Props {
  entry: LibraryEntry;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onRemove: () => void;
}

const LibraryGameCard = ({ entry, onOpen, onToggleFavorite, onRemove }: Props) => (
  <article className="tl-gcard" onClick={(e) => { startCoverFlight(e.currentTarget.querySelector('img')); onOpen(); }}>
    <div className="thumb">
      {entry.game?.header_image ? (
        <img src={entry.game.header_image} alt={entry.game?.title} />
      ) : (
        <div className="w-full h-full grid place-items-center tl-term tl-muted text-xs bg-[#0f0a17]">
          Нет изображения
        </div>
      )}
    </div>

    <div className="badges2">
      <span className="tl-chip ok">В БИБЛИОТЕКЕ</span>
      {entry.game?.age_rating && <span className="tl-chip nsfw">{entry.game.age_rating}+</span>}
    </div>

    <div className="body">
      <h3 className="truncate">{entry.game?.title || 'Неизвестная игра'}</h3>
      <div className="dev truncate">{entry.game?.developer || '—'}</div>

      <div className="foot">
        {entry.favorite
          ? <span className="tl-owned">◆ ИЗБРАННОЕ</span>
          : <span className="tl-term tl-muted text-sm">◆ В БИБЛИОТЕКЕ</span>}

        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
            className="tl-btn"
            style={{ padding: '7px 9px' }}
            title={entry.favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          >
            <Heart size={13} className={entry.favorite ? 'fill-yellow-400 text-yellow-400' : ''} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="tl-btn ghost"
            style={{ padding: '7px 9px' }}
            title="Удалить из библиотеки"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  </article>
);

export default LibraryGameCard;
