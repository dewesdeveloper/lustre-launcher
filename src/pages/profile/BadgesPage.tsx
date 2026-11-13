import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconChevronLeft, IconTrophy, IconLock, IconWorld,
  IconDeviceGamepad2, IconUsersGroup, IconCrown, IconFlame
} from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import {
  rarityStyles, categoryLabels,
  type BadgeWithStatus, type BadgeCategory, type BadgeRarity, type BadgeSummary, type BadgeSummaryItem
} from '../../api/badges';
import { makeResourceFetcher, CACHE_POLICY, RESOURCE_KEYS } from '../../api/catalog';
import { useCachedResource } from '../../hooks/useCachedResource';
import BadgeEmblem from '../../components/BadgeEmblem';

type Filter = 'all' | BadgeCategory;

const TABS: [Filter, string, ReactNode][] = [
  ['all', 'Все значки', <IconTrophy key="all" size={14} />],
  ['launcher', 'Лаунчер', <IconWorld key="launcher" size={14} />],
  ['game', 'Игры', <IconDeviceGamepad2 key="game" size={14} />],
  ['community', 'Сообщества', <IconUsersGroup key="community" size={14} />],
];

/** 5 мар. 2027 г. — пусто, если даты нет */
const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const styleOf = (rarity: BadgeRarity) => rarityStyles[rarity] ?? rarityStyles.common;

/** Карточка значка в каталоге: полученные подсвечены цветом редкости, остальные приглушены и с замком */
function BadgeTile({ badge }: { badge: BadgeWithStatus }) {
  const r = styleOf(badge.rarity);
  // у секретного неполученного значка не раскрываем, у скольких он есть
  const share = badge.secret && !badge.earned ? undefined : badge.holders_percent;
  return (
    <article className={`tl-panel relative p-5 transition-all duration-500 ${badge.earned ? `${r.border} ${r.glow}` : 'opacity-70 hover:opacity-100'}`}>
      <div className="mb-4 flex items-start justify-between">
        <BadgeEmblem code={badge.code} rarity={badge.rarity} size={64} dim={!badge.earned} />
        {!badge.earned && <span className="flex h-6 w-6 items-center justify-center border border-[var(--line)] bg-black/60 tl-muted"><IconLock size={12} /></span>}
      </div>
      <h3 className={`tl-head text-[12px] font-bold uppercase tracking-tight ${badge.earned ? 'text-white' : 'tl-muted'}`}>{badge.name}</h3>
      <div className="mb-2.5 mt-2 flex items-center gap-2">
        <span className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${r.chip}`}>{r.label}</span>
        <span className="border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.03)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] tl-muted">{categoryLabels[badge.category]}</span>
      </div>
      <p className="tl-term text-[15px] leading-relaxed tl-muted">{badge.description}</p>
      <div className="mt-3 flex items-center justify-between">
        {typeof share === 'number' ? <p className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)]">есть у {share}%</p> : <span />}
        {badge.earned && badge.awarded_at && <p className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--green2)]">получен {shortDate(badge.awarded_at)}</p>}
      </div>
    </article>
  );
}

/** Страница значков: ранг и трофейный счёт, редкие и последние значки, каталог с фильтром по разделу. */
export default function BadgesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');

  // Статика приходит из кэша мгновенно и обновляется в фоне:
  // кулдаун не даёт долбить сервер при переходах туда-сюда,
  // а ETag превращает повтор в дешёвый 304.
  const badgesRes = useCachedResource<BadgeWithStatus[]>(
    user ? RESOURCE_KEYS.badges(user.id) : null,
    makeResourceFetcher<BadgeWithStatus[]>('/badges/'),
    CACHE_POLICY.badges,
  );

  const summaryRes = useCachedResource<BadgeSummary>(
    user ? RESOURCE_KEYS.badgeSummary(user.id) : null,
    makeResourceFetcher<BadgeSummary>(`/badges/summary/${user?.id}`),
    CACHE_POLICY.summary,
  );

  const badges = useMemo(() => badgesRes.data || [], [badgesRes.data]);
  const summary = summaryRes.data || null;
  const loading = badgesRes.loading;

  const shown = filter === 'all' ? badges : badges.filter((b) => b.category === filter);
  const earnedCount = summary?.earned ?? badges.filter(b => b.earned).length;
  const totalBadges = summary?.total_badges ?? badges.length;
  const progress = totalBadges ? Math.round((earnedCount / totalBadges) * 100) : 0;

  const rarest: BadgeSummaryItem[] = summary?.rarest || [];
  const last: BadgeSummaryItem[] = summary?.last || [];

  return (
    <div className="max-w-[1180px] mx-auto px-6 py-8 text-left pb-20">

      {/* HEADER */}
      <div className="tl-sec-head">
        <span className="bar" />
        <h2><IconTrophy size={15} className="text-accent" /> ЗНАЧКИ ДОСТИЖЕНИЙ</h2>
        <span className="line" />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted hover:text-white border border-[var(--line)] px-2.5 py-1.5 transition-colors flex items-center gap-1.5"
        >
          <IconChevronLeft size={13} /> Назад
        </button>
      </div>

      {/* РАНГ + ТРОФЕЙНЫЙ СЧЁТ */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-8">
        <div className="tl-panel p-[22px]">
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 border border-[var(--line-2)] flex items-center justify-center text-accent shrink-0">
              <IconCrown size={26} />
            </div>
            <div className="min-w-0">
              <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] tl-muted">Ранг</p>
              <p className="tl-head text-[18px] font-bold uppercase tracking-tight text-white leading-none mt-1">{summary?.rank || '—'}</p>
            </div>
            <div className="ml-auto text-right shrink-0">
              <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] tl-muted">Получено</p>
              <p className="tl-num text-[20px] font-bold tl-pink mt-1">{earnedCount} <span className="tl-term text-[14px] text-[var(--muted-2)]">из {totalBadges || '—'}</span></p>
            </div>
          </div>

          <div className="tl-prog mt-4">
            <div className="t">
              <div className="f" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)]">
            <span>Прогресс коллекции</span>
            {summary && summary.next_rank_at > 0 && <span>До следующего ранга — {Math.max(0, summary.next_rank_at - earnedCount)}</span>}
          </div>

          {summary && (
            <div className="relative mt-4 flex items-center gap-2 tl-term text-[15px] tl-muted">
              <IconFlame size={13} className="text-accent" />
              Вы выше <span className="font-bold tl-pink">{summary.percentile}%</span> игроков по числу значков
            </div>
          )}
        </div>

        <div className="tl-panel p-[22px] flex flex-col justify-center">
          <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] tl-muted mb-1">Трофейный счёт</p>
          <p className="tl-num text-[34px] font-bold text-accent" style={{ textShadow: 'var(--glow)' }}>
            {summary?.trophy_score ?? 0}
          </p>
          <p className="tl-term text-[15px] tl-muted mt-1">Очки за редкость значков</p>
        </div>
      </section>

      {/* САМОЕ РЕДКОЕ */}
      {rarest.length > 0 && (
        <section className="mb-8">
          <div className="tl-sec-head">
            <span className="bar" />
            <h2>САМОЕ РЕДКОЕ</h2>
            <span className="line" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {rarest.map((it) => {
              const r = styleOf(it.badge.rarity);
              return (
                <div key={it.badge.id} className={`tl-panel ${r.border} ${r.glow} p-5`}>
                  <BadgeEmblem code={it.badge.code} rarity={it.badge.rarity} size={56} />
                  <h3 className="tl-head text-[11px] font-bold uppercase tracking-tight text-white mt-3 leading-tight">{it.badge.name}</h3>
                  <p className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted mt-1.5">
                    {r.label} · есть у {it.holders_percent}%
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ПОСЛЕДНЕЕ ПОЛУЧЕННОЕ */}
      {last.length > 0 && (
        <section className="mb-8">
          <div className="tl-sec-head">
            <span className="bar" />
            <h2>ПОСЛЕДНЕЕ ПОЛУЧЕННОЕ</h2>
            <span className="line" />
          </div>
          <div className="tl-panel divide-y divide-[rgb(var(--accent-rgb)/.12)] overflow-hidden">
            {last.map((it) => (
              <div key={it.badge.id} className="flex items-center gap-3.5 px-5 py-3.5">
                <BadgeEmblem code={it.badge.code} rarity={it.badge.rarity} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="tl-head text-[11px] font-bold uppercase tracking-tight text-white truncate">{it.badge.name}</p>
                  <p className="tl-term text-[14px] tl-muted">{shortDate(it.awarded_at)}</p>
                </div>
                <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-pink shrink-0">есть у {it.holders_percent}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <nav className="mb-6 flex flex-wrap gap-2.5">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} className={`tl-btn ${filter === id ? '' : 'ghost'}`}>{icon} {label}</button>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }, (_, i) => <div key={i} className="h-48 tl-panel bg-[rgb(var(--accent-rgb)/.03)] animate-pulse" />)
          : shown.map((b) => <BadgeTile key={b.id} badge={b} />)}
      </div>
    </div>
  );
}
