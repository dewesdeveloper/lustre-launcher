import { eraForLevel } from '../pages/profile/constants';
import { ERA_ICON, RANK_BG, glowVars, lookFor } from './rankStyle';

type LevelEmblemProps = {
  level: number;
  size?: number;
  className?: string;
};

/**
 * Эмблема уровня для ленты активности — в стиле значков: квадрат цвета звания с номером уровня
 * и иконкой звания, уголки — акцентный цвет лаунчера. Начиная с Мифа эмблема залита цветом
 * звания; свечение и его пульс — те же, что у плашки звания (RankPlate).
 */
export default function LevelEmblem({ level, size = 40, className = '' }: LevelEmblemProps) {
  const lv = Math.max(1, Math.floor(level || 1));
  const era = eraForLevel(lv);
  const t = era.tier;
  const look = lookFor(t);
  const glow = glowVars(t);
  const Icon = ERA_ICON[Math.min(t, ERA_ICON.length - 1)];
  const ink = look.filled ? RANK_BG : era.color;
  const tick = Math.max(5, Math.round(size * 0.18));
  const glowClass = look.glow ? 'tl-rank-radiance' : `tl-rank-glow${glow.pulse ? ' pulse' : ''}`;

  return (
    <div
      title={`${era.name} · уровень ${lv}`}
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center ${glowClass}`}
        style={{
          ['--rank-glow' as string]: era.color,
          ...glow.vars,
          border: `${size >= 36 ? 2 : 1}px ${look.dashed ? 'dashed' : 'solid'} ${era.color}`,
          outline: look.doubleFrame ? `1px solid color-mix(in srgb, ${era.color} 60%, transparent)` : undefined,
          outlineOffset: 2,
          background: look.filled ? era.color : `color-mix(in srgb, ${era.color} 10%, ${RANK_BG})`,
          color: ink,
        }}
      >
        <Icon size={Math.round(size * 0.26)} strokeWidth={2.2} />
        <span className="tl-pixel leading-none" style={{ fontSize: Math.round(size * (lv >= 100 ? 0.26 : 0.32)), marginTop: Math.round(size * 0.05) }}>
          {lv}
        </span>
      </div>
      <span aria-hidden className="pointer-events-none absolute" style={{ left: -3, top: -3, width: tick, height: tick, borderTop: '2px solid var(--pink)', borderLeft: '2px solid var(--pink)' }} />
      <span aria-hidden className="pointer-events-none absolute" style={{ right: -3, bottom: -3, width: tick, height: tick, borderBottom: '2px solid var(--pink)', borderRight: '2px solid var(--pink)' }} />
    </div>
  );
}
