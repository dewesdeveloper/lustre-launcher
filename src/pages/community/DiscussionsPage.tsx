import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconMessages, IconSearch, IconUsersGroup, IconX } from '@tabler/icons-react';
import {
  getDiscussions, getForums,
  type DiscussionItem, type DiscussionPeriod, type DiscussionSort, type ForumItem, type GameKind,
} from '../../api/community';
import { useAuth } from '../../context/AuthContext';
import Pagination from '../../components/ui/Pagination';
import Select from '../../components/ui/Select';
import type { SortOption } from './types';
import SortMenu from './components/SortMenu';
import DiscussionCard from './components/DiscussionCard';
import GameForumItem from './components/GameForumItem';
import { COMMUNITY_FORMATS } from './formats';

// Страница «Обсуждения». Раньше она скачивала все сообщества, весь каталог и все обсуждения
// каждого сообщества; теперь сервер отдаёт по одной странице ленты (20 тем) или форумов (10 игр).

type View = 'feed' | 'forums';

const SORTS: { value: DiscussionSort; label: string }[] = [
  { value: 'active', label: 'Недавняя активность' },
  { value: 'new', label: 'Сначала новые' },
  { value: 'old', label: 'Сначала старые' },
  { value: 'comments', label: 'Больше ответов' },
];
const PERIODS: { value: DiscussionPeriod; label: string }[] = [
  { value: 'all', label: 'За всё время' },
  { value: 'day', label: 'За сутки' },
  { value: 'week', label: 'За неделю' },
  { value: 'month', label: 'За месяц' },
];
const PAGE_SIZES = [10, 20, 50];
const FORUMS_PAGE = 10;

/** Строка поиска с задержкой: запрос к серверу — когда пользователь перестал печатать */
function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Skeleton({ rows, height }: { rows: number; height: string }) {
  return <div className="space-y-3">{Array.from({ length: rows }, (_, i) => <div key={i} className={`tl-panel animate-pulse ${height}`} />)}</div>;
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="tl-panel p-12 text-center">
      <p className="tl-head tl-muted text-[11px] font-bold uppercase tracking-[.2em]">{title}</p>
      <p className="tl-term mt-2 text-[15px] text-[var(--muted-2)]">{hint}</p>
    </div>
  );
}

function SectionHead({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <div className="tl-sec-head">
      <span className="bar" />
      <h2>{children}</h2>
      {count !== undefined && <span className="count">// {count}</span>}
      <span className="line" />
    </div>
  );
}

/** Переключатель-чип фильтра */
function Chip({ on, tone = '', label, onClick }: { on: boolean; tone?: string; label: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`tl-chip cursor-pointer ${on ? tone || 'rare' : 'text-[var(--muted)] hover:text-white'}`}>
      {label}
    </button>
  );
}

/** Фильтр «обычные / NSFW» — один из двух или ни одного (все игры) */
function KindChips({ value, onChange }: { value: GameKind; onChange: (v: GameKind) => void }) {
  return (
    <>
      <Chip on={value === 'regular'} tone="common" label="Обычные игры" onClick={() => onChange(value === 'regular' ? '' : 'regular')} />
      <Chip on={value === 'nsfw'} tone="nsfw" label="NSFW игры" onClick={() => onChange(value === 'nsfw' ? '' : 'nsfw')} />
    </>
  );
}

/** Обсуждения платформы: лента тем с фильтрами и форумы по играм — обе постранично. */
export default function DiscussionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // запрос может прийти из поиска на главной сообществ (?q=…)
  const [params] = useSearchParams();
  const [view, setView] = useState<View>(params.get('view') === 'forums' ? 'forums' : 'feed');
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const q = useDebounced(query.trim());

  // ---- лента ----
  const [sort, setSort] = useState<DiscussionSort>('active');
  const [period, setPeriod] = useState<DiscussionPeriod>('all');
  const [format, setFormat] = useState('');
  const [kind, setKind] = useState<GameKind>('');
  const [mine, setMine] = useState(false);
  const [game, setGame] = useState<{ id: number; title: string } | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [feed, setFeed] = useState<{ items: DiscussionItem[]; total: number } | null>(null);
  const [feedError, setFeedError] = useState(false);

  // ---- форумы ----
  const [forumSort, setForumSort] = useState<SortOption>('popular');
  const [forumKind, setForumKind] = useState<GameKind>('');
  const [forumPage, setForumPage] = useState(1);
  const [forums, setForums] = useState<{ items: ForumItem[]; total: number } | null>(null);
  const [forumsError, setForumsError] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  // любой фильтр — с первой страницы
  useEffect(() => setPage(1), [q, sort, period, format, kind, mine, game, pageSize]);
  useEffect(() => setForumPage(1), [q, forumSort, forumKind]);

  useEffect(() => {
    if (view !== 'feed') return;
    let alive = true;
    setFeed(null);
    setFeedError(false);
    getDiscussions({ q, sort, period, format, kind, mine, game_id: game?.id, limit: pageSize, offset: (page - 1) * pageSize })
      .then((r) => alive && setFeed(r))
      .catch(() => alive && setFeedError(true));
    return () => { alive = false; };
  }, [view, q, sort, period, format, kind, mine, game, pageSize, page]);

  useEffect(() => {
    if (view !== 'forums') return;
    let alive = true;
    setForums(null);
    setForumsError(false);
    getForums({ q, sort: forumSort, kind: forumKind, limit: FORUMS_PAGE, offset: (forumPage - 1) * FORUMS_PAGE })
      .then((r) => alive && setForums(r))
      .catch(() => alive && setForumsError(true));
    return () => { alive = false; };
  }, [view, q, forumSort, forumKind, forumPage]);

  const feedFiltered = !!(period !== 'all' || format || kind || mine || game);
  const resetFeed = () => { setPeriod('all'); setFormat(''); setKind(''); setMine(false); setGame(null); };
  const feedPages = feed ? Math.max(1, Math.ceil(feed.total / pageSize)) : 1;
  const forumPages = forums ? Math.max(1, Math.ceil(forums.total / FORUMS_PAGE)) : 1;
  const scrollTop = () => document.querySelector('main')?.scrollTo?.({ top: 0, behavior: 'smooth' });

  return (
    <div className="mx-auto max-w-[1400px] p-8 text-left animate-in fade-in duration-700">
      <header className="tl-panel relative mb-6 overflow-hidden p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{
          backgroundImage: 'radial-gradient(520px 200px at 90% 0%, rgb(var(--accent-rgb)/.2), transparent 70%), linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
          backgroundSize: 'auto, 28px 28px, 28px 28px',
        }} />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="shrink-0">
            <p className="tl-head mb-2 text-[10px] font-bold uppercase tracking-[.3em] text-accent">// Forums</p>
            <h1 className="tl-pixel text-[26px] text-white" style={{ textShadow: 'var(--glow)' }}>Обсуждения <span className="text-accent">Lustre</span></h1>
            <p className="tl-head tl-muted mt-2.5 text-[10px] font-bold uppercase tracking-[.26em]">Темы всех сообществ и форумы по играм</p>
          </div>
          <div className="relative w-full md:w-[420px]">
            <div className="tl-prefix">
              <span className="at"><IconSearch size={16} /></span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-search-hotkey="page"
                placeholder={view === 'feed' ? 'Поиск по темам, сообществам и играм…' : 'Поиск игры…'}
                className="tl-field"
              />
            </div>
            {query && (
              <button type="button" title="Очистить поиск" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] transition-colors hover:text-accent">
                <IconX size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="tl-tabs mb-6">
        <button type="button" className={`tl-tab ${view === 'feed' ? 'active' : ''}`} onClick={() => setView('feed')}>
          <IconMessages size={14} /> Лента обсуждений
        </button>
        <button type="button" className={`tl-tab ${view === 'forums' ? 'active' : ''}`} onClick={() => setView('forums')}>
          <IconUsersGroup size={14} /> Форумы игр
        </button>
      </div>

      {view === 'feed' ? (
        <section>
          <div className="tl-toolbar flex-wrap gap-2">
            <Select value={sort} options={SORTS} onChange={setSort} className="w-64" />
            <Select value={period} options={PERIODS} onChange={setPeriod} className="w-44" />
            <Select value={pageSize} options={PAGE_SIZES.map((n) => ({ value: n, label: `По ${n} на странице` }))} onChange={(v) => setPageSize(Number(v))} className="w-52" />
            <div className="spacer" />
            <KindChips value={kind} onChange={setKind} />
            {user && <Chip on={mine} label="Мои темы" onClick={() => setMine((v) => !v)} />}
          </div>
          <div className="mb-5 mt-3 flex flex-wrap items-center gap-2">
            <span className="tl-head mr-1 text-[10px] font-bold uppercase tracking-[.18em] text-[var(--muted)]">Формат:</span>
            <Chip on={!format} label="Все" onClick={() => setFormat('')} />
            {COMMUNITY_FORMATS.map((f) => (
              <Chip key={f.id} on={format === f.id} label={<><f.Icon size={11} className="mr-1 inline align-[-1px]" />{f.label}</>} onClick={() => setFormat(format === f.id ? '' : f.id)} />
            ))}
            {game && (
              <span className="tl-chip rare">
                Игра: {game.title}
                <button type="button" aria-label="Убрать фильтр по игре" onClick={() => setGame(null)} className="ml-1.5 align-[-2px] hover:text-white"><IconX size={11} /></button>
              </span>
            )}
            {feedFiltered && (
              <button type="button" onClick={resetFeed} className="tl-btn ghost ml-auto"><IconX size={12} /> Сбросить фильтры</button>
            )}
          </div>

          <SectionHead count={feed?.total}>{q ? 'Результаты поиска' : <>Последние <span className="text-accent">темы</span></>}</SectionHead>
          {feedError ? <Empty title="Не удалось загрузить обсуждения" hint="Проверьте подключение и попробуйте ещё раз" />
            : !feed ? <Skeleton rows={5} height="h-24" />
            : feed.items.length === 0 ? (
              <Empty
                title={q || feedFiltered ? 'Ничего не найдено' : 'Обсуждений пока нет'}
                hint={q || feedFiltered ? 'Измените запрос или сбросьте фильтры' : 'Создайте тему в любом сообществе — она появится здесь'}
              />
            ) : (
              <div className="space-y-3">
                {feed.items.map((it) => (
                  <DiscussionCard
                    key={it.post.ID}
                    item={it}
                    onOpen={() => navigate(`/community/${it.community.id}/post/${it.post.ID}`)}
                    onCommunity={() => navigate(`/community/${it.community.id}`)}
                  />
                ))}
              </div>
            )}
          <Pagination page={page} totalPages={feedPages} onChange={(p) => { setPage(p); scrollTop(); }} className="mt-6" />
        </section>
      ) : (
        <section>
          <div className="tl-toolbar">
            <SortMenu value={forumSort} onChange={setForumSort} />
            <div className="spacer" />
            <KindChips value={forumKind} onChange={setForumKind} />
          </div>

          <SectionHead count={forums?.total}>Форумы <span className="text-accent">игр</span></SectionHead>
          {forumsError ? <Empty title="Не удалось загрузить форумы" hint="Проверьте подключение и попробуйте ещё раз" />
            : !forums ? <Skeleton rows={4} height="h-24" />
            : forums.items.length === 0 ? <Empty title="Форумов не найдено" hint="Форум появляется, когда по игре создают сообщество" />
            : (
              <div className="flex flex-col gap-3">
                {forums.items.map((f) => (
                  <GameForumItem
                    key={f.game.ID}
                    forum={f}
                    expanded={open === f.game.ID}
                    onToggle={() => setOpen((id) => (id === f.game.ID ? null : f.game.ID))}
                    onOpenCommunity={(id) => navigate(`/community/${id}`)}
                    onShowDiscussions={() => {
                      resetFeed(); // иначе прежний фильтр (формат, «мои») мог спрятать темы игры
                      setGame({ id: f.game.ID, title: f.game.title });
                      setQuery('');
                      setView('feed');
                    }}
                  />
                ))}
              </div>
            )}
          <Pagination page={forumPage} totalPages={forumPages} onChange={(p) => { setForumPage(p); scrollTop(); }} className="mt-6" />
        </section>
      )}
    </div>
  );
}
