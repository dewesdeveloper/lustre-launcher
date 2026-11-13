import React, { useState, useEffect, useRef } from 'react';
import { landCoverFlight } from '../../utils/coverFlight';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Monitor, Shield, Building2, Disc, Info, ExternalLink
} from 'lucide-react';
import api from '../../api';
import { StoreIcon, storeLabel } from '../../components/storeLinks';
import { useAuth } from '../../context/AuthContext';
import { useAdultGate } from '../../components/AdultGate/AdultGate';
import GameReviews from '../../components/GameReviews';
import { useSettings } from '../../context/SettingsContext';
import { notifyLibraryChanged } from '../../utils/libraryEvents';
import type { Game } from './types';
import MediaGallery from './components/details/MediaGallery';
import { RequirementList } from './components/details/RequirementsList';
import GameModes from './components/details/GameModes';
import DetailsCard from './components/details/DetailsCard';
import GameActions from './components/details/GameActions';
import { Loading } from '../../components/Loading';
import { gameBannerUrl, gameBannerFallback, gameCoverUrl } from '../../utils/gameBanner';
import { safeHtml } from '../../utils/safeHtml';
import { applySeo, plainDescription } from '../../seo/seo';
import { hasAdmin } from '../../admin';

const GameDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = (user as any)?.role;
  const isAdmin = role === 'admin';
  const isStaff = role === 'admin' || role === 'manager';
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [inLibrary, setInLibrary] = useState(false);
  const [favorite, setFavorite] = useState(false);
  // Время в игре на аккаунте, мс (из статуса библиотеки)
  const [playtimeMs, setPlaytimeMs] = useState(0);
  const [installed, setInstalled] = useState<any | null>(null);
  const [launching, setLaunching] = useState(false);
  const { getLibrary } = useSettings();
  const hideCommunityContent = getLibrary().hide_community_content;
  const [showCommunity, setShowCommunity] = useState(false);

  // SEO: своё название и описание; игры 18+ не индексируются
  useEffect(() => {
    if (!game || !id) return;
    applySeo({
      title: `${game.title} — игра в каталоге Lustre`,
      description: plainDescription(game.description || game.about_game) || `${game.title} в каталоге игр Lustre.`,
      path: `/games/${id}`,
      image: game.header_image || game.banner_url || undefined,
      noindex: !!game.is_adult,
    });
  }, [game, id]);

  // Взрослая игра (is_adult): при входе на страницу — подтверждение 18+
  useAdultGate(!!game?.is_adult);

  // Длинное описание: сворачиваем, если контент выше порога
  const descRef = useRef<HTMLDivElement>(null);
  const [descOverflow, setDescOverflow] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  useEffect(() => {
    const el = descRef.current;
    if (!el) { setDescOverflow(false); return; }
    const check = () => setDescOverflow(el.scrollHeight > 360);
    check();
    // высота может измениться после загрузки шрифтов/картинок в HTML
    const t = setTimeout(check, 500);
    window.addEventListener('resize', check);
    return () => { window.removeEventListener('resize', check); clearTimeout(t); };
  }, [game?.description, game?.about_game]);

  // Установлена ли игра на этом ПК (реестр Electron)
  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron?.installedGames || !game?.title) { setInstalled(null); return; }

    const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();
    const matchInstalled = (title: string, list: any[]) => {
      const tokens = normalize(title).split(' ').filter(Boolean);
      let best: any = null;
      let bestScore = 0;
      for (const g of list || []) {
        const gTokens = new Set(normalize(g.name).split(' ').filter(Boolean));
        const score = tokens.filter((t) => gTokens.has(t)).length;
        if (score > bestScore) { best = g; bestScore = score; }
      }
      return best;
    };

    const refresh = () => {
      electron.installedGames().then((list: any[]) => setInstalled(matchInstalled(game.title, list || []))).catch(() => {});
    };
    refresh();

    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const off = electron.onInstallProgress?.((p: any) => { if (p?.phase === 'done') refresh(); });
    return () => {
      window.removeEventListener('focus', onFocus);
      if (typeof off === 'function') off();
    };
  }, [game?.title]);

  const playInstalled = async () => {
    const electron = (window as any).electron;
    if (!installed?.id || !electron?.launchGame) return;
    setLaunching(true);
    try {
      const res = await electron.launchGame(installed.id);
      if (res?.error) console.error('Launch failed:', res.error);
    } finally {
      setLaunching(false);
    }
  };

  useEffect(() => {
    const fetchGame = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const res = await api.get(`/games/${id}`);
        setGame(res.data);
      } catch (err) {
        console.error("Failed to fetch game:", err);
        setError('Не удалось загрузить данные игры');
      } finally {
        setLoading(false);
      }
    };
    fetchGame();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    api.get(`/library/status/${id}`).then(res => {
      setInLibrary(res.data.in_library);
      setFavorite(res.data.favorite);
      setPlaytimeMs(Number(res.data.playtime_ms) || 0);
    }).catch(() => {});
  }, [id]);

  // Перелёт обложки из каталога: баннер отрисован — копия «приземляется» на него
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && game) requestAnimationFrame(() => landCoverFlight(bannerRef.current));
  }, [loading, game]);

  const toggleLibrary = async () => {
    if (!id) return;
    try {
      if (inLibrary) {
        await api.post('/library/remove', { game_id: Number(id) });
        setInLibrary(false);
        setFavorite(false);
      } else {
        await api.post('/library/add', { game_id: Number(id) });
        setInLibrary(true);
      }
      notifyLibraryChanged();
    } catch (err) {
      console.error("Library toggle failed:", err);
    }
  };

  const toggleFavorite = async () => {
    if (!id) return;
    try {
      const res = await api.post('/library/favorite', { game_id: Number(id) });
      setFavorite(res.data.favorite);
      if (!inLibrary) setInLibrary(true);
      notifyLibraryChanged();
    } catch (err) {
      console.error("Favorite toggle failed:", err);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (error || !game) {
    return (
      <div className="flex flex-col items-center justify-center py-32 tl-muted">
        <p className="tl-term text-[16px] uppercase tracking-[0.2em]">{error || 'Игра не найдена'}</p>
        <button onClick={() => navigate(-1)} className="tl-btn ghost mt-4">
          Назад
        </button>
      </div>
    );
  }

  // Баннер — фон шапки страницы, в слайдер не попадает
  const allMedia = game.media;

  const minReq = game.requirements.find(r => r.type === 'minimum');
  const maxReq = game.requirements.find(r => r.type === 'recommended');

  let gameModes: Record<string, boolean> = {};
  try {
    gameModes = typeof game.features === 'string' ? JSON.parse(game.features) : game.features || {};
  } catch { /* ignore */ }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="relative isolate min-h-screen bg-main-bg text-pearl animate-in fade-in duration-500">
      {/* Атмосфера: сильно размытая обложка окрашивает фон страницы в цвета игры */}
      <div className="fx-ambient" style={{ zIndex: -1 }} aria-hidden="true">
        <img src={game.header_image || gameBannerFallback(game)} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      </div>
      {/* Banner / Hero */}
      <div ref={bannerRef} className="relative w-full h-[400px] overflow-hidden">
        <img
          src={gameBannerUrl(game)}
          alt={game.title}
          className="fx-banner-fade w-full h-full object-cover"
          onError={(e) => {
            const el = e.currentTarget;
            const fb = gameBannerFallback(game);
            if (fb && !el.dataset.fb) { el.dataset.fb = '1'; el.src = fb; }
          }}
        />
        {/* Затемнение под текст сходит на нет к нижней кромке: баннер растворяется
            в цветном фоне страницы (.fx-ambient), без резкой границы */}
        <div className="absolute inset-0 fx-banner-shade" />

        <button
          onClick={() => navigate(-1)}
          className="tl-btn absolute top-6 left-6 z-20"
        >
          <ArrowLeft size={16} />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-end gap-6">
              {(game.header_image || game.banner_url) && (
                <div className="tl-panel hidden md:block w-32 h-44 overflow-hidden shrink-0">
                  <img
                    src={gameCoverUrl(game)}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const el = e.currentTarget;
                      const fb = game.header_image || game.banner_url;
                      if (fb && !el.dataset.fb) { el.dataset.fb = '1'; el.src = fb; }
                    }}
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  {game.is_adult && (
                    <span className="tl-chip nsfw">
                      NSFW
                    </span>
                  )}
                  {game.age_rating && (
                    <span className="tl-chip age flex items-center gap-1">
                      <Shield size={12} /> {game.age_rating}
                    </span>
                  )}
                  {game.release_date && (
                    <span className="tl-term text-[15px] tl-muted">
                      {formatDate(game.release_date)}
                    </span>
                  )}
                </div>
                <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-none mb-3 text-white">
                  {game.title}
                </h1>
                <div className="flex flex-wrap items-center gap-4 tl-term text-[15px] tl-muted">
                  {game.developer && (
                    <span className="flex items-center gap-1.5">
                      <Building2 size={13} className="text-accent" /> {game.developer}
                    </span>
                  )}
                  {game.publisher && (
                    <span className="flex items-center gap-1.5">
                      <Disc size={13} className="text-cyan" /> {game.publisher}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-10">

            {/* Media Gallery */}
            <MediaGallery allMedia={allMedia} activeMediaIdx={activeMediaIdx} onSelect={setActiveMediaIdx} />

            {/* Description */}
            <section>
              <div className="tl-sec-head">
                <span className="bar" />
                <h2><Info size={15} className="text-accent" /> Об игре</h2>
                <span className="line" />
              </div>
              <div className="tl-panel p-6 game-content">
                <div className="relative">
                  <div
                    ref={descRef}
                    className="space-y-4 text-[13px] tl-muted leading-relaxed"
                    style={descOverflow && !descOpen ? { maxHeight: 300, overflow: 'hidden' } : undefined}
                  >
                    {game.description && (
                      <div dangerouslySetInnerHTML={{ __html: safeHtml(game.description) }} />
                    )}
                    {game.about_game && (
                      <div className="pt-4 border-t border-[var(--line)]" dangerouslySetInnerHTML={{ __html: safeHtml(game.about_game) }} />
                    )}
                  </div>
                  {descOverflow && !descOpen && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#110b19] to-transparent" />
                  )}
                </div>
                {descOverflow && (
                  <button className="tl-btn ghost block mt-4" onClick={() => setDescOpen(v => !v)}>
                    {descOpen ? 'Свернуть' : 'Показать полностью'}
                  </button>
                )}
              </div>
            </section>

            {/* System Requirements */}
            {(minReq || maxReq) && (
              <section>
                <div className="tl-sec-head">
                  <span className="bar" />
                  <h2><Monitor size={15} className="text-cyan" /> Системные требования</h2>
                  <span className="line" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {minReq && (
                    <div className="tl-panel p-5">
                      <h3 className="tl-head text-[11px] font-bold uppercase text-accent mb-4">Минимальные</h3>
                      <RequirementList req={minReq} />
                    </div>
                  )}
                  {maxReq && (
                    <div className="tl-panel p-5">
                      <h3 className="tl-head text-[11px] font-bold uppercase text-cyan mb-4">Рекомендуемые</h3>
                      <RequirementList req={maxReq} />
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Game Modes */}
            <GameModes gameModes={gameModes} />

            {/* Reviews — при «Скрыть контент сообщества» не грузим автоматически */}
            {hideCommunityContent && !showCommunity ? (
              <button
                onClick={() => setShowCommunity(true)}
                className="tl-btn ghost block"
              >
                Показать отзывы и комментарии сообщества
              </button>
            ) : (
              <GameReviews gameId={game.ID} />
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">

            {/* Action Buttons */}
            <GameActions
              game={game}
              navigate={navigate}
              installed={installed}
              launching={launching}
              inLibrary={inLibrary}
              favorite={favorite}
              canEdit={hasAdmin && isStaff}
              isAdmin={hasAdmin && isAdmin}
              onPlay={playInstalled}
              onToggleLibrary={toggleLibrary}
              onToggleFavorite={toggleFavorite}
            />

            {game.store_links && game.store_links.length > 0 && (
              <div className="space-y-2">
                <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] px-1">Оригинал</p>
                {game.store_links.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="tl-vrow transition-opacity hover:opacity-80"
                  >
                    <span className="ic">
                      <StoreIcon store={s.store} size={16} />
                    </span>
                    <span className="vt">
                      <b>{storeLabel(s.store)}</b>
                    </span>
                    <ExternalLink size={12} className="text-[var(--muted-2)]" />
                  </a>
                ))}
              </div>
            )}

            <DetailsCard game={game} formatDate={formatDate} playtimeMs={playtimeMs} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameDetailsPage;
