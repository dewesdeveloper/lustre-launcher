import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import CommunityList from './components/CommunityList';
import CommunityFeed, { type CommunityFeedKind, type PublishTab } from './components/CommunityFeeds';
import StatsPanel from './components/StatsPanel';
import PublishContentModal from './components/PublishContentModal';
import InviteModal from './components/InviteModal';

const STATS_POLL_MS = 60_000;

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

  const [tab, setTab] = useState('trending');
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
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
    navigate(location.pathname, { replace: true }); // чтобы при возврате окно не всплыло снова
  }, [location.state, location.pathname, navigate]);

  const pages = Math.max(1, Math.ceil(communities.length / pageSize));
  const current = Math.min(page, pages);
  const shown = communities.slice((current - 1) * pageSize, current * pageSize);

  const switchTab = (id: string) => {
    if (id === 'discussions') {
      navigate('/community/discussions');
      return;
    }
    setTab(id);
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
    <div className="mx-auto max-w-[1600px] p-8 text-left animate-in fade-in duration-700">
      <CommunityHero activeTab={tab} onTabSelect={switchTab} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_330px]">
        <main className="space-y-8">
          {tab === 'trending' ? (
            <>
              <CommunityList
                communities={shown}
                total={communities.length}
                loading={loading}
                userId={user?.id}
                isModerator={canModerate(user?.role)}
                onPublish={() => setPublishTab('image')}
                onCreate={() => navigate('/community/create')}
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

        <aside className="space-y-8">
          <StatsPanel stats={stats} />
        </aside>
      </div>

      {publishTab && <PublishContentModal communities={communities} initialTab={publishTab} onClose={() => setPublishTab(null)} />}

      {invite && (
        <InviteModal name={invite.name} code={invite.code} copied={copied} onClose={() => setInvite(null)} onCopy={copyInvite} />
      )}
    </div>
  );
}
