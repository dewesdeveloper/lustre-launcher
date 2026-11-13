import { formatPlaytime } from '../../../utils/playtime';

export type ProfileStatsData = {
  games?: number;
  favorites?: number;
  achievements?: number;
  friends?: number;
  level?: number;
  xp?: number;
  level_xp?: number;
  level_goal?: number;
  /** Суммарное время в играх на аккаунте, мс */
  playtime_ms?: number;
};

export default function ProfileStats({ stats }: { stats?: ProfileStatsData }) {
  const items = [
    { key: 'level', label: 'Уровень', value: String(stats?.level ?? 1) },
    { key: 'games', label: 'Игр', value: String(stats?.games ?? 0) },
    { key: 'playtime', label: 'Наиграно', value: formatPlaytime(stats?.playtime_ms) },
    { key: 'achievements', label: 'Значков', value: String(stats?.achievements ?? 0) },
    { key: 'favorites', label: 'Избранное', value: String(stats?.favorites ?? 0) },
    { key: 'friends', label: 'Друзей', value: String(stats?.friends ?? 0) },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((it) => (
        <div key={it.key} className="tl-stat">
          <div className="n">{it.value}</div>
          <div className="l">{it.label}</div>
        </div>
      ))}
    </div>
  );
}
