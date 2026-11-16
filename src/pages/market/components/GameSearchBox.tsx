import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CornerDownLeft } from 'lucide-react';
import api from '../../../api';
import { useSettings } from '../../../context/SettingsContext';
import { useAdultConsent } from '../../../components/AdultGate/AdultGate';
import { compileQuery, scoreGame } from '../../../utils/gameSearch';
import { markLeavingToGame } from '../constants';

type IndexGame = {
  id: number;
  title: string;
  developer: string;
  publisher: string;
  header_image: string;
  age_rating: string;
  is_adult: boolean;
  tags: string[];
  /** теги в виде, который ждёт поиск (как у полной карточки игры) */
  tagObjs?: { name: string }[];
};

const MAX_SUGGESTIONS = 6;

/** Индекс каталога для подсказок: грузится при первом фокусе, живёт весь сеанс */
let indexCache: IndexGame[] | null = null;
let indexPromise: Promise<IndexGame[]> | null = null;
function loadIndex(): Promise<IndexGame[]> {
  if (indexCache) return Promise.resolve(indexCache);
  indexPromise ??= api.get<IndexGame[]>('/games/search-index')
    .then(({ data }) => {
      indexCache = (data || []).map((g) => ({ ...g, tagObjs: (g.tags || []).map((name) => ({ name })) }));
      return indexCache;
    })
    .catch(() => { indexPromise = null; return []; });
  return indexPromise;
}

/**
 * Поиск в шапке магазина: подсказки с обложками уже при вводе (опечатки, раскладка,
 * транслит — как в каталоге). Enter или «Все результаты» открывают каталог с запросом.
 */
export default function GameSearchBox() {
  const navigate = useNavigate();
  const { getHideAdult } = useSettings();
  const { confirmed: adultConfirmed } = useAdultConsent();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<IndexGame[] | null>(indexCache);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const suggestions = useMemo(() => {
    const q = query.trim();
    if (!q || !index) return [];
    const compiled = compileQuery(q);
    const hideAdult = getHideAdult() || !adultConfirmed;
    const scored: { g: IndexGame; s: number }[] = [];
    for (const g of index) {
      if (hideAdult && g.is_adult) continue;
      const s = scoreGame({ title: g.title, developer: g.developer, publisher: g.publisher, tags: g.tagObjs }, compiled);
      if (s > 0) scored.push({ g, s });
    }
    return scored.sort((a, b) => b.s - a.s).slice(0, MAX_SUGGESTIONS).map((x) => x.g);
  }, [query, index, getHideAdult, adultConfirmed]);

  useEffect(() => setActive(-1), [query]);

  const ensureIndex = () => { if (!index) void loadIndex().then(setIndex); };

  const openAll = () => {
    const q = query.trim();
    navigate(q ? `/store?q=${encodeURIComponent(q)}` : '/store');
    setQuery('');
    setOpen(false);
  };
  const openGame = (id: number) => {
    markLeavingToGame();
    navigate(`/games/${id}`);
    setQuery('');
    setOpen(false);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (active >= 0 && suggestions[active]) openGame(suggestions[active].id);
    else openAll();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (i + 1) % (suggestions.length + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length : i - 1)); }
  };

  const showList = open && query.trim().length > 0;

  return (
    <form ref={boxRef} role="search" onSubmit={onSubmit} className="relative ml-auto hidden md:block">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
      <input
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); ensureIndex(); }}
        onFocus={() => { ensureIndex(); setOpen(true); }}
        onKeyDown={onKeyDown}
        data-search-hotkey="section"
        placeholder="Поиск по магазину"
        aria-label="Поиск по магазину"
        aria-expanded={showList}
        autoComplete="off"
        className="tl-field with-icon text-[12px] w-56 focus:w-72 transition-[width] duration-200"
      />
      {showList && (
        <div className="absolute right-0 top-full z-[60] mt-1 w-80 border border-[var(--line-2)] bg-[var(--panel)] p-1 shadow-[0_0_24px_rgb(var(--accent-rgb)/.25)]">
          {!index ? (
            <p className="tl-term px-3 py-2 text-[14px] text-[var(--muted)]">Загружаем каталог…</p>
          ) : suggestions.length === 0 ? (
            <p className="tl-term px-3 py-2 text-[14px] text-[var(--muted)]">Ничего не нашлось</p>
          ) : (
            suggestions.map((g, i) => (
              <button
                key={g.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => openGame(g.id)}
                className={`flex w-full items-center gap-3 px-2 py-1.5 text-left transition-colors ${active === i ? 'bg-accent/15' : 'hover:bg-accent/[0.08]'}`}
              >
                {g.header_image
                  ? <img src={g.header_image} alt="" loading="lazy" className="h-9 w-[76px] shrink-0 border border-[var(--line)] object-cover" />
                  : <span className="h-9 w-[76px] shrink-0 border border-[var(--line)] bg-black/30" />}
                <span className="min-w-0">
                  <span className="block truncate tl-head text-[10px] font-bold uppercase tracking-[0.08em] text-white">{g.title}</span>
                  {g.developer && <span className="block truncate tl-term text-[13px] text-[var(--muted)]">{g.developer}</span>}
                </span>
              </button>
            ))
          )}
          {index && (
            <button
              type="button"
              onMouseEnter={() => setActive(suggestions.length)}
              onClick={openAll}
              className={`mt-1 flex w-full items-center justify-between border-t border-[var(--line)] px-3 py-2 tl-head text-[10px] font-bold uppercase tracking-[0.1em] transition-colors ${active === suggestions.length ? 'text-accent' : 'text-[var(--muted)] hover:text-white'}`}
            >
              Все результаты в каталоге <CornerDownLeft size={12} />
            </button>
          )}
        </div>
      )}
    </form>
  );
}
