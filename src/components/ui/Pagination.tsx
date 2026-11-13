import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

// Строит список страниц с многоточиями: 1 … 4 5 6 … 20
function pageItems(page: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | '...')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) items.push('...');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push('...');
  items.push(total);
  return items;
}

const Pagination = ({ page, totalPages, onChange, className = '' }: PaginationProps) => {
  if (totalPages <= 1) return null;

  // стиль TL: без скруглений, розовая активная страница
  const btn = 'min-w-10 h-10 px-3 tl-head text-[10px] font-bold border transition-colors cursor-pointer flex items-center justify-center';
  const idle = 'bg-transparent border-[var(--line)] text-[var(--muted)] hover:text-white hover:border-[var(--line-2)]';

  return (
    <div className={`flex items-center justify-center gap-2 mt-10 flex-wrap ${className}`}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Предыдущая страница"
        className={`${btn} ${idle} disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <ChevronLeft size={16} />
      </button>

      {pageItems(page, totalPages).map((it, i) =>
        it === '...' ? (
          <span key={`e${i}`} className="px-2 text-[var(--muted-2)] text-[11px]">…</span>
        ) : (
          <button
            type="button"
            key={it}
            onClick={() => onChange(it)}
            aria-current={it === page ? 'page' : undefined}
            className={`${btn} ${
              it === page
                ? 'bg-accent/15 border-[var(--pink)] text-accent shadow-[inset_0_-2px_0_var(--pink)]'
                : idle
            }`}
          >
            {it}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Следующая страница"
        className={`${btn} ${idle} disabled:opacity-30 disabled:cursor-not-allowed`}
      >
        <ChevronRight size={16} />
      </button>

      <span className="w-full text-center tl-head text-[10px] text-[var(--muted-2)] uppercase tracking-[0.2em] mt-3">
        Страница {page} из {totalPages}
      </span>
    </div>
  );
};

export default Pagination;
