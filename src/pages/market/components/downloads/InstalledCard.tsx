import { Gamepad2, Play, FolderOpen, Trash2 } from 'lucide-react';
import type { InstalledGame } from '../../types';

interface InstalledCardProps {
  game: InstalledGame;
  onPlay: (id: string) => void;
  onReveal: (id: string) => void;
  onUninstall: (g: InstalledGame) => void;
}

const InstalledCard = ({ game, onPlay, onReveal, onUninstall }: InstalledCardProps) => (
  <div className="tl-panel p-4 flex items-center gap-3">
    <div className="w-10 h-10 shrink-0 grid place-items-center border border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.08)] text-accent">
      <Gamepad2 size={18} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="tl-head text-[11px] font-bold uppercase tracking-[0.06em] text-white truncate">{game.name}</p>
      <p className="tl-term text-[13px] text-[var(--muted-2)] truncate" title={game.installPath}>{game.installPath}</p>
      {!game.exePath && (
        <p className="tl-term text-[13px] text-amber-300/80">Не указан exe — выберите его на странице игры</p>
      )}
    </div>
    <div className="flex gap-1.5 shrink-0">
      {game.exePath && (
        <button type="button" onClick={() => onPlay(game.id)} className="tl-btn solid !py-1.5">
          <Play size={13} /> Играть
        </button>
      )}
      <button type="button" onClick={() => onReveal(game.id)} className="tl-btn ghost !px-2 !py-1.5" title="Открыть папку" aria-label="Открыть папку">
        <FolderOpen size={13} />
      </button>
      <button type="button" onClick={() => onUninstall(game)} className="tl-btn ghost !px-2 !py-1.5 hover:!text-[#ff5b8a]" title="Удалить игру" aria-label="Удалить игру">
        <Trash2 size={13} />
      </button>
    </div>
  </div>
);

export default InstalledCard;
