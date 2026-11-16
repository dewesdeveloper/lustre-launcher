import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Award, Clock, Crown, Loader2, MessageSquareText, RefreshCw, Trophy, Zap } from 'lucide-react';
import AvatarFrame from '../../components/AvatarFrame';
import ProBadge from '../../components/ProBadge';
import { useAuth } from '../../context/AuthContext';
import { formatTopValue, getUserTop, topLevelXp, type TopBoard, type TopEntry, type TopResult } from '../../api/userTops';

const BOARDS: { id: TopBoard; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'level', label: 'Уровень', hint: 'Опыт за игры, отзывы, активность и значки', icon: <Zap size={14} /> },
  { id: 'playtime', label: 'Время в играх', hint: 'Сколько часов наиграно в лаунчере', icon: <Clock size={14} /> },
  { id: 'badges', label: 'Значки', hint: 'Собрано значков за достижения', icon: <Award size={14} /> },
  { id: 'reviews', label: 'Отзывы', hint: 'Сколько отзывов об играх написано', icon: <MessageSquareText size={14} /> },
];

const PODIUM = ['#ffd166', '#c9d1e0', '#e0965a'];

function Avatar({ e, size }: { e: TopEntry; size: 'xs' | 'small' | 'medium' }) {
  return (
    <AvatarFrame
      avatarUrl={e.user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${e.user.username}`}
      frameId={e.user.frame_id}
      frameUrl={e.user.avatar_frame_url}
      isPro={e.user.is_pro}
      size={size}
    />
  );
}

const name = (e: TopEntry) => e.user.display_name || e.user.username;

/** Топ пользователей: четыре рейтинга, пьедестал первой тройки, список до 50 и «ваше место» */
export default function TopUsersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const board = (BOARDS.some((b) => b.id === params.get('board')) ? params.get('board') : 'level') as TopBoard;
  const [data, setData] = useState<TopResult | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(false);
    getUserTop(board).then((r) => { if (alive) setData(r); }, () => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [board, reload]);

  const info = BOARDS.find((b) => b.id === board)!;
  const entries = data?.entries ?? [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const open = (e: TopEntry) => navigate(`/profile/${e.user.username}`);

  const valueText = (v: number) => (
    <>
      {formatTopValue(board, v)}
      {board === 'level' && <span className="ml-1.5 text-[var(--muted)]">· {topLevelXp(v).toLocaleString('ru-RU')} XP</span>}
    </>
  );

  return (
    <div className="mx-auto max-w-[1100px] p-8 text-left animate-in fade-in duration-700 max-md:p-4">
      <header className="tl-panel relative mb-6 overflow-hidden p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{
          backgroundImage: 'radial-gradient(520px 200px at 90% 0%, rgb(var(--accent-rgb)/.2), transparent 70%), linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
          backgroundSize: 'auto, 28px 28px, 28px 28px',
        }} />
        <div className="relative">
          <p className="tl-head mb-2 text-[10px] font-bold uppercase tracking-[.3em] text-accent">// Leaderboards</p>
          <h1 className="tl-pixel flex items-center gap-3 text-[26px] text-white" style={{ textShadow: 'var(--glow)' }}>
            <Trophy size={24} className="text-accent" /> Топ игроков <span className="text-accent">Lustre</span>
          </h1>
          <p className="tl-head tl-muted mt-2.5 text-[10px] font-bold uppercase tracking-[.26em]">Лучшие по уровню, времени в играх, значкам и отзывам</p>
        </div>
        <nav className="relative mt-6 flex flex-wrap gap-2">
          {BOARDS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setParams({ board: b.id }, { replace: true })}
              className={`tl-head flex items-center gap-2 border px-4 py-2 text-[10px] font-bold uppercase tracking-[.12em] transition-colors ${b.id === board ? 'border-[var(--line-2)] bg-accent/15 text-accent' : 'border-[var(--line)] text-[var(--muted)] hover:text-white'}`}
            >
              {b.icon} {b.label}
            </button>
          ))}
        </nav>
      </header>

      <p className="tl-term mb-4 text-[15px] text-[var(--muted)]">
        {info.hint}. В рейтинге — только открытые профили{data ? `; обновлено ${new Date(data.updated_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}.
      </p>

      {data?.me && user && (
        <div className="tl-panel mb-6 flex items-center gap-4 border-[var(--line-2)] p-4">
          <Crown size={18} className="shrink-0 text-accent" />
          <span className="tl-head text-[10px] font-bold uppercase tracking-[.14em] text-white">Ваше место</span>
          <span className="tl-num text-[18px] text-accent">{data.me.rank > 0 ? `#${data.me.rank}` : 'вне топ-50'}</span>
          <span className="tl-term ml-auto text-[15px] text-pearl/80">{valueText(data.me.value)}</span>
        </div>
      )}

      {error ? (
        <div className="tl-panel p-10 text-center">
          <p className="tl-term text-[15px] text-[var(--muted)]">Не удалось загрузить рейтинг</p>
          <button type="button" onClick={() => setReload((n) => n + 1)} className="tl-btn ghost mx-auto mt-4"><RefreshCw size={13} /> Повторить</button>
        </div>
      ) : !data ? (
        <div className="flex justify-center py-20 text-[var(--muted)]"><Loader2 className="animate-spin" size={22} /></div>
      ) : entries.length === 0 ? (
        <div className="tl-panel p-10 text-center tl-term text-[15px] text-[var(--muted)]">Пока в этом рейтинге никого нет</div>
      ) : (
        <>
          {/* пьедестал: второе, первое, третье место */}
          <div className="mb-6 grid grid-cols-3 items-end gap-3 max-sm:grid-cols-1">
            {[1, 0, 2].map((i) => podium[i] && (
              <button
                key={podium[i].user.id}
                type="button"
                onClick={() => open(podium[i])}
                className={`tl-panel group flex flex-col items-center gap-2 px-3 text-center transition-colors hover:border-[var(--line-2)] ${i === 0 ? 'pb-6 pt-8' : 'pb-5 pt-6'} max-sm:order-none`}
                style={{ boxShadow: `inset 0 3px 0 ${PODIUM[i]}` }}
              >
                <span className="tl-num text-[20px]" style={{ color: PODIUM[i] }}>#{i + 1}</span>
                <Avatar e={podium[i]} size={i === 0 ? 'medium' : 'small'} />
                <span className="flex max-w-full items-center gap-1.5">
                  <span className="tl-head truncate text-[11px] font-bold uppercase tracking-[.1em] text-white group-hover:text-accent">{name(podium[i])}</span>
                  {podium[i].user.is_pro && <ProBadge size="sm" />}
                </span>
                <span className="tl-term text-[15px] text-pearl/80">{valueText(podium[i].value)}</span>
              </button>
            ))}
          </div>

          {rest.length > 0 && (
            <ol className="tl-panel divide-y divide-[var(--line)]">
              {rest.map((e) => {
                const mine = e.user.id === user?.id;
                return (
                  <li key={e.user.id}>
                    <button
                      type="button"
                      onClick={() => open(e)}
                      className={`group flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors hover:bg-accent/[0.06] ${mine ? 'bg-accent/10' : ''}`}
                    >
                      <span className="tl-num w-10 shrink-0 text-[15px] text-[var(--muted)]">#{e.rank}</span>
                      <Avatar e={e} size="xs" />
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="tl-head truncate text-[11px] font-bold uppercase tracking-[.1em] text-pearl/90 group-hover:text-accent">{name(e)}</span>
                        {e.user.is_pro && <ProBadge size="sm" />}
                        {board !== 'level' && <span className="tl-term shrink-0 text-[13px] text-[var(--muted)]">· {e.user.level} ур.</span>}
                      </span>
                      <span className="tl-term shrink-0 text-[15px] text-pearl/80">{valueText(e.value)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
