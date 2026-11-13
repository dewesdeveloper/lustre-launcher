import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useConnectivity } from '../../context/ConnectivityContext';
import { openChatWindow } from '../../utils/openChat';
import { LIBRARY_CHANGED_EVENT } from '../../utils/libraryEvents';
import api from '../../api';
import { IconLock } from '@tabler/icons-react';
import CommentsSection from './CommentsSection';
import { ProfileShowcase } from './ProfileShowcase';
import { useDialog } from '../../components/Dialogs';
import { PROFILE_THEMES, isCustomThemeId, parseCustomThemeId } from '../../components/profileThemes';
import type { ShopItem } from '../../api/shop';
import { getUserBadges, type UserBadge } from '../../api/badges';
import { type FriendState, parseTags } from './constants';
import ProfileHeader from './components/ProfileHeader';
import ProfileTabs from './components/ProfileTabs';
import ProfileStats from './components/ProfileStats';
import ProfileGamesTab from './components/ProfileGamesTab';
import ProfileInventoryTab from './components/ProfileInventoryTab';
import ProfileBadgesBlock from './components/ProfileBadgesBlock';
import FavoritesBlock from './components/FavoritesBlock';
import CollectionsBlock from '../../components/collections/CollectionsBlock';
import SocialBlock from './components/SocialBlock';
import { ProfileSidebar } from './ProfileSidebar';
import ActivityBlock from './components/ActivityBlock';
import LevelCard from './components/LevelCard';
import { Loading } from '../../components/Loading';
import { canModerate } from '../../utils/roles';

const PANEL_HEAD = 'tl-head text-[11px] font-bold text-white mb-3.5';
const PANEL_HEAD_STYLE = { textShadow: 'var(--glow-sm)' };

export default function ProfilePage() {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const { offline } = useConnectivity();
  const navigate = useNavigate();
  const dlg = useDialog();

  const [viewedUser, setViewedUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [friendState, setFriendState] = useState<FriendState | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);
  const [profileBadges, setProfileBadges] = useState<UserBadge[]>([]);

  // Вкладки профиля: обзор / игры / инвентарь (игры и инвентарь — для себя и друзей)
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';
  const [library, setLibrary] = useState<any[] | null>(null);
  const [inventory, setInventory] = useState<ShopItem[] | null>(null);

  const isOwnProfile = !username || username === currentUser?.username;
  const viewerIsFriend = !!viewedUser?.viewer?.is_friend;
  const canViewContent = isOwnProfile || viewerIsFriend;
  const activeTab = canViewContent ? tab : 'overview';

  useEffect(() => {
    setLibrary(null);
    setInventory(null);
  }, [viewedUser?.username]);

  useEffect(() => {
    if (!isOwnProfile) return;
    const onChanged = () => setLibrary(null);
    window.addEventListener(LIBRARY_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, onChanged);
  }, [isOwnProfile]);

  useEffect(() => {
    const name = viewedUser?.username;
    if (!name || !canViewContent) return;
    if ((activeTab === 'games' || isOwnProfile) && library === null) {
      const req = isOwnProfile ? api.get('/library/') : api.get(`/library/user/${name}`);
      req.then(r => setLibrary(r.data || [])).catch(() => setLibrary([]));
    }
    if (activeTab === 'inventory' && inventory === null) {
      api.get(`/shop/user/${name}`).then(r => setInventory(r.data || [])).catch(() => setInventory([]));
    }
  }, [activeTab, viewedUser?.username, canViewContent, library, inventory, isOwnProfile]);

  const setTab = (t: string) => {
    if (!canViewContent) return;
    const next = new URLSearchParams(searchParams);
    if (t === 'overview') next.delete('tab');
    else next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  const refreshFriendState = () => {
    if (!viewedUser?.id) return;
    api.get(`/friends/status/${viewedUser.id}`)
      .then(res => setFriendState(res.data))
      .catch(() => setFriendState(null));
  };

  useEffect(() => { refreshFriendState(); }, [viewedUser?.id]);

  // значки владельца открытого профиля; ответ от прежнего профиля отбрасываем
  const viewedId = viewedUser?.id;
  useEffect(() => {
    if (!viewedId) return;
    let current = true;
    getUserBadges(viewedId).then(
      (list) => current && setProfileBadges(list),
      () => current && setProfileBadges([]),
    );
    return () => { current = false; };
  }, [viewedId]);

  const sendFriendRequest = async () => {
    if (!viewedUser?.id || friendBusy) return;
    setFriendBusy(true);
    try {
      await api.post('/friends/request', { friend_id: viewedUser.id });
      refreshFriendState();
    } catch (err: any) {
      await dlg.alert({ title: 'Ошибка', message: err.response?.data?.error || 'Не удалось отправить заявку', danger: true });
    } finally {
      setFriendBusy(false);
    }
  };

  const acceptFriendRequest = async () => {
    if (!friendState?.request_id || friendBusy) return;
    setFriendBusy(true);
    try {
      await api.post('/friends/accept', { request_id: friendState.request_id });
      refreshFriendState();
    } catch (err: any) {
      await dlg.alert({ title: 'Ошибка', message: err.response?.data?.error || 'Не удалось принять заявку', danger: true });
    } finally {
      setFriendBusy(false);
    }
  };

  const removeFriend = async () => {
    if (!viewedUser?.id || friendBusy) return;
    const ok = await dlg.confirm({
      title: 'Удалить из друзей',
      message: `Удалить «${viewedUser.profile?.display_name || viewedUser.username}» из списка друзей?`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    setFriendBusy(true);
    try {
      await api.delete('/friends/remove', { data: { friend_id: viewedUser.id } });
      refreshFriendState();
    } catch (err: any) {
      await dlg.alert({ title: 'Ошибка', message: err.response?.data?.error || 'Не удалось удалить из друзей', danger: true });
    } finally {
      setFriendBusy(false);
    }
  };

  useEffect(() => {
    const name = username || currentUser?.username;
    if (!name) return;
    setIsLoading(true);
    api.get(`/user/${name}`)
      .then(({ data }) => setViewedUser(data))
      .catch((err) => {
        if (err.response?.status === 403) setViewedUser({ private: true } as any);
        else if (isOwnProfile && currentUser) setViewedUser(currentUser);
        else navigate('/library');
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, currentUser, isOwnProfile]);

  if (isLoading) return <Loading />;

  if ((viewedUser as any)?.private) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6 text-left">
        <div className="tl-panel p-8 max-w-sm text-center">
          <IconLock size={40} className="text-accent mx-auto" />
          <h2 className="tl-head text-[13px] font-bold uppercase tracking-[0.14em] text-white mt-4">Профиль скрыт</h2>
          <p className="tl-term text-[16px] tl-muted mt-2">Пользователь ограничил круг лиц, которым виден его профиль.</p>
          <button
            onClick={() => navigate(-1)}
            className="tl-btn ghost mt-5"
          >
            Назад
          </button>
        </div>
      </div>
    );
  }

  const profile = viewedUser?.profile;
  const privacyViewer = (viewedUser as any)?.viewer;
  const tags = parseTags(profile);
  const themeId = (profile as any)?.theme_id as string | undefined;
  const customTheme = isCustomThemeId(themeId) ? parseCustomThemeId(themeId!) : null;
  const activeTheme = customTheme
    ? { id: themeId!, name: 'Своя палитра', color: customTheme.accent, ambient: '', overlay: undefined as string | undefined }
    : PROFILE_THEMES.find(t => t.id === themeId) || PROFILE_THEMES[0];

  return (
    <div className="relative pb-20 overflow-x-hidden text-left">
      <div className="max-w-[1180px] mx-auto px-6 pt-8">

        <ProfileHeader
          profile={profile}
          activeTheme={activeTheme}
          isOwnProfile={isOwnProfile}
          friendState={friendState}
          friendBusy={friendBusy}
          privacyViewer={privacyViewer}
          onEditProfile={() => navigate('/profile/edit')}
          onRemoveFriend={removeFriend}
          onAcceptFriendRequest={acceptFriendRequest}
          onSendFriendRequest={sendFriendRequest}
          onMessage={() => viewedUser?.id && openChatWindow(viewedUser.id)}
          canMessage={!offline && !!viewedUser?.id}
          tags={tags}
          memberSince={viewedUser?.member_since}
          onlineStatus={viewedUser?.online_status}
          username={viewedUser?.username}
          userId={viewedUser?.id}
          tabs={canViewContent ? <ProfileTabs activeTab={activeTab} onSelect={setTab} /> : null}
        >
          {/* КОНТЕНТ */}
          <div className="mt-6 flex flex-col gap-0">
            {activeTab === 'overview' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-[22px] items-start">
                  {/* ЛЕВАЯ КОЛОНКА */}
                  <div className="flex flex-col gap-[22px] min-w-0">
                    <section className="tl-panel p-[22px]">
                      <h3 className={PANEL_HEAD} style={PANEL_HEAD_STYLE}>О СЕБЕ</h3>
                      <p className="tl-wrap tl-term text-[16px] leading-[1.65] tl-muted">
                        {profile?.bio || 'Пока ничего не рассказано о себе.'}
                      </p>
                      <LevelCard profile={profile} activeTheme={activeTheme} />
                    </section>

                    <ProfileShowcase profile={profile} userId={viewedUser?.id} />

                    {isOwnProfile && (
                      <FavoritesBlock
                        library={library}
                        isOwnProfile={isOwnProfile}
                        onGameClick={(gameId) => navigate(`/games/${gameId}`)}
                      />
                    )}

                    {viewedUser && (
                      <CollectionsBlock
                        username={viewedUser.username}
                        isOwnProfile={isOwnProfile}
                        onGameClick={(gameId) => navigate(`/games/${gameId}`)}
                      />
                    )}

                    {viewedUser && (
                      <ActivityBlock username={viewedUser.username} isOwnProfile={isOwnProfile} />
                    )}
                  </div>

                  {/* ПРАВАЯ КОЛОНКА */}
                  <div className="flex flex-col gap-[22px] min-w-0">
                    {/* Боковое меню профиля: закреплено при прокрутке */}
                    <ProfileSidebar />

                    <section className="tl-panel p-[22px]">
                      <h3 className={PANEL_HEAD} style={PANEL_HEAD_STYLE}>СТАТИСТИКА</h3>
                      <ProfileStats stats={viewedUser?.stats} />
                    </section>

                    {viewedUser && (
                      <SocialBlock userId={viewedUser.id} isOwnProfile={isOwnProfile} />
                    )}

                    <ProfileBadgesBlock
                      profileBadges={profileBadges}
                      isOwnProfile={isOwnProfile}
                      onViewAll={() => navigate('/profile/badges')}
                    />

                    {tags.length > 0 && (
                      <section className="tl-panel p-[22px]">
                        <h3 className={PANEL_HEAD} style={PANEL_HEAD_STYLE}>ЛЮБИМЫЕ ТЕГИ</h3>
                        <div className="flex gap-2 flex-wrap">
                          {tags.map((t, i) => (
                            <span
                              key={`${t.text}-${i}`}
                              className="tl-chip age"
                              style={t.color ? { color: t.color, borderColor: `${t.color}99`, background: `${t.color}1f` } : undefined}
                            >
                              {t.text}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </div>

                {viewedUser && <CommentsSection profileId={viewedUser.id} canDelete={isOwnProfile || canModerate(currentUser?.role)} />}
              </>
            )}

            {activeTab === 'games' && (
              <ProfileGamesTab library={library} onGameClick={(gameId) => navigate(`/games/${gameId}`)} />
            )}

            {activeTab === 'inventory' && (
              <ProfileInventoryTab inventory={inventory} viewedUser={viewedUser} />
            )}
          </div>
        </ProfileHeader>

        <footer className="tl-footer">
          <div className="status">SYSTEM STATUS: <b>UNSTABLE</b><br />BUT YOU GOT THIS ◆</div>
          <div className="left">
            <span className="keep">KEEP GOING.EXE</span>
            <div className="tl-barcode">
              {Array.from({ length: 20 }).map((_, i) => <i key={i} />)}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
