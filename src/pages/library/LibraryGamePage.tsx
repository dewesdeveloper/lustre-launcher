import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Play, Loader2, FolderSearch, MonitorSmartphone,
  ShieldCheck, ShieldAlert } from 'lucide-react';
import api from '../../api';
import { useDialog } from '../../components/Dialogs';
import { CRACK_MISSING_TEXT, applyChosenCrack, keepWithoutCrack, reinstallWithWizard } from '../../utils/crackMissing';
import CrackChoiceDialog from '../../components/CrackChoiceDialog';
import { notifyLibraryChanged } from '../../utils/libraryEvents';
import type { InstalledGame, Game } from './types';
import { landCoverFlight } from '../../utils/coverFlight';
import GameActionsMenu from './components/GameActionsMenu';
import { AboutSection, InfoPanel, InstallPanel, ScreenshotStrip, StatTile, type GameMediaItem } from './components/LibraryGameSections';
import GameTranslatePanel from './components/GameTranslatePanel';
import { Loading } from '../../components/Loading';
import SourcePickerModal, { type DownloadSource } from '../market/components/SourcePickerModal';
import ItchFilePickerModal from '../market/components/ItchFilePickerModal';
import PathPickerModal from '../market/components/PathPickerModal';
import { getAppPaths } from '../../utils/appPaths';
import { fetchItchFiles, type ItchFile } from '../market/itchFiles';
import { gameBannerUrl, gameBannerFallback } from '../../utils/gameBanner';
import { formatPlaytime } from '../../utils/playtime';
import { reportDownload } from '../../api/downloadStats';
import { sourceKeyFor } from '../../api/scanReports';
import VirusCheckModal from './components/VirusCheckModal';
import { reportRemoteInstall, type RemoteInstallState } from '../../api/remoteInstall';
import { beforeLaunch } from '../../api/cloudSaves';
import CloudSavesPanel from './components/CloudSavesPanel';
import AchievementsSection from '../../components/achievements/AchievementsSection';

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
  const [crackPickOpen, setCrackPickOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [shortcutMsg, setShortcutMsg] = useState('');
  const [installing, setInstalling] = useState(false);
  // установка этой игры уже идёт в фоне (запущена со страницы загрузок или раньше)
  const [bgInstall, setBgInstall] = useState(false);
  const [installError, setInstallError] = useState('');
  const [virusCheckOpen, setVirusCheckOpen] = useState(false);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [itchFiles, setItchFiles] = useState<ItchFile[]>([]);
  const [itchLoading, setItchLoading] = useState(false);
  const [itchPickerOpen, setItchPickerOpen] = useState(false);
  // Выбор пути скачивания (см. PathPickerModal): до подтверждения откладываем исходную задачу
  const [pathPrompt, setPathPrompt] = useState<{ source: DownloadSource; resolved: boolean; filename: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Загрузка, поставленная с телефона: её итог (началась / не удалась) уходит обратно на телефон
  const location = useLocation();
  const remoteRef = useRef<number | null>(null);
  const remoteHandledRef = useRef(0);
  const finishRemote = (status: 'started' | 'failed', err = '') => {
    const rid = remoteRef.current;
    if (!rid) return;
    remoteRef.current = null;
    reportRemoteInstall(rid, status, err);
  };

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
    const mine = (p: { catalogId?: number }) => Number(p?.catalogId) === Number(id);
    electron?.getInstallStatus?.().then((list: { catalogId?: number }[]) => {
      setBgInstall(Array.isArray(list) && list.some(mine));
    }).catch(() => {});
    const off = electron?.onInstallProgress?.((p: { gameId: string; phase: string; percent: number; catalogId?: number }) => {
      if (mine(p)) setBgInstall(p.phase !== 'done' && p.phase !== 'idle');
      if (p.phase === 'done') refreshInstalled();
    });
    const onFocus = () => refreshInstalled();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      if (typeof off === 'function') off();
    };
  }, [electron, refreshInstalled, id]);

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
      // облачные сохранения: в облаке новее (играли на другом ПК) — предложить скачать
      await beforeLaunch(Number(id), installed.installPath, dlg.confirm);
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
    } else if (res?.uninstallEntryLeft) {
      await dlg.alert({ title: 'Игра удалена', message: 'Файлы игры удалены, но запись в «Установленных приложениях» Windows осталась: не хватило прав администратора. Её можно убрать в «Параметры → Приложения» или удалить игру ещё раз и разрешить запрос прав.' });
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
            // источник из каталога — к нему привяжется итог проверки Защитником после скачивания
            sourceKey: sourceKeyFor(source),
          });
        } else {
          window.open(locator, '_blank');
        }
        if (res?.error) {
          setInstallError(res.error);
          setInstalling(false);
          finishRemote('failed', String(res.error));
          return;
        }
        reportDownload(Number(id), 'started', source.kind || 'torrent');
        finishRemote('started');
      } catch (e: any) {
        console.error('download failed:', e);
        setInstallError(e?.response?.data?.error || 'Не удалось добавить загрузку');
        finishRemote('failed', e?.response?.data?.error || 'Не удалось добавить загрузку');
        setInstalling(false);
        return;
      }
    }
    navigate('/downloads');
  };

  // Команда с телефона (MainLayout открыл страницу с ней): запускаем загрузку выбранного источника
  useEffect(() => {
    const cmd = (location.state as RemoteInstallState | null)?.remoteInstall;
    if (!cmd || !game || Number(id) !== cmd.game_id || remoteHandledRef.current === cmd.install_id) return;
    remoteHandledRef.current = cmd.install_id;
    navigate(location.pathname, { replace: true, state: null });
    void (async () => {
      const list: InstalledGame[] = (await electron?.installedGames?.().catch(() => [])) || [];
      if (matchInstalled(game.title, list)) {
        reportRemoteInstall(cmd.install_id, 'failed', 'Игра уже установлена на этом компьютере');
        return;
      }
      const source: DownloadSource | undefined = cmd.source_index === -1
        ? (game.magnet_uri ? { kind: 'torrent', magnet_uri: game.magnet_uri } : undefined)
        : game.sources?.[cmd.source_index];
      if (!source) {
        reportRemoteInstall(cmd.install_id, 'failed', 'Источник игры не найден');
        return;
      }
      remoteRef.current = cmd.install_id;
      await startDownload(source, false, '', true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, location.state]);

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
  const playtimeText = formatPlaytime(Math.max(libPlaytime, installed?.playtimeMs || 0));
  const releaseYear = game.release_date ? new Date(game.release_date).getFullYear() : 0;
  const media = ((game as Game & { media?: GameMediaItem[] }).media) || [];

  return (
    <div className="min-h-screen bg-main-bg text-pearl animate-in fade-in duration-300 pb-12">
      {/* --- ШАПКА --- */}
      <div ref={bannerRef} className="relative h-[340px] overflow-hidden">
        {banner ? (
          <img
            src={banner}
            alt={game.title}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => {
              const el = e.currentTarget;
              const fb = gameBannerFallback(game);
              if (fb && !el.dataset.fb) { el.dataset.fb = '1'; el.src = fb; }
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-violet/20 via-main-bg to-accent/10" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-main-bg via-main-bg/35 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-r from-main-bg/85 via-main-bg/10 to-transparent" />

        <div className="absolute bottom-[76px] left-8 right-8 max-md:left-4 max-md:right-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`tl-chip ${installed ? 'ok' : 'age'}`}>{installed ? 'Установлена' : 'Не установлена'}</span>
            {favorite && <span className="tl-chip rare">В избранном</span>}
            {game.age_rating && <span className="tl-chip age">{game.age_rating}+</span>}
          </div>
          <h1 className="max-w-4xl text-3xl font-black uppercase leading-tight tracking-tight text-white md:text-5xl" style={{ textShadow: '0 2px 18px rgba(0,0,0,.6)' }}>
            {game.title}
          </h1>
          <p className="tl-term mt-1 text-[16px] text-pearl/80">
            {[game.developer, releaseYear > 1970 ? String(releaseYear) : ''].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {/* --- ПАНЕЛЬ ДЕЙСТВИЙ (на краю шапки) --- */}
      <div className="relative z-10 -mt-[60px] px-8 max-md:px-4">
        <div className="tl-panel flex flex-wrap items-center gap-x-8 gap-y-4 border-[var(--line-2)] bg-[var(--panel)]/92 p-4 backdrop-blur-xl">
          {installed ? (
            !installed.exePath ? (
              <button onClick={pickExe} disabled={pickingExe} title="Укажите exe игры, чтобы появился запуск" className="tl-btn solid h-12 px-7 text-[12px]">
                {pickingExe ? <Loader2 size={16} className="animate-spin" /> : <FolderSearch size={16} />}
                Указать файл игры
              </button>
            ) : (
              <button onClick={play} disabled={launching} className="tl-btn solid h-12 min-w-[180px] justify-center px-8 text-[13px]">
                {launching ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} className="fill-current" />}
                Играть
              </button>
            )
          ) : (
            bgInstall ? (
              <button
                disabled
                title="Установка идёт в фоне. Если открылись окна установщика (проверка файлов, DirectX, Visual C++) — завершите их."
                className="tl-btn solid h-12 min-w-[180px] cursor-not-allowed justify-center px-8 text-[13px] opacity-60"
              >
                <Loader2 size={16} className="animate-spin" /> Идёт установка
              </button>
            ) : (
              <button onClick={install} disabled={installing} className="tl-btn solid h-12 min-w-[180px] justify-center px-8 text-[13px]">
                {installing ? <Loader2 size={16} className="animate-spin" /> : <MonitorSmartphone size={16} />}
                {installing ? 'Добавление…' : 'Установить'}
              </button>
            )
          )}

          <div className="grid min-w-0 flex-1 grid-cols-3 gap-6 max-lg:order-last max-lg:basis-full max-sm:grid-cols-2">
            <StatTile label="Наиграно" value={playtimeText} />
            <StatTile label="Последний запуск" value={formatDateTime(lastPlayedTs || undefined)} />
            <StatTile label="В библиотеке с" value={formatDate(addedAt)} />
          </div>

          <div className="flex items-center gap-2">
            {!installed && (
              <button type="button" onClick={() => setVirusCheckOpen(true)} className="tl-btn ghost" title="Что нашёл Защитник Windows у игроков, которые уже скачали игру">
                <ShieldCheck size={14} /> Проверить на вирусы
              </button>
            )}
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
        </div>
        {installError && <p className="tl-term mt-2 text-[15px] text-[#ff5b8a]">{installError}</p>}
        {installed?.crackOptions && installed.crackOptions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.06)] px-4 py-3">
            <ShieldAlert size={18} className="shrink-0 text-accent" />
            <p className="tl-term min-w-[240px] flex-1 text-[15px] leading-snug text-pearl/85">
              <span className="text-accent">Кряк не выбран.</span> В раздаче несколько кряков ({installed.crackOptions.map((o) => o.label).join(', ')}) — без кряка игра откроет Steam.
            </p>
            <button type="button" className="tl-btn solid" onClick={() => setCrackPickOpen(true)}>Выбрать кряк</button>
          </div>
        )}
        {crackPickOpen && installed?.crackOptions && (
          <CrackChoiceDialog
            gameName={game.title}
            options={installed.crackOptions}
            onClose={() => setCrackPickOpen(false)}
            onPick={async (o) => {
              const err = await applyChosenCrack(installed.id, o.id);
              if (err) return err;
              setCrackPickOpen(false);
              refreshInstalled();
            }}
          />
        )}
        {installed?.crackMissing && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border border-amber-400/50 bg-amber-400/[.07] px-4 py-3">
            <ShieldAlert size={18} className="shrink-0 text-amber-300" />
            <p className="tl-term min-w-[240px] flex-1 text-[15px] leading-snug text-pearl/85">
              <span className="text-amber-300">Кряк не установлен.</span> {CRACK_MISSING_TEXT}
            </p>
            <button
              type="button"
              className="tl-btn solid"
              onClick={async () => { await reinstallWithWizard(installed.id, game.title, dlg); refreshInstalled(); }}
            >
              Переустановить с мастером
            </button>
            <button
              type="button"
              className="tl-btn ghost"
              onClick={async () => { if (await keepWithoutCrack(installed.id, dlg)) refreshInstalled(); }}
            >
              Оставить как есть
            </button>
          </div>
        )}
        {bgInstall && !installed && (
          <p className="tl-term mt-2 text-[15px] text-[var(--muted)]">
            Игра устанавливается в фоне. Если установщик открыл свои окна (проверка файлов, DirectX, Visual C++) — завершите их, после этого появится кнопка «Играть».
          </p>
        )}
      </div>

      {/* --- КОНТЕНТ --- */}
      <div className="flex items-start gap-8 px-8 pt-8 max-lg:flex-col max-md:px-4">
        <div className="min-w-0 flex-1 max-lg:w-full">
          <ScreenshotStrip media={media} />
          <AboutSection game={game} />
          <AchievementsSection gameId={Number(game.ID ?? id)} gameTitle={game.title} installedId={installed?.id ?? null} />
        </div>

        <div className="flex w-80 shrink-0 flex-col gap-5 max-lg:w-full">
          <InstallPanel
            installed={installed}
            onReveal={reveal}
            onPickExe={pickExe}
            onCreateShortcut={createShortcut}
            onUninstall={uninstall}
            onInstall={install}
            installing={installing}
            shortcutMsg={shortcutMsg}
          />
          {installed && <CloudSavesPanel gameId={Number(id)} gameDir={installed.installPath} />}
          {installed && <GameTranslatePanel installedId={installed.id} gameId={Number(id)} />}
          <InfoPanel game={game} releaseDate={formatDate(game.release_date)} onOpenStore={() => navigate(`/games/${game.ID}`)} />
        </div>
      </div>

      {game && (
        <VirusCheckModal
          open={virusCheckOpen}
          gameId={Number(id)}
          gameTitle={game.title}
          sources={game.sources?.length ? game.sources : [{ kind: 'torrent', magnet_uri: game.magnet_uri }]}
          onClose={() => setVirusCheckOpen(false)}
        />
      )}

      {game && (
        <SourcePickerModal
          open={sourcePickerOpen}
          gameId={Number(game.ID ?? id)}
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
