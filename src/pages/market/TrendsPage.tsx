import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconArrowUpRight, IconDeviceGamepad2, IconDownload, IconFlame, IconLibraryPlus, IconLoader2,
  IconSparkles, IconStar, IconThumbUp, IconTrendingUp,
} from '@tabler/icons-react';
import { ImageOff } from 'lucide-react';
import { StoreSubNav } from './StoreSubNav';
import { markLeavingToGame } from './constants';
import { getTrends, type TrendEntry, type TrendGame, type TrendPeriod, type Trends } from '../../api/trends';
import { useAdultConsent } from '../../components/AdultGate/AdultGate';
import { useSettings } from '../../context/SettingsContext';

const PERIODS: { id: TrendPeriod; label: string; hint: string }[] = [
  { id: 'day', label: 'Сутки', hint: 'за последние 24 часа' },
  { id: 'week', label: 'Неделя', hint: 'за последние 7 дней' },
  { id: 'month', label: 'Месяц', hint: 'за последние 30 дней' },
];

type Kind = 'all' | 'regular' | 'nsfw';

const nf = new Intl.NumberFormat('ru-RU');

function Cover({ game, className }: { game: TrendGame; className: string }) {
  const [failed, setFailed] = useState(false);
  const src = game.header_image || game.banner_url;
  if (!src || failed) {
    return <div className={`${className} flex items-center justify-center bg-[rgb(var(--accent-rgb)/.08)] text-[var(--muted-2)]`}><ImageOff size={20} /></div>;
  }
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />;
}

/** Рост против прошлого периода: «новинка», «+N%» или ничего */
function Delta({ e }: { e: TrendEntry }) {
  if (e.prev_score === 0) {
    return <span className="tl-chip warn"><IconSparkles size={10} className="mr-1 inline align-[-1px]" />new</span>;
  }
  const pct = Math.round(((e.score - e.prev_score) / e.prev_score) * 100);
  if (pct <= 0) return null;
  return <span className="tl-chip ok"><IconArrowUpRight size={10} className="mr-0.5 inline align-[-1px]" />+{pct}%</span>;
}

function Metrics({ e, compact = false }: { e: TrendEntry; compact?: boolean }) {
  const all: { n: number; icon: ReactNode; title: string }[] = [
    { n: e.downloads, icon: <IconDownload size={12} />, title: 'Скачиваний' },
    { n: e.added, icon: <IconLibraryPlus size={12} />, title: 'Добавили в библиотеку' },
    { n: e.players, icon: <IconDeviceGamepad2 size={12} />, title: 'Играли' },
    { n: e.positive, icon: <IconThumbUp size={12} />, title: 'Положительных отзывов' },
  ];
  const shown = compact ? all.filter((m) => m.n > 0) : all;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {shown.map((m) => (
        <span key={m.title} title={m.title} className={`tl-term flex items-center gap-1 text-[14px] ${m.n ? 'text-pearl/80' : 'text-[var(--muted-2)]'}`}>
          {m.icon} {nf.format(m.n)}
        </span>
      ))}
    </div>
  );
}

function SectionHead({ icon, title, hint, children }: { icon: ReactNode; title: ReactNode; hint?: string; children?: ReactNode }) {
  return (
    <div className="tl-sec-head">
      <span className="bar" />
      <h2 className="flex items-center gap-2">{icon} {title}</h2>
      {hint && <span className="tag">{hint}</span>}
      <span className="line" />
      {children}
    </div>
  );
}

/** Первые три места — крупные карточки с номером */
function Podium({ entries, onOpen }: { entries: TrendEntry[]; onOpen: (id: number) => void }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {entries.map((e, i) => (
        <button key={e.game.ID} type="button" onClick={() => onOpen(e.game.ID)} className="tl-panel tl-gcard group relative overflow-hidden text-left">
          <div className="relative aspect-video overflow-hidden bg-[#121017]">
            <Cover game={e.game} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#07040c] via-[#07040c]/30 to-transparent" />
            <span className="tl-pixel absolute left-4 top-3 text-[44px] leading-none text-white" style={{ textShadow: 'var(--glow)' }}>#{i + 1}</span>
            <span className="absolute right-3 top-3"><Delta e={e} /></span>
            <div className="absolute inset-x-4 bottom-3">
              <h3 className="truncate text-white transition-colors group-hover:text-accent">{e.game.title}</h3>
              {e.game.developer && <p className="tl-term truncate text-[14px] text-[var(--muted)]">{e.game.developer}</p>}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
            <Metrics e={e} />
            <span className="tl-num shrink-0 text-[15px] text-accent" title="Очки тренда">{nf.format(e.score)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Места с 4-го — плотный список */
function RankRow({ e, rank, onOpen, onTag }: { e: TrendEntry; rank: number; onOpen: () => void; onTag: (name: string) => void }) {
  return (
    <div role="link" tabIndex={0} onClick={onOpen} onKeyDown={(ev) => ev.key === 'Enter' && onOpen()} className="tl-panel tl-gcard group flex cursor-pointer items-center gap-4 px-4 py-3">
      <span className="tl-num w-9 shrink-0 text-center text-[18px] text-[var(--muted)] group-hover:text-accent">{rank}</span>
      <Cover game={e.game} className="h-12 w-24 shrink-0 border border-[var(--line)] object-cover" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate transition-colors group-hover:text-accent">{e.game.title}</h3>
          {e.game.is_adult && <span className="tl-chip nsfw shrink-0">18+</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {e.game.tags.slice(0, 3).map((t) => (
            <button key={t.id} type="button" onClick={(ev) => { ev.stopPropagation(); onTag(t.name); }} className="tl-chip age hover:text-white">{t.name}</button>
          ))}
        </div>
      </div>
      <div className="hidden shrink-0 md:block"><Metrics e={e} /></div>
      <span className="w-16 shrink-0 text-right"><Delta e={e} /></span>
    </div>
  );
}

/** Полка из 4–8 карточек */
function Shelf({ entries, games, onOpen, stat }: {
  entries?: TrendEntry[]; games?: TrendGame[]; onOpen: (id: number) => void; stat?: (e: TrendEntry) => ReactNode;
}) {
  const list: { game: TrendGame; e?: TrendEntry }[] = entries ? entries.map((e) => ({ game: e.game, e })) : (games ?? []).map((game) => ({ game }));
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {list.map(({ game, e }) => (
        <button key={game.ID} type="button" onClick={() => onOpen(game.ID)} className="tl-panel tl-gcard group overflow-hidden text-left">
          <div className="relative aspect-video overflow-hidden bg-[#121017]">
            <Cover game={game} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
            {game.is_adult && <span className="tl-chip nsfw absolute left-2 top-2">18+</span>}
          </div>
          <div className="px-3 py-2.5">
            <h3 className="truncate text-[11px] transition-colors group-hover:text-accent">{game.title}</h3>
            <div className="tl-term mt-1 truncate text-[14px] text-[var(--muted)]">
              {e && stat ? stat(e) : game.tags.slice(0, 2).map((t) => t.name).join(' · ') || 'Игра'}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="tl-panel tl-term p-10 text-center text-[16px] tl-muted">{children}</div>;
}

/** Тренды магазина: рейтинг игр за период, растущие игры, во что играют, что хвалят, новинки и горячие теги. */
export const TrendsPage = () => {
  const navigate = useNavigate();
  const { confirmed, request } = useAdultConsent();
  const { getHideAdult } = useSettings();
  const adultAllowed = confirmed && !getHideAdult();

  const [period, setPeriod] = useState<TrendPeriod>('week');
  const [kind, setKind] = useState<Kind>('all');
  const [data, setData] = useState<Trends | null>(null);
  const [error, setError] = useState(false);

  // без подтверждения возраста игры 18+ в тренды не попадают
  const effective: Kind = adultAllowed ? kind : 'regular';

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    getTrends(period, effective === 'regular' ? '0' : effective === 'nsfw' ? '1' : '')
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [period, effective]);

  const openGame = (id: number) => { markLeavingToGame(); navigate(`/games/${id}`); };
  const byTag = (name: string) => navigate(`/store?tag=${encodeURIComponent(name)}`);
  const pickKind = (k: Kind) => {
    if (k === 'nsfw' && !adultAllowed) { request({ stay: true }); return; }
    setKind(k);
  };
  const current = PERIODS.find((p) => p.id === period)!;

  const stats: { label: string; n: number; icon: ReactNode }[] = data ? [
    { label: 'скачиваний', n: data.totals.downloads, icon: <IconDownload size={15} /> },
    { label: 'добавлений', n: data.totals.added, icon: <IconLibraryPlus size={15} /> },
    { label: 'игроков', n: data.totals.players, icon: <IconDeviceGamepad2 size={15} /> },
    { label: 'игр в тренде', n: data.totals.games, icon: <IconFlame size={15} /> },
  ] : [];

  return (
    <div className="animate-in fade-in pb-12 duration-500 text-left">
      <StoreSubNav />
      <div className="mx-auto max-w-[1240px] px-6 pt-8">
        <header className="tl-panel relative mb-8 overflow-hidden p-8">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{
            backgroundImage: 'radial-gradient(560px 240px at 88% 0%, rgba(255,120,40,.18), transparent 70%), radial-gradient(520px 240px at 0% 100%, rgb(var(--accent-rgb)/.18), transparent 70%), linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
            backgroundSize: 'auto, auto, 28px 28px, 28px 28px',
          }} />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="tl-head mb-3 text-[10px] font-bold uppercase tracking-[.3em] text-accent">// Trending now</p>
              <h1 className="tl-pixel flex items-center gap-3 text-[30px] leading-tight text-white" style={{ textShadow: 'var(--glow)' }}>
                <IconFlame size={30} className="text-orange-400" /> Тренды <span className="text-accent">Lustre</span>
              </h1>
              <p className="tl-term mt-2 max-w-xl text-[16px] text-[var(--muted)]">
                Что скачивают, добавляют в библиотеку, во что играют и что хвалят в отзывах — {current.hint}.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              <div className="tl-tabs">
                {PERIODS.map((p) => (
                  <button key={p.id} type="button" className={`tl-tab ${period === p.id ? 'active' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {([['all', 'Все игры'], ['regular', 'Обычные'], ['nsfw', 'NSFW']] as [Kind, string][]).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={effective === k} onClick={() => pickKind(k)}
                    className={`tl-chip cursor-pointer ${effective === k ? (k === 'nsfw' ? 'nsfw' : 'rare') : 'text-[var(--muted)] hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {data && (
            <div className="relative mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="tl-stat">
                  <div className="n">{nf.format(s.n)}</div>
                  <div className="l flex items-center justify-center gap-1.5">{s.icon} {s.label}</div>
                </div>
              ))}
            </div>
          )}
        </header>

        {error ? <Empty>Не удалось загрузить тренды. Попробуйте обновить страницу.</Empty>
          : !data ? <div className="flex justify-center py-24"><IconLoader2 className="animate-spin text-accent" size={30} /></div>
          : (
            <div className="space-y-10">
              <section>
                <SectionHead icon={<IconTrendingUp size={16} className="text-accent" />} title={<>Топ <span className="text-accent">периода</span></>} hint={current.hint} />
                {data.top.length === 0 ? <Empty>За этот период активности пока не было — попробуйте период побольше.</Empty> : (
                  <>
                    <Podium entries={data.top.slice(0, 3)} onOpen={openGame} />
                    {data.top.length > 3 && (
                      <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_280px]">
                        <div className="space-y-2">
                          {data.top.slice(3).map((e, i) => <RankRow key={e.game.ID} e={e} rank={i + 4} onOpen={() => openGame(e.game.ID)} onTag={byTag} />)}
                        </div>
                        {data.tags.length > 0 && (
                          <aside className="tl-panel h-fit p-5">
                            <h3 className="tl-head mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-white"><IconFlame size={14} className="text-orange-400" /> Горячие теги</h3>
                            <div className="flex flex-wrap gap-2">
                              {data.tags.map((t, i) => (
                                <button key={t.id} type="button" onClick={() => byTag(t.name)} title={`Игр в топе: ${t.games}`}
                                  className={`tl-chip cursor-pointer hover:text-white ${i < 3 ? 'rare' : 'age'}`}>
                                  {t.name}
                                </button>
                              ))}
                            </div>
                          </aside>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>

              {data.rising.length > 0 && (
                <section>
                  <SectionHead icon={<IconArrowUpRight size={16} className="text-emerald-400" />} title="На подъёме" hint="рост против прошлого периода" />
                  <Shelf entries={data.rising} onOpen={openGame}
                    stat={(e) => (e.prev_score ? `+${Math.round(((e.score - e.prev_score) / e.prev_score) * 100)}% к прошлому периоду` : 'впервые в трендах')} />
                </section>
              )}

              {data.most_played.length > 0 && (
                <section>
                  <SectionHead icon={<IconDeviceGamepad2 size={16} className="text-cyan" />} title="Во что играют" hint="запускали за период" />
                  <Shelf entries={data.most_played} onOpen={openGame} stat={(e) => `${nf.format(e.players)} игроков`} />
                </section>
              )}

              {data.top_rated.length > 0 && (
                <section>
                  <SectionHead icon={<IconStar size={16} className="text-amber-400" />} title="Хвалят в отзывах" hint="положительные отзывы за период" />
                  <Shelf entries={data.top_rated} onOpen={openGame} stat={(e) => `${e.positive} из ${e.reviews} положительные`} />
                </section>
              )}

              {data.new_games.length > 0 && (
                <section>
                  <SectionHead icon={<IconSparkles size={16} className="text-violet" />} title="Новинки каталога" />
                  <Shelf games={data.new_games} onOpen={openGame} />
                </section>
              )}
            </div>
          )}
      </div>
    </div>
  );
};
