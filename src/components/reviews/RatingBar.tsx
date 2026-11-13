import { ThumbsUp, ThumbsDown, Meh } from 'lucide-react';

interface RatingBarProps {
  positive: number;
  neutral: number;
  negative: number;
}

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** Полоса оценок: зелёный / жёлтый (нейтральные) / красный — доли от всех отзывов */
export const RatingBar = ({ positive, neutral, negative }: RatingBarProps) => {
  const total = positive + neutral + negative;
  const p = pct(positive, total);
  const n = pct(neutral, total);
  const neg = total > 0 ? Math.max(0, 100 - p - n) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold" title="Положительные">
        <ThumbsUp size={12} className="text-green-400" />
        <span className="text-green-400">{p}%</span>
      </div>
      {neutral > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold" title="Нейтральные">
          <Meh size={12} className="text-amber-300" />
          <span className="text-amber-300">{n}%</span>
        </div>
      )}
      <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden flex">
        <div className="h-full bg-green-400 transition-all" style={{ width: `${p}%` }} />
        <div className="h-full bg-amber-300 transition-all" style={{ width: `${n}%` }} />
        <div className="h-full bg-red-400 transition-all" style={{ width: `${neg}%` }} />
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-bold" title="Отрицательные">
        <span className="text-red-400">{neg}%</span>
        <ThumbsDown size={12} className="text-red-400" />
      </div>
    </div>
  );
};
