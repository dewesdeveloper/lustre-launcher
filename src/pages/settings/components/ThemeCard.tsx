import { Check } from 'lucide-react';
import type { LauncherTheme } from '../../../components/profileThemes';

export default function ThemeCard({ theme, active, busy, onClick, tag }: { theme: LauncherTheme; active: boolean; busy: boolean; onClick: () => void; tag?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || active}
      className={`relative p-3 text-left transition-all border bg-[rgb(var(--accent-rgb)/.03)] disabled:cursor-default ${
        active
          ? 'border-accent shadow-[inset_0_0_0_1px_var(--pink)]'
          : 'border-[var(--line)] hover:border-[var(--line-2)]'
      }`}
    >
      <div
        className="h-10 mb-3 border border-[var(--line)]"
        style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.violet})` }}
      />
      <div className="flex items-center gap-1.5">
        <span className="tl-head text-[10px] font-bold text-white truncate">{theme.name}</span>
        {active && <Check size={13} className="text-accent shrink-0" />}
      </div>
      {tag && <span className="tl-head text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">{tag}</span>}
    </button>
  );
}
