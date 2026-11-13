import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../../api';
import { useSettings } from '../../context/SettingsContext';
import { useAdultConsent } from '../../components/AdultGate/AdultGate';
import type { SortKey } from './types';
import {
  containerVariantsFor, AGE_ORDER, CONTENT_TAG_MAP, releaseTime, titleCollator,
  STORE_VIEW_KEY, STORE_FROM_GAME_KEY, readSavedView, markLeavingToGame,
} from './constants';
import CatalogFilters from './components/catalog/CatalogFilters';
import CatalogToolbar from './components/catalog/CatalogToolbar';
import CatalogPagination from '../../components/ui/Pagination';
import GameCard from './components/catalog/GameCard';
import GameHoverPreview from '../../components/GameHoverPreview';
import StoreHero from './components/catalog/StoreHero';

type TagInfo = { name: string; category: string };

export const GameCatalog: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getStoreFilters, getAgeRating, getHideAdult } = useSettings();

  // вид восстанавливаем только при возврате из игры (читаем один раз при маунте)
  const [initial] = useState(() => {
    const saved = readSavedView();
    return sessionStorage.getItem(STORE_FROM_GAME_KEY) === '1' && saved ? saved : null;
  });

  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false); // фоновая догрузка остальных страниц
  const [loadError, setLoadError] = useState(false);
  // часть страниц так и не загрузилась (сеть) — показываем предупреждение с повтором
  const [incomplete, setIncomplete] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Общее число игр в каталоге — из X-Total-Count первого ответа
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>(initial?.searchQuery ?? '');
  const [selectedRating, setSelectedRating] = useState<string>(initial?.selectedRating ?? '');
  const [selectedTags, setSelectedTags] = useState<string[]>(initial?.selectedTags ?? []);
  const [selectedLang, setSelectedLang] = useState<string>(initial?.selectedLang ?? '');
  const [sortBy, setSortBy] = useState<SortKey>(initial?.sortBy ?? 'added-new');

  const [page, setPage] = useState<number>(initial?.page ?? 1);
  // размеры страниц кратны 3 (три колонки сетки); старое сохранённое 20 → 24
  const [pageSize, setPageSize] = useState<number>([12, 24, 36, 48].includes(initial?.pageSize) ? initial.pageSize : 24);
  const [view, setView] = useState<'grid' | 'list'>(initial?.view === 'list' ? 'list' : 'grid');
  const mainRef = useRef<HTMLDivElement>(null);

  const [tags, setTags] = useState<TagInfo[]>([]);
  const [allLanguages, setAllLanguages] = useState<string[]>([]);

  // Флаг «вышли из каталога в игру» потребляем один раз при маунте
  useEffect(() => {
    sessionStorage.removeItem(STORE_FROM_GAME_KEY);
  }, []);

  // Поиск/тег из верхней навигации магазина (/store?q=… или /store?tag=…):
  // применяем и убираем из адреса, чтобы «назад» не возвращал старый фильтр
  useEffect(() => {
    const q = searchParams.get('q');
    const tag = searchParams.get('tag');
    if (q === null && tag === null) return;
    // переход из шапки — новый поиск: прежние фильтры сбрасываем
    setSearchQuery(q ?? '');
    setSelectedTags(tag ? [tag] : []);
    setSelectedRating('');
    setSelectedLang('');
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Зеркало view-state в ref: cleanup эффекта видит state первого рендера
  const viewRef = useRef<Record<string, any>>({});
  viewRef.current = {
    page, searchQuery, selectedRating, selectedTags, selectedLang, sortBy, pageSize, view,
    savedAt: Date.now(),
  };
  useEffect(() => () => {
    try {
      sessionStorage.setItem(STORE_VIEW_KEY, JSON.stringify(viewRef.current));
    } catch { /* переполнение sessionStorage — не критично */ }
  }, []);

  useEffect(() => {
    // Отмена при уходе со страницы: рвём запросы и запрещаем записи в стейт
    const controller = new AbortController();
    const signal = controller.signal;
    let cancelled = false;

    const PAGE = 100;
    const CONCURRENCY = 3; // одновременных фоновых чанков
    const FLUSH_MS = 300;  // интервал батч-коммита

    const langs = new Set<string>();
    const collectLangs = (list: any[]) => {
      list.forEach((g: any) => g.languages?.forEach((l: any) => l?.name && langs.add(l.name)));
    };

    // Буфер фоновых чанков: в стейт кладём не чаще раза в FLUSH_MS
    let buffer: any[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
      if (cancelled || buffer.length === 0) return;
      const add = buffer;
      buffer = [];
      // дубликаты возможны, если каталог изменился между запросами страниц
      setGames((prev) => {
        const seen = new Set(prev.map((g) => g.ID));
        return [...prev, ...add.filter((g) => !seen.has(g.ID))];
      });
      setAllLanguages(Array.from(langs).sort((a, b) => titleCollator.compare(a, b)));
    };
    const scheduleFlush = () => {
      if (flushTimer === null) flushTimer = setTimeout(flush, FLUSH_MS);
    };

    // Страница каталога с повторами: на нестабильной сети запрос иногда обрывается,
    // и раньше такая страница (до 100 игр) молча пропадала из каталога
    const fetchPage = async (offset: number) => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await api.get('/games/', { params: { limit: PAGE, offset, sort: 'added-new' }, signal });
        } catch (err) {
          if (cancelled || signal.aborted || attempt >= 2) throw err;
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    };

    const load = async () => {
      setLoading(true);
      setLoadError(false);
      setIncomplete(false);
      try {
        const [firstRes, tagsRes] = await Promise.all([
          fetchPage(0),
          api.get('/tags/', { signal }).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const firstChunk: any[] = Array.isArray(firstRes.data) ? firstRes.data : [];
        const total = Number(firstRes.headers?.['x-total-count']) || firstChunk.length;
        setTotalCount(total);
        setGames(firstChunk);
        collectLangs(firstChunk);
        setAllLanguages(Array.from(langs).sort((a, b) => titleCollator.compare(a, b)));
        setTags(((tagsRes.data || []) as any[])
          .map((t) => ({ name: t.name as string, category: (t.category as string) || 'regular' }))
          .sort((a, b) => titleCollator.compare(a.name, b.name)));
        setLoading(false);

        // Фоновая догрузка остальных страниц параллельными чанками
        const offsets: number[] = [];
        for (let o = PAGE; o < total; o += PAGE) offsets.push(o);
        if (offsets.length === 0) return;
        setLoadingMore(true);

        let failed = false;
        const worker = async () => {
          while (!cancelled && offsets.length > 0) {
            const offset = offsets.shift() as number;
            try {
              const res = await fetchPage(offset);
              const chunk: any[] = Array.isArray(res.data) ? res.data : [];
              if (chunk.length === 0) return;
              collectLangs(chunk);
              buffer.push(...chunk);
              scheduleFlush();
            } catch {
              if (cancelled || signal.aborted) return;
              failed = true; // страница не загрузилась и после повторов — берём следующую
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, offsets.length) }, () => worker()));
        flush();
        if (failed && !cancelled) setIncomplete(true);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to load catalog:', err);
        setLoadError(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
      if (flushTimer) clearTimeout(flushTimer);
      buffer = [];
    };
  }, [reloadKey]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  // Любое изменение фильтров/сортировки/размера страницы — на первую страницу.
  // Первый прогон пропускаем, чтобы не затереть страницу, восстановленную после возврата из игры.
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return; }
    setPage(1);
  }, [searchQuery, selectedRating, selectedTags, selectedLang, sortBy, pageSize]);

  // При смене страницы прокручиваем к началу каталога (но не при открытии страницы)
  const isFirstPageRun = useRef(true);
  useEffect(() => {
    if (isFirstPageRun.current) { isFirstPageRun.current = false; return; }
    mainRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [page]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedRating('');
    setSelectedTags([]);
    setSelectedLang('');
  };

  const hasFilters = !!(searchQuery || selectedRating || selectedTags.length > 0 || selectedLang);

  const matchedGames = useMemo(() => {
    const contentFilters = getStoreFilters();
    const maxAge = AGE_ORDER[getAgeRating()] ?? 18;
    const hideAdult = getHideAdult();

    const blockedTags: string[] = [];
    for (const [category, enabled] of Object.entries(contentFilters)) {
      if (enabled && CONTENT_TAG_MAP[category]) blockedTags.push(...CONTENT_TAG_MAP[category]);
    }
    const q = searchQuery.trim().toLowerCase();

    const result = games.filter((game) => {
      // 0. Игры для взрослых (настройка магазина)
      if (hideAdult && game.is_adult) return false;

      // 1. Возрастной рейтинг из настроек магазина
      if ((AGE_ORDER[game.age_rating] ?? 0) > maxAge) return false;

      // 2. Фильтр контента из настроек — только по тегам. Название и описание не проверяем:
      //    слово «NSFW» в названии прятало отдельные игры 18+ (остальные, без него, были видны),
      //    а для 18+ уже есть своя пометка is_adult и подтверждение возраста.
      if (blockedTags.length > 0) {
        const gameTagNames: string[] = game.tags?.map((t: any) => String(t.name).toLowerCase()) || [];
        for (const blocked of blockedTags) {
          if (gameTagNames.some((t) => t.includes(blocked))) return false;
        }
      }

      // 3. Пользовательские фильтры
      if (q) {
        const hay = `${game.title || ''}\n${game.developer || ''}\n${game.publisher || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (selectedRating && game.age_rating !== selectedRating) return false;
      if (selectedTags.length > 0) {
        const gameTagNames = game.tags?.map((t: any) => t.name) || [];
        if (!selectedTags.every((tag) => gameTagNames.includes(tag))) return false;
      }
      if (selectedLang) {
        const gameLangNames = game.languages?.map((l: any) => l.name) || [];
        if (!gameLangNames.includes(selectedLang)) return false;
      }
      return true;
    });

    // игры без даты выхода — всегда в конце (раньше NaN ломал сортировку)
    const byDate = (a: any, b: any, dir: 1 | -1) => {
      const ta = releaseTime(a.release_date);
      const tb = releaseTime(b.release_date);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return (ta - tb) * dir;
    };
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title-asc': return titleCollator.compare(a.title || '', b.title || '');
        case 'title-desc': return titleCollator.compare(b.title || '', a.title || '');
        case 'date-new': return byDate(a, b, -1);
        case 'date-old': return byDate(a, b, 1);
        case 'added-new': return (b.ID || 0) - (a.ID || 0);
        case 'added-old': return (a.ID || 0) - (b.ID || 0);
        default: return 0;
      }
    });
    return result;
  }, [games, searchQuery, selectedRating, selectedTags, selectedLang, sortBy, getStoreFilters, getAgeRating, getHideAdult]);

  // Игры 18+ скрыты, пока возраст не подтверждён: окно на входе в каталог закрывало
  // магазин новым посетителям и поисковикам. Подтверждение — по кнопке в плашке.
  const { confirmed: adultConfirmed, request: requestAdult } = useAdultConsent();
  const filteredGames = useMemo(
    () => (adultConfirmed ? matchedGames : matchedGames.filter((g: any) => !g.is_adult)),
    [matchedGames, adultConfirmed],
  );
  const hiddenAdult = matchedGames.length - filteredGames.length;

  const totalPages = Math.max(1, Math.ceil(filteredGames.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedGames = useMemo(
    () => filteredGames.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredGames, currentPage, pageSize]
  );
  const gridVariants = useMemo(() => containerVariantsFor(pagedGames.length), [pagedGames.length]);

  if (loading) {
    return (
      // Скелетон вместо спиннера: сетка «проступает» на месте будущих карточек
      <div className="flex flex-col lg:flex-row gap-8" aria-busy="true" aria-label="Загружаем каталог…">
        <div className="hidden lg:flex flex-col gap-3 w-[260px] shrink-0">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="fx-skel h-8 border border-[var(--line)]" style={{ animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <div className="tl-sec-head">
            <span className="bar" />
            <span className="tl-head text-[10px] font-bold uppercase tracking-[0.3em] text-accent">Загружаем каталог…</span>
            <span className="line" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="border border-[var(--line)] bg-[var(--panel)] animate-in fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="fx-skel aspect-video" />
                <div className="p-3 flex flex-col gap-2">
                  <div className="fx-skel h-3 w-3/4" />
                  <div className="fx-skel h-3 w-1/2" />
                  <div className="fx-skel h-8 w-full mt-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError && games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <AlertTriangle size={36} className="text-red-400" />
        <p className="tl-term text-[16px] tl-muted">Не удалось загрузить каталог. Проверьте подключение к интернету.</p>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="tl-btn solid">
          <RefreshCw size={14} /> Повторить
        </button>
      </div>
    );
  }

  const openGame = (game: any) => {
    markLeavingToGame(); // при возврате из игры каталог восстановит страницу/фильтры
    navigate(`/games/${game.ID}`);
  };

  return (
    <>
    {/* Витрина — только на «чистом» каталоге: при поиске/фильтрах она мешает результатам */}
    {!hasFilters && currentPage === 1 && <StoreHero games={filteredGames} onOpen={openGame} />}
    <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-700">
      <CatalogFilters
        hasFilters={hasFilters}
        clearFilters={clearFilters}
        selectedRating={selectedRating}
        onChangeRating={setSelectedRating}
        tags={tags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        allLanguages={allLanguages}
        selectedLang={selectedLang}
        onChangeLang={setSelectedLang}
        hideAdult={getHideAdult()}
      />

      <main ref={mainRef} className="flex-1 min-w-0 scroll-mt-6">
        <div className="tl-sec-head">
          <span className="bar" />
          <h2>КАТАЛОГ</h2>
          <span className="count whitespace-nowrap">// {filteredGames.length} из {new Intl.NumberFormat('ru-RU').format(totalCount ?? games.length)}</span>
          {loadingMore && (
            <span className="count flex items-center gap-1.5" style={{ color: 'var(--pink)' }}>
              <Loader2 size={11} className="animate-spin" /> догружаем
            </span>
          )}
          {incomplete && !loadingMore && (
            <span className="count flex items-center gap-1.5 whitespace-nowrap" style={{ color: '#fbbf24' }} title="Часть страниц каталога не загрузилась из-за сети">
              <AlertTriangle size={11} /> не всё загрузилось ·
              <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline hover:text-white">
                повторить
              </button>
            </span>
          )}
          <span className="line" />
          <span className="tag">STORE</span>
        </div>

        {hiddenAdult > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-4 py-3 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.06)]">
            <span className="tl-term text-[16px] text-[var(--muted)]">
              Скрыто игр 18+: <b className="text-white font-normal">{hiddenAdult}</b>
            </span>
            <button type="button" className="tl-btn" onClick={() => requestAdult({ stay: true })}>
              Показать — мне есть 18
            </button>
          </div>
        )}

        <CatalogToolbar
          searchQuery={searchQuery}
          onChangeSearch={setSearchQuery}
          sortBy={sortBy}
          onChangeSort={setSortBy}
          selectedRating={selectedRating}
          onClearRating={() => setSelectedRating('')}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          selectedLang={selectedLang}
          onClearLang={() => setSelectedLang('')}
          onClearAll={clearFilters}
          pageSize={pageSize}
          onChangePageSize={setPageSize}
          view={view}
          onChangeView={setView}
        />

        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="visible"
          key={`${sortBy}-${selectedRating}-${selectedTags.join(',')}-${selectedLang}-${view}-${currentPage}-${pageSize}`}
          className={view === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5' : 'flex flex-col gap-4'}
        >
          {pagedGames.length > 0 ? (
            pagedGames.map((game) => (
              <GameHoverPreview key={game.ID} game={game}>
                <GameCard
                  game={game}
                  view={view}
                  onClick={() => {
                    markLeavingToGame(); // при возврате из игры каталог восстановит страницу/фильтры
                    navigate(`/games/${game.ID}`);
                  }}
                />
              </GameHoverPreview>
            ))
          ) : (
            <div className="col-span-full text-center py-24">
              {loadingMore ? (
                <p className="tl-term text-[16px] text-[var(--muted)] flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-accent" /> Ищем в остальной части каталога…
                </p>
              ) : (
                <>
                  <p className="tl-term text-[16px] text-[var(--muted)] uppercase tracking-[0.1em] mb-4">
                    {games.length === 0 ? 'В каталоге пока нет игр' : 'Нет игр по вашим фильтрам'}
                  </p>
                  {hasFilters && (
                    <button type="button" onClick={clearFilters} className="tl-btn ghost">Сбросить все фильтры</button>
                  )}
                  {!hasFilters && games.length > 0 && (
                    <p className="tl-term text-[14px] text-[var(--muted-2)]">
                      Часть игр может быть скрыта фильтрами контента в настройках магазина.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </motion.div>

        <CatalogPagination page={currentPage} totalPages={totalPages} onChange={setPage} />

        <footer className="tl-footer">
          <div className="status">SYSTEM STATUS: <b>ONLINE</b><br />{loadingMore ? 'CATALOG SYNCING' : 'CATALOG SYNCED'}</div>
          <div className="left">
            <span className="keep">KEEP GOING.EXE</span>
            <div className="tl-barcode">
              {Array.from({ length: 20 }).map((_, i) => <i key={i} />)}
            </div>
          </div>
        </footer>
      </main>
    </div>
    </>
  );
};
