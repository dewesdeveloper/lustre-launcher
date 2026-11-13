import type { CommunityStats } from '../../../api/community';

const nf = new Intl.NumberFormat('ru-RU');

/** Плитки статистики: подпись, ключ в ответе сервера и цвет полоски (начало, конец, свечение) */
const TILES: { label: string; key: keyof CommunityStats; color: [string, string, string] }[] = [
  { label: 'Игроков онлайн', key: 'online_users', color: ['#22d3ee', '#38bdf8', 'rgba(34,211,238,0.4)'] },
  { label: 'Обсуждений', key: 'discussions', color: ['#FF006E', '#ff6fa5', 'rgb(var(--accent-rgb)/0.4)'] },
  { label: 'Участников', key: 'members', color: ['#8338ec', '#c77dff', 'rgba(131,56,236,0.4)'] },
  { label: 'Сообществ', key: 'communities', color: ['#f59e0b', '#fbbf24', 'rgba(245,158,11,0.35)'] },
];

/** Блок «Активность Lustre»: живые цифры платформы (прочерк, пока не загрузились). */
export default function StatsPanel({ stats }: { stats: CommunityStats | null }) {
  return (
    <div className="tl-panel p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="tl-pixel text-[10px] text-white">Активность Lustre</h3>
        <span className="tl-st ok"><span className="led" /> Live</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {TILES.map(({ label, key, color: [from, to, glow] }) => (
          <div key={key} className="tl-stat">
            <div className="n" style={{ filter: `drop-shadow(0 0 8px ${glow})` }}>{stats ? nf.format(stats[key]) : '—'}</div>
            <div className="l">{label}</div>
            <div className="tl-prog mt-2.5">
              <div className="t"><div className="f" style={{ background: `linear-gradient(90deg, ${from}, ${to})` }} /></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
