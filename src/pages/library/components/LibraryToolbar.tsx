export type LibraryTab = 'all' | 'installed' | 'favorites' | 'collections';

interface Props {
  count: number;
  filter: LibraryTab;
  onFilterChange: (filter: LibraryTab) => void;
  search: string;
  onSearchChange: (value: string) => void;
  pageSize: number;
  onChangePageSize: (size: number) => void;
  onOpenDownloads: () => void;
}

const LibraryToolbar = ({
  count,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  pageSize,
  onChangePageSize,
  onOpenDownloads,
}: Props) => (
  <>
    <div className="tl-sec-head">
      <span className="bar" />
      <h2>БИБЛИОТЕКА</h2>
      <span className="count">// {count} игр</span>
      <span className="line" />
      <span className="tag">OWNED</span>
    </div>

    <div className="tl-toolbar">
      <div className="tl-tabs">
        <button className={`tl-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => onFilterChange('all')}>
          Все
        </button>
        <button className={`tl-tab ${filter === 'installed' ? 'active' : ''}`} onClick={() => onFilterChange('installed')}>
          Установленные
        </button>
        <button className={`tl-tab ${filter === 'favorites' ? 'active' : ''}`} onClick={() => onFilterChange('favorites')}>
          Избранное
        </button>
        <button className={`tl-tab ${filter === 'collections' ? 'active' : ''}`} onClick={() => onFilterChange('collections')}>
          Коллекции
        </button>
        <button className="tl-tab" onClick={onOpenDownloads}>
          Загрузки
        </button>
      </div>

      {/* поиск и размер страницы относятся к списку игр — на вкладке коллекций не нужны */}
      {filter !== 'collections' && (
        <>
          <input
            type="text"
            className="tl-field"
            style={{ flex: 1, minWidth: 220, maxWidth: 380 }}
            data-search-hotkey="page"
            placeholder="Поиск по библиотеке…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />

          <select
            className="tl-select"
            value={pageSize}
            onChange={(e) => onChangePageSize(Number(e.target.value))}
            title="Количество игр на странице"
          >
            {[10, 20, 30, 50].map(n => (
              <option key={n} value={n}>По {n}</option>
            ))}
          </select>
        </>
      )}
    </div>
  </>
);

export default LibraryToolbar;
