import { IconX } from '@tabler/icons-react';
import type { Community, CommunityFormat } from '../../../api/community';
import Select from '../../../components/ui/Select';
import { COMMUNITY_FORMATS, formatOf } from '../formats';
import { CommunityCardItem } from './CommunityCard';

export type CommunitySort = 'new' | 'popular' | 'alpha';
export type FormatFilter = CommunityFormat | 'all' | 'mine';

/** Расширенные фильтры: текст, тематика, игра, вид и размер сообщества */
export type CommunityFilters = {
  query: string;
  themeId: number;
  gameId: number;
  visibility: '' | 'public' | 'private';
  size: '' | 'small' | 'medium' | 'large';
};
export const EMPTY_COMMUNITY_FILTERS: CommunityFilters = { query: '', themeId: 0, gameId: 0, visibility: '', size: '' };

const SIZES: Record<Exclude<CommunityFilters['size'], ''>, [number, number]> = {
  small: [0, 9], medium: [10, 49], large: [50, Infinity],
};

/** Подходит ли сообщество под расширенные фильтры */
export function matchCommunity(c: Community, f: CommunityFilters): boolean {
  const q = f.query.trim().toLowerCase();
  if (q && !`${c.name}\n${c.description}\n${c.game?.title ?? ''}\n${c.theme?.name ?? ''}`.toLowerCase().includes(q)) return false;
  if (f.themeId && c.theme_id !== f.themeId) return false;
  if (f.gameId && c.game_id !== f.gameId) return false;
  if (f.visibility && c.is_private !== (f.visibility === 'private')) return false;
  if (f.size) {
    const [min, max] = SIZES[f.size];
    if (c.members_count < min || c.members_count > max) return false;
  }
  return true;
}

type CommunityListProps = {
  communities: Community[];
  /** все сообщества (для счётчиков форматов) */
  all: Community[];
  total: number;
  loading: boolean;
  userId?: number;
  /** Модератор может удалить любое сообщество */
  isModerator?: boolean;
  /** Крупная карточка над сеткой (первая страница без фильтров) */
  featured: Community | null;
  filter: FormatFilter;
  onFilter: (f: FormatFilter) => void;
  filters: CommunityFilters;
  onFilters: (patch: Partial<CommunityFilters>) => void;
  sort: CommunitySort;
  onSort: (s: CommunitySort) => void;
  onDelete: (id: number) => void;
  onInvite: (community: Community) => void;
  onOpen: (community: Community) => void;
  pageSize: number;
  onChangePageSize: (size: number) => void;
};

const PAGE_SIZES = [12, 24, 48];
const SORTS: { value: CommunitySort; label: string }[] = [
  { value: 'new', label: 'Сначала новые' },
  { value: 'popular', label: 'Популярные' },
  { value: 'alpha', label: 'По алфавиту' },
];
const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
const SELECT_BTN = 'rounded-none! bg-[#08050f]! border-[color:var(--line)]! px-3.5 py-2.5 text-[10px]';
const SELECT_PANEL = 'rounded-none! shadow-none! backdrop-blur-none! bg-[#0f0a17]! border-[color:var(--line)]!';

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`tl-chip inline-flex items-center gap-1.5 ${on ? 'tl-tagpick on' : 'text-[var(--muted)] hover:text-white'}`}>
      {children}
    </button>
  );
}

/** Раздел «Сообщества»: фильтр по формату, сортировка, «сообщество дня» и сетка карточек. */
export default function CommunityList(props: CommunityListProps) {
  const { communities, all, total, loading, userId, isModerator = false, featured, filter, filters, sort, pageSize } = props;

  // варианты для выпадающих списков — из самих сообществ
  const themeOptions = Array.from(new Map(all.filter((c) => c.theme).map((c) => [c.theme_id, c.theme!.name])).entries())
    .sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  const gameOptions = Array.from(new Map(all.filter((c) => c.game).map((c) => [c.game!.ID, c.game!.title])).entries())
    .sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  const advActive = !!(filters.query || filters.themeId || filters.gameId || filters.visibility || filters.size);

  const count = (f: FormatFilter) =>
    f === 'all' ? all.length
      : f === 'mine' ? all.filter((c) => c.creator_id === userId).length
        : all.filter((c) => formatOf(c).id === f).length;

  const card = (c: Community, isFeatured = false) => {
    const owner = userId === c.creator_id;
    return (
      <CommunityCardItem
        key={c.ID}
        community={c}
        featured={isFeatured}
        isOwner={owner}
        canDelete={owner || isModerator}
        onDelete={() => props.onDelete(c.ID)}
        onInvite={() => props.onInvite(c)}
        onOpen={() => props.onOpen(c)}
      />
    );
  };

  let body;
  if (loading) {
    body = <div className={GRID}>{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="tl-panel h-72 animate-pulse" />)}</div>;
  } else if (communities.length === 0 && !featured) {
    body = (
      <div className="tl-panel p-14 text-center">
        <p className="tl-head tl-muted text-[11px] font-bold uppercase tracking-[.2em]">
          {filter === 'all' ? 'Пока нет ни одного сообщества' : 'Здесь пока пусто'}
        </p>
        <p className="tl-term mt-2 text-[15px] text-[var(--muted-2)]">Создай своё — по игре, для общения или по увлечению</p>
      </div>
    );
  } else {
    body = (
      <div className="space-y-5">
        {featured && card(featured, true)}
        {communities.length > 0 && <div className={GRID}>{communities.map((c) => card(c))}</div>}
      </div>
    );
  }

  return (
    <section>
      <div className="tl-sec-head">
        <span className="bar" />
        <h2>Сообщества</h2>
        <span className="count">// {total}</span>
        <span className="line" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <FilterChip on={filter === 'all'} onClick={() => props.onFilter('all')}>Все <span className="opacity-60">{count('all')}</span></FilterChip>
        {userId ? (
          <FilterChip on={filter === 'mine'} onClick={() => props.onFilter('mine')}>Мои <span className="opacity-60">{count('mine')}</span></FilterChip>
        ) : null}
        {COMMUNITY_FORMATS.map(({ id, label, Icon }) => (
          <FilterChip key={id} on={filter === id} onClick={() => props.onFilter(id)}>
            <Icon size={13} /> {label} <span className="opacity-60">{count(id)}</span>
          </FilterChip>
        ))}
        <div className="ml-auto flex gap-2">
          <Select
            value={sort}
            onChange={(v) => props.onSort(v as CommunitySort)}
            buttonClassName={SELECT_BTN}
            panelClassName={SELECT_PANEL}
            options={SORTS}
          />
          <Select
            value={pageSize}
            onChange={(v) => props.onChangePageSize(Number(v))}
            buttonClassName={SELECT_BTN}
            panelClassName={SELECT_PANEL}
            options={PAGE_SIZES.map((n) => ({ value: n, label: `По ${n}` }))}
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {themeOptions.length > 0 && (
          <Select
            value={filters.themeId}
            onChange={(v) => props.onFilters({ themeId: Number(v) })}
            buttonClassName={SELECT_BTN}
            panelClassName={SELECT_PANEL}
            options={[{ value: 0, label: 'Любая тематика' }, ...themeOptions.map(([value, label]) => ({ value, label }))]}
          />
        )}
        {gameOptions.length > 0 && (
          <Select
            value={filters.gameId}
            onChange={(v) => props.onFilters({ gameId: Number(v) })}
            buttonClassName={SELECT_BTN}
            panelClassName={SELECT_PANEL}
            options={[{ value: 0, label: 'Любая игра' }, ...gameOptions.map(([value, label]) => ({ value, label }))]}
          />
        )}
        <Select
          value={filters.visibility}
          onChange={(v) => props.onFilters({ visibility: v })}
          buttonClassName={SELECT_BTN}
          panelClassName={SELECT_PANEL}
          options={[{ value: '', label: 'Любой вид' }, { value: 'public', label: 'Публичные' }, { value: 'private', label: 'Приватные' }]}
        />
        <Select
          value={filters.size}
          onChange={(v) => props.onFilters({ size: v })}
          buttonClassName={SELECT_BTN}
          panelClassName={SELECT_PANEL}
          options={[{ value: '', label: 'Любой размер' }, { value: 'small', label: 'До 10 участников' }, { value: 'medium', label: '10–49 участников' }, { value: 'large', label: '50+ участников' }]}
        />
        {advActive && (
          <button type="button" onClick={() => props.onFilters(EMPTY_COMMUNITY_FILTERS)} className="tl-head inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-accent hover:text-white">
            <IconX size={11} /> Сбросить
          </button>
        )}
      </div>

      {body}
    </section>
  );
}
