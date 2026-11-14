import RankPlate from '../../../components/RankPlate';
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
      <div className="flex items-center justify-between tl-term text-[16px] tl-muted mb-2.5 gap-3 flex-wrap">
        <RankPlate level={level} size="md" />
        <span>{progress.current.toLocaleString('ru-RU')} / {progress.goal.toLocaleString('ru-RU')} XP</span>
      </div>
      {/* полоса опыта в стиле плашки: рамка цвета эры, заполнение — полосы цвета темы */}
      <div className="h-2.5 p-px" style={{ border: `1px solid ${era.color}` }}>
        <div
          className="h-full"
          style={{ width: `${percent}%`, background: `repeating-linear-gradient(-55deg, ${activeTheme.color} 0 3px, transparent 3px 6px)` }}
        />
      </div>
      <div className="mt-2 tl-term text-[14px] text-[var(--muted-2)]">
        {xp.toLocaleString('ru-RU')} XP · до {level + 1} уровня — {progress.goal - progress.current} XP
      </div>
    </div>
  );
}
