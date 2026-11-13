import type { StorageGame } from './types';
import { fmtBytes, fmtDate, fmtPlaytime } from './storageUtils';

interface StorageGameRowProps {
  game: StorageGame;
  selected: boolean;
  onToggle: (id: string) => void;
  thumb?: string;
}

export const StorageGameRow = ({ game, selected, onToggle, thumb }: StorageGameRowProps) => (
  <label className="flex items-center gap-4 px-6 py-3 hover:bg-[rgb(var(--accent-rgb)/.05)] transition-colors cursor-pointer">
    <input
      type="checkbox"
      checked={selected}
      onChange={() => onToggle(game.id)}
      className="w-4 h-4 accent-[color:var(--color-accent)] cursor-pointer shrink-0"
    />
    <div className="w-24 h-14 overflow-hidden bg-[#0b0912] border border-[var(--line)] shrink-0 flex items-center justify-center">
      {thumb
        ? <img src={thumb} alt="" className="w-full h-full object-cover" draggable={false} />
        : <span className="tl-num text-lg font-black text-[var(--muted-2)]">{game.name.charAt(0).toUpperCase()}</span>}
    </div>
    <div className="min-w-0 flex-1">
      <p className="tl-head text-[11px] font-bold text-white truncate">{game.name}</p>
      <p className="tl-term text-[14px] tl-muted mt-1 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted-2)]" />
        Последний запуск: {fmtDate(game.lastPlayedAt)}
        {game.playtimeMs > 0 && <span className="text-[var(--muted-2)]">· {fmtPlaytime(game.playtimeMs)}</span>}
      </p>
      {game.installPath && <p className="tl-term text-[13px] text-[var(--muted-2)] truncate mt-0.5">{game.installPath}</p>}
    </div>
    <span className="tl-term text-[16px] tl-pink tabular-nums shrink-0">{fmtBytes(game.size)}</span>
  </label>
);
