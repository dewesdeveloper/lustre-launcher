import { startCoverFlight } from '../../../utils/coverFlight';

interface Props {
  title: string;
  image?: string;
  compact: boolean;
  onClick: () => void;
}

const SidebarGameRow = ({ title, image, compact, onClick }: Props) => (
  <div
    onClick={(e) => { startCoverFlight(e.currentTarget.querySelector('img')); onClick(); }}
    className="fx-side-row flex items-center gap-2 px-2 py-1.5 cursor-pointer tl-term text-sm transition-all text-[var(--muted)] hover:bg-[rgb(var(--accent-rgb)/.08)] hover:text-[var(--text)] group"
    title={compact ? title : undefined}
  >
    {image ? (
      <img src={image} alt="" className="w-5 h-5 object-cover shrink-0 border border-[var(--line)]" />
    ) : (
      <div className="w-5 h-5 shrink-0 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.06)]" />
    )}
    {!compact && <span className="truncate">{title}</span>}
  </div>
);

export default SidebarGameRow;
