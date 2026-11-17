import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, EyeOff, Loader2, Lock, RefreshCw, Trophy } from 'lucide-react';
import {
  getGameAchievements, notifyAchievements, syncLocalAchievements,
  type Achievement, type GameAchievements,
} from '../../api/achievements';

type Filter = 'all' | 'unlocked' | 'locked';

const PREVIEW = 8;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });

/** Редкость по доле игроков Steam */
function rarity(p: number): { label: string; cls: string } {
  if (p > 0 && p < 5) return { label: 'Очень редкое', cls: 'text-amber-300' };
  if (p > 0 && p < 15) return { label: 'Редкое', cls: 'text-accent' };
  return { label: '', cls: 'text-[var(--muted)]' };
}

function Row({ a }: { a: Achievement }) {
  const [broken, setBroken] = useState(false);
  const open = !!a.unlocked_at;
  const secret = a.hidden && !open;
  const r = rarity(a.global_percent);
  const icon = open ? a.icon : a.icon_gray || a.icon;
  return (
    <li className={`flex items-center gap-3.5 border p-2.5 transition-colors ${open ? 'border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.06)]' : 'border-[var(--line)]'}`}>
      <div className="relative h-12 w-12 shrink-0 border border-white/10 bg-black/40">
        {secret
          ? <span className="flex h-full w-full items-center justify-center text-[var(--muted-2)]"><EyeOff size={18} /></span>
          : icon && !broken
            ? <img src={icon} alt="" loading="lazy" onError={() => setBroken(true)} className={`h-full w-full object-cover ${open ? '' : 'opacity-60'}`} />
            // иконки нет или не загрузилась — значок вместо «битой» картинки
            : <span className={`flex h-full w-full items-center justify-center ${open ? 'text-accent' : 'text-[var(--muted-2)]'}`}><Trophy size={18} /></span>}
        {!open && !secret && <Lock size={12} className="absolute -bottom-1 -right-1 bg-[var(--panel)] p-[1px] text-[var(--muted)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate tl-head text-[11px] font-bold uppercase tracking-[0.1em] ${open ? 'text-white' : 'text-pearl/60'}`}>
          {secret ? 'Скрытое достижение' : a.display_name || a.name}
        </p>
        <p className="tl-term mt-0.5 line-clamp-2 text-[14px] leading-snug text-[var(--muted)]">
          {secret ? 'Описание откроется после получения' : a.description || '—'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {a.global_percent > 0 && (
          <p className={`tl-term text-[14px] ${r.cls}`} title="Доля игроков Steam, открывших достижение">
            {a.global_percent.toFixed(1)}%{r.label && <span className="ml-1.5 text-[12px] uppercase tracking-wider">{r.label}</span>}
          </p>
        )}
        {open && <p className="tl-term text-[13px] text-[var(--green2)]">{fmtDate(a.unlocked_at!)}</p>}
      </div>
    </li>
  );
}

/**
 * Достижения игры Steam. На странице установленной игры (installedId) лаунчер читает
 * файл эмулятора в репаке и отправляет открытые достижения на сервер.
 */
export default function AchievementsSection({ gameId, gameTitle, installedId, className = 'mt-10' }: {
  gameId: number;
  /** отступ сверху: на странице магазина интервал между секциями задаёт родитель */
  className?: string;
  gameTitle?: string;
  installedId?: string | number | null;
}) {
  const [data, setData] = useState<GameAchievements | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const canReadLocal = !!(window as any).electron?.achievements && installedId != null;

  const syncLocal = async (d: GameAchievements, notify: boolean) => {
    if (!canReadLocal || !d.app_id || d.total === 0) return;
    setSyncing(true);
    try {
      const res = await syncLocalAchievements(gameId, d.app_id, installedId);
      if (res?.new?.length) {
        if (notify) notifyAchievements(res.new, gameTitle);
        setData(await getGameAchievements(gameId));
      }
    } catch { /* нет сети — попробуем при следующем открытии */ } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    getGameAchievements(gameId).then((d) => {
      if (!alive) return;
      setData(d);
      void syncLocal(d, false);
    }, () => alive && setError(true));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, installedId]);

  const list = useMemo(() => {
    const all = Array.isArray(data?.achievements) ? data!.achievements : [];
    const f = filter === 'unlocked' ? all.filter((a) => a.unlocked_at) : filter === 'locked' ? all.filter((a) => !a.unlocked_at) : all;
    // открытые — сверху (свежие первыми), закрытые — от самых частых к редким, скрытые в конце
    return [...f].sort((a, b) => {
      if (!!a.unlocked_at !== !!b.unlocked_at) return a.unlocked_at ? -1 : 1;
      if (a.unlocked_at && b.unlocked_at) return b.unlocked_at.localeCompare(a.unlocked_at);
      if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
      return b.global_percent - a.global_percent;
    });
  }, [data, filter]);

  if (error || !data || !data.total) {
    // у игры нет достижений Steam (или она не из Steam) — блок не показываем
    if (data === null && !error) {
      return (
        <section className={`${className} flex items-center gap-2 tl-term text-[14px] tl-muted`}>
          <Loader2 size={14} className="animate-spin" /> Загружаем достижения…
        </section>
      );
    }
    return null;
  }

  const pct = Math.round((data.unlocked_count / data.total) * 100);
  const shown = expanded ? list : list.slice(0, PREVIEW);

  return (
    <section className={className}>
      <div className="tl-sec-head">
        <span className="bar" />
        <h2><Trophy size={15} className="text-accent" /> Достижения</h2>
        <span className="count">{data.unlocked_count} / {data.total}</span>
        <span className="line" />
        {canReadLocal && (
          <button type="button" onClick={() => syncLocal(data, true)} disabled={syncing} className="tl-btn ghost" title="Проверить открытые достижения в файлах игры">
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Обновить
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-4">
        <div className="relative h-2 flex-1 border border-[var(--line)] bg-black/40">
          <div className="absolute inset-y-0 left-0 bg-[var(--pink)] shadow-[var(--glow-sm)]" style={{ width: `${pct}%` }} />
        </div>
        <span className="tl-term text-[15px] text-white">{pct}%</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {([['all', 'Все'], ['unlocked', 'Открытые'], ['locked', 'Не открытые']] as [Filter, string][]).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} className={`tl-btn ${filter === id ? 'solid' : 'ghost'}`}>{label}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="tl-term text-[14px] tl-muted">
          {filter === 'unlocked' ? 'Пока ничего не открыто. Достижения появятся здесь, когда вы получите их в игре.' : 'Все достижения открыты!'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
          {shown.map((a) => <Row key={a.name} a={a} />)}
        </ul>
      )}

      {list.length > PREVIEW && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="tl-btn ghost mt-3">
          <ChevronDown size={13} className={expanded ? 'rotate-180' : ''} /> {expanded ? 'Свернуть' : `Показать все (${list.length})`}
        </button>
      )}

      {canReadLocal && (
        <p className="tl-term mt-3 text-[13px] text-[var(--muted-2)]">
          Открытые достижения лаунчер берёт из файлов эмулятора Steam в репаке. Если репак не записывает
          достижения, они здесь не появятся.
        </p>
      )}
    </section>
  );
}
