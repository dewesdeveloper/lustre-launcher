import type { CSSProperties } from 'react';
import MotionFX from './MotionFX';

// Частицы с фиксированным «случайным» разбросом: одинаковые между ререндерами
const PARTICLES = Array.from({ length: 32 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: `${(r(1) * 100).toFixed(1)}%`,
    '--dur': `${(12 + r(2) * 14).toFixed(1)}s`,
    '--delay': `${(-r(3) * 26).toFixed(1)}s`,
    '--sway': `${Math.round((r(4) - 0.5) * 120)}px`,
  } as CSSProperties;
});

/**
 * Фоновая подложка лаунчера в стиле шаблонов: неоновая сетка, дрейфующие
 * glow-пятна, всплывающие пиксельные частицы, редкий луч-развёртка и зерно.
 * Слой фиксированный и не перехватывает клики. Здесь же подключены
 * глобальные интерактивные эффекты (MotionFX).
 */
export default function ThemeDecor() {
  return (
    <div className="fx-layer pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="tl-glow-blob a" />
      <div className="tl-glow-blob b" />
      <div className="tl-glow-blob c" />
      <div className="tl-grid-bg" />
      <div className="fx-particles">
        {PARTICLES.map((style, i) => <i key={i} style={style} />)}
      </div>
      <div className="fx-beam" />
      <div className="fx-grain" />
      <MotionFX />
    </div>
  );
}
