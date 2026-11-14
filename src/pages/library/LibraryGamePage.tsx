import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play, Loader2, FolderSearch, MonitorSmartphone,
  Building2, Calendar, Shield, Clock, Tag
} from 'lucide-react';
import api from '../../api';
import { useDialog } from '../../components/Dialogs';
import { notifyLibraryChanged } from '../../utils/libraryEvents';
import type { InstalledGame, Game } from './types';
import { landCoverFlight } from '../../utils/coverFlight';
import GameActionsMenu from './components/GameActionsMenu';
import GameStatsPanel from './components/GameStatsPanel';
import GameTranslatePanel from './components/GameTranslatePanel';
import { Loading } from '../../components/Loading';
import SourcePickerModal, { type DownloadSource } from '../market/components/SourcePickerModal';
import ItchFilePickerModal from '../market/components/ItchFilePickerModal';
import PathPickerModal from '../market/components/PathPickerModal';
import { getAppPaths } from '../../utils/appPaths';
import { fetchItchFiles, type ItchFile } from '../market/itchFiles';
import { gameBannerUrl, gameBannerFallback } from '../../utils/gameBanner';
import { formatPlaytime } from '../../utils/playtime';
import { safeHtml } from '../../utils/safeHtml';
import { reportDownload } from '../../api/downloadStats';

const tokenize = (s: string) =>
  new Set(s.toLowerCase().split(/[^a-z0-9а-яё]+/).filter(t => t.length >= 3));

const formatDate = (v?: string | number | null) => {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateTime = (v?: number | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function LibraryGamePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const electron = (window as any).electron;
  const dlg = useDialog();
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  // Перелёт обложки из библиотеки: баннер отрисован — копия «приземляется» на него
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && game) requestAnimationFrame(() => landCoverFlight(bannerRef.current));
  }, [loading, game]);
  const [error, setError] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [addedAt, setAddedAt] = useState<string | null>(null);
  // Время в игре на аккаунте (сервер); локальное — запасной вариант
  const [libPlaytime, setLibPlaytime] = useState(0);
  // Последний запуск с аккаунта: хранится на сервере и НЕ теряется при
  // удалении игры с устройства (в electron-реестре запись удаляется).
  const [libLastPlayedAt, setLibLastPlayedAt] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledGame | null>(null);
  const [launching, setLaunching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [shortcutMsg, setShortcutMsg] = useState('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [itchFiles, setItchFiles] = useState<ItchFile[]>([]);
  const [itchLoading, setItchLoading] = useState(false);
  const [itchPickerOpen, setItchPickerOpen] = useState(false);
  // Выбор пути скачивания (см. PathPickerModal): до подтверждения откладываем исходную задачу
  const [pathPrompt, setPathPrompt] = useState<{ source: DownloadSource; resolved: boolean; filename: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const matchInstalled = useCallback((title: string, list: InstalledGame[]) => {
    const tt = [...tokenize(title)];
    let best: InstalledGame | null = null;
    let bestScore = 0;
    for (const g of list) {
      const gt = tokenize(g.name);
      const score = tt.filter(t => gt.has(t)).length;
      if (score > bestScore) { best = g; bestScore = score; }
    }
    return best;
  }, []);

  const refreshInstalled = useCallback(() => {
    electron?.installedGames?.().then((list: InstalledGame[]) => {
      setInstalled(game ? matchInstalled(game.title, list || []) : null);
    });
  }, [electron, game, matchInstalled]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const res = await api.get(`/games/${id}`);
        setGame(res.data);
        try {
          const lib = await api.get('/library/');
          const entry = (lib.data || []).find((e: any) => e.game_id === Number(id));
          if (entry) {
            setFavorite(entry.favorite);
            setAddedAt(entry.created_at);
            setLibPlaytime(Number(entry.playtime_ms) || 0);
            setLibLastPlayedAt(entry.last_played_at || null);
          }
        } catch {}
      } catch (err) {
        console.error('Failed to fetch game:', err);
        setError('Не удалось загрузить игру');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => { refreshInstalled(); }, [game, refreshInstalled]);

  // Обновляем статус установки: по событию завершения и при возврате на страницу
  useEffect(() => {
    const off = electron?.onInstallProgress?.((p: { gameId: string; phase: string; percent: number }) => {
      if (p.phase === 'done') refreshInstalled();
    });
    const onFocus = () => refreshInstalled();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (typeof off === 'function') off();
    };
  }, [electron, refreshInstalled]);

  // Закрытие меню по клику вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setSubmenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleFavorite = async () => {
    if (!id) return;
    try {
      const res = await api.post('/library/favorite', { game_id: Number(id) });
      setFavorite(res.data.favorite);
      notifyLibraryChanged();
    } catch (err) { console.error('Failed to toggle favorite:', err); }
  };

  const play = async () => {
    if (!installed?.id) return;
    try {
      setLaunching(true);
      const res = await electron?.launchGame?.(installed.id);
      if (res?.error) console.error(res.error);
      else refreshInstalled();
    } finally {
      setTimeout(() => setLaunching(false), 800);
    }
  };

  const uninstall = async () => {
    if (!installed?.id) return;
    const ok = await dlg.confirm({
      title: 'Удалить игру',
      message: `Удалить «${installed.name}» с устройства? Все файлы игры будут удалены.`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    const res = await electron?.uninstallGame?.(installed.id);
    if (!res?.error) reportDownload(Number(id), 'uninstalled');
    if (res?.keptFiles) {
      await dlg.alert({ title: 'Игра убрана из библиотеки', message: `Игра была установлена своим установщиком, поэтому её файлы остались в ${res.path}. Удалите их её деинсталлятором или вручную.` });
    }
    refreshInstalled();
  };

  const startDownload = async (source: DownloadSource, resolved = false, filename = '', prompted = false) => {
    // Выбор пути скачивания — при каждом действии, пока не отмечено
    // «Не показывать снова» (в веб-режиме настроек путей нет — пропускаем)
    if (!prompted) {
      const paths = await getAppPaths();
      if (paths?.askDownloadDir) {
        setPathPrompt({ source, resolved, filename });
        return;
      }
    }

    setInstallError('');
    let kind = source.kind || 'torrent';
    let locator = kind === 'torrent' ? source.magnet_uri : source.url;
    let downloadName = filename;

    if (locator) {
      try {
        setInstalling(true);

        // itch.io: страницу игры резолвим в прямые ссылки (Windows-сборка
        // первой); если файлов несколько — даём выбрать, как источники.
        // Окно открываем сразу с лоадером, чтобы не было паузы между окнами.
        if (!resolved && (kind === 'itch' || (/itch\.io/i.test(locator) && kind !== 'torrent'))) {
          setItchFiles([]);
          setItchLoading(true);
          setItchPickerOpen(true);
          let files;
          try {
            files = await fetchItchFiles(locator);
          } catch (e) {
            setItchLoading(false);
            setItchPickerOpen(false);
            throw e;
          }
          setItchLoading(false);
          if (files.length === 0) {
            setItchPickerOpen(false);
            throw new Error('empty');
          }
          if (files.length > 1) {
            setItchFiles(files);
            setInstalling(false);
            return;
          }
          setItchPickerOpen(false);
          locator = files[0].url;
          downloadName = files[0].filename || '';
          kind = 'direct';
        }

        let res: any;
        if (kind === 'torrent') {
          res = await electron?.torrentAdd?.({
            magnetURI: locator,
            gameId: Number(id),
            gameTitle: game?.title,
          });
        } else if (electron?.httpDownload) {
          res = await electron.httpDownload({
            url: locator,
            kind,
            gameId: Number(id),
            gameTitle: game?.title,
            filename: downloadName,
          });
        } else {
          window.open(locator, '_blank');
        }
        if (res?.error) {
          setInstallError(res.error);
          setInstalling(false);
          return;
        }
        reportDownload(Number(id), 'started', source.kind || 'torrent');
      } catch (e: any) {
        console.error('download failed:', e);
        setInstallError(e?.response?.data?.error || 'Не удалось добавить загрузку');
        setInstalling(false);
        return;
      }
    }
    navigate('/downloads');
  };

  const install = async () => {
    // Есть несколько источников — предлагаем выбрать; иначе старый magnet-URI
    if (game?.sources && game.sources.length > 0) {
      setSourcePickerOpen(true);
      return;
    }
    await startDownload({ kind: 'torrent', magnet_uri: game?.magnet_uri });
  };

  const createShortcut = async () => {
    if (!installed?.id) return;
    const res = await electron?.createShortcut?.(installed.id);
    setShortcutMsg(res?.ok ? 'Ярлык создан на рабочем столе' : (res?.error || 'Не удалось создать ярлык'));
    setTimeout(() => setShortcutMsg(''), 2500);
  };

  // Указать exe вручную (для игр без найденного исполняемого файла)
  const [pickingExe, setPickingExe] = useState(false);
  const pickExe = async () => {
    if (!installed?.id) return;
    setPickingExe(true);
    try {
      const exe = await electron?.pickGameExe?.();
      if (!exe) return;
      const res = await electron?.setGameExe?.(installed.id, exe);
      if (res?.error) {
        setInstallError(res.error);
        setTimeout(() => setInstallError(''), 4000);
      } else {
        refreshInstalled();
      }
    } finally {
      setPickingExe(false);
    }
  };

  const reveal = () => {
    electron?.revealGame?.(installed?.id);
  };

  if (loading) {
    return <Loading />;
  }

  if (error || !game) {
    return (
      <div className="p-8 text-center py-24">
        <p className="tl-term text-[16px] tl-muted uppercase tracking-[0.2em]">{error || 'Игра не найдена'}</p>
        <button onClick={() => navigate('/library')} className="tl-btn mt-4">
          В библиотеку
        </button>
      </div>
    );
  }

  const banner = gameBannerUrl(game);

  // Последний запуск: electron-реестр (пока игра установлена) или аккаунт на
  // сервере — серверное значение переживает удаление игры с устройства.
  const lastPlayedTs = Math.max(
    Number(installed?.lastPlayedAt) || 0,
    libLastPlayedAt ? new Date(libLastPlayedAt).getTime() : 0,
  );

  return (
    <div className="min-h-screen bg-main-bg text-pearl animate-in fade-in duration-300 pb-10">
      {/* --- БАННЕР --- */}
      <div ref={bannerRef} className="relative h-[300px] overflow-hidden">
        {banner ? (
          <img
            src={banner}
            alt={game.title}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              const el = e.currentTarget;
              const fb = gameBannerFallback(game);
              if (fb && !el.dataset.fb) { el.dataset.fb = '1'; el.src = fb; }
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-violet/20 via-main-bg to-accent/10" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-main-bg via-main-bg/20 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-r from-main-bg/80 via-transparent to-main-bg/40" />

        {game.age_rating && (
          <div className="absolute top-4 right-8 tl-chip age">
            {game.age_rating}+
          </div>
        )}

        <div className="absolute bottom-5 left-8 right-8">
          <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white leading-tight max-w-3xl">
            {game.title}
          </h1>
          <p className="tl-term text-[15px] tl-muted mt-1">{game.developer}</p>
        </div>
      </div>

      {/* --- ТУЛБАР: ИГРАТЬ / СТАТЫ / ИКОНКИ --- */}
      <div className="px-8 py-4 flex items-center gap-6 border-b border-[var(--line)] bg-[rgb(var(--accent-rgb)/.04)]">
        {installed ? (
          !installed.exePath ? (
            <button
              onClick={pickExe}
              disabled={pickingExe}
              title="Укажите exe игры, чтобы появился запуск"
              className="tl-btn"
            >
              {pickingExe ? <Loader2 size={14} className="animate-spin" /> : <FolderSearch size={14} />}
              Указать файл игры
            </button>
          ) : (
            <button
              onClick={play}
              disabled={launching}
              className="tl-btn solid"
            >
              {launching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} className="fill-current" />}
              Играть
            </button>
          )
        ) : (
          <button
            onClick={install}
            disabled={installing}
            className="tl-btn solid"
          >
            {installing ? <Loader2 size={14} className="animate-spin" /> : <MonitorSmartphone size={14} />}
            {installing ? 'Добавление...' : 'Установить'}
          </button>
        )}

        {installError && (
          <span className="tl-chip nsfw">
            {installError}
          </span>
        )}

        {/* Статистика */}
        <GameStatsPanel
          installed={installed}
          lastLaunch={formatDateTime(lastPlayedTs || undefined)}
          playtime={formatPlaytime(Math.max(libPlaytime, installed?.playtimeMs || 0))}
          addedAt={formatDate(addedAt)}
        />

        {/* Иконки справа */}
        <GameActionsMenu
          installed={installed}
          favorite={favorite}
          shortcutMsg={shortcutMsg}
          menuRef={menuRef}
          menuOpen={menuOpen}
          submenuOpen={submenuOpen}
          setMenuOpen={setMenuOpen}
          setSubmenuOpen={setSubmenuOpen}
          onToggleFavorite={toggleFavorite}
          onPickExe={pickExe}
          onCreateShortcut={createShortcut}
          onReveal={reveal}
          onUninstall={uninstall}
          onOpenStore={() => navigate(`/games/${game.ID}`)}
        />
      </div>

      {/* --- ТАБЫ --- */}
      <div className="px-8 pt-5">
        <div className="tl-tabs">
          <button className="tl-tab active">
            Обзор
          </button>
          <button
            onClick={() => navigate(`/games/${game.ID}`)}
            className="tl-tab"
          >
            Страница в магазине
          </button>
          <button
            onClick={() => navigate('/downloads')}
            className="tl-tab"
          >
            Загрузки
          </button>
        </div>
      </div>

      {/* --- КОНТЕНТ --- */}
      <div className="px-8 pt-6 flex gap-8 items-start">
        {/* Левая колонка */}
        <div className="flex-1 min-w-0">
          {game.about_game && (
            <section className="mb-8">
              <div className="tl-sec-head">
                <span className="bar" />
                <h2>Об игре</h2>
                <span className="line" />
              </div>
              <div className="game-content text-[13px] tl-muted leading-relaxed" dangerouslySetInnerHTML={{ __html: safeHtml(game.about_game) }} />
            </section>
          )}
          {game.description && (
            <section>
              <div className="tl-sec-head">
                <span className="bar" />
                <h2>Описание</h2>
                <span className="line" />
              </div>
              <div className="game-content text-[13px] tl-muted leading-relaxed" dangerouslySetInnerHTML={{ __html: safeHtml(game.description) }} />
            </section>
          )}
          {!game.about_game && !game.description && (
            <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-2)]">Нет описания</p>
          )}
        </div>

        {/* Правая колонка */}
        <div className="w-72 shrink-0 flex flex-col gap-5">
        <div className="tl-panel p-5">
          <div className="tl-sec-head">
            <span className="bar" />
            <h2>Об игре</h2>
            <span className="line" />
          </div>
          <div>
            {game.developer && (
              <div className="tl-srow">
                <span className="k flex items-center gap-2">
                  <Building2 size={13} className="text-accent shrink-0" />
                  Разработчик
                </span>
                <span className="v text-right truncate max-w-[60%]">{game.developer}</span>
              </div>
            )}
            {game.publisher && (
              <div className="tl-srow">
                <span className="k flex items-center gap-2">
                  <Building2 size={13} className="text-accent shrink-0" />
                  Издатель
                </span>
                <span className="v text-right truncate max-w-[60%]">{game.publisher}</span>
              </div>
            )}
            {game.release_date && (
              <div className="tl-srow">
                <span className="k flex items-center gap-2">
                  <Calendar size={13} className="text-accent shrink-0" />
                  Дата выхода
                </span>
                <span className="v text-right truncate max-w-[60%]">{formatDate(game.release_date)}</span>
              </div>
            )}
            {game.age_rating && (
              <div className="tl-srow">
                <span className="k flex items-center gap-2">
                  <Shield size={13} className="text-accent shrink-0" />
                  Возрастной рейтинг
                </span>
                <span className="v text-right">{game.age_rating}+</span>
              </div>
            )}
            <div className="tl-srow">
              <span className="k flex items-center gap-2">
                <Clock size={13} className="text-accent shrink-0" />
                Последний запуск
              </span>
              <span className="v text-right truncate max-w-[60%]">{formatDateTime(lastPlayedTs || undefined)}</span>
            </div>
            <div className="tl-srow">
              <span className="k flex items-center gap-2">
                <Clock size={13} className="text-accent shrink-0" />
                Наиграно
              </span>
              <span className="v text-right">{formatPlaytime(Math.max(libPlaytime, installed?.playtimeMs || 0))}</span>
            </div>
            {game.tags?.length > 0 && (
              <div className="pt-3 mt-1 border-t border-[var(--line)]">
                <div className="flex items-center gap-2 mb-2">
                  <Tag size={13} className="text-accent" />
                  <p className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Метки</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {game.tags.map(t => (
                    <span key={t.id} className="tl-chip common">
                      {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {installed && <GameTranslatePanel installedId={installed.id} gameId={Number(id)} />}
        </div>
      </div>

      {game && (
        <SourcePickerModal
          open={sourcePickerOpen}
          gameTitle={game.title}
          sources={game.sources || []}
          onClose={() => setSourcePickerOpen(false)}
          onPick={(s) => {
            setSourcePickerOpen(false);
            startDownload(s);
          }}
        />
      )}

      {game && (
        <ItchFilePickerModal
          open={itchPickerOpen}
          gameTitle={game.title}
          files={itchFiles}
          loading={itchLoading}
          onClose={() => { setItchPickerOpen(false); setItchLoading(false); }}
          onPick={(f) => {
            setItchPickerOpen(false);
            // prompted=true: выбор пути уже подтверждён до резолва itch
            startDownload({ kind: 'direct', url: f.url }, true, f.filename, true);
          }}
        />
      )}

      {game && (
        <PathPickerModal
          open={!!pathPrompt}
          kind="download"
          gameTitle={game.title}
          onClose={() => setPathPrompt(null)}
          onConfirm={() => {
            const p = pathPrompt;
            setPathPrompt(null);
            if (p) void startDownload(p.source, p.resolved, p.filename, true);
          }}
        />
      )}
    </div>
  );
}
