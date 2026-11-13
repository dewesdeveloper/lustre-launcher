import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, ImageOff } from 'lucide-react';
import { cardVariants, stripHtml, releaseTime } from '../../constants';
import { startCoverFlight } from '../../../../utils/coverFlight';

interface GameCardProps {
  game: any;
  onClick: () => void;
  view?: 'grid' | 'list';
}

// Обложка с заглушкой: битая ссылка не должна оставлять пустую рамку со значком браузера
const Cover = ({ src, alt, className }: { src?: string; alt: string; className: string }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-[rgb(var(--accent-rgb)/.08)] text-[var(--muted-2)]`}>
        <ImageOff size={22} />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />;
};

// Сколько тегов целиком помещается в строку карточки: лучше показать меньше, чем обрезать все.
// Ширина оценочная (символ шрифта тега и поля чипа); если ошибётся, последний тег обрежется.
const TAG_ROW_WIDTH = 220;
function tagsThatFit(tags: any[]): any[] {
  const shown: any[] = [];
  let used = 0;
  for (const tag of tags.slice(0, 3)) {
    used += String(tag.name).length * 8 + 22;
    if (shown.length > 0 && used > TAG_ROW_WIDTH) break;
    shown.push(tag);
  }
  return shown;
}

const GameCard = ({ game, onClick, view = 'grid' }: GameCardProps) => {
  // stripHtml создаёт DOM-узел — не повторяем на каждый рендер
  const description = useMemo(() => (game.description ? stripHtml(game.description) : ''), [game.description]);
  const releaseYear = useMemo(() => {
    const t = releaseTime(game.release_date);
    return t === null ? null : new Date(t).getFullYear();
  }, [game.release_date]);
  const cover = game.header_image || game.banner_url;

  // карточка — ссылка на игру: открывается и мышью, и с клавиатуры
  // Перед переходом обложка «вылетает» из карточки на место баннера страницы игры
  const open = (card: HTMLElement) => {
    startCoverFlight(card.querySelector('img'));
    onClick();
  };
  const linkProps = {
    role: 'link' as const,
    tabIndex: 0,
    'aria-label': game.title,
    onClick: (e: React.MouseEvent<HTMLElement>) => open(e.currentTarget),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e.currentTarget); }
    },
  };

  const badges = (
    <>
      {game.age_rating && <span className="tl-chip age">{game.age_rating}</span>}
      {game.is_adult && <span className="tl-chip nsfw">NSFW</span>}
    </>
  );

  const tagList: any[] = Array.isArray(game.tags) ? game.tags : [];
  const shownTags = tagsThatFit(tagList);
  // Теги всегда в одну строку: при переносе низ карточек в ряду оказывался на разной высоте
  const tags = tagList.length > 0 && (
    <div className="flex items-center gap-1 min-w-0">
      {shownTags.map((tag: any) => (
        <span key={tag.id ?? tag.name} className="tl-chip common min-w-0 truncate" title={tag.name}>{tag.name}</span>
      ))}
      {tagList.length > shownTags.length && (
        <span className="tl-term text-[14px] text-[var(--muted-2)] shrink-0">+{tagList.length - shownTags.length}</span>
      )}
    </div>
  );

  // Если кого-то из двух не указали, показываем второго: строка не должна пустовать
  const developer = game.developer || game.publisher;
  const publisher = game.publisher || game.developer;
  const meta = [developer, releaseYear].filter(Boolean).join(' · ');

  if (view === 'list') {
    return (
      <motion.div
        variants={cardVariants}
        {...linkProps}
        className="group relative tl-panel cursor-pointer flex outline-none focus-visible:shadow-[0_0_0_2px_var(--pink)]"
      >
        <div className="relative w-40 sm:w-56 md:w-64 shrink-0 overflow-hidden border-r border-[var(--line)] min-h-[120px]">
          <Cover src={cover} alt={game.title} className="absolute inset-0 w-full h-full object-cover saturate-90 contrast-105" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#060309]/50" />
          <div className="absolute top-2 left-2 flex gap-1.5 z-[2]">{badges}</div>
        </div>

        <div className="p-5 flex-1 min-w-0 flex flex-col text-left">
          <h3 className="tl-head font-bold text-[13px] uppercase tracking-[0.06em] text-white group-hover:text-accent transition-colors leading-tight truncate">
            {game.title}
          </h3>
          {meta && <p className="tl-term text-[15px] text-[var(--muted)] mt-1 truncate">{meta}</p>}
          {description && (
            <p className="text-[12px] text-[var(--muted)] line-clamp-3 mt-3 leading-relaxed">{description}</p>
          )}
          <div className="mt-auto pt-3 flex items-center justify-between gap-3">
            {tags || <span />}
            <span className="tl-btn shrink-0"><Plus size={12} /> Подробнее</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={cardVariants}
      {...linkProps}
      className="group tl-gcard flex flex-col h-full outline-none focus-visible:shadow-[0_0_0_2px_var(--pink)]"
    >
      <div className="thumb">
        <Cover src={cover} alt={game.title} className="w-full h-full object-cover" />
      </div>
      <div className="badges2">{badges}</div>

      <div className="body flex-1 flex flex-col text-left">
        <h3 className="truncate group-hover:text-accent transition-colors" title={game.title}>{game.title}</h3>
        {/* Высота строк постоянная, чтобы теги и кнопка стояли ровно во всём ряду */}
        <div className="dev truncate min-h-[1lh]" title={meta}>{meta}</div>
        <p className="text-[12px] text-[var(--muted)] line-clamp-2 mt-2 leading-relaxed min-h-[2lh]">{description}</p>

        <div className="mt-auto pt-3">
          <div className="min-h-[25px]">{tags}</div>
          <div className="foot !flex-nowrap">
            <span className="tl-term text-[13px] text-[var(--muted-2)] flex-1" title={publisher ? `Издатель: ${publisher}` : undefined}>{publisher}</span>
            <span className="tl-btn shrink-0"><Plus size={12} /> Подробнее</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default GameCard;
