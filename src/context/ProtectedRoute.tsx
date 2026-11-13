// src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isWeb } from '../App';

const Spinner = () => (
  <div className="h-screen w-full bg-main-bg flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-accent"></div>
  </div>
);

export const ProtectedRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Spinner />;

  // Web: неавторизованный пользователь попадает на витрину About (только web),
  // десктоп — как раньше, на страницу входа.
  return user ? <Outlet /> : <Navigate to={isWeb ? '/about' : '/login'} replace />;
};

const NoAccess = ({ text }: { text: string }) => (
  <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-center px-6">
    <ShieldAlert size={40} className="text-accent/60" />
    <p className="text-sm font-black uppercase tracking-widest text-pearl/72">{text}</p>
    <button
      onClick={() => window.history.back()}
      className="px-4 py-2 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-pearl/70 hover:text-white hover:border-white/25 transition-colors cursor-pointer"
    >
      Назад
    </button>
  </div>
);

/** Доступ только для администраторов (роль проверяет и сервер) */
export const RequireAdmin = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Spinner />;

  if (!user) return <Navigate to="/login" replace />;

  if ((user as any).role !== 'admin') {
    return <NoAccess text="Доступ только для администраторов" />;
  }

  return <Outlet />;
};

/** Доступ для администраторов и менеджеров (управление играми и магазином). */
export const RequireStaff = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <Spinner />;

  if (!user) return <Navigate to="/login" replace />;

  const role = (user as any).role;
  if (role !== 'admin' && role !== 'manager') {
    return <NoAccess text="Доступ только для администраторов и менеджеров" />;
  }

  return <Outlet />;
};