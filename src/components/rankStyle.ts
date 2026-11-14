import type { ComponentType } from 'react';
import {
  Atom, Bell, Compass, Crown, Globe, Infinity as InfinityIcon, Mountain, MousePointer2, Radiation, Search, Shield,
  Sparkles, Star, Sun, Zap,
} from 'lucide-react';

// Общие правила оформления званий: используют плашка звания (RankPlate) и эмблема уровня (LevelEmblem)

export type Icon = ComponentType<{ size?: number; strokeWidth?: number }>;

/** Иконка каждого звания: Новичок (0) … Миф (6) … Сияние Lustre (14) */
export const ERA_ICON: Icon[] = [
  MousePointer2, Search, Compass, Shield, Globe, Star, Radiation,
  Mountain, Bell, Crown, Zap, InfinityIcon, Atom, Sun, Sparkles,
];

export const RANK_BG = '#0b0710';

/**
 * Оформление по номеру звания. До Мифа плашка «уплотняется» так:
 * Новичок — пунктир; Искатель — рамка с иконкой; Странник — ×○×○; Хранитель — штрихкод;
 * Мастер — двойная рамка и полосы; Легенда — залитая иконка и ✦✦✦; Миф — заливка цветом звания.
 * Звания после Мифа сохраняют заливку и с каждой ступенью получают новый элемент:
 * ✦ (Вестник и выше), двойную рамку (Архонт и выше), штрихкод (Абсолют и выше), свечение (Сияние Lustre).
 */
export function lookFor(t: number) {
  const filled = t >= 6;
  return {
    filled,
    dashed: t === 0,
    symbols: t === 2,
    barcode: t === 3 || t >= 12,
    stripes: t >= 4,
    doubleFrame: t === 4 || t === 5 || t >= 9,
    invertedIcon: t === 5,
    stars: t === 5 ? 3 : t >= 8 ? Math.min(3, t - 7) : 0,
    glow: t >= 14,
  };
}

/**
 * Свечение по номеру звания: у Новичка едва заметное, к Легенде — ярче и шире.
 * С Мастера (4) оно пульсирует: чем выше звание, тем быстрее и шире пульс;
 * с Архонта (9) на пике появляется внешний ореол. Сияние Lustre (14) — своя анимация.
 */
export function glowVars(t: number): { vars: Record<string, string>; pulse: boolean } {
  const r = 3 + t * 1.6; // радиус в покое, px
  const a = 18 + t * 4; // яркость в покое, %
  const pulse = t >= 4;
  return {
    pulse,
    vars: {
      '--g-r': `${r.toFixed(1)}px`,
      '--g-s': t >= 8 ? '1px' : '0px',
      '--g-a': `${a}%`,
      '--g-r2': `${(r * 1.9).toFixed(1)}px`,
      '--g-a2': `${Math.min(95, a + 22)}%`,
      '--g-r3': t >= 9 ? `${(r * 3.2).toFixed(1)}px` : '0px',
      '--g-a3': t >= 9 ? `${10 + (t - 9) * 6}%` : '0%',
      '--g-dur': `${Math.max(1.9, 3.4 - (t - 4) * 0.15).toFixed(2)}s`,
      '--g-b': (1 + t * 0.012).toFixed(3),
    },
  };
}
