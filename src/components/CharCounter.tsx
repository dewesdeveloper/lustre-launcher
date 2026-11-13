/**
 * Счётчик символов под текстовым полем: «120 / 2 000». Ближе к лимиту желтеет,
 * на лимите — акцентный цвет и подсказка, что дальше текст не поместится.
 * Лимиты совпадают с серверными (controllers/flood.go).
 */
export default function CharCounter({ value, max, className = '' }: { value: string; max: number; className?: string }) {
  const n = value.length;
  const full = n >= max;
  const near = !full && n >= max * 0.9;
  return (
    <div className={`flex items-center justify-end gap-3 mt-1.5 tl-term text-[14px] leading-none ${className}`}>
      {full && <span className="text-accent">Достигнут лимит символов</span>}
      <span className={`tabular-nums ${full ? 'text-accent' : near ? 'text-amber-300' : 'text-[var(--muted-2)]'}`}>
        {n.toLocaleString('ru-RU')} / {max.toLocaleString('ru-RU')}
      </span>
    </div>
  );
}
