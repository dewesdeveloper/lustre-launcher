import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconChevronLeft, IconActivity, IconPlus, IconHeart, IconTrophy,
  IconMessage, IconUserPlus, IconUsersGroup, IconStar, IconCrown, IconArrowUp, IconLoader2,
} from '@tabler/icons-react';
import ImageOr from '../../components/ImageOr';
import ProBadge, { PRO_NICK_CLASS } from '../../components/ProBadge';
import { getActivityFeed, type ActivityItem, type ActivityKind } from '../../api/activity';
import BadgeEmblem from '../../components/BadgeEmblem';
import LevelEmblem from '../../components/LevelEmblem';
import RankPlate from '../../components/RankPlate';
import { rarityStyles, type BadgeRarity } from '../../api/badges';
import { useAuth } from '../../context/AuthContext';

const KIND_META: Record<ActivityKind, { label: string; verb: string; icon: React.ReactNode; color: string }> = {
  library_add:  { label: 'Библиотека', verb: 'добавил(а) в библиотеку', icon: <IconPlus size={14} />, color: 'var(--pink)' },
  favorite:     { label: 'Избранное', verb: 'добавил(а) в избранное', icon: <IconHeart size={14} />, color: '#fb7185' },
  badge_earned: { label: 'Значки', verb: 'получил(а) значок', icon: <IconTrophy size={14} />, color: '#fbbf24' },
  comment:      { label: 'Стена', verb: 'оставил(а) комментарий на стене', icon: <IconMessage size={14} />, color: '#a78bfa' },
  follow:       { label: 'Подписки', verb: 'подписался(ась) на', icon: <IconUserPlus size={14} />, color: '#38bdf8' },
  group:        { label: 'Группы', verb: 'создал(а) группу', icon: <IconUsersGroup size={14} />, color: '#34d399' },
  review:       { label: 'Отзывы', verb: 'оставил(а) отзыв на', icon: <IconStar size={14} />, color: '#facc15' },
  title_equip:  { label: 'Титулы', verb: 'надел(а) титул', icon: <IconCrown size={14} />, color: '#c084fc' },
  level_up:     { label: 'Уровни', verb: 'достиг(ла) уровня', icon: <IconArrowUp size={14} />, color: '#fcd34d' },
};

// порядок фильтров; «Титулы» раньше отсутствовали, хотя такие события есть
const FILTER_ORDER: ActivityKind[] = ['library_add', 'favorite', 'review', 'badge_earned', 'title_equip', 'level_up', 'comment', 'follow', 'group'];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Сегодня';
  if (dayKey(d) === dayKey(yest)) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

export default function ActivityPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [summary, setSummary] = useState<Partial<Record<ActivityKind, number>>>({});
  const [filter, setFilter] = useState<ActivityKind | 'all'>('all');
  const [cursor, setCursor] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // номер запроса: ответ на старый фильтр не должен перезаписать новый
  const reqRef = useRef(0);

  useEffect(() => {
    const req = ++reqRef.current;
    setLoading(true);
    setError(false);
    setItems([]);
    getActivityFeed({ limit: 25, kind: filter })
      .then((data) => {
        if (req !== reqRef.current) return;
        setItems(data.items);
        setSummary(data.summary_7d || {});
        setCursor(data.next_before || 0);
        setHasMore(!!data.has_more);
      })
      .catch(() => { if (req === reqRef.current) setError(true); })
      .finally(() => { if (req === reqRef.current) setLoading(false); });
  }, [filter, reloadKey]);

  const loadMore = async () => {
    const req = reqRef.current;
    setLoadingMore(true);
    try {
      const data = await getActivityFeed({ limit: 25, before: cursor, kind: filter });
      if (req !== reqRef.current) return;
      setItems(prev => [...prev, ...data.items]);
      setCursor(data.next_before || 0);
      setHasMore(!!data.has_more);
    } catch { /* кнопка останется — можно повторить */ } finally {
      setLoadingMore(false);
    }
  };

  const grouped = useMemo(() => {
    const out: { key: string; label: string; rows: ActivityItem[] }[] = [];
    for (const it of items) {
      const key = dayKey(new Date(it.created_at));
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(it);
      else out.push({ key, label: dayLabel(it.created_at), rows: [it] });
    }
    return out;
  }, [items]);

  const total7d = useMemo(() => Object.values(summary).reduce((a, b) => a + (Number(b) || 0), 0), [summary]);
  const topKinds = useMemo(
    () => FILTER_ORDER.filter(k => (summary[k] || 0) > 0).sort((a, b) => (summary[b] || 0) - (summary[a] || 0)),
    [summary],
  );
  const name = user?.profile?.display_name || user?.username;

  return (
    <div className="max-w-[1240px] mx-auto px-6 pt-8 pb-16 text-left animate-in fade-in duration-500">
      <div className="tl-ticker">
        <span className="live">// ACTIVITY LOG</span>
        <span>{name}</span>
        <span>· за 7 дней: {total7d}</span>
      </div>

      <div className="tl-sec-head mt-1">
        <span className="bar" />
        <h2>ЛЕНТА АКТИВНОСТИ</h2>
        <span className="count">// {items.length}{hasMore ? '+' : ''}</span>
        <span className="line" />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted hover:text-white border border-[var(--line)] px-2.5 py-1.5 transition-colors inline-flex items-center gap-1"
        >
          <IconChevronLeft size={11} /> назад
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <main className="min-w-0">
          {/* фильтры */}
          <div className="tl-tabs flex-wrap mb-5" style={{ width: '100%' }}>
            {(['all', ...FILTER_ORDER] as const).map(id => {
              const n = id === 'all' ? total7d : summary[id] || 0;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`tl-tab ${filter === id ? 'active' : ''}`}
                  aria-pressed={filter === id}
                >
                  {id === 'all' ? 'Всё' : KIND_META[id].label}
                  {n > 0 && <span className="ml-1.5 opacity-60">{n}</span>}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2.5">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="tl-panel h-[68px] animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="tl-panel py-14 text-center">
              <p className="tl-term text-[16px] tl-muted mb-4">Не удалось загрузить ленту.</p>
              <button type="button" onClick={() => setReloadKey(k => k + 1)} className="tl-btn ghost">
                Повторить
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="tl-panel py-16 text-center">
              <IconActivity size={34} className="mx-auto mb-3 text-[var(--muted-2)]" />
              <p className="tl-term text-[16px] tl-muted">
                {filter === 'all'
                  ? 'Пока нет активности. Добавьте игру в библиотеку, оставьте отзыв или получите значок.'
                  : `В разделе «${KIND_META[filter].label}» пока пусто.`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {grouped.map(group => (
                <section key={group.key}>
                  <div className="tl-head text-[10px] font-bold uppercase tracking-[0.24em] text-accent mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[var(--pink)] shadow-[var(--glow-sm)]" /> {group.label}
                    <span className="flex-1 h-px bg-[var(--line)]" />
                  </div>
                  <div className="flex flex-col gap-2 border-l border-[var(--line)] ml-[3px] pl-4">
                    {group.rows.map(it => (
                      <ActivityRow
                        key={it.id}
                        item={it}
                        actorName={name || ''}
                        isPro={!!user?.profile?.is_pro}
                        onOpen={(to) => navigate(to)}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {hasMore && (
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="tl-btn ghost block disabled:opacity-50">
                  {loadingMore ? <IconLoader2 size={14} className="animate-spin" /> : 'Показать ещё'}
                </button>
              )}
            </div>
          )}
        </main>

        {/* сводка за неделю */}
        <aside className="tl-panel p-5 lg:sticky lg:top-6">
          <h3 className="tl-pixel text-[11px] text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>ЗА 7 ДНЕЙ</h3>
          <div className="tl-stat" style={{ textAlign: 'left' }}>
            <div className="n tl-pixel text-[26px]">{total7d}</div>
            <div className="l">событий</div>
          </div>
          {topKinds.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2.5">
              {topKinds.map(k => {
                const n = summary[k] || 0;
                return (
                  <button key={k} type="button" onClick={() => setFilter(k)} className="text-left group">
                    <div className="flex items-center justify-between tl-term text-[14px]">
                      <span className="flex items-center gap-2 tl-muted group-hover:text-white transition-colors">
                        <span style={{ color: KIND_META[k].color }}>{KIND_META[k].icon}</span> {KIND_META[k].label}
                      </span>
                      <span className="text-white">{n}</span>
                    </div>
                    <div className="mt-1 h-1 bg-white/5 overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.max(6, (n / Math.max(1, total7d)) * 100)}%`, background: KIND_META[k].color }} />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="tl-term text-[14px] text-[var(--muted-2)] mt-3">За неделю событий не было.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function ActivityRow({ item, actorName, isPro, onOpen }: {
  item: ActivityItem;
  actorName: string;
  isPro: boolean;
  onOpen: (to: string) => void;
}) {
  const meta = KIND_META[item.kind] || KIND_META.library_add;
  const isBadge = item.kind === 'badge_earned';
  // у события «уровень» в target_id лежит номер достигнутого уровня
  const isLevel = item.kind === 'level_up' && item.target_id > 0;
  const rarity = (item.meta?.rarity as BadgeRarity) || 'common';
  const rStyle = rarityStyles[rarity] || rarityStyles.common;

  // профиль открывается по логину (раньше подставлялся числовой id — ссылка вела в никуда)
  const targetHref =
    item.kind === 'library_add' || item.kind === 'favorite' || item.kind === 'review'
      ? `/games/${item.target_id}`
      : item.kind === 'badge_earned'
        ? '/profile/badges'
        : (item.kind === 'follow' || item.kind === 'comment') && item.target_username
          ? `/profile/${item.target_username}`
          : null;

  return (
    <div className="tl-panel relative flex items-center gap-3.5 p-3">
      {/* точка на линии времени */}
      <span className="absolute -left-[21px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 border-2 bg-[#050407]" style={{ borderColor: meta.color }} />

      {isBadge ? (
        <div className="shrink-0"><BadgeEmblem code={item.meta?.code || 'unknown'} rarity={rarity} size={40} /></div>
      ) : isLevel ? (
        <div className="shrink-0"><LevelEmblem level={item.target_id} size={40} /></div>
      ) : (
        <ImageOr
          src={item.target_image}
          className="w-12 h-12 object-cover shrink-0 border border-[var(--line)]"
          fallback={(
            <div className="w-10 h-10 shrink-0 grid place-items-center border border-[var(--line)]" style={{ color: meta.color }}>
              {meta.icon}
            </div>
          )}
        />
      )}

      <div className="min-w-0 flex-1">
        <p className="tl-term text-[15px] tl-muted leading-snug">
          <span className="inline-flex items-center gap-1.5 text-white">
            {isPro && <ProBadge />}
            <span className={isPro ? PRO_NICK_CLASS : undefined}>{actorName}</span>
          </span>{' '}
          <span style={{ color: meta.color }}>{meta.verb}</span>{' '}
          {isLevel ? <span className="text-white">{item.target_id}</span> : item.target_name && (
            targetHref ? (
              <button type="button" onClick={() => onOpen(targetHref)} className="text-white hover:text-accent transition-colors text-left">
                {item.target_name}
              </button>
            ) : (
              <span className="text-white">{item.target_name}</span>
            )
          )}
        </p>
        {item.meta?.excerpt && <p className="tl-term text-[14px] text-[var(--muted-2)] mt-0.5 line-clamp-1">«{item.meta.excerpt}»</p>}
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {isLevel && <RankPlate level={item.target_id} size="sm" showLevel={false} />}
          {isBadge && <span className={`tl-chip border ${rStyle.chip}`}>{rStyle.label}</span>}
          {item.kind === 'review' && item.meta?.positive !== undefined && (
            <span className={`tl-chip ${item.meta.neutral ? 'warn' : item.meta.positive ? 'ok' : 'nsfw'}`}>{item.meta.neutral ? 'нейтрально' : item.meta.positive ? 'рекомендует' : 'не рекомендует'}</span>
          )}
        </div>
      </div>

      <span className="tl-head text-[10px] text-[var(--muted-2)] shrink-0 self-start mt-1">{timeLabel(item.created_at)}</span>
    </div>
  );
}
