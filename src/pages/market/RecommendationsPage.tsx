import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  IconArrowRight, IconChevronRight, IconDeviceGamepad2, IconHeart, IconLoader2, IconRefresh, IconShoppingBag,
  IconSparkles, IconStar, IconTag, IconUsersGroup,
} from '@tabler/icons-react';
import { ImageOff } from 'lucide-react';
import { StoreSubNav } from './StoreSubNav';
import { markLeavingToGame, stripHtml } from './constants';
import {
  getRecommendations,
  type RecGame, type RecItem, type RecSource, type RecTag, type RecommendationSignals, type Recommendations,
} from '../../api/recommendations';
import { themeSwatch } from '../../components/profileThemes';

/** Источники подборки: вкладка и подзаголовок для каждого */
const SOURCES: { id: RecSource; label: string; icon: ReactNode; hint: string }[] = [
  { id: 'all', label: 'Всё', icon: <IconSparkles size={13} />, hint: 'по всем вашим интересам: отзывы, избранное, библиотека, сообщества и покупки' },
  { id: 'reviews', label: 'Отзывы', icon: <IconStar size={13} />, hint: 'по играм, которые вы положительно оценили' },
  { id: 'favorites', label: 'Избранное', icon: <IconHeart size={13} />, hint: 'по играм из вашего избранного' },
  { id: 'library', label: 'Библиотека', icon: <IconDeviceGamepad2 size={13} />, hint: 'по играм из вашей библиотеки' },
  { id: 'communities', label: 'Сообщества', icon: <IconUsersGroup size={13} />, hint: 'по играм сообществ, в которых вы состоите' },
  { id: 'customization', label: 'Кастомизация', icon: <IconShoppingBag size={13} />, hint: 'по тегам купленных предметов и стилю профиля' },
];

/** Счётчики «на чём основана подборка» */
const SIGNALS: { key: keyof RecommendationSignals; label: string; icon: ReactNode }[] = [
  { key: 'reviews', label: 'отзывов', icon: <IconStar size={14} /> },
  { key: 'favorites', label: 'в избранном', icon: <IconHeart size={14} /> },
  { key: 'library', label: 'в библиотеке', icon: <IconDeviceGamepad2 size={14} /> },
  { key: 'communities', label: 'сообществ', icon: <IconUsersGroup size={14} /> },
  { key: 'purchases', label: 'покупок', icon: <IconShoppingBag size={14} /> },
];

const RARITY: Record<string, { label: string; chip: string }> = {
  common: { label: 'Обычный', chip: 'common' },
  rare: { label: 'Редкий', chip: 'rare' },
  epic: { label: 'Эпический', chip: 'epic' },
  legendary: { label: 'Легендарный', chip: 'legendary' },
};

const money = new Intl.NumberFormat('ru-RU');

function Cover({ src, className }: { src?: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`${className} flex items-center justify-center bg-[rgb(var(--accent-rgb)/.08)] text-[var(--muted-2)]`}><ImageOff size={22} /></div>;
  }
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />;
}

function ItemCover({ item }: { item: RecItem }) {
  if (item.type !== 'theme') return <Cover src={item.image_url} className="h-full w-full object-cover" />;
  const [accent, violet] = themeSwatch(item.payload, item.scope);
  return (
    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}40, #0d0b13 55%, ${violet}55)` }}>
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-50 blur-2xl" style={{ background: accent }} />
      <span className="tl-head absolute bottom-3 left-3 text-[9px] font-bold uppercase tracking-[.25em] text-white/70">
        {item.scope === 'launcher' ? 'Тема лаунчера' : 'Тема профиля'}
      </span>
    </div>
  );
}

/** Теги игры, совпавшие с интересами пользователя — «почему это в подборке» */
function matchedTags(game: RecGame, liked: Set<number>) {
  return (game.tags ?? []).filter((t) => liked.has(t.id));
}

function WhyLine({ tags }: { tags: { id: number; name: string }[] }) {
  if (!tags.length) return <span className="tl-term text-[14px] text-[var(--muted-2)]">Похожа на ваши игры</span>;
  return (
    <span className="tl-term truncate text-[14px] text-[var(--muted)]">
      Вам нравится: <span className="text-accent">{tags.slice(0, 3).map((t) => t.name).join(', ')}</span>
    </span>
  );
}

/** Главная рекомендация — крупно, с описанием */
function Spotlight({ game, liked, onOpen }: { game: RecGame; liked: Set<number>; onOpen: () => void }) {
  const why = matchedTags(game, liked);
  const text = game.description ? stripHtml(game.description) : '';
  return (
    <button type="button" onClick={onOpen} className="tl-panel tl-gcard group grid w-full grid-cols-1 overflow-hidden text-left lg:grid-cols-[1.5fr_1fr]">
      <div className="relative aspect-video overflow-hidden bg-[#121017] lg:aspect-auto lg:min-h-[300px]">
        <Cover src={game.banner_url || game.header_image} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#07040c]/70" />
        <span className="tl-chip rare absolute left-4 top-4"><IconSparkles size={10} className="mr-1 inline align-[-1px]" />Лучшее совпадение</span>
      </div>
      <div className="flex flex-col justify-between gap-5 p-7">
        <div>
          <h2 className="tl-pixel text-[22px] leading-tight text-white transition-colors group-hover:text-accent">{game.title}</h2>
          <div className="mt-3"><WhyLine tags={why} /></div>
          {text && <p className="tl-term mt-4 line-clamp-5 text-[16px] leading-relaxed text-pearl/75">{text}</p>}
        </div>
        <div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {game.age_rating && <span className="tl-chip age">{game.age_rating}</span>}
            {(game.tags ?? []).slice(0, 5).map((t) => <span key={t.id} className={`tl-chip ${liked.has(t.id) ? 'rare' : 'age'}`}>{t.name}</span>)}
          </div>
          <span className="tl-btn solid w-fit">Открыть игру <IconArrowRight size={14} /></span>
        </div>
      </div>
    </button>
  );
}

function GameTile({ game, liked, onOpen }: { game: RecGame; liked: Set<number>; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="tl-panel tl-gcard group overflow-hidden text-left">
      <div className="relative aspect-video overflow-hidden bg-[#121017]">
        <Cover src={game.header_image || game.banner_url} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        {game.age_rating && <span className="tl-chip age absolute left-2 top-2 bg-black/60">{game.age_rating}</span>}
      </div>
      <div className="px-4 py-3">
        <h3 className="truncate text-[11px] transition-colors group-hover:text-accent">{game.title}</h3>
        <div className="mt-1.5 truncate"><WhyLine tags={matchedTags(game, liked)} /></div>
      </div>
    </button>
  );
}

function ItemTile({ item, onOpen }: { item: RecItem; onOpen: () => void }) {
  const r = RARITY[item.rarity] ?? { label: item.rarity, chip: 'age' };
  return (
    <button type="button" onClick={onOpen} className="tl-panel tl-gcard group overflow-hidden text-left">
      <div className="relative aspect-video overflow-hidden bg-[#121017]"><ItemCover item={item} /></div>
      <div className="px-4 py-3">
        <h3 className="truncate text-[11px] transition-colors group-hover:text-accent">{item.name}</h3>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={`tl-chip ${r.chip}`}>{r.label}</span>
          <span className="tl-num text-[13px] text-amber-400">{money.format(item.price)} ₸</span>
        </div>
      </div>
    </button>
  );
}

function SectionHead({ icon, title, action }: { icon: ReactNode; title: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="tl-sec-head">
      <span className="bar" />
      <h2 className="flex items-center gap-2">{icon} {title}</h2>
      <span className="line" />
      {action && (
        <button type="button" onClick={action.onClick} className="tl-btn ghost">
          {action.label} <IconChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

function TagCloud({ tags, onTag }: { tags: RecTag[]; onTag: (name: string) => void }) {
  const max = Math.max(...tags.map((t) => t.score), 1);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => {
        const strong = t.score / max > 0.6;
        return (
          <button key={t.id} type="button" onClick={() => onTag(t.name)} title={`Вес интереса: ${t.score}`}
            className={`tl-chip cursor-pointer hover:text-white ${strong ? 'rare' : 'age'}`}>
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

/** Персональные рекомендации игр и товаров кастомизации, с выбором источника (?source=). */
export const RecommendationsPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const current = SOURCES.find((s) => s.id === params.get('source')) ?? SOURCES[0];

  const [data, setData] = useState<Recommendations | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRecommendations(current.id)
      .then((r) => alive && setData(r), () => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [current.id, reload]);

  const liked = useMemo(() => new Set((data?.tags ?? []).map((t) => t.id)), [data]);
  const signals = data?.signals;
  const empty = !data || (data.games.length === 0 && data.items.length === 0);
  const [first, ...restGames] = data?.games ?? [];

  const openGame = (id: number) => { markLeavingToGame(); navigate(`/games/${id}`); };
  const byTag = (name: string) => navigate(`/store?tag=${encodeURIComponent(name)}`);
  const pick = (id: RecSource) => navigate(id === 'all' ? '/store/recommendations' : `/store/recommendations?source=${id}`);

  return (
    <div className="animate-in fade-in pb-12 duration-500 text-left">
      <StoreSubNav />

      <div className="mx-auto max-w-[1240px] px-6 pt-8">
        <header className="tl-panel relative mb-6 overflow-hidden p-8">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{
            backgroundImage: 'radial-gradient(560px 240px at 90% 0%, rgba(131,56,236,.24), transparent 70%), radial-gradient(520px 220px at 0% 100%, rgb(var(--accent-rgb)/.18), transparent 70%), linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
            backgroundSize: 'auto, auto, 28px 28px, 28px 28px',
          }} />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="tl-head mb-3 text-[10px] font-bold uppercase tracking-[.3em] text-accent">// For you</p>
              <h1 className="tl-pixel text-[30px] leading-tight text-white" style={{ textShadow: 'var(--glow)' }}>
                Рекомендовано <span className="text-violet">вам</span>
              </h1>
              <p className="tl-term mt-2 text-[16px] text-[var(--muted)]">Подборка {current.hint}.</p>
            </div>
            <button type="button" onClick={() => setReload((n) => n + 1)} className="tl-btn ghost shrink-0" title="Обновить подборку">
              <IconRefresh size={14} /> Обновить
            </button>
          </div>

          {signals && (
            <div className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {SIGNALS.map((s) => (
                <div key={s.key} className="tl-stat">
                  <div className="n">{signals[s.key]}</div>
                  <div className="l flex items-center justify-center gap-1.5">{s.icon} {s.label}</div>
                </div>
              ))}
            </div>
          )}

          {!!data?.tags.length && (
            <div className="relative mt-6">
              <p className="tl-head mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.22em] text-[var(--muted)]"><IconTag size={12} /> Ваши интересы — нажмите, чтобы открыть каталог</p>
              <TagCloud tags={data.tags.slice(0, 14)} onTag={byTag} />
            </div>
          )}
        </header>

        <div className="tl-tabs mb-8">
          {SOURCES.map((s) => (
            <button key={s.id} type="button" onClick={() => pick(s.id)} className={`tl-tab ${current.id === s.id ? 'active' : ''}`}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><IconLoader2 className="animate-spin text-accent" size={30} /></div>
        ) : empty ? (
          <div className="tl-panel p-14 text-center">
            <IconSparkles className="mx-auto mb-4 text-[var(--muted-2)]" size={32} />
            <p className="tl-head text-[11px] font-bold uppercase tracking-[.2em] text-white">Пока нечего рекомендовать</p>
            <p className="tl-term mx-auto mt-2 max-w-lg text-[16px] text-[var(--muted)]">
              Оцените игры, добавьте их в избранное или библиотеку, вступите в сообщества — и подборка появится.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => navigate('/store')} className="tl-btn solid">В каталог</button>
              <button type="button" onClick={() => navigate('/store/trends')} className="tl-btn ghost">Тренды</button>
              <button type="button" onClick={() => navigate('/community')} className="tl-btn ghost">Сообщества</button>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {first && (
              <section>
                <Spotlight game={first} liked={liked} onOpen={() => openGame(first.ID)} />
              </section>
            )}
            {restGames.length > 0 && (
              <section>
                <SectionHead icon={<IconDeviceGamepad2 size={16} className="text-accent" />} title={<>Игры <span className="text-accent">для вас</span></>} action={{ label: 'В каталог', onClick: () => navigate('/store') }} />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {restGames.map((g) => <GameTile key={g.ID} game={g} liked={liked} onOpen={() => openGame(g.ID)} />)}
                </div>
              </section>
            )}
            {data.items.length > 0 && (
              <section>
                <SectionHead icon={<IconShoppingBag size={16} className="text-violet" />} title={<>Кастомизация <span className="text-violet">для вас</span></>} action={{ label: 'В магазин', onClick: () => navigate('/cosmetics') }} />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {data.items.map((it) => <ItemTile key={it.id} item={it} onOpen={() => navigate('/cosmetics')} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
