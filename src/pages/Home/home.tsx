import { useEffect, useState } from 'react';
import CountUp from '../../components/CountUp';
import GameMiniCover from '../../components/GameMiniCover';
import { useNavigate } from 'react-router-dom';
import {
  IconBook, IconShoppingBag, IconPlayerPlay, IconSparkles,
  IconMessage, IconDownload, IconCoin, IconActivity,
} from '@tabler/icons-react';
import api from '../../api';
import { useAuth } from '../../context/AuthContext';
import { getMiniProfile, type MiniProfile } from '../../api/miniProfile';
import { getRecommendations, type RecGame } from '../../api/recommendations';
import { getActivityFeed, type ActivityItem, type ActivityKind } from '../../api/activity';
import { getNews, type NewsItem } from '../../api/news';
import { getPresence, usePresenceVersion } from '../../api/presence';
import { openChatWindow } from '../../utils/openChat';
import { formatPlaytime } from '../../utils/playtime';
import type { LibraryEntry } from '../library/types';
import { Loading } from '../../components/Loading';
import ImageOr from '../../components/ImageOr';

interface FriendEntry {
  id: number;
  online_status?: string;
  friend_details: {
    id: number;
    username: string;
    profile?: { display_name?: string; avatar_url?: string; level?: number };
  };
}

const nf = new Intl.NumberFormat('ru-RU');

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'вчера' : `${d} дн назад`;
}

const ACTIVITY_VERB: Record<ActivityKind, string> = {
  library_add: 'добавил(а) в библиотеку',
  favorite: 'добавил(а) в избранное',
  badge_earned: 'получил(а) значок',
  comment: 'оставил(а) комментарий',
  follow: 'подписался(ась) на',
  group: 'создал(а) группу',
  review: 'оставил(а) отзыв',
  title_equip: 'надел(а) титул',
  level_up: 'вышел(а) на уровень',
};

/**
 * Главная страница лаунчера (дашборд): приветствие, «продолжить игру»,
 * статистика, рекомендации, лента активности, друзья в сети и новости.
 */
/** Приветствие по времени суток */
function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'ДОБРОЕ УТРО';
  if (h >= 12 && h < 18) return 'ДОБРЫЙ ДЕНЬ';
  if (h >= 18 && h < 23) return 'ДОБРЫЙ ВЕЧЕР';
  return 'ДОБРОЙ НОЧИ';
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  usePresenceVersion(); // перерисовка при изменении присутствия друзей

  const [mini, setMini] = useState<MiniProfile | null>(null);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [recs, setRecs] = useState<RecGame[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const username = user?.username || '';

  useEffect(() => {
    if (!username) return;
    let alive = true;
    setLoading(true);
    Promise.allSettled([
      getMiniProfile(username).then((d) => alive && setMini(d)),
      api.get('/library/').then((r) => alive && setLibrary(r.data || [])),
      api.get('/friends/list').then((r) => alive && setFriends(r.data || [])),
      getRecommendations('all').then((d) => alive && setRecs(d.games || [])),
      getActivityFeed({ limit: 4 }).then((d) => alive && setActivity(d.items || [])),
      getNews().then((n) => alive && setNews((n || []).slice(0, 3))),
    ]).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [username]);

  const displayName = user?.profile?.display_name || user?.username || 'оператор';
  const avatar = user?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
  const isPro = !!user?.profile?.is_pro;

  // usePresenceVersion() выше форсит ререндер, поэтому считаем каждый раз
  const onlineFriends = friends.filter((f) => getPresence(f.friend_details?.id)?.online);

  const lastGame = library[0];
  const level = mini?.level ?? user?.profile?.level ?? 1;
  const levelXp = mini?.level_xp ?? user?.profile?.xp ?? 0;
  const levelGoal = mini?.level_goal || 30;
  const levelPct = Math.max(0, Math.min(100, Math.round((levelXp / Math.max(1, levelGoal)) * 100)));

  const gamesCount = mini?.stats?.games ?? library.length;
  const playtimeMs = mini?.stats?.playtime_ms ?? library.reduce((s, e) => s + (e.playtime_ms || 0), 0);

  if (loading) return <Loading />;

  return (
    <div className="p-8 animate-in fade-in duration-500">

      {/* ===== ПРИВЕТСТВИЕ ===== */}
      <section
        className="tl-panel relative overflow-hidden mt-1 px-[30px] py-[26px] flex items-center gap-5 flex-wrap"
        style={{ background: 'linear-gradient(120deg, rgb(var(--accent-rgb) / 0.16), rgba(131,56,236,0.12) 55%, transparent)' }}
      >
        <div className="relative z-[1] flex-1 min-w-[260px]">
          <h1 className="tl-pixel text-[20px] text-white" style={{ textShadow: 'var(--glow)' }}>
            {greeting()}, <span className="tl-pink">{displayName.toUpperCase()}</span>
          </h1>
          <div className="tl-term text-[13px] text-[var(--muted)] mt-3">
            В сети <b className="text-[var(--green2)]">{onlineFriends.length} {plural(onlineFriends.length, 'друг', 'друга', 'друзей')}</b>
            {gamesCount > 0 && <> · {nf.format(gamesCount)} {plural(gamesCount, 'игра', 'игры', 'игр')} в библиотеке</>}
          </div>
        </div>
        <div className="relative z-[1] flex gap-2.5 flex-wrap">
          <button className="tl-btn" onClick={() => navigate('/library')}>
            <IconBook size={15} /> Библиотека
          </button>
          <button className="tl-btn ghost" onClick={() => navigate('/store')}>
            <IconShoppingBag size={15} /> Магазин
          </button>
        </div>
      </section>

      {/* ===== ПРОДОЛЖИТЬ ===== */}
      {lastGame ? (
        <section
          className="tl-panel relative overflow-hidden mt-[18px] h-[260px] md:h-[340px] bg-gradient-to-br from-violet/25 via-[#121017] to-accent/20 cursor-pointer group"
          onClick={() => navigate(`/library/games/${lastGame.game_id}`)}
        >
          <img
            src={lastGame.game?.banner_url || lastGame.game?.header_image}
            alt=""
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-[1.04]"
          />
          <div
            className="absolute inset-0 flex flex-col justify-end gap-1.5 px-[30px] py-[26px]"
            style={{ background: 'linear-gradient(to top, rgba(6,3,9,.97) 12%, rgba(6,3,9,.45) 55%, transparent 85%)' }}
          >
            <div className="tl-head text-[10px] font-bold tracking-[0.24em] text-[var(--pink)] uppercase">
              // продолжить · {lastGame.last_played_at ? relTime(lastGame.last_played_at) : 'недавно'}
            </div>
            <h2 className="tl-pixel text-[15px] md:text-[22px] text-white" style={{ textShadow: 'var(--glow)' }}>
              {lastGame.game?.title}
            </h2>
            <div className="flex items-center gap-3.5 flex-wrap tl-term text-[15px] text-[var(--muted)]">
              <span>{formatPlaytime(lastGame.playtime_ms)} в игре</span>
              {lastGame.game?.age_rating && <span className="tl-chip age">{lastGame.game.age_rating}</span>}
              {lastGame.favorite && <span className="tl-chip ok">В ИЗБРАННОМ</span>}
            </div>
            <div className="flex items-center gap-2.5 mt-3">
              <button
                className="tl-btn solid"
                onClick={(e) => { e.stopPropagation(); navigate(`/library/games/${lastGame.game_id}`); }}
              >
                <IconPlayerPlay size={15} /> Играть
              </button>
              <button className="tl-btn ghost" onClick={(e) => { e.stopPropagation(); navigate('/library'); }}>
                Библиотека
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="tl-panel mt-[18px] px-[30px] py-[30px] flex items-center gap-4 flex-wrap">
          <IconBook size={26} className="text-[var(--pink)]" />
          <div className="flex-1 min-w-[220px]">
            <div className="tl-head text-[11px] font-bold text-white uppercase">Библиотека пуста</div>
            <div className="tl-term text-[15px] text-[var(--muted)] mt-1">Добавьте первую игру из магазина — она появится здесь.</div>
          </div>
          <button className="tl-btn solid" onClick={() => navigate('/store')}>В магазин</button>
        </section>
      )}

      {/* ===== СТАТИСТИКА ===== */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-[14px] mt-[18px]">
        <div className="tl-stat"><div className="n">{formatPlaytime(playtimeMs)}</div><div className="l">Наиграно всего</div></div>
        <div className="tl-stat"><div className="n"><CountUp value={gamesCount} /></div><div className="l">Игр в библиотеке</div></div>
        <div className="tl-stat"><div className="n"><CountUp value={onlineFriends.length} /></div><div className="l">Друзей в сети</div></div>
        <div className="tl-stat"><div className="n"><CountUp value={Number(level) || 0} /></div><div className="l">Уровень{isPro ? ' · PRO' : ''}</div></div>
      </section>

      {/* ===== ОСНОВА ===== */}
      <section className="tl-sec">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[22px] items-start">

          {/* ---- ЛЕВАЯ КОЛОНКА ---- */}
          <div className="flex flex-col gap-[22px] min-w-0">

            {/* Рекомендуемое */}
            <div>
              <div className="tl-sec-head">
                <span className="bar" />
                <h2><IconSparkles size={15} className="text-[var(--pink)]" /> РЕКОМЕНДУЕМОЕ</h2>
                <span className="count">// по вашим интересам</span>
                <span className="line" />
                <button className="tag" onClick={() => navigate('/store/recommendations')}>ВСЁ →</button>
              </div>

              {recs.length === 0 ? (
                <div className="tl-panel p-6 tl-term text-[15px] text-[var(--muted)]">
                  Пока нечего рекомендовать. Оцените игры, добавьте в избранное — подборка появится.
                </div>
              ) : (
                <div className="tl-cards">
                  {recs.slice(0, 4).map((g) => (
                    <article key={g.ID} className="tl-gcard" onClick={() => navigate(`/games/${g.ID}`)}>
                      <div className="thumb">
                        {g.header_image || g.banner_url
                          ? <img src={g.header_image || g.banner_url} alt="" loading="lazy" />
                          : <div className="w-full h-full bg-gradient-to-br from-violet/30 via-[#121017] to-accent/20" />}
                      </div>
                      {g.age_rating && <div className="badges2"><span className="tl-chip age">{g.age_rating}</span></div>}
                      <div className="body">
                        <h3>{g.title}</h3>
                        <div className="dev">{(g.tags || []).slice(0, 2).map((t) => t.name).join(' · ') || 'Игра'}</div>
                        <div className="foot">
                          <span className="tl-owned">◆ РЕКОМЕНД.</span>
                          <span className="tl-btn">Подробнее</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Лента активности */}
            <div>
              <div className="tl-sec-head">
                <span className="bar" />
                <h2><IconActivity size={15} className="text-[var(--pink)]" /> ЛЕНТА АКТИВНОСТИ</h2>
                <span className="count">// ваши события</span>
                <span className="line" />
                <button className="tag" onClick={() => navigate('/activity')}>ВСЯ →</button>
              </div>

              {activity.length === 0 ? (
                <div className="tl-panel p-6 tl-term text-[15px] text-[var(--muted)]">
                  Пока нет активности. Добавьте игру, поставьте лайк или получите значок.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {activity.map((it) => (
                    <div key={it.id} className="tl-panel p-[15px] flex items-center gap-3.5">
                      <ImageOr
                        src={it.target_image}
                        className="w-[42px] h-[42px] object-cover border border-[var(--line-2)] shrink-0"
                        fallback={<div className="w-[42px] h-[42px] bg-white/[0.03] border border-[var(--line)] shrink-0" />}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="tl-head text-[10px] font-bold text-white uppercase truncate">{displayName}</div>
                        <div className="tl-term text-[15px] text-[var(--muted)] truncate">
                          {ACTIVITY_VERB[it.kind]} {it.target_name && <span className="text-white">{it.target_name}</span>}
                        </div>
                      </div>
                      <span className="tl-term text-[14px] text-[var(--muted-2)] shrink-0">{relTime(it.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---- САЙДБАР ---- */}
          <aside className="flex flex-col gap-[22px]">

            {/* Мини-профиль */}
            <div className="tl-panel p-5">
              <div className="flex items-center gap-3">
                <div className="w-[54px] h-[54px] shrink-0 border-2 border-[var(--pink)] p-0.5">
                  <img src={avatar} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="tl-head text-[11px] font-bold text-white uppercase tracking-[0.1em] truncate">{displayName}</div>
                  <div className="tl-term text-[15px] text-[var(--muted-2)] mt-0.5 truncate">
                    @{username}{isPro ? ' · PRO' : ''}
                  </div>
                </div>
                <span className="tl-chip age">LVL {level}</span>
              </div>

              <div className="mt-3.5">
                <div className="flex justify-between tl-term text-[15px] text-[var(--muted)] mb-1.5">
                  <span>ДО {level + 1} УРОВНЯ</span>
                  <span><CountUp value={levelXp} /> / {nf.format(levelGoal)} XP</span>
                </div>
                <div className="tl-prog"><div className="t"><div className="f" style={{ width: `${levelPct}%` }} /></div></div>
              </div>

              <button className="tl-btn ghost block mt-3.5" onClick={() => navigate('/profile')}>Открыть профиль</button>
            </div>

            {/* Друзья в сети */}
            <div className="tl-panel p-5">
              <h3 className="tl-pixel text-[10px] text-white mb-3.5">В СЕТИ — {onlineFriends.length}</h3>
              {onlineFriends.length === 0 ? (
                <p className="tl-term text-[15px] text-[var(--muted)]">Никого нет в сети. Позовите друзей!</p>
              ) : (
                <div className="flex flex-col">
                  {onlineFriends.slice(0, 5).map((f) => {
                    const p = getPresence(f.friend_details?.id);
                    const name = f.friend_details?.profile?.display_name || f.friend_details?.username || 'друг';
                    const av = f.friend_details?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.friend_details?.username}`;
                    return (
                      <div key={f.id} className="flex items-center gap-3 py-2.5 border-b border-dashed border-[rgb(var(--accent-rgb)/0.15)] last:border-0">
                        <div className={`relative w-[36px] h-[36px] shrink-0 border border-[var(--line-2)] ${p?.away ? '' : `fx-presence online ${p?.playing ? 'ingame' : ''}`}`}>
                          <img src={av} alt="" className="w-full h-full object-cover" />
                          <span className={`absolute -right-[3px] -bottom-[3px] w-[9px] h-[9px] border-2 border-[var(--panel)] ${p?.away ? 'bg-[#fbbf24]' : 'bg-[var(--green2)]'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="tl-head text-[10px] font-bold text-white uppercase truncate">{name}</div>
                          <div className={`tl-term text-[14px] truncate ${p?.playing ? 'text-[var(--pink)]' : 'text-[var(--muted-2)]'}`}>
                            {p?.playing ? `Играет в ${p.playing}` : p?.away ? 'Нет на месте' : 'В сети'}
                          </div>
                        </div>
                        <GameMiniCover presence={p} size="sm" />
                        <button
                          className="tl-btn ghost !px-2 !py-1.5"
                          title="Сообщение"
                          onClick={() => openChatWindow(f.friend_details.id)}
                        >
                          <IconMessage size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button className="tl-btn ghost block mt-3.5" onClick={() => navigate('/friends')}>Все друзья</button>
            </div>

            {/* Быстрый старт */}
            <div className="tl-panel p-5 flex flex-col gap-2.5">
              <h3 className="tl-pixel text-[10px] text-white mb-1">БЫСТРЫЙ СТАРТ</h3>
              <button
                className="tl-btn solid block"
                disabled={!lastGame}
                onClick={() => lastGame && navigate(`/library/games/${lastGame.game_id}`)}
              >
                <IconPlayerPlay size={14} /> Продолжить{lastGame ? `: ${lastGame.game?.title || 'игру'}` : ''}
              </button>
              <button className="tl-btn ghost block" onClick={() => navigate('/downloads')}>
                <IconDownload size={14} /> Загрузки
              </button>
              <button className="tl-btn ghost block" onClick={() => navigate('/cosmetics')}>
                <IconCoin size={14} /> Дневной бонус
              </button>
            </div>

            {/* Новости */}
            {news.length > 0 && (
              <div className="tl-panel p-5">
                <div className="flex items-center justify-between mb-3.5">
                  <h3 className="tl-pixel text-[10px] text-white">НОВОСТИ</h3>
                  <button className="tag" onClick={() => navigate('/news')}>ВСЁ →</button>
                </div>
                <div className="flex flex-col gap-3">
                  {news.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => navigate('/news')}
                      className="text-left p-3 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/0.03)] hover:border-[var(--line-2)] transition-colors"
                    >
                      <div className="tl-head text-[10px] font-bold tracking-[0.18em] text-[var(--pink)] uppercase">
                        {n.category || 'новость'} · {relTime(n.created_at)}
                      </div>
                      <div className="tl-head text-[10px] font-bold text-white leading-snug mt-1.5">{n.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>

      <footer className="tl-footer">
        <div className="status">SYSTEM STATUS: <b>ONLINE</b><br />WELCOME BACK.EXE</div>
        <div className="left">
          <span className="keep">LUSTRE HOME</span>
          <div className="tl-barcode">
            {Array.from({ length: 20 }).map((_, i) => <i key={i} />)}
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Русская плюрализация: 1 друг / 2 друга / 5 друзей */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
