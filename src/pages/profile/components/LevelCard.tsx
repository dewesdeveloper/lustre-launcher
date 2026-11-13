import { eraForLevel, levelProgress } from '../constants';

type LevelCardProps = {
  profile: any;
  activeTheme: { color: string };
};

export default function LevelCard({ profile, activeTheme }: LevelCardProps) {
  const xp = Number(profile?.xp || 0);
  const progress = levelProgress(xp);
  const level = progress.level;
  const era = eraForLevel(level);
  const percent = Math.min(100, progress.percent);

  return (
    <div className="mt-[18px]">
      <div className="flex items-center justify-between tl-term text-[16px] tl-muted mb-1.5 gap-3">
        <span>УРОВЕНЬ {level} · {era.name}</span>
        <span>{progress.current.toLocaleString('ru-RU')} / {progress.goal.toLocaleString('ru-RU')} XP</span>
      </div>
      <div className="tl-prog">
        <div className="t">
          <div className="f" style={{ width: `${percent}%`, background: activeTheme.color }} />
        </div>
      </div>
      <div className="mt-2 tl-term text-[14px] text-[var(--muted-2)]">
        {xp.toLocaleString('ru-RU')} XP · до {level + 1} уровня — {progress.goal - progress.current} XP
      </div>
    </div>
  );
}
