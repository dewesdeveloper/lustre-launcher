import { HardDrive } from 'lucide-react';
import type { StorageDrive, StorageSegment } from './types';
import { fmtBytes, driveLabel } from './storageUtils';
import { StorageLegend } from './StorageLegend';

interface StorageDriveCardProps {
  driveInfo: StorageDrive | null;
  drive: string;
  drives: StorageDrive[];
  gamesDir?: string;
  segments: StorageSegment[];
  pct: (v: number) => number;
  onDriveChange: (root: string) => void;
}

export const StorageDriveCard = ({ driveInfo, drive, drives, gamesDir, segments, pct, onDriveChange }: StorageDriveCardProps) => {
  const total = driveInfo?.total || 0;
  const free = driveInfo?.free || 0;

  return (
    <div className="tl-panel overflow-hidden">
      <div className="flex items-center gap-4 px-6 py-5 flex-wrap">
        <div className="w-10 h-10 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.03)] flex items-center justify-center text-accent shrink-0">
          <HardDrive size={18} />
        </div>
        <div className="min-w-0">
          <p className="tl-head text-[11px] font-bold text-white">{driveInfo ? driveLabel(driveInfo.root) : 'Диск'}</p>
        </div>
        <div className="ml-auto flex items-center gap-4 flex-wrap">
          <span className="tl-term text-[15px] tl-muted tabular-nums">
            {fmtBytes(free)} доступно из {fmtBytes(total)}
          </span>
          <select
            value={drive}
            onChange={(e) => onDriveChange(e.target.value)}
            className="tl-select"
          >
            {drives.map((d) => <option key={d.root} value={d.root}>{driveLabel(d.root)}</option>)}
          </select>
        </div>
      </div>

      <div className="px-6 pb-2 tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)] truncate">
        {gamesDir}
      </div>

      <div className="px-6 pb-5">
        <div className="h-2.5 w-full overflow-hidden flex bg-white/5">
          {segments.map((s) => (
            <div
              key={s.key}
              title={`${s.label}: ${fmtBytes(s.value)}`}
              style={{ width: `${pct(s.value)}%`, background: s.color }}
              className="h-full transition-all"
            />
          ))}
        </div>
        <StorageLegend segments={segments} />
      </div>
    </div>
  );
};
