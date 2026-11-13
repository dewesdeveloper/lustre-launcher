import { FolderOpen, ArrowRightLeft, Trash2, Loader2 } from 'lucide-react';

const SORTS = [
  { id: 'size', label: 'По размеру на диске' },
  { id: 'date', label: 'По дате запуска' },
  { id: 'name', label: 'По названию' },
];

interface StorageToolbarProps {
  count: number;
  sort: string;
  onSortChange: (v: string) => void;
  selectedCount: number;
  busy: boolean;
  onReveal: () => void;
  onUninstall: () => void;
}

export const StorageToolbar = ({ count, sort, onSortChange, selectedCount, busy, onReveal, onUninstall }: StorageToolbarProps) => (
  <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--line)] flex-wrap">
    <h3 className="tl-head text-[11px] font-bold text-white uppercase tracking-[0.12em]">
      Игры <span className="tl-term text-[var(--muted-2)] tabular-nums">{count}</span>
    </h3>
    <div className="ml-auto flex items-center gap-2 flex-wrap">
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value)}
        className="tl-select py-2"
      >
        {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <button
        onClick={onReveal}
        disabled={selectedCount !== 1}
        title="Открыть папку"
        className="w-9 h-9 border border-[var(--line)] bg-[#08050f] flex items-center justify-center text-[var(--muted)] hover:text-white hover:border-[var(--line-2)] transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <FolderOpen size={15} />
      </button>
      <button
        disabled
        title="Перемещение появится позже"
        className="w-9 h-9 border border-[var(--line)] bg-[#08050f] flex items-center justify-center text-[var(--muted-2)] cursor-not-allowed"
      >
        <ArrowRightLeft size={15} />
      </button>
      <button
        onClick={onUninstall}
        disabled={selectedCount === 0 || busy}
        className="tl-btn danger h-9 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Удалить
      </button>
    </div>
  </div>
);
