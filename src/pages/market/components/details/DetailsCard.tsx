import React, { useState } from 'react';
import { Building2, Disc, Calendar, Shield, Tags, Languages, Clock } from 'lucide-react';
import type { Game } from '../../types';
import { formatPlaytime } from '../../../../utils/playtime';

// При большом количестве языков список сворачивается
const LANG_COLLAPSE_AT = 8;
const LANG_VISIBLE = 6;

const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="tl-srow">
    <span className="k flex items-center gap-2 min-w-0">
      <span className="text-accent shrink-0 flex items-center">{icon}</span>
      <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] truncate">{label}</span>
    </span>
    <span className="v text-right truncate max-w-[58%]">{value}</span>
  </div>
);

interface DetailsCardProps {
  game: Game;
  formatDate: (dateStr: string) => string;
  /** Время в игре на аккаунте, мс */
  playtimeMs?: number;
}

const DetailsCard = ({ game, formatDate, playtimeMs }: DetailsCardProps) => {
  const [langsOpen, setLangsOpen] = useState(false);
  const manyLangs = game.languages.length >= LANG_COLLAPSE_AT;
  const visibleLangs = manyLangs && !langsOpen
    ? game.languages.slice(0, LANG_VISIBLE)
    : game.languages;

  return (
  <>
    {/* Info Card */}
    <div className="tl-panel p-5">
      <h3 className="tl-head text-[10px] font-bold uppercase tracking-[0.22em] text-accent mb-2">Детали</h3>
      {game.developer && (
        <InfoRow icon={<Building2 size={13} />} label="Разработчик" value={game.developer} />
      )}
      {game.publisher && (
        <InfoRow icon={<Disc size={13} />} label="Издатель" value={game.publisher} />
      )}
      {game.release_date && (
        <InfoRow icon={<Calendar size={13} />} label="Дата выхода" value={formatDate(game.release_date)} />
      )}
      {game.age_rating && (
        <InfoRow icon={<Shield size={13} />} label="Возрастной рейтинг" value={game.age_rating} />
      )}
      {!!playtimeMs && (
        <InfoRow icon={<Clock size={13} />} label="Наиграно" value={formatPlaytime(playtimeMs)} />
      )}
    </div>

    {/* Tags */}
    {game.tags.length > 0 && (
      <div className="tl-panel p-5">
        <h3 className="flex items-center gap-2 tl-head text-[10px] font-bold uppercase tracking-[0.22em] text-accent mb-3">
          <Tags size={13} /> Теги
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {game.tags.map(tag => (
            <span key={tag.id} className="tl-chip common">
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    )}

    {/* Languages */}
    {game.languages.length > 0 && (
      <div className="tl-panel p-5">
        <h3 className="flex items-center gap-2 tl-head text-[10px] font-bold uppercase tracking-[0.22em] text-accent mb-3">
          <Languages size={13} /> Языки
          {manyLangs && (
            <span className="tl-chip common ml-auto">{game.languages.length}</span>
          )}
        </h3>
        <div>
          {visibleLangs.map(lang => (
            <div key={lang.id} className="tl-srow">
              <span className="k">{lang.name}</span>
              <span className="flex gap-1.5">
                {lang.interface && <span className="tl-chip common">UI</span>}
                {lang.audio && <span className="tl-chip common">Озвучка</span>}
                {lang.subtitles && <span className="tl-chip common">Субтитры</span>}
              </span>
            </div>
          ))}
        </div>
        {manyLangs && (
          <button className="tl-btn ghost block mt-3" onClick={() => setLangsOpen(v => !v)}>
            {langsOpen
              ? 'Свернуть'
              : `Показать все языки · ${game.languages.length}`}
          </button>
        )}
      </div>
    )}
  </>
  );
};

export default DetailsCard;
