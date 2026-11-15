import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  buildInviteLink, deleteCommunity, getCommunities, getCommunityInvite, getCommunityStats,
  type Community, type CommunityStats,
} from '../../api/community';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useDialog } from '../../components/Dialogs';
import Pagination from '../../components/ui/Pagination';
import { canModerate } from '../../utils/roles';
import { copyText } from '../../utils/clipboard';
import CommunityHero from './components/CommunityHero';
import CommunityList, {
  EMPTY_COMMUNITY_FILTERS, matchCommunity, type CommunityFilters, type CommunitySort, type FormatFilter,
} from './components/CommunityList';
import CommunityFeed, { type CommunityFeedKind, type PublishTab } from './components/CommunityFeeds';
import PublishContentModal from './components/PublishContentModal';
import InviteModal from './components/InviteModal';
import { formatOf } from './formats';

const STATS_POLL_MS = 60_000;
const FEED_TABS: CommunityFeedKind[] = ['screenshots', 'workshop', 'broadcasts'];

/**
 * Живые цифры платформы: загрузка сразу, затем раз в минуту, пока вкладка на экране.
 * В режиме экономии трафика — только один раз.
 */
function useLiveStats(lowBandwidth: boolean): CommunityStats | null {
  const [stats, setStats] = useState<CommunityStats | null>(null);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) getCommunityStats().then(setStats).catch(() => {});
    };
    refresh();
    if (lowBandwidth) return;
    const timer = setInterval(refresh, STATS_POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [lowBandwidth]);
  return stats;
}

type Invite = { name: string; code: string };

/** Главная раздела «Сообщество»: список сообществ, ленты контента и живая статистика. */
export default function CommunityPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dialog = useDialog();
  const { user } = useAuth();
  const { getLibrary } = useSettings();
  const stats = useLiveStats(!!getLibrary().low_bandwidth);

  // вкладка — в адресе (?tab=workshop), чтобы на неё вели пункты нижней навигации
  const [params, setParams] = useSearchParams();
  const tab = FEED_TABS.includes(params.get('tab') as CommunityFeedKind) ? (params.get('tab') as string) : 'trending';
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [filter, setFilter] = useState<FormatFilter>('all');
  const [sort, setSort] = useState<CommunitySort>('new');
  const [filters, setFilters] = useState<CommunityFilters>(EMPTY_COMMUNITY_FILTERS);
  const [publishTab, setPublishTab] = useState<PublishTab | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getCommunities()
      .then(setCommunities)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // только что создано приватное сообщество — сразу показываем ссылку-приглашение
  useEffect(() => {
    const created = (location.state as { created?: Community } | null)?.created;
    if (!location.state) return;
    if (created?.is_private && created.invite_code) setInvite({ name: created.name, code: created.invite_code });
    navigate(location.pathname + location.search, { replace: true }); // чтобы при возврате окно не всплыло снова
  }, [location.state, location.pathname, location.search, navigate]);

  // фильтр по формату и сортировка; «самое большое сообщество» — крупно над сеткой (только без фильтра)
  const filtered = useMemo(() => {
    const list = communities.filter((c) =>
      (filter === 'all' ? true : filter === 'mine' ? c.creator_id === user?.id : formatOf(c).id === filter)
      && matchCommunity(c, filters));
    const byNew = (a: Community, b: Community) => b.ID - a.ID;
    if (sort === 'popular') list.sort((a, b) => b.members_count - a.members_count || byNew(a, b));
    else if (sort === 'alpha') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    else list.sort(byNew);
    return list;
  }, [communities, filter, filters, sort, user?.id]);
  const featured = useMemo(() => {
    const advActive = filters.query || filters.themeId || filters.gameId || filters.visibility || filters.size;
    if (filter !== 'all' || advActive || communities.length < 4) return null;
    return [...communities].filter((c) => !c.is_private).sort((a, b) => b.members_count - a.members_count)[0] || null;
  }, [communities, filter, filters]);
  const rest = featured ? filtered.filter((c) => c.ID !== featured.ID) : filtered;

  const pages = Math.max(1, Math.ceil(rest.length / pageSize));
  const current = Math.min(page, pages);
  const shown = rest.slice((current - 1) * pageSize, current * pageSize);

  const switchTab = (id: string) => {
    if (id === 'discussions') {
      navigate('/community/discussions');
      return;
    }
    setParams(id === 'trending' ? {} : { tab: id }, { replace: true });
    setPage(1);
  };

  const resize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const remove = async (id: number) => {
    if (!(await dialog.confirm({ title: 'Удалить сообщество?', message: 'Сообщество и его публикации будут удалены.', confirmText: 'Удалить', danger: true }))) return;
    try {
      await deleteCommunity(id);
      setCommunities((list) => list.filter((c) => c.ID !== id));
    } catch (err: any) {
      await dialog.alert({ title: 'Не удалось удалить сообщество', message: err?.response?.data?.error || 'Ошибка сервера', danger: true });
    }
  };

  const showInvite = async (community: Community) => {
    try {
      const code = await getCommunityInvite(community.ID);
      setCopied(false);
      setInvite({ name: community.name, code });
    } catch (err: any) {
      await dialog.alert({ title: 'Ссылка недоступна', message: err?.response?.data?.error || 'Не удалось получить ссылку-приглашение', danger: true });
    }
  };

  const copyInvite = async () => {
    if (invite) setCopied(await copyText(buildInviteLink(invite.code)));
  };

  return (
    <div className="mx-auto max-w-[1600px] p-8 text-left">
      <CommunityHero
        activeTab={tab}
        onTabSelect={switchTab}
        stats={stats}
        onCreate={user ? () => navigate('/community/create') : null}
        onPublish={user ? () => setPublishTab('image') : null}
        query={filters.query}
        onQuery={(query) => { setFilters((f) => ({ ...f, query })); setPage(1); }}
        matches={filters.query.trim() ? communities.filter((c) => matchCommunity(c, { ...EMPTY_COMMUNITY_FILTERS, query: filters.query })) : []}
        onOpen={(c) => navigate(`/community/${c.ID}`)}
      />

      <main className="space-y-8">
          {tab === 'trending' ? (
            <>
              <CommunityList
                communities={shown}
                all={communities}
                total={filtered.length}
                loading={loading}
                userId={user?.id}
                isModerator={canModerate(user?.role)}
                featured={current === 1 ? featured : null}
                filter={filter}
                onFilter={(f) => { setFilter(f); setPage(1); }}
                filters={filters}
                onFilters={(patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); }}
                sort={sort}
                onSort={(v) => { setSort(v); setPage(1); }}
                onDelete={remove}
                onInvite={showInvite}
                onOpen={(c) => navigate(`/community/${c.ID}`)}
                pageSize={pageSize}
                onChangePageSize={resize}
              />
              <Pagination page={current} totalPages={pages} onChange={setPage} className="mt-0" />
            </>
          ) : (
            <CommunityFeed kind={tab as CommunityFeedKind} onPublish={user ? setPublishTab : null} />
          )}
      </main>

      {publishTab && <PublishContentModal communities={communities} initialTab={publishTab} onClose={() => setPublishTab(null)} />}

      {invite && (
        <InviteModal name={invite.name} code={invite.code} copied={copied} onClose={() => setInvite(null)} onCopy={copyInvite} />
      )}
    </div>
  );
}
