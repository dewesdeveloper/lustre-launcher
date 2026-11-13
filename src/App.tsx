import { BrowserRouter, HashRouter, Routes, Route, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { useEffect } from 'react';
import Home from "./pages/Home/home";
import { StorePage } from "./pages/market/StorePage";
import { RecommendationsPage } from "./pages/market/RecommendationsPage";
import Login from './pages/authorization/Login';
import Register from './pages/authorization/Register';
import ResetPassword from './pages/authorization/ResetPassword';
import LibraryPage from './pages/library/Library';
import LibraryGamePage from './pages/library/LibraryGamePage';
import CommunityPage from "./pages/community/CommunityPage";
import CreateCommunityPage from "./pages/community/CreateCommunityPage";
import CommunityInvitePage from "./pages/community/CommunityInvitePage";
import CommunityDetailPage from "./pages/community/CommunityDetailPage";
import CommunityPostPage from "./pages/community/CommunityPostPage";
import DiscussionsPage from "./pages/community/DiscussionsPage";
import MainLayout from './MainLayout';
import ProfilePage from './pages/profile/Profile';
import BadgesPage from './pages/profile/BadgesPage';
import ActivityPage from './pages/activity/ActivityPage';
import AboutPage from './pages/about/AboutPage';
import { PublicContentShell } from './components/PublicContentShell';
import PrivacyPage from './pages/help/PrivacyPage';
import LegalInfoPage from './pages/help/LegalInfoPage';
import SubscriberAgreementPage from './pages/help/SubscriberAgreementPage';
import EditProfilePage from './pages/profile/EditProfile';
import AddFriend from './pages/friends/AddFriend';
import FriendsLayout from './pages/friends/FriendsLayout';
import FriendsList from './pages/friends/FriendsList';
import NotFoundPage from "./pages/NotFound";
import DownloadsPage from "./pages/market/DownloadsPage";
import GameDetailsPage from "./pages/market/GameDetailsPage";
import { ProtectedRoute } from "./context/ProtectedRoute";
import { admin } from "./admin";
import SettingsPage from "./pages/settings/SettingsPage";
import FriendsStandalone from './pages/friends/FriendsStandalone';
import OverlayPage from './pages/overlay/OverlayPage';
import OverlayToastsPage from './pages/overlay/OverlayToastsPage';
import ModerationPage from './pages/moderation/ModerationPage';
import { applyRouteSeo } from './seo/seo';
import AccountPickerPage from './pages/authorization/AccountPickerPage';
import CosmeticsShopPage from './pages/shop/CosmeticsShopPage';
import CoinHistoryPage from './pages/shop/CoinHistoryPage';
import AppearancePage from './pages/shop/AppearancePage';
import SubscriptionsPage from './pages/shop/SubscriptionsPage';
import NewsPage from './pages/market/NewsPage';
import InventoryPage from './pages/inventory/InventoryPage';
import SupportPage from './pages/support/SupportPage';
import SupportManagePage from './pages/support/SupportManagePage';
import ChatWindow from './pages/chat/ChatWindow';
import UpdateWindow from './pages/update/UpdateWindow';
import PaymentResultPage from './pages/payment/PaymentResultPage';
import { OfflineGate } from './components/OfflineGate';
import { DialogProvider } from './components/Dialogs'; 
import { AdultGateProvider } from './components/AdultGate/AdultGate';
import PageTransition from './components/PageTransition';
import { useAuth } from './context/AuthContext';

export const isElectron = typeof window !== 'undefined' && !!(window as any).electron;
export const isWeb = !isElectron;

/**
 * Роутер: web — BrowserRouter (чистые URL /store, /about без '#'),
 * десктоп (Electron) — HashRouter: рендерер грузится с file://, где
 * history.pushState работает с ограничениями (origin 'null').
 */
export const Router = isWeb ? BrowserRouter : HashRouter;

/**
 * Оболочка публичных страниц: политика, соглашение, справка и поддержка
 * открываются без входа в аккаунт. Не залогиненному пользователю страница
 * рендерится сама по себе (как документ), залогиненному — внутри шелла лаунчера.
 */
function PublicShell() {
  const { user, isLoading } = useAuth();
  const outlet = useOutlet();

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-main-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-accent" />
      </div>
    );
  }

  if (!user) return <>{outlet}</>;
  return <MainLayout>{outlet}</MainLayout>;
}

/** Заголовок и мета-теги текущего маршрута (веб) */
function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => { applyRouteSeo(pathname); }, [pathname]);
  return null;
}

export default function App() {

  return (
    <DialogProvider>
      <Router>
      <AdultGateProvider>
      <PageTransition />
      <TrayNavigation />
      <RouteSeo />
      <Routes>
        {/* окно «Друзья» лаунчера — без общей шапки и боковых панелей */}
        <Route path="/friends-window" element={<FriendsStandalone />} />

        {/* --- Игровой оверлей (отдельное поверх-окно) --- */}
        <Route path="/overlay" element={<OverlayPage />} />
        <Route path="/overlay-toasts" element={<OverlayToastsPage />} />

        {/* --- Окно «Кто играет?» (выбор аккаунта) --- */}
        <Route path="/account-picker" element={<AccountPickerPage />} />

        {/* --- Окно чата (без MainLayout) --- */}
        <Route path="/chat-window" element={<ChatWindow />} />

        {/* --- Окно обновления (без MainLayout) --- */}
        <Route path="/update" element={<UpdateWindow />} />

        {/* --- Окно групповых чатов (без MainLayout) --- */}

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Публичные страницы: доступны без входа — на них ведут ссылки
            чекбоксов согласия и футер страниц авторизации */}
        <Route element={<PublicShell />}>
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/legal" element={<LegalInfoPage />} />
          <Route path="/subscriber-agreement" element={<SubscriberAgreementPage />} />
          <Route path="/support" element={<OfflineGate><SupportPage /></OfflineGate>} />
        </Route>

        {/* Публичный контент: витрина About (только web), каталог игр,
            страница игры и сообщества — открываются без авторизации.
            Гость получает навбар с кнопками «Войти»/«Регистрация» (PublicContentShell),
            залогиненный пользователь — обычный MainLayout. */}
        <Route element={<PublicContentShell />}>
          {isWeb && <Route path="/about" element={<AboutPage />} />}
          <Route path="/store" element={<OfflineGate><StorePage /></OfflineGate>} />
          <Route path="/store/recommendations" element={<OfflineGate><RecommendationsPage /></OfflineGate>} />
          <Route path="/games/:id" element={<OfflineGate><GameDetailsPage /></OfflineGate>} />
          <Route path="/community" element={<OfflineGate><CommunityPage /></OfflineGate>} />
          <Route path="/community/discussions" element={<OfflineGate><DiscussionsPage /></OfflineGate>} />
          <Route path="/community/:id" element={<OfflineGate><CommunityDetailPage /></OfflineGate>} />
          <Route path="/community/:id/post/:postId" element={<OfflineGate><CommunityPostPage /></OfflineGate>} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route index element={<Home />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/library/games/:id" element={<LibraryGamePage />} />
            <Route path="/cosmetics" element={<OfflineGate><CosmeticsShopPage /></OfflineGate>} />
<Route path="/shop/history" element={<OfflineGate><CoinHistoryPage /></OfflineGate>} />
<Route path="/shop/packages" element={<OfflineGate><CosmeticsShopPage /></OfflineGate>} />
            <Route path="/appearance" element={<OfflineGate><AppearancePage /></OfflineGate>} />
            <Route path="/subscriptions" element={<OfflineGate><SubscriptionsPage /></OfflineGate>} />
            <Route path="/news" element={<OfflineGate><NewsPage /></OfflineGate>} />
            <Route path="/inventory" element={<OfflineGate><InventoryPage /></OfflineGate>} />
            <Route path="/support/manage" element={<OfflineGate><SupportManagePage /></OfflineGate>} />
            <Route path="/moderation" element={<OfflineGate><ModerationPage /></OfflineGate>} />
            <Route path="/community/create" element={<OfflineGate><CreateCommunityPage /></OfflineGate>} />
            <Route path="/community/invite/:code" element={<OfflineGate><CommunityInvitePage /></OfflineGate>} />
            <Route path="/downloads" element={<OfflineGate><DownloadsPage /></OfflineGate>} />

            {/* Результат оплаты (возврат из платёжной формы через lustre://payment/result) */}
            <Route path="/payment/result" element={<OfflineGate><PaymentResultPage /></OfflineGate>} />

            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:username" element={<ProfilePage />} />
            <Route path="/profile/edit" element={<EditProfilePage />} />
            <Route path="/profile/badges" element={<BadgesPage />} />
<Route path="/activity" element={<OfflineGate><ActivityPage /></OfflineGate>} />

            <Route path="/friends" element={<OfflineGate><FriendsLayout /></OfflineGate>}>
              <Route index element={<FriendsList />} />
              <Route path="add" element={<AddFriend />} />
            </Route>
            {/* Админка — закрытый модуль (src/admin.ts); в сборке из открытого кода её нет */}
            {admin?.adminRoutes}
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </AdultGateProvider>
      </Router>
    </DialogProvider>
  );
}

function TrayNavigation() {
  const navigate = useNavigate();
  const electron = (window as any).electron;

  useEffect(() => {
    if (!electron?.onNavigate) return;
    const handler = (route: string) => navigate(route);
    electron.onNavigate(handler);
  }, [navigate, electron]);

  return null;
}