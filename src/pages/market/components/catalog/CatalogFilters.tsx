import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { AGE_RATINGS } from '../../constants';
import { KIND_OPTIONS, RU_OPTIONS, SOURCE_LABEL, YEAR_OPTIONS, type ExtraFilters } from './extraFilters';
import Select, { SELECT_BUTTON, SELECT_BUTTON_IDLE, SELECT_BUTTON_OPEN, SELECT_PANEL } from '../../../../components/ui/Select';

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
  /** Доп. фильтры (год, русский язык, разработчик, источник…) — только в каталоге магазина */
  extra?: ExtraFilters;
  onChangeExtra?: (patch: Partial<ExtraFilters>) => void;
  /** разработчики и издатели каталога */
  developers?: string[];
  /** какие виды источников есть в каталоге */
  sourceKinds?: string[];
}

/** Ряд переключателей «выбран один или ни одного» */
function ChipGroup<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T | ''; onChange: (v: T | '') => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(value === o.id ? '' : o.id)}
          className={`tl-chip tl-tagpick ${value === o.id ? 'on' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
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
  extra,
  onChangeExtra = () => {},
  developers = [],
  sourceKinds = [],
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

        {/* Обычные / NSFW (NSFW скрыт настройкой «Скрывать 18+» — тогда и выбирать нечего) */}
        {extra && !hideAdult && <div>
          <span className={LABEL}>Тип игр</span>
          <ChipGroup options={KIND_OPTIONS} value={extra.kind} onChange={(kind) => onChangeExtra({ kind })} />
        </div>}

        {/* Год выхода */}
        {extra && <div>
          <span className={LABEL}>Год выхода</span>
          <ChipGroup options={YEAR_OPTIONS} value={extra.year} onChange={(year) => onChangeExtra({ year })} />
        </div>}

        {/* Теги */}
        {visibleTags.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className={`${LABEL} mb-0!`}>Теги</span>
              {extra && selectedTags.length > 1 && (
                <div className="flex border border-[var(--line)] text-[10px] font-bold uppercase" role="group" aria-label="Режим тегов">
                  {(['all', 'any'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={extra.tagMode === m}
                      onClick={() => onChangeExtra({ tagMode: m })}
                      title={m === 'all' ? 'Игра должна иметь все выбранные теги' : 'Достаточно любого из выбранных тегов'}
                      className={`px-2 py-1 ${extra.tagMode === m ? 'bg-accent/15 text-accent' : 'text-[var(--muted)] hover:text-white'}`}
                    >
                      {m === 'all' ? 'Все' : 'Любой'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {collapseTags ? (
              <div className="relative" ref={tagsRef}>
                <button
                  type="button"
                  onClick={() => setTagsOpen(!tagsOpen)}
                  aria-expanded={tagsOpen}
                  className={`${SELECT_BUTTON} ${tagsOpen ? SELECT_BUTTON_OPEN : SELECT_BUTTON_IDLE}`}
                >
                  <span className="truncate">
                    {selectedTags.length > 0 ? `Выбрано: ${selectedTags.length}` : 'Выбрать теги…'}
                  </span>
                  <ChevronDown size={14} className={`shrink-0 text-[var(--muted)] transition-transform ${tagsOpen ? 'rotate-180 text-accent' : ''}`} />
                </button>

                {tagsOpen && (
                  <div className={`mt-2 w-full ${SELECT_PANEL} flex flex-col overflow-hidden z-20 relative`}>
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
            <Select
              value={selectedLang}
              options={[{ value: '', label: 'Все языки' }, ...allLanguages.map((l) => ({ value: l, label: l }))]}
              onChange={(v) => onChangeLang(String(v))}
              title="Язык"
            />
          </div>
        )}

{extra && (
          <>
        {/* Русский язык */}
        <div>
          <span className={LABEL}>Русский язык</span>
          <ChipGroup options={RU_OPTIONS} value={extra.ru} onChange={(ru) => onChangeExtra({ ru })} />
        </div>

        {/* Разработчик / издатель */}
        {developers.length > 0 && (
          <div>
            <span className={LABEL}>Разработчик или издатель</span>
            <input
              list="lh-catalog-developers"
              className="tl-field"
              placeholder="Начните вводить…"
              value={extra.developer}
              onChange={(e) => onChangeExtra({ developer: e.target.value })}
            />
            <datalist id="lh-catalog-developers">
              {developers.map((d) => <option key={d} value={d} />)}
            </datalist>
          </div>
        )}

        {/* Источник скачивания */}
        {sourceKinds.length > 1 && (
          <div>
            <span className={LABEL}>Где скачать</span>
            <div className="flex flex-wrap gap-1.5">
              {sourceKinds.map((k) => {
                const on = extra.sources.includes(k);
                return (
                  <button
                    type="button"
                    key={k}
                    aria-pressed={on}
                    onClick={() => onChangeExtra({ sources: on ? extra.sources.filter((x) => x !== k) : [...extra.sources, k] })}
                    className={`tl-chip tl-tagpick ${on ? 'on' : ''}`}
                  >
                    {SOURCE_LABEL[k] || k}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Библиотека */}
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={extra.hideOwned}
            onChange={(e) => onChangeExtra({ hideOwned: e.target.checked })}
            className="h-4 w-4 accent-[color:var(--color-accent)]"
          />
          <span className="tl-term text-[15px] text-[var(--muted)]">Скрыть игры из моей библиотеки</span>
        </label>
          </>
        )}
      </div>
    </aside>
  );
};

export default CatalogFilters;
