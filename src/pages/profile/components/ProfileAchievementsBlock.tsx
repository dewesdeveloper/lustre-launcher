import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { getUserAchievements, type UserAchievementsSummary } from '../../../api/achievements';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });

/** Достижения игрока в профиле: сколько открыто, последние открытые и игры с прогрессом */
export default function ProfileAchievementsBlock({ userId, onGameClick }: { userId: number; onGameClick: (gameId: number) => void }) {
  const [data, setData] = useState<UserAchievementsSummary | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    if (!(Number(userId) > 0)) return;
    getUserAchievements(userId).then((d) => alive && setData(d), () => alive && setData(null));
    return () => { alive = false; };
  }, [userId]);

  if (!data || !data.total) return null;
  const recent = Array.isArray(data.recent) ? data.recent : [];
  const games = Array.isArray(data.games) ? data.games : [];

  return (
    <div className="tl-panel p-[22px]">
      <h3 className="tl-head mb-4 text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>
        <span className="inline-flex items-center gap-2">
          <Trophy size={14} className="text-accent" /> ДОСТИЖЕНИЯ <span className="tl-term text-[14px] tl-muted">({data.total})</span>
        </span>
      </h3>

      <div className="mb-4 flex flex-wrap gap-2">
        {recent.map((a) => (
          <button
            key={`${a.game_id}-${a.name}`}
            type="button"
            onClick={() => a.game_id && onGameClick(a.game_id)}
            title={`${a.display_name || a.name}${a.description ? ` — ${a.description}` : ''}\n${a.title || ''} · ${fmtDate(a.unlocked_at)}${a.global_percent > 0 ? ` · есть у ${a.global_percent.toFixed(1)}% игроков Steam` : ''}`}
            className="h-12 w-12 border border-[var(--line-2)] bg-black/40 transition-transform hover:scale-110"
          >
            {a.icon ? (
              <img
                src={a.icon}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
              />
            ) : null}
            <Trophy size={18} className={`m-auto text-accent ${a.icon ? 'hidden' : ''}`} />
          </button>
        ))}
      </div>

      <ul className="space-y-2.5">
        {games.slice(0, 5).map((g) => {
          const pct = g.total > 0 ? Math.min(100, Math.round((g.unlocked / g.total) * 100)) : 0;
          return (
            <li key={g.app_id}>
              <button type="button" onClick={() => g.game_id && onGameClick(g.game_id)} className="group flex w-full items-center gap-3 text-left">
                {g.cover && <img src={g.cover} alt="" loading="lazy" className="h-9 w-[76px] shrink-0 border border-white/10 object-cover" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate tl-term text-[15px] text-pearl/85 group-hover:text-white">{g.title || `Игра ${g.app_id}`}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="relative h-1.5 flex-1 bg-black/40">
                      <span className="absolute inset-y-0 left-0 bg-[var(--pink)]" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="tl-term text-[13px] text-[var(--muted)]">{g.unlocked}/{g.total || '?'}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {data.games_perfect > 0 && (
        <p className="tl-term mt-3 text-[13px] text-amber-300">Все достижения открыты в {data.games_perfect} {data.games_perfect === 1 ? 'игре' : 'играх'}</p>
      )}
    </div>
  );
}
