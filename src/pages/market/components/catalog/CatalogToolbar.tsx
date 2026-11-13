import { Search, LayoutGrid, List, X } from 'lucide-react';
import type { SortKey } from '../../types';
import { SORT_OPTIONS } from '../../constants';

interface CatalogToolbarProps {
  searchQuery: string;
  onChangeSearch: (value: string) => void;
  sortBy: SortKey;
  onChangeSort: (value: SortKey) => void;
  selectedRating: string;
  onClearRating: () => void;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  selectedLang: string;
  onClearLang: () => void;
  onClearAll: () => void;
  pageSize: number;
  onChangePageSize: (size: number) => void;
  view: 'grid' | 'list';
  onChangeView: (view: 'grid' | 'list') => void;
}

const viewBtn = (active: boolean) =>
  `w-10 h-[42px] flex items-center justify-center transition-colors cursor-pointer ${
    active ? 'bg-accent/15 text-accent shadow-[inset_0_-2px_0_var(--pink)]' : 'text-[var(--muted)] hover:text-white hover:bg-accent/[0.07]'
  }`;

const Chip = ({ label, onRemove, tone = 'age' }: { label: string; onRemove: () => void; tone?: 'age' | 'common' }) => (
  <span className={`tl-chip ${tone} flex items-center gap-1`}>
    {label}
    <button type="button" onClick={onRemove} aria-label={`Убрать фильтр ${label}`} className="hover:text-white leading-none">&times;</button>
  </span>
);

const CatalogToolbar = ({
  searchQuery,
  onChangeSearch,
  sortBy,
  onChangeSort,
  selectedRating,
  onClearRating,
  selectedTags,
  onToggleTag,
  selectedLang,
  onClearLang,
  onClearAll,
  pageSize,
  onChangePageSize,
  view,
  onChangeView,
}: CatalogToolbarProps) => {
  const chipCount = (searchQuery ? 1 : 0) + (selectedRating ? 1 : 0) + selectedTags.length + (selectedLang ? 1 : 0);

  return (
    <>
      <div className="tl-toolbar">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input
            type="search"
            data-search-hotkey="page"
            placeholder="Поиск по названию, разработчику, издателю…"
            className="tl-field with-icon pr-9"
            value={searchQuery}
            onChange={(e) => onChangeSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onChangeSearch(''); }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onChangeSearch('')}
              aria-label="Очистить поиск"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select className="tl-select" value={sortBy} onChange={(e) => onChangeSort(e.target.value as SortKey)} aria-label="Сортировка">
          {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>

        <select className="tl-select" value={pageSize} onChange={(e) => onChangePageSize(Number(e.target.value))} aria-label="Игр на странице">
          {[12, 24, 36, 48].map((n) => <option key={n} value={n}>По {n}</option>)}
        </select>

        <div className="flex items-center border border-[var(--line)]">
          <button type="button" onClick={() => onChangeView('grid')} title="Сетка" aria-pressed={view === 'grid'} className={viewBtn(view === 'grid')}>
            <LayoutGrid size={16} />
          </button>
          <button type="button" onClick={() => onChangeView('list')} title="Список" aria-pressed={view === 'list'} className={`${viewBtn(view === 'list')} border-l border-[var(--line)]`}>
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Активные фильтры */}
      {chipCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {searchQuery && <Chip label={`«${searchQuery}»`} onRemove={() => onChangeSearch('')} tone="common" />}
          {selectedRating && <Chip label={selectedRating} onRemove={onClearRating} />}
          {selectedTags.map((tag) => <Chip key={tag} label={tag} onRemove={() => onToggleTag(tag)} />)}
          {selectedLang && <Chip label={selectedLang} onRemove={onClearLang} tone="common" />}
          {chipCount > 1 && (
            <button type="button" onClick={onClearAll} className="tl-head text-[10px] text-accent hover:text-white font-bold uppercase tracking-widest ml-1">
              Сбросить всё
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default CatalogToolbar;
