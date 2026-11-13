import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api';
import { useSettings } from '../../context/SettingsContext';
import { useConnectivity } from '../../context/ConnectivityContext';
import { useAuth } from '../../context/AuthContext';
import type { LibraryEntry, InstalledGame } from './types';
import LibraryToolbar, { type LibraryTab } from './components/LibraryToolbar';
import LibraryGameCard from './components/LibraryGameCard';
import LibraryOffline from './components/LibraryOffline';
import CollectionsBlock from '../../components/collections/CollectionsBlock';
import Pagination from '../../components/ui/Pagination';
import { notifyLibraryChanged } from '../../utils/libraryEvents';
import { formatPlaytime } from '../../utils/playtime';
import { Loading } from '../../components/Loading';

const GRID_BY_SIZE: Record<string, string> = {
  auto: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4',
  small: 'grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3',
  medium: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4',
  large: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6',
};

const norm = (s?: string) => (s || '').toLowerCase().trim();

export default function LibraryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getLibrary } = useSettings();
  const { offline, reconnectKey } = useConnectivity();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [installed, setInstalled] = useState<InstalledGame[]>([]);
  // Реальные данные диска (statfs из main-процесса), где лежат игры
  const [disk, setDisk] = useState<{ root: string; total: number; free: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Вкладка — в адресе (/library?tab=collections): на неё ведёт пункт «Коллекции» в меню,
  // в том числе когда библиотека уже открыта
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const filter: LibraryTab = tabParam === 'installed' || tabParam === 'favorites' || tabParam === 'collections' ? tabParam : 'all';
  const setFilter = (next: LibraryTab) => setSearchParams(next === 'all' ? {} : { tab: next }, { replace: true });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchLibrary = async () => {
    if (offline) { setLoading(false); return; }
    try {
      setLoading(true);
      // Постраничная загрузка: первый блок показываем сразу,
      // остальное догружаем фоном — полный список с сервера больше не ждём.
      const PAGE = 100;
      let offset = 0;
      let total = Number.MAX_SAFE_INTEGER;
      const all: any[] = [];
      while (offset < total) {
        const res = await api.get('/library/', { params: { limit: PAGE, offset } });
        const chunk: any[] = Array.isArray(res.data) ? res.data : [];
        total = Number(res.headers?.['x-total-count']) || chunk.length;
        all.push(...chunk);
        setEntries([...all]);
        if (offset === 0) setLoading(false);
        offset += PAGE;
        if (chunk.length < PAGE) break;
      }
    } catch (err) {
      console.error("Failed to fetch library:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLibrary(); }, [offline, reconnectKey]);

  // Update tray with library games
  useEffect(() => {
    if (entries.length > 0) {
      const electron = (window as any).electron;
      const games = entries.map(e => ({
        id: e.game_id,
        title: e.game?.title || 'Неизвестно',
      }));
      electron?.updateTrayGames?.(games);
    }
  }, [entries]);

  // Данные об установленных играх — для вкладки/сводки/памяти
  useEffect(() => {
    const electron = (window as any).electron;
    electron?.installedGames?.()
      .then((list: InstalledGame[]) => setInstalled(list || []))
      .catch(() => {});
  }, [entries]);

  // Занято/свободно — берём у ОС (быстрый statfs, без обхода файлов)
  useEffect(() => {
    const electron = (window as any).electron;
    electron?.diskSpace?.()
      .then((res: any) => {
        const drives: { root: string; total: number; free: number }[] = res?.drives || [];
        const gamesRoot = String(res?.gamesDir || '').slice(0, 3).toLowerCase();
        const drive = drives.find((d) => String(d.root).toLowerCase() === gamesRoot)
          || drives.find((d) => String(d.root).toLowerCase().startsWith('c:'))
          || drives[0];
        if (drive) {
          setDisk({ root: String(drive.root), total: Number(drive.total) || 0, free: Number(drive.free) || 0 });
        }
      })
      .catch(() => setDisk(null));
  }, [entries]);

  const removeFromLibrary = async (gameId: number) => {
    try {
      await api.post('/library/remove', { game_id: gameId });
      setEntries(prev => prev.filter(e => e.game_id !== gameId));
      notifyLibraryChanged();
    } catch (err) {
      console.error("Failed to remove:", err);
    }
  };

  const toggleFavorite = async (gameId: number) => {
    try {
      const res = await api.post('/library/favorite', { game_id: gameId });
      setEntries(prev => prev.map(e =>
        e.game_id === gameId ? { ...e, favorite: res.data.favorite } : e
      ));
      notifyLibraryChanged();
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const matchesInstalled = (title?: string) => {
    const t = norm(title);
    if (!t) return false;
    return installed.some(g => {
      const n = norm(g.name);
      return n === t || n.includes(t) || t.includes(n);
    });
  };

  const filtered = entries.filter(e => {
    if (filter === 'favorites' && !e.favorite) return false;
    if (filter === 'installed' && !matchesInstalled(e.game?.title)) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return e.game?.title?.toLowerCase().includes(q);
    }
    return true;
  });

  // Сброс на первую страницу при смене фильтра/поиска/размера страницы
  useEffect(() => { setPage(1); }, [filter, search, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize]
  );

  if (offline) {
    return <LibraryOffline />;
  }

  if (loading) {
    return <Loading />;
  }

  const favoritesCount = entries.filter(e => e.favorite).length;
  const installedCount = entries.filter(e => matchesInstalled(e.game?.title)).length;
  // Наиграно: время на аккаунте (сервер) или локальный учёт, что больше
  const serverPlaytimeMs = entries.reduce((sum, e) => sum + (e.playtime_ms || 0), 0);
  const localPlaytimeMs = installed.reduce((sum, g) => sum + (g.playtimeMs || 0), 0);
  const playtimeMs = Math.max(serverPlaytimeMs, localPlaytimeMs);
  // Реальная память диска
  const GB = 1024 * 1024 * 1024;
  const usedGb = disk ? Math.max(0, Math.round((disk.total - disk.free) / GB)) : null;
  const freeGb = disk ? Math.round(disk.free / GB) : null;
  const usedPct = disk && disk.total > 0
    ? Math.min(100, Math.round(((disk.total - disk.free) / disk.total) * 100))
    : 0;
  const fmtGb = (v: number | null) => (v == null ? '—' : `${v} ГБ`);
  const lastGame = entries[0];

  return (
    <div className="p-8 animate-in fade-in duration-500">
      <section className="tl-sec" style={{ marginTop: 0 }}>
        <LibraryToolbar
          count={entries.length}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          pageSize={pageSize}
          onChangePageSize={setPageSize}
          onOpenDownloads={() => navigate('/downloads')}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-[22px] items-start">
          <div className="min-w-0">
            {filter === 'collections' ? (
              // Коллекции игр: создание, редактирование, удаление, состав
              user ? (
                <CollectionsBlock
                  username={user.username}
                  isOwnProfile
                  onGameClick={(gameId) => navigate(`/library/games/${gameId}`)}
                />
              ) : null
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="tl-term tl-muted text-sm uppercase tracking-[0.2em]">
                  {entries.length === 0 ? 'Ваша библиотека пуста' : 'Нет игр по вашему запросу'}
                </p>
                {entries.length === 0 && (
                  <button onClick={() => navigate('/store')} className="tl-btn mt-4">
                    Перейти в магазин
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className={GRID_BY_SIZE[getLibrary().item_size] || GRID_BY_SIZE.auto}>
                  {paged.map(entry => (
                    <LibraryGameCard
                      key={entry.id}
                      entry={entry}
                      onOpen={() => navigate(`/library/games/${entry.game_id}`)}
                      onToggleFavorite={() => toggleFavorite(entry.game_id)}
                      onRemove={() => removeFromLibrary(entry.game_id)}
                    />
                  ))}
                </div>
                <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
              </>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="tl-panel p-5">
              <h3 className="tl-pixel text-[10px] text-white mb-3">СВОДКА</h3>
              <div className="tl-srow"><span className="k">Всего игр</span><span className="v">{entries.length}</span></div>
              <div className="tl-srow"><span className="k">Установлено</span><span className="v">{installedCount}</span></div>
              <div className="tl-srow"><span className="k">Избранное</span><span className="v">{favoritesCount}</span></div>
              <div className="tl-srow"><span className="k">Наиграно</span><span className="v">{formatPlaytime(playtimeMs)}</span></div>
            </div>

            <div className="tl-panel p-5">
              <h3 className="tl-pixel text-[10px] text-white mb-3">
                ПАМЯТЬ{disk?.root ? <span className="tl-term text-[15px] text-[var(--pink)] [text-shadow:none]"> · {disk.root.replace(/\\$/, '').toUpperCase()}</span> : null}
              </h3>
              <div className="tl-srow"><span className="k">Занято</span><span className="v">{fmtGb(usedGb)}</span></div>
              <div className="tl-srow"><span className="k">Свободно</span><span className="v">{fmtGb(freeGb)}</span></div>
              <div className="tl-prog mt-3">
                <div className="t"><div className="f" style={{ width: `${usedPct}%` }} /></div>
              </div>
            </div>

            <div className="tl-panel p-5 flex flex-col gap-2.5">
              <h3 className="tl-pixel text-[10px] text-white mb-1">БЫСТРЫЙ СТАРТ</h3>
              <button
                className="tl-btn block"
                disabled={!lastGame}
                onClick={() => lastGame && navigate(`/library/games/${lastGame.game_id}`)}
              >
                Продолжить{lastGame ? `: ${lastGame.game?.title || 'игру'}` : ''}
              </button>
              <button className="tl-btn ghost block" onClick={() => navigate('/downloads')}>
                Показать загрузки
              </button>
            </div>
          </aside>
        </div>
      </section>

      <footer className="tl-footer">
        <div className="status">SYSTEM STATUS: <b>STABLE</b><br />ALL GAMES SYNCED</div>
        <div className="left">
          <span className="keep">KEEP GOING.EXE</span>
          <div className="tl-barcode">
            {Array.from({ length: 20 }).map((_, i) => <i key={i} />)}
          </div>
        </div>
      </footer>
    </div>
  );
}
