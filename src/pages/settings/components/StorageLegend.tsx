import type { StorageSegment } from './types';
import { fmtBytes } from './storageUtils';

interface StorageLegendProps {
  segments: StorageSegment[];
}

export const StorageLegend = ({ segments }: StorageLegendProps) => (
  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3">
    {segments.map((s) => (
      <span key={s.key} className="flex items-center gap-2 tl-head text-[10px] uppercase tracking-[0.1em] tl-muted">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
        {s.label} <span className="tl-term text-[14px] text-[var(--muted-2)] tabular-nums">{fmtBytes(s.value)}</span>
      </span>
    ))}
  </div>
);
