import type { CSSProperties } from 'react';
import { ERA_ICON, RANK_BG as BG, glowVars, lookFor } from './rankStyle';
import { eraForLevel } from '../pages/profile/constants';

const SIZES = {
  sm: { h: 22, icon: 12, name: 11, lv: 13, pad: 7 },
  md: { h: 28, icon: 14, name: 13, lv: 15, pad: 9 },
  lg: { h: 36, icon: 18, name: 16, lv: 17, pad: 12 },
} as const;

const stripes = (color: string, w = 3, gap = 7): CSSProperties => ({
  background: `repeating-linear-gradient(-55deg, ${color} 0 ${w}px, transparent ${w}px ${gap}px)`,
});

const barcode = (color: string): CSSProperties => ({
  background: `repeating-linear-gradient(90deg, ${color} 0 1px, transparent 1px 3px, ${color} 3px 5px, transparent 5px 6px)`,
});

type RankPlateProps = {
  level: number;
  size?: keyof typeof SIZES;
  /** показывать номер уровня справа */
  showLevel?: boolean;
  className?: string;
};

/** Плашка звания профиля в цветах лаунчера; уголки — акцентный цвет темы. */
export default function RankPlate({ level, size = 'md', showLevel = true, className = '' }: RankPlateProps) {
  const era = eraForLevel(level);
  const t = era.tier;
  const look = lookFor(t);
  const s = SIZES[size];
  const Icon = ERA_ICON[Math.min(t, ERA_ICON.length - 1)];
  const ink = look.filled ? BG : era.color; // цвет линий и текста
  const line = `1px ${look.dashed ? 'dashed' : 'solid'} ${ink}`;
  const lv = String(Math.max(1, level || 1)).padStart(2, '0');
  const glow = glowVars(t);
  // высшее звание — своя, самая мощная пульсация; остальные — общая шкала свечения
  const glowClass = look.glow ? 'tl-rank-radiance' : `tl-rank-glow${glow.pulse ? ' pulse' : ''}`;

  return (
    <span
      title={`${era.name} · уровень ${lv}`}
      className={`relative inline-flex shrink-0 items-stretch select-none ${glowClass} ${className}`}
      style={{
        // цвет и сила свечения (анимации — в theme.css)
        ['--rank-glow' as string]: era.color,
        ...glow.vars,
        height: s.h,
        color: ink,
        border: `1px ${look.dashed ? 'dashed' : 'solid'} ${era.color}`,
        background: look.filled ? era.color : `color-mix(in srgb, ${era.color} 8%, ${BG})`,
        outline: look.doubleFrame ? `1px solid color-mix(in srgb, ${era.color} 60%, transparent)` : undefined,
        outlineOffset: 2,
        opacity: look.dashed ? 0.85 : 1,
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: s.h - 2,
          borderRight: line,
          background: look.invertedIcon ? era.color : undefined,
          color: look.invertedIcon ? BG : ink,
        }}
      >
        <Icon size={s.icon} strokeWidth={2.2} />
      </span>

      <span className="tl-pixel flex items-center whitespace-nowrap leading-none" style={{ padding: `0 ${s.pad}px`, fontSize: s.name }}>
        {era.name}
        {look.stars > 0 && <span style={{ marginLeft: 6, letterSpacing: 1 }}>{'✦'.repeat(look.stars)}</span>}
      </span>

      {look.symbols && <span className="tl-term flex items-center" style={{ paddingRight: s.pad, fontSize: s.lv, letterSpacing: 1 }}>×○×○</span>}
      {look.barcode && <span style={{ width: s.h * 1.3, margin: `${Math.round(s.h * 0.22)}px ${s.pad}px ${Math.round(s.h * 0.22)}px 0`, ...barcode(ink) }} />}
      {look.stripes && (
        <span
          style={{
            width: s.h * (t === 4 ? 1.4 : 2),
            margin: look.filled ? `${Math.round(s.h * 0.2)}px 0` : undefined,
            ...stripes(ink, look.filled ? 4 : 3, look.filled ? 9 : 7),
          }}
        />
      )}

      {showLevel && (
        <span className="tl-term flex items-center whitespace-nowrap leading-none" style={{ padding: `0 ${s.pad}px`, fontSize: s.lv, borderLeft: line }}>
          {look.filled ? `LV.${lv} →` : `LV.${lv}`}
        </span>
      )}

      {/* уголки цвета акцента лаунчера */}
      <span aria-hidden className="pointer-events-none absolute" style={{ left: -3, top: -3, width: 6, height: 6, borderTop: '2px solid var(--pink)', borderLeft: '2px solid var(--pink)' }} />
      <span aria-hidden className="pointer-events-none absolute" style={{ right: -3, bottom: -3, width: 6, height: 6, borderBottom: '2px solid var(--pink)', borderRight: '2px solid var(--pink)' }} />
    </span>
  );
}
