import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { AGE_RATINGS } from '../../constants';

const TagPill = ({ tag, selected, onToggle }: { tag: string; selected: boolean; onToggle: (t: string) => void }) => (
  <button
    type="button"
    onClick={() => onToggle(tag)}
    aria-pressed={selected}
    className={`tl-chip tl-tagpick ${selected ? 'on' : ''}`}
  >
    {tag}
  </button>
);

interface CatalogFiltersProps {
  hasFilters: boolean;
  clearFilters: () => void;
  selectedRating: string;
  onChangeRating: (rating: string) => void;
  /** Теги каталога с разделом (regular | adult) — загружаются вместе с каталогом */
  tags: { name: string; category: string }[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  allLanguages: string[];
  selectedLang: string;
  onChangeLang: (lang: string) => void;
  hideAdult: boolean;
}

const LABEL = 'tl-head text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-3 block';
const COLLAPSE_AFTER = 7; // больше тегов — сворачиваем в выпадающий список с поиском

const CatalogFilters = ({
  hasFilters,
  clearFilters,
  selectedRating,
  onChangeRating,
  tags,
  selectedTags,
  onToggleTag,
  allLanguages,
  selectedLang,
  onChangeLang,
  hideAdult,
}: CatalogFiltersProps) => {
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const tagsRef = useRef<HTMLDivElement>(null);

  // закрытие выпадающего списка: клик мимо или Esc
  useEffect(() => {
    if (!tagsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (tagsRef.current && !tagsRef.current.contains(e.target as Node)) setTagsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTagsOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [tagsOpen]);

  // взрослые теги не показываем, если в настройках включено «Скрывать 18+»
  const visibleTags = useMemo(() => tags.filter((t) => !(hideAdult && t.category === 'adult')), [tags, hideAdult]);
  const collapseTags = visibleTags.length > COLLAPSE_AFTER;

  const sectionTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const list = q ? visibleTags.filter((t) => t.name.toLowerCase().includes(q)) : visibleTags;
    return {
      regular: list.filter((t) => t.category !== 'adult').map((t) => t.name),
      adult: list.filter((t) => t.category === 'adult').map((t) => t.name),
    };
  }, [visibleTags, tagSearch]);

  const pills = (names: string[]) => (
    <div className="flex flex-wrap gap-1.5">
      {names.map((tag) => <TagPill key={tag} tag={tag} selected={selectedTags.includes(tag)} onToggle={onToggleTag} />)}
    </div>
  );

  return (
    <aside className="w-full lg:w-72 shrink-0">
      <div className="tl-panel p-6 lg:sticky lg:top-6 space-y-6">
        <div className="flex items-center justify-between">
          <span className="tl-head text-[10px] font-bold uppercase tracking-[0.3em] text-white">Фильтры</span>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="tl-head text-[10px] text-accent hover:text-white font-bold uppercase tracking-widest flex items-center gap-1">
              <X size={10} /> Очистить
            </button>
          )}
        </div>

        {/* Возрастной рейтинг */}
        <div>
          <span className={LABEL}>Возрастной рейтинг</span>
          <div className="flex flex-wrap gap-1.5">
            {AGE_RATINGS.map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => onChangeRating(selectedRating === r ? '' : r)}
                aria-pressed={selectedRating === r}
                className={`tl-chip tl-tagpick ${selectedRating === r ? 'on' : ''}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Теги */}
        {visibleTags.length > 0 && (
          <div>
            <span className={LABEL}>Теги</span>
            {collapseTags ? (
              <div className="relative" ref={tagsRef}>
                <button
                  type="button"
                  onClick={() => setTagsOpen(!tagsOpen)}
                  aria-expanded={tagsOpen}
                  className="tl-field flex items-center justify-between cursor-pointer"
                >
                  <span className={selectedTags.length > 0 ? 'text-[var(--text)]' : 'text-[var(--muted-2)]'}>
                    {selectedTags.length > 0 ? `Выбрано: ${selectedTags.length}` : 'Выбрать теги…'}
                  </span>
                  <ChevronDown size={14} className={`text-[var(--muted)] transition-transform ${tagsOpen ? 'rotate-180' : ''}`} />
                </button>

                {tagsOpen && (
                  <div className="mt-1 w-full bg-[var(--panel2)] border border-[var(--line-2)] shadow-[0_0_24px_rgb(var(--accent-rgb)/.25)] flex flex-col overflow-hidden z-20 relative">
                    <div className="p-2 border-b border-[var(--line)] shrink-0">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={14} />
                        <input
                          type="text"
                          placeholder="Поиск тегов…"
                          autoFocus
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          className="tl-field with-icon dense text-xs"
                        />
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-72 custom-scrollbar px-2.5 py-2.5 flex flex-col gap-2">
                      {sectionTags.regular.length > 0 && (
                        <div>
                          <div className="tl-head text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--muted)] mb-1.5">Основные</div>
                          {pills(sectionTags.regular)}
                        </div>
                      )}
                      {sectionTags.adult.length > 0 && (
                        <div>
                          <div className="tl-head text-[10px] font-bold uppercase tracking-[0.25em] text-accent mb-1.5 flex items-center gap-1.5">
                            Для взрослых <span className="tl-chip nsfw">18+</span>
                          </div>
                          {pills(sectionTags.adult)}
                        </div>
                      )}
                      {sectionTags.regular.length === 0 && sectionTags.adult.length === 0 && (
                        <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">Ничего не найдено</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sectionTags.regular.length > 0 && pills(sectionTags.regular)}
                {sectionTags.adult.length > 0 && pills(sectionTags.adult)}
              </div>
            )}
          </div>
        )}

        {/* Язык */}
        {allLanguages.length > 0 && (
          <div>
            <span className={LABEL}>Язык</span>
            <select className="tl-select w-full" value={selectedLang} onChange={(e) => onChangeLang(e.target.value)}>
              <option value="">Все языки</option>
              {allLanguages.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        )}
      </div>
    </aside>
  );
};

export default CatalogFilters;
