import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Compass, Heart, LayoutGrid, Loader2, Search, ShoppingBag, Sparkles, Star, Users } from 'lucide-react';
import api from '../../api';
import { getRecommendations, type RecommendationSignals, type Recommendations } from '../../api/recommendations';
import { useSettings } from '../../context/SettingsContext';
import { markLeavingToGame, titleCollator } from './constants';

// Анимации выпадающих панелей (.animate-in, .slide-in-from-*, .anim-rise-N) описаны в index.css
const PANEL = 'absolute top-full left-0 w-full mt-1 bg-[var(--panel)] border border-[var(--line-2)] shadow-[0_0_36px_rgb(var(--accent-rgb)/.28)] animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-3xl origin-top overflow-hidden';
const TAG_BTN = 'block w-full text-left py-1.5 tl-head text-[10px] font-bold text-[var(--muted)] hover:text-accent transition-colors uppercase tracking-[0.08em] break-inside-avoid';
const SEGMENT = 'tl-head flex items-center gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap transition-all duration-150 cursor-pointer border-l border-[var(--line)] first:border-l-0';
const SEGMENT_ON = 'bg-accent/15 text-accent shadow-[inset_0_-2px_0_var(--pink)]';
const SEGMENT_OFF = 'text-[var(--muted)] hover:text-white hover:bg-accent/[0.07]';

type Tag = { name: string; adult: boolean };
type Panel = 'rec' | 'cat' | null;

/** Теги каталога меняются редко — грузим один раз за сеанс */
let tagCache: Tag[] | null = null;

async function loadTags(): Promise<Tag[]> {
  const { data } = await api.get<{ name: unknown; category?: string }[]>('/tags/');
  return (data ?? [])
    .map((t) => ({ name: String(t.name), adult: t.category === 'adult' }))
    .sort((a, b) => titleCollator.compare(a.name, b.name));
}

const SIGNAL_BADGES: { key: keyof RecommendationSignals; label: string; icon: ReactNode }[] = [
  { key: 'reviews', label: 'отзывов', icon: <Star size={12} /> },
  { key: 'favorites', label: 'избранных', icon: <Heart size={12} /> },
  { key: 'library', label: 'в библиотеке', icon: <Sparkles size={12} /> },
  { key: 'communities', label: 'сообществ', icon: <Users size={12} /> },
  { key: 'purchases', label: 'покупок', icon: <ShoppingBag size={12} /> },
];

/** Ссылки на страницу рекомендаций; count — сколько сигналов у источника (null — сумма всех) */
const REC_LINKS: { label: string; source?: string; count: keyof RecommendationSignals | null }[] = [
  { label: 'Рекомендуемое вам', count: null },
  { label: 'По вашим отзывам', source: 'reviews', count: 'reviews' },
  { label: 'На основе избранного', source: 'favorites', count: 'favorites' },
  { label: 'Из вашей библиотеки', source: 'library', count: 'library' },
  { label: 'Из ваших сообществ', source: 'communities', count: 'communities' },
  { label: 'По вашей кастомизации', source: 'customization', count: 'purchases' },
];

/** Закрывает панель по клику вне неё и её кнопки, а также по Esc */
function useDismiss(open: boolean, refs: RefObject<HTMLElement | null>[], close: () => void) {
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) close();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
    };
  });
}

function TagColumns({ tags, onPick }: { tags: Tag[]; onPick: (name: string) => void }) {
  return (
    <div className="columns-2 md:columns-4 xl:columns-5 gap-x-10">
      {tags.map((t) => <button key={t.name} type="button" onClick={() => onPick(t.name)} className={TAG_BTN}>{t.name}</button>)}
    </div>
  );
}

function Pending({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 tl-term text-[15px] text-[var(--muted)]"><Loader2 size={14} className="animate-spin" /> {children}</div>;
}

/** Вторая строка навигации магазина: обзор, рекомендации и категории (выпадающие панели) и поиск. */
export const StoreSubNav = () => {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { getHideAdult } = useSettings();

  const [panel, setPanel] = useState<Panel>(null);
  const [rec, setRec] = useState<Recommendations | null>(null);
  const [recError, setRecError] = useState(false);
  const [tags, setTags] = useState<Tag[] | null>(tagCache);
  const [query, setQuery] = useState('');

  const panelRef = useRef<HTMLDivElement>(null);
  const recBtn = useRef<HTMLButtonElement>(null);
  const catBtn = useRef<HTMLButtonElement>(null);

  useDismiss(panel !== null, [panelRef, panel === 'rec' ? recBtn : catBtn], () => setPanel(null));
  useEffect(() => setPanel(null), [pathname, search]);

  // данные панелей подгружаются при первом открытии
  useEffect(() => {
    if (panel === 'rec' && !rec && !recError) getRecommendations().then(setRec, () => setRecError(true));
    if (panel === 'cat' && !tags) {
      loadTags().then((list) => { tagCache = list; setTags(list); }, () => setTags([]));
    }
  }, [panel, rec, recError, tags]);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const byTag = (name: string) => navigate(`/store?tag=${encodeURIComponent(name)}`);
  const openGame = (id: number) => {
    setPanel(null);
    markLeavingToGame(); // каталог восстановит прокрутку и фильтры при возврате
    navigate(`/games/${id}`);
  };
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/store?q=${encodeURIComponent(q)}` : '/store');
    setQuery('');
  };

  const signals = rec?.signals;
  const total = signals ? SIGNAL_BADGES.reduce((n, s) => n + signals[s.key], 0) : 0;
  const regularTags = tags?.filter((t) => !t.adult) ?? [];
  const adultTags = getHideAdult() ? [] : tags?.filter((t) => t.adult) ?? [];

  const dropdown = (id: Exclude<Panel, null>, label: string, icon: ReactNode, ref: RefObject<HTMLButtonElement | null>, active: boolean) => (
    <button ref={ref} type="button" aria-expanded={panel === id} onClick={() => toggle(id)} className={`${SEGMENT} ${active || panel === id ? SEGMENT_ON : SEGMENT_OFF}`}>
      {icon} {label}
      <ChevronDown size={13} className={`transition-transform duration-300 ${panel === id ? 'rotate-180' : ''}`} />
    </button>
  );

  return (
    // z-[30]: ниже основной панели навигации
    <div className="relative z-[30]">
      <div className="px-6 pt-4">
        <div className="max-w-[1500px] mx-auto flex items-center gap-3 border border-[var(--line)] bg-[#0b0512]/85 backdrop-blur-2xl px-3 py-2.5">
          <div
            className="w-9 h-9 border-2 border-accent flex items-center justify-center shrink-0 text-accent"
            style={{ clipPath: 'polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)' }}
          >
            <span className="tl-num text-[13px]">L</span>
          </div>

          <nav className="flex items-center border border-[var(--line)] overflow-x-auto custom-scrollbar">
            <Link to="/store" className={`${SEGMENT} ${pathname === '/store' ? SEGMENT_ON : SEGMENT_OFF}`}>
              <Compass size={15} /> Обзор
            </Link>
            {dropdown('rec', 'Рекомендации', <Sparkles size={15} />, recBtn, pathname.startsWith('/store/recommendations'))}
            {dropdown('cat', 'Категории', <LayoutGrid size={15} />, catBtn, false)}
          </nav>

          <form role="search" onSubmit={onSearch} className="relative ml-auto hidden md:block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-search-hotkey="section"
              placeholder="Поиск по магазину"
              aria-label="Поиск по магазину"
              className="tl-field with-icon text-[12px] w-56"
            />
          </form>
        </div>
      </div>

      {panel === 'rec' && (
        <div ref={panelRef} className={PANEL}>
          <div className="max-w-7xl mx-auto p-10 flex gap-12">
            <div className="flex-1 min-w-0 space-y-3 text-left anim-rise anim-rise-1">
              <h4 className="tl-head text-[10px] font-bold text-[var(--muted)] uppercase tracking-[0.4em] mb-4">// Рекомендовано вам</h4>
              {!rec && !recError ? <Pending>Подбираем игры…</Pending>
                : rec?.games.length ? rec.games.slice(0, 3).map((g) => {
                  const cover = g.header_image || g.banner_url;
                  return (
                    <button key={g.ID} type="button" onClick={() => openGame(g.ID)} className="group w-full flex items-center gap-4 p-2 bg-accent/[0.03] border border-[var(--line)] hover:border-[var(--line-2)] transition-all cursor-pointer text-left">
                      {cover ? <img src={cover} alt="" className="w-20 h-10 object-cover shrink-0" /> : <div className="w-20 h-10 bg-accent/20 shrink-0" />}
                      <div className="flex flex-col min-w-0">
                        <span className="tl-head text-[11px] font-bold text-pearl group-hover:text-accent uppercase tracking-[0.06em] truncate">{g.title}</span>
                        <span className="tl-term text-[14px] text-[var(--muted)] truncate">{g.tags?.[0]?.name ?? 'Игра'}</span>
                      </div>
                    </button>
                  );
                })
                : (
                  <p className="tl-term text-[15px] text-[var(--muted)] leading-relaxed">
                    {recError ? 'Не удалось загрузить рекомендации. Попробуйте позже.' : 'Оценивайте игры, добавляйте в избранное и вступайте в сообщества — подборка появится здесь.'}
                  </p>
                )}
            </div>

            <div className="flex-[1.5] relative tl-panel overflow-hidden anim-rise anim-rise-2">
              <div className="absolute inset-0 bg-gradient-to-br from-violet/25 to-cyan/10 opacity-60" />
              <div className="relative h-full p-8 flex flex-col justify-center text-left">
                <h3 className="tl-head text-[15px] font-bold uppercase tracking-[0.14em] text-white">Ваши интересы</h3>
                <p className="tl-term text-[15px] text-[var(--muted)] mt-1 mb-4">Отзывы, избранное, сообщества и покупки</p>
                {rec?.tags.length ? (
                  <div className="flex flex-wrap gap-2 mb-5">
                    {rec.tags.slice(0, 10).map((t) => <button key={t.id} type="button" onClick={() => byTag(t.name)} className="tl-chip age hover:text-white">{t.name}</button>)}
                  </div>
                ) : <p className="tl-term text-[15px] text-[var(--muted)] mb-5">Пока мало данных об интересах</p>}
                {signals && (
                  <div className="flex flex-wrap gap-3">
                    {SIGNAL_BADGES.map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent/[0.06] border border-[var(--line)]">
                        <span className="text-accent">{s.icon}</span>
                        <span className="tl-num text-[13px] font-bold text-white">{signals[s.key]}</span>
                        <span className="tl-head text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{s.label}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1 pt-6 text-left anim-rise anim-rise-3">
              {REC_LINKS.map((l) => {
                const count = l.count === null ? total : signals?.[l.count] ?? 0;
                return (
                  <button
                    key={l.label}
                    type="button"
                    onClick={() => navigate(l.source ? `/store/recommendations?source=${l.source}` : '/store/recommendations')}
                    className="tl-head w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-bold text-[var(--muted)] hover:text-white hover:bg-accent/10 transition-all uppercase tracking-[0.1em] cursor-pointer border-l-2 border-transparent hover:border-accent"
                  >
                    <span>{l.label}</span>
                    {count > 0 && <span className="tl-chip age">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {panel === 'cat' && (
        <div ref={panelRef} className={PANEL}>
          <div className="max-w-7xl mx-auto p-10 text-left">
            <div className="flex items-baseline justify-between mb-6 anim-rise anim-rise-1">
              <h3 className="tl-head text-[10px] font-bold text-[var(--muted)] uppercase tracking-[0.4em]">// Категории каталога</h3>
              <button type="button" onClick={() => navigate('/store')} className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-accent hover:text-white">Весь каталог →</button>
            </div>
            {tags === null ? <Pending>Загружаем категории…</Pending>
              : regularTags.length + adultTags.length === 0 ? <p className="tl-term text-[15px] text-[var(--muted)]">Категорий пока нет.</p>
              : (
                <div className="max-h-[55vh] overflow-y-auto custom-scrollbar pr-2 anim-rise anim-rise-2">
                  <TagColumns tags={regularTags} onPick={byTag} />
                  {adultTags.length > 0 && (
                    <>
                      <div className="h-px bg-[var(--line)] w-full my-6" />
                      <div className="tl-head text-[10px] font-bold uppercase tracking-[0.3em] text-accent mb-3 flex items-center gap-2">
                        Для взрослых <span className="tl-chip nsfw">18+</span>
                      </div>
                      <TagColumns tags={adultTags} onPick={byTag} />
                    </>
                  )}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
};
