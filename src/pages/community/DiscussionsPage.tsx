import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconSearch, IconX } from '@tabler/icons-react';
import {
  getCommunities, getCommunityGames, getCommunityPosts,
  type Community, type CommunityGame, type CommunityPost,
} from '../../api/community';
import type { GameForum, SortOption } from './types';
import SortMenu from './components/SortMenu';
import SearchResultCard from './components/SearchResultCard';
import GameForumItem from './components/GameForumItem';

type PostsByCommunity = Record<number, CommunityPost[]>;
type Hit = { post: CommunityPost; community: Community };

/** Сообщества, игры каталога и обсуждения каждого сообщества (ошибка одного — пустой список) */
function useForumData() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [games, setGames] = useState<CommunityGame[]>([]);
  const [posts, setPosts] = useState<PostsByCommunity>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, catalog] = await Promise.all([getCommunities(), getCommunityGames()]);
        if (!alive) return;
        setCommunities(list);
        setGames(catalog);
        const pairs = await Promise.all(list.map((c) => getCommunityPosts(c.ID).catch(() => []).then((p) => [c.ID, p] as const)));
        if (alive) setPosts(Object.fromEntries(pairs));
      } catch {
        /* нет данных — страница покажет пустые списки */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { communities, games, posts, loading };
}

/** Поиск по заголовку и тексту обсуждения, названию сообщества и игры */
function search(communities: Community[], posts: PostsByCommunity, query: string): Hit[] {
  const q = query.toLowerCase();
  const hits: Hit[] = [];
  for (const community of communities) {
    const where = `${community.name}\n${community.game?.title ?? ''}`.toLowerCase();
    for (const post of posts[community.ID] ?? []) {
      if (where.includes(q) || `${post.title}\n${post.content}`.toLowerCase().includes(q)) hits.push({ post, community });
    }
  }
  return hits;
}

/** Форум игры: её сообщества, число обсуждений и участников */
function forumOf(game: CommunityGame, communities: Community[], posts: PostsByCommunity): GameForum {
  const own = communities.filter((c) => c.game_id === game.ID);
  return {
    game,
    communities: own,
    communityCount: own.length,
    discussions: own.reduce((n, c) => n + (posts[c.ID]?.length ?? 0), 0),
    members: own.reduce((n, c) => n + (c.members_count || 0), 0),
  };
}

const ORDER: Record<SortOption, (a: GameForum, b: GameForum) => number> = {
  popular: (a, b) => b.members - a.members,
  discussions: (a, b) => b.discussions - a.discussions,
  alpha: (a, b) => a.game.title.localeCompare(b.game.title, 'ru'),
};

function Skeleton({ rows, height }: { rows: number; height: string }) {
  return <div className="max-w-4xl space-y-3">{Array.from({ length: rows }, (_, i) => <div key={i} className={`tl-panel animate-pulse ${height}`} />)}</div>;
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="tl-panel max-w-4xl p-12 text-center">
      <p className="tl-head tl-muted text-[11px] font-bold uppercase tracking-[.2em]">{title}</p>
      <p className="tl-term mt-2 text-[15px] text-[var(--muted-2)]">{hint}</p>
    </div>
  );
}

function SectionHead({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="tl-sec-head">
      <span className="bar" />
      <h2>{children}</h2>
      {count !== undefined && <span className="count">// {count}</span>}
      <span className="line" />
    </div>
  );
}

/** Переключатель фильтра по типу игр (обычные / NSFW) */
function KindChip({ on, tone, dot, label, onToggle }: { on: boolean; tone: string; dot: string; label: string; onToggle: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onToggle} className={`tl-chip ${on ? tone : 'text-[var(--muted)]'}`}>
      <span className={`mr-1.5 inline-block h-1.5 w-1.5 align-middle ${on ? dot : 'bg-[var(--muted-2)]'}`} />
      {label}
    </button>
  );
}

/** Обсуждения платформы: поиск по всем обсуждениям и форумы по играм с сортировкой и фильтром. */
export default function DiscussionsPage() {
  const navigate = useNavigate();
  const { communities, games, posts, loading } = useForumData();
  // запрос может прийти из поиска на главной сообществ (?q=…)
  const [params] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [sort, setSort] = useState<SortOption>('popular');
  const [open, setOpen] = useState<number | null>(null);
  // ни один фильтр не выбран — показываются все игры
  const [regular, setRegular] = useState(false);
  const [nsfw, setNsfw] = useState(false);

  const q = query.trim();
  const hits = useMemo(() => (q ? search(communities, posts, q) : []), [communities, posts, q]);

  const forums = useMemo(() => {
    const shown = regular || nsfw ? games.filter((g) => (g.is_adult ? nsfw : regular)) : games;
    return shown.map((g) => forumOf(g, communities, posts)).sort(ORDER[sort]);
  }, [games, communities, posts, regular, nsfw, sort]);

  return (
    <div className="mx-auto max-w-[1400px] p-8 text-left animate-in fade-in duration-700">
      <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div className="shrink-0">
          <h1 className="tl-pixel text-[26px] text-white" style={{ textShadow: 'var(--glow)' }}>Обсуждения <span className="text-accent">Lustre</span></h1>
          <p className="tl-head tl-muted mt-2.5 text-[10px] font-bold uppercase tracking-[.26em]">Форумы платформы и игровые сообщества</p>
        </div>
        <div className="relative w-full md:w-96">
          <div className="tl-prefix">
            <span className="at"><IconSearch size={16} /></span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} data-search-hotkey="page" placeholder="Поиск по обсуждениям..." className="tl-field" />
          </div>
          {query && (
            <button type="button" title="Очистить поиск" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] transition-colors hover:text-accent">
              <IconX size={14} />
            </button>
          )}
        </div>
      </header>

      {q ? (
        <section>
          <SectionHead count={hits.length}>Результаты поиска</SectionHead>
          {loading ? <Skeleton rows={3} height="h-16" />
            : hits.length === 0 ? <Empty title="Ничего не найдено" hint="Ищем по заголовкам, тексту и сообществам" />
            : (
              <div className="max-w-4xl space-y-3">
                {hits.map(({ post, community }) => (
                  <SearchResultCard
                    key={post.ID}
                    post={post}
                    community={community}
                    onOpen={() => navigate(`/community/${community.ID}`, { state: { tab: 'discussions' } })}
                  />
                ))}
              </div>
            )}
        </section>
      ) : (
        <section>
          <SectionHead>Обзор <span className="text-accent">форумов</span></SectionHead>

          <div className="tl-toolbar">
            <SortMenu value={sort} onChange={setSort} />
            <div className="spacer" />
            <KindChip on={regular} tone="common" dot="bg-cyan" label="Обычные игры" onToggle={() => setRegular((v) => !v)} />
            <KindChip on={nsfw} tone="nsfw" dot="bg-[#ff5b8a]" label="NSFW игры" onToggle={() => setNsfw((v) => !v)} />
            {(regular || nsfw) && (
              <button type="button" title="Сбросить фильтр" onClick={() => { setRegular(false); setNsfw(false); }} className="tl-btn ghost">
                <IconX size={12} /> Сброс
              </button>
            )}
          </div>

          {loading ? <Skeleton rows={3} height="h-24" />
            : forums.length === 0 ? <Empty title="Игр в выбранных категориях нет" hint="Снимите фильтр «Обычные» или «NSFW», чтобы увидеть все форумы" />
            : (
              <div className="flex max-w-4xl flex-col gap-3">
                {forums.map((f) => (
                  <GameForumItem
                    key={f.game.ID}
                    forum={f}
                    expanded={open === f.game.ID}
                    onToggle={() => setOpen((id) => (id === f.game.ID ? null : f.game.ID))}
                    onOpenCommunity={(id) => navigate(`/community/${id}`)}
                    postsByCommunity={posts}
                  />
                ))}
              </div>
            )}
        </section>
      )}
    </div>
  );
}
