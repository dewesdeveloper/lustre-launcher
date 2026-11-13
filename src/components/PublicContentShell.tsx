import { Outlet } from 'react-router-dom';
import MainLayout from '../MainLayout';
import { Navbar } from '../pages/navigation/Navbar';
import { useAuth } from '../context/AuthContext';

/**
 * Оболочка публичного контента: /about, каталог игр, страница игры,
 * сообщества — доступны без входа.
 *
 * Залогиненному пользователю страница рендерится внутри обычного шелла
 * лаунчера (MainLayout), гостю — под навигационной панелью, где вместо
 * профиля стоят кнопки «Войти» / «Регистрация» (NavbarTop сам переключается
 * при user === null).
 */
export function PublicContentShell() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full bg-main-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-accent" />
      </div>
    );
  }

  if (user) return <MainLayout><Outlet /></MainLayout>;

  return (
    <div className="min-h-screen w-full bg-main-bg flex flex-col">
      <Navbar />
      <main data-page-content className="flex-1"><Outlet /></main>
    </div>
  );
}

export default PublicContentShell;
