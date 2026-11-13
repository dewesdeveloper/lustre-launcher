import { useEffect, useRef, type ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import api from './api';
import { API_URL } from './api/config';
import { LIBRARY_CHANGED_EVENT } from './utils/libraryEvents';
import { openChatWindow } from './utils/openChat';
import SidebarGames from './pages/library/Slidebar';
import BottomBar from './pages/bottomBar/BottomBar';
import { Navbar } from './pages/navigation/Navbar';
import { isElectron } from './App';
import { connectChat, disconnectChat, sendWS } from './api/chat';
import { initPresence } from './api/presence';
import { initCallManager, startCall } from './api/call';
import { initGroupCallManager, joinGroupCall, startGroupCall } from './api/groupCall';
import CallOverlay from './components/CallOverlay';
import GroupCallOverlay from './components/GroupCallOverlay';
import VoiceConnectedBar from './components/voice/VoiceConnectedBar';
import VoiceInviteToast from './components/voice/VoiceInviteToast';
import { useAdultConsent } from './components/AdultGate/AdultGate';
import { fetchItchFiles } from './pages/market/itchFiles';
import { initVoiceChannels } from './api/voiceChannel';
import { setProStatus } from './api/mediaQuality';
import { useAuth } from './context/AuthContext';
import { useConnectivity } from './context/ConnectivityContext';
import { applyLauncherTheme, useLauncherThemeSync } from './components/profileThemes';
import LauncherBackdrop from './components/LauncherBackdrop';
import ScrollTopButton from './components/ScrollTopButton';
import { useSearchHotkey } from './utils/searchHotkey';
import ThemeDecor from './components/ThemeDecor';
import { applyLauncherBackground } from './components/launcherBackground';

export default function MainLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const { offline, reconnectKey } = useConnectivity();
  const navigate = useNavigate();

  // Pro-статус нужен медиа-модулю (SD/HD) вне React-дерева.
  useEffect(() => {
    setProStatus(!!user?.profile?.is_pro);
  }, [user?.profile?.is_pro]);

  // Клик по системному уведомлению Windows: окно уже поднято main-процессом,
  // здесь — переход к нужному разделу
  useEffect(() => {
    const electron = (window as any).electron;
    const off = electron?.onNotifyClick?.((payload: { type?: string; userId?: number } | null) => {
      try { window.focus(); } catch { /* ignore */ }
      if (payload?.type === 'friends') navigate('/friends');
      else if (payload?.type === 'chat' && payload.userId) openChatWindow(payload.userId);
      else if (payload?.type === 'group') openChatWindow();
      // payload.type === 'call' — оверлей звонка и так открыт в фокусе
    });
    return () => off?.();
  }, [navigate]);

  // ===== Учёт времени в игре на аккаунте =====
  // Копим сессию локально и отправляем на сервер каждую минуту, при выходе из
  // игры и при закрытии окна. Каталожный id приходит из electron (catalogId);
  // id в реестре — id скачивания, поэтому для старых записей сопоставляем
  // имя игры со списком библиотеки.
  const mainRef = useRef<HTMLElement>(null);
  useSearchHotkey(); // Ctrl+F — поиск на текущей странице
  const playSessionRef = useRef<{ gameId: number; pending: number; last: number } | null>(null);
  const libraryRef = useRef<{ id: number; title: string }[]>([]);
  const flushPlayRef = useRef<() => void>(() => {});
  // Разбор «отложенного» запуска — см. resolvePendingLaunchRef.current ниже.
  const resolvePendingLaunchRef = useRef<() => void>(() => {});
  // Игра, запущенная раньше, чем загрузилась библиотека: сопоставим с каталогом,
  // как только список подтянется, чтобы сессия не потерялась.
  const pendingLaunchRef = useRef<string>('');

  const refreshLibraryRef = () => {
    api.get('/library/')
      .then(res => {
        libraryRef.current = (res.data || []).map((e: any) => ({
          id: Number(e.game_id),
          title: String(e.game?.title || ''),
        }));
        resolvePendingLaunchRef.current?.();
      })
      .catch(() => { /* офлайн — обновим при следующем событии */ });
  };

  const matchCatalogGame = (registryName?: string) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();
    const tokens = norm(registryName || '').split(' ').filter(Boolean);
    if (!tokens.length) return 0;
    let best = 0;
    let bestScore = 0;
    for (const g of libraryRef.current) {
      const gt = new Set(norm(g.title).split(' ').filter(Boolean));
      const score = tokens.filter(t => gt.has(t)).length;
      if (score > bestScore) { best = g.id; bestScore = score; }
    }
    // совпасть должно хотя бы половиной токенов — иначе игра не из нашего каталога
    return bestScore >= Math.ceil(tokens.length / 2) ? best : 0;
  };

  // Каталожный id: electron присылает его напрямую (id в реестре — id скачивания),
  // а для старых записей без catalogId сопоставляем игру по имени из библиотеки.
  const resolveCatalogId = (g: { name?: string; catalogId?: number } | null | undefined) => {
    const byId = Number(g?.catalogId) || 0;
    if (byId > 0) return byId;
    return matchCatalogGame(g?.name);
  };

  const startPlaySession = (gameId: number) => {
    playSessionRef.current = { gameId, pending: 0, last: Date.now() };
  };

  // Разбор «отложенного» запуска, когда библиотека догрузилась позже старта игры.
  resolvePendingLaunchRef.current = () => {
    const name = pendingLaunchRef.current;
    if (!name || playSessionRef.current) return;
    const gameId = matchCatalogGame(name);
    if (gameId > 0) {
      pendingLaunchRef.current = '';
      startPlaySession(gameId);
    }
  };

  flushPlayRef.current = () => {
    const s = playSessionRef.current;
    if (!s || s.gameId <= 0 || s.pending < 1000) return;
    const ms = Math.min(s.pending, 6 * 60 * 60 * 1000);
    api.post('/library/playtime', { game_id: s.gameId, session_ms: ms })
      .then(() => { s.pending = Math.max(0, s.pending - ms); })
      .catch(() => { /* офлайн — досошлём следующим тиком */ });
  };

  useEffect(() => {
    refreshLibraryRef();
    const onLibraryChanged = () => refreshLibraryRef();
    window.addEventListener(LIBRARY_CHANGED_EVENT, onLibraryChanged);
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, onLibraryChanged);
  }, []);

  // Тема лаунчера: перекрашивает весь интерфейс через CSS-переменные
  const launcherThemeId = (user?.profile as any)?.launcher_theme_id as string | undefined;
  useEffect(() => { applyLauncherTheme(launcherThemeId); }, [launcherThemeId]);
  useLauncherThemeSync();

  // Фон лаунчера: применяем сохранённый (в т.ч. если окно открылось позже)
  const launcherBg = (user?.profile as any)?.launcher_background_url;
  useEffect(() => {
    if (launcherBg) {
      applyLauncherBackground({
        url: launcherBg,
        isVideo: (user?.profile as any)?.launcher_background_is_video,
        scale: (user?.profile as any)?.launcher_background_scale,
        blur: (user?.profile as any)?.launcher_background_blur,
        opacity: (user?.profile as any)?.launcher_background_opacity,
        offsetX: (user?.profile as any)?.launcher_background_offset_x,
        offsetY: (user?.profile as any)?.launcher_background_offset_y,
      });
    } else {
      applyLauncherBackground(null);
    }
  }, [launcherBg]);

  // WS-подключение из главного окна: пользователь «в сети», пока запущен лаунчер
  useEffect(() => {
    if (offline) return;
    connectChat();
    return () => disconnectChat();
  }, [offline, reconnectKey]);

  // Учёт времени в игре живёт отдельно от онлайна: офлайн-режим и
  // переподключения WS не должны выключать отчёт сессий.
  useEffect(() => {
    const electron = (window as any).electron;

    const unGame = electron?.onGameState?.((g: { running: boolean; name?: string; id?: string | number; catalogId?: number }) => {
      // id игры из каталога — сервер по нему отдаст друзьям обложку (мини-превью)
      sendWS({ type: 'presence.game', game: g?.running ? (g.name || '') : '', game_id: g?.running ? resolveCatalogId(g) : 0 });

      const s = playSessionRef.current;
      if (g?.running) {
        // новая сессия — предыдущую досчитываем и отправляем
        if (s) {
          s.pending += Date.now() - s.last;
          flushPlayRef.current();
        }
        const gameId = resolveCatalogId(g);
        if (gameId > 0) {
          pendingLaunchRef.current = '';
          startPlaySession(gameId);
        } else {
          // библиотека ещё не загрузилась — сопоставим, когда подтянется
          playSessionRef.current = null;
          pendingLaunchRef.current = String(g.name || '');
          refreshLibraryRef();
        }
      } else {
        pendingLaunchRef.current = '';
        if (s) {
          // игра закрылась — досчитываем хвост и отправляем сразу
          s.pending += Date.now() - s.last;
          s.last = Date.now();
          flushPlayRef.current();
          playSessionRef.current = null;
        }
      }
    });

    // Тик раз в минуту: копим время и отправляем на сервер, чтобы не потерять
    // хвост сессии при закрытии лаунчера или падении игры.
    const playTimer = setInterval(() => {
      const cur = playSessionRef.current;
      if (!cur) {
        // игра запущена, но ещё не сопоставлена с каталогом (библиотека грузилась)
        if (pendingLaunchRef.current && libraryRef.current.length === 0) refreshLibraryRef();
        resolvePendingLaunchRef.current();
        return;
      }
      cur.pending += Date.now() - cur.last;
      cur.last = Date.now();
      if (cur.pending >= 60_000) flushPlayRef.current();
    }, 60_000);

    // Последний кусок сессии при закрытии окна: keepalive-запрос переживает unload.
    const flushOnClose = () => {
      const cur = playSessionRef.current;
      if (!cur || cur.gameId <= 0) return;
      cur.pending += Date.now() - cur.last;
      cur.last = Date.now();
      if (cur.pending < 1000) return;
      const ms = Math.min(cur.pending, 6 * 60 * 60 * 1000);
      try {
        const token = localStorage.getItem('token');
        fetch(`${API_URL}/library/playtime`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ game_id: cur.gameId, session_ms: ms }),
        }).catch(() => {});
        cur.pending = Math.max(0, cur.pending - ms);
      } catch { /* ignore */ }
    };
    window.addEventListener('beforeunload', flushOnClose);

    return () => {
      clearInterval(playTimer);
      flushPlayRef.current(); // не теряем хвост сессии
      unGame?.();
      window.removeEventListener('beforeunload', flushOnClose);
    };
  }, []);

  // Голосовые каналы сообществ (как в Discord): присутствие и подключение живут в главном окне
  useEffect(() => { if (user?.id) initVoiceChannels(user.id); }, [user?.id]);

  // Первый вход: игры 18+ скрыты, один раз предлагаем их показывать
  const { offer: offerAdult } = useAdultConsent();
  useEffect(() => { if (user?.id) offerAdult(); }, [user?.id, offerAdult]);

  // Ссылка itch.io протухла за время обрыва загрузки — получаем новую на бэкенде
  useEffect(() => {
    const electron = (window as any).electron;
    return electron?.onHttpLinkExpired?.(async ({ id, page, filename }: { id: string; page: string; filename?: string }) => {
      try {
        const files = await fetchItchFiles(page);
        const file = files.find((f) => filename && f.filename === filename) ?? (files.length === 1 ? files[0] : undefined);
        electron.httpRelink(id, file?.url || '');
      } catch {
        electron.httpRelink(id, '');
      }
    });
  }, []);

  // Менеджер звонков + presence живут в главном окне
  useEffect(() => {
    if (offline) return;
    const stopCalls = initCallManager();
    const stopGroupCalls = initGroupCallManager();
    const stopPresence = initPresence();
    const electron = (window as any).electron;
    // Звонок из другого окна (окно чата делегирует главному окну)
    const unStartCall = electron?.onStartCall?.((peer: { id: number; username: string; display_name?: string; avatar_url?: string; video?: boolean }) => {
      if (peer?.id) startCall(peer, !!peer.video);
    });
    // Групповой звонок из другого окна (окно групп делегирует главному окну)
    const runGroupCall = (payload: { groupId: number; groupName: string; callId?: string; me?: { id: number; username: string; display_name?: string; avatar_url?: string } }) => {
      if (!payload?.groupId) return;
      const me = payload.me || { id: user?.id || 0, username: user?.username || 'Вы', display_name: (user?.profile as any)?.display_name || user?.username, avatar_url: (user?.profile as any)?.avatar_url };
      if (payload.callId) joinGroupCall(payload.callId, payload.groupId, payload.groupName, me);
      else startGroupCall(payload.groupId, payload.groupName, me);
    };
    const unStartGroupCall = electron?.onStartGroupCall?.(runGroupCall);
    // Веб-режим: окно чата (popup) просит главное окно начать звонок через localStorage
    const onStartCallStorage = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        if (e.key === 'lh_start_call') {
          const peer = JSON.parse(e.newValue);
          if (peer?.id) startCall(peer, !!peer.video);
        } else if (e.key === 'lh_start_group_call') {
          runGroupCall(JSON.parse(e.newValue));
        }
      } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStartCallStorage);
    return () => {
      stopCalls();
      stopGroupCalls();
      stopPresence();
      unStartCall?.();
      unStartGroupCall?.();
      window.removeEventListener('storage', onStartCallStorage);
    };
  }, [offline, reconnectKey]);

  return (
    <div className="flex flex-col h-screen w-full bg-main-bg overflow-hidden font-sans text-pearl">
      <Navbar />

      <div className="flex flex-1 overflow-hidden relative">
        <SidebarGames />
        <VoiceConnectedBar />
        <VoiceInviteToast />

        <main ref={mainRef} className="flex-1 overflow-y-auto custom-scrollbar relative">

          {/* Фон: неоновая сетка/сканлайны/glow-пятна в стиле шаблонов */}
          <ThemeDecor />

          {/* Фон: пользовательский (изображение/видео) или стандартная сетка */}
          <LauncherBackdrop />

          {/* КОНТЕНТ СТРАНИЦЫ */}
          <div data-page-content className="h-full w-full relative" style={{ zIndex: 10 }}>
            {children ?? <Outlet />}
          </div>

        </main>
        {/* Кнопка «наверх» поверх области страницы (вне <main>, чтобы не прокручивалась вместе с ней) */}
        <ScrollTopButton target={mainRef} />
      </div>
      {isElectron && <BottomBar />}
      <CallOverlay />
      <GroupCallOverlay />
    </div>
  );
}
