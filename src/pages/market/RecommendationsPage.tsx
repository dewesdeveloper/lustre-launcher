import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  IconChevronRight, IconDeviceGamepad2, IconHeart, IconLoader2, IconShoppingBag,
  IconSparkles, IconStar, IconTag, IconUsersGroup,
} from '@tabler/icons-react';
import { StoreSubNav } from './StoreSubNav';
import {
  getRecommendations,
  type RecGame, type RecItem, type RecSource, type RecommendationSignals, type Recommendations,
} from '../../api/recommendations';
import { themeSwatch } from '../../components/profileThemes';

/** Источники подборки: кнопка-фильтр и заголовок страницы для каждого */
const SOURCES: { id: RecSource; chip: string; heading: [string, string]; hint: string }[] = [
  { id: 'all', chip: 'Всё', heading: ['Рекомендовано', 'Lustre'], hint: 'Подборка по всем вашим интересам: отзывы, избранное, сообщества и покупки.' },
  { id: 'reviews', chip: 'Отзывы', heading: ['По вашим', 'отзывам'], hint: 'Основано на играх, которые вы положительно оценили.' },
  { id: 'favorites', chip: 'Избранное', heading: ['На основе', 'избранного'], hint: 'Основано на играх, добавленных вами в избранное.' },
  { id: 'library', chip: 'Библиотека', heading: ['Из вашей', 'библиотеки'], hint: 'Основано на играх, которые вы добавили в библиотеку.' },
  { id: 'communities', chip: 'Сообщества', heading: ['Из ваших', 'сообществ'], hint: 'Основано на играх сообществ, в которых вы состоите.' },
  { id: 'customization', chip: 'Кастомизация', heading: ['По вашей', 'кастомизации'], hint: 'Основано на тегах приобретённых товаров и стиля профиля.' },
];

/** Счётчики «на чём основана подборка» */
const SIGNALS: { key: keyof RecommendationSignals; label: string; tone: string; icon: ReactNode }[] = [
  { key: 'reviews', label: 'отзывов', tone: 'text-accent', icon: <IconStar size={13} /> },
  { key: 'favorites', label: 'в избранном', tone: 'text-rose-400', icon: <IconHeart size={13} /> },
  { key: 'library', label: 'в библиотеке', tone: 'text-emerald-400', icon: <IconDeviceGamepad2 size={13} /> },
  { key: 'communities', label: 'сообществ', tone: 'text-cyan', icon: <IconUsersGroup size={13} /> },
  { key: 'purchases', label: 'покупок', tone: 'text-violet', icon: <IconShoppingBag size={13} /> },
];

const RARITY: Record<string, string> = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };

const money = new Intl.NumberFormat('ru-RU');

const PLACEHOLDER = <div className="w-full h-full bg-gradient-to-br from-violet/30 via-[#121017] to-accent/20" />;

function ItemCover({ item }: { item: RecItem }) {
  if (item.type !== 'theme') return item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : PLACEHOLDER;
  const [accent, violet] = themeSwatch(item.payload, item.scope);
  return (
    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}40, #0d0b13 55%, ${violet}55)` }}>
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-50" style={{ background: accent }} />
      <span className="absolute bottom-3 left-3 text-[10px] font-black uppercase tracking-[0.25em] text-white/70">
        {item.scope === 'launcher' ? 'Лаунчер' : 'Профиль'}
      </span>
    </div>
  );
}

function GameTile({ game, onOpen }: { game: RecGame; onOpen: () => void }) {
  const cover = game.header_image || game.banner_url;
  return (
    <button type="button" onClick={onOpen} className="group text-left rounded-3xl overflow-hidden border border-white/5 bg-[#09070c] hover:border-accent/30 hover:-translate-y-0.5 transition-all duration-500">
      <div className="relative aspect-video bg-[#121017] overflow-hidden">
        {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> : PLACEHOLDER}
        {game.age_rating && (
          <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-[10px] font-black uppercase tracking-widest text-white/80 border border-white/10">{game.age_rating}</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="text-sm font-black text-white uppercase tracking-tight line-clamp-1 group-hover:text-accent transition-colors">{game.title}</h3>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {game.tags?.slice(0, 3).map((t) => (
            <span key={t.id} className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest bg-violet/10 border border-violet/20 text-violet/80">{t.name}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

function ItemTile({ item, onOpen }: { item: RecItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group text-left rounded-3xl overflow-hidden border border-white/5 bg-[#09070c] hover:border-violet/30 hover:-translate-y-0.5 transition-all duration-500">
      <div className="relative aspect-video bg-[#121017] overflow-hidden"><ItemCover item={item} /></div>
      <div className="p-4">
        <h3 className="text-xs font-black text-white uppercase tracking-tight line-clamp-1 mb-2">{item.name}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-pearl/60">{RARITY[item.rarity] ?? item.rarity}</span>
          <span className="text-[10px] font-black italic tracking-tighter text-amber-400">{money.format(item.price)} ₸</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {item.tags?.slice(0, 2).map((t) => (
            <span key={t.id} className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-pearl/70">{t.name}</span>
          ))}
        </div>
      </div>
    </button>
  );
}

/** Блок подборки: заголовок с иконкой, ссылка «ещё» и сетка карточек */
function Shelf({ icon, title, more, moreHover, onMore, children }: {
  icon: ReactNode; title: string; more: string; moreHover: string; onMore: () => void; children: ReactNode;
}) {
  return (
    <section className="mb-10 last:mb-0">
      <div className="flex items-center justify-between gap-4 mb-5">
        <h3 className="text-lg font-black italic uppercase tracking-tighter text-white flex items-center gap-2.5">{icon} {title}</h3>
        <button type="button" onClick={onMore} className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-pearl/60 transition-all ${moreHover}`}>
          {more} <IconChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">{children}</div>
    </section>
  );
}

/** Персональные рекомендации игр и товаров кастомизации, с выбором источника (?source=). */
export const RecommendationsPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const current = SOURCES.find((s) => s.id === params.get('source')) ?? SOURCES[0];

  const [data, setData] = useState<Recommendations | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getRecommendations(current.id)
      .then((r) => alive && setData(r), () => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [current.id]);

  const signals = data?.signals;
  const anySignal = !!signals && SIGNALS.some((s) => signals[s.key] > 0);
  const empty = !data || (data.games.length === 0 && data.items.length === 0);

  return (
    <div className="animate-in fade-in duration-500 pt-20 text-left">
      <StoreSubNav />

      <div className="p-8 max-w-[1500px] mx-auto">
        <header className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#09070c] p-8 mb-8">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-violet/20 blur-[130px] pointer-events-none" />
          <div className="absolute -bottom-24 -left-20 w-72 h-72 rounded-full bg-accent/15 blur-[130px] pointer-events-none" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-[10px] font-black uppercase tracking-[0.3em] text-pearl/72">
              <IconSparkles size={12} className="text-violet" /> Персонально для вас
            </span>
            <h2 className="mt-4 text-3xl font-black italic uppercase tracking-tighter text-white">
              {current.heading[0]} <span className="text-violet">{current.heading[1]}</span>
            </h2>
            <p className="text-pearl/70 text-xs font-medium mt-2 max-w-2xl">{current.hint}</p>

            {anySignal && (
              <div className="flex flex-wrap gap-2.5 mt-5">
                {SIGNALS.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10">
                    <span className={s.tone}>{s.icon}</span>
                    <span className="text-[11px] font-black text-white">{signals[s.key]}</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-pearl/60">{s.label}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-5">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(s.id === 'all' ? '/store/recommendations' : `/store/recommendations?source=${s.id}`)}
                  className={`px-3.5 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${current.id === s.id
                    ? 'bg-violet/15 border-violet/40 text-violet'
                    : 'bg-white/[0.02] border-white/5 text-pearl/60 hover:border-white/15'}`}
                >
                  {s.chip}
                </button>
              ))}
            </div>

            {!!data?.tags.length && (
              <div className="flex flex-wrap items-center gap-2 mt-5">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-pearl/60"><IconTag size={12} /> Вам нравится</span>
                {data.tags.slice(0, 10).map((t) => (
                  <span key={t.id} title={`Вес интереса: ${t.score}`} className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-violet/10 border border-violet/20 text-violet/80">{t.name}</span>
                ))}
              </div>
            )}
          </div>
        </header>

        {loading ? (
          <div className="flex justify-center py-24"><IconLoader2 className="animate-spin text-accent" size={30} /></div>
        ) : empty ? (
          <div className="rounded-[2rem] bg-white/[0.02] border border-white/5 p-16 text-center">
            <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center mx-auto mb-5">
              <IconSparkles className="text-pearl/60" size={28} />
            </div>
            <p className="text-sm font-black uppercase tracking-widest text-pearl/60">Пока нечего рекомендовать</p>
            <p className="text-xs text-pearl/55 mt-2">Оцените игры, добавьте их в избранное, вступите в сообщества — и подборка появится.</p>
          </div>
        ) : (
          <>
            {data.games.length > 0 && (
              <Shelf icon={<IconDeviceGamepad2 size={20} className="text-accent" />} title="Игры для вас" more="В каталог" moreHover="hover:text-accent" onMore={() => navigate('/store')}>
                {data.games.map((g) => <GameTile key={g.ID} game={g} onOpen={() => navigate(`/games/${g.ID}`)} />)}
              </Shelf>
            )}
            {data.items.length > 0 && (
              <Shelf icon={<IconShoppingBag size={20} className="text-violet" />} title="Кастомизация для вас" more="В магазин" moreHover="hover:text-violet" onMore={() => navigate('/cosmetics')}>
                {data.items.map((it) => <ItemTile key={it.id} item={it} onOpen={() => navigate('/cosmetics')} />)}
              </Shelf>
            )}
          </>
        )}
      </div>
    </div>
  );
};
