import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CircleUserRound, Info, Library, RotateCw, ShoppingBag, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BottomTab, type SectionLink } from './components/BottomTab';

type Section = {
  title: string;
  icon: ReactNode;
  /** куда ведёт клик по вкладке */
  home: string;
  /** маршруты, на которых вкладка подсвечена */
  routes: string[];
  links: SectionLink[];
  /** только для вошедших */
  private?: boolean;
  /** только в веб-версии */
  webOnly?: boolean;
};

/** Разделы нижней строки; username — для ссылки на свой профиль (гостю — вход) */
function sections(username?: string): Section[] {
  const me = username ? `/profile/${username}` : '/login';
  return [
    {
      title: 'МАГАЗИН',
      icon: <ShoppingBag size={16} />,
      home: '/store',
      routes: ['/store', '/cosmetics', '/subscriptions', '/appearance'],
      links: [
        { label: 'Популярное', to: '/store' },
        // персональная подборка требует входа
        ...(username ? [{ label: 'Рекомендации', to: '/store/recommendations' }] : []),
        { label: 'Подписки', to: '/subscriptions' },
        { label: 'Тренды', to: '/store' },
        { label: 'Новости', to: '/news' },
        { label: 'Магазин кастомизаций', to: '/cosmetics', divider: true },
        { label: 'Пакеты валюты', to: '/shop/packages' },
      ],
    },
    {
      title: 'БИБЛИОТЕКА',
      icon: <Library size={16} />,
      home: '/library',
      routes: ['/library', '/downloads'],
      private: true,
      links: [
        { label: 'Домашняя страница', to: '/library' },
        { label: 'Коллекции', to: '/library?tab=collections' },
        { label: 'Загрузки', to: '/downloads', divider: true },
      ],
    },
    {
      title: 'СООБЩЕСТВО',
      icon: <Users size={16} />,
      home: '/community',
      routes: ['/community'],
      links: [
        { label: 'Домашняя страница', to: '/community' },
        { label: 'Обсуждения', to: '/community/discussions' },
        { label: 'Мастерская', to: '/community' },
        { label: 'Поддержка', to: '/support' },
      ],
    },
    {
      title: 'ПРОФИЛЬ',
      icon: <CircleUserRound size={16} />,
      home: me,
      routes: ['/profile', '/friends'],
      private: true,
      links: [
        { label: 'Профиль', to: me },
        { label: 'Друзья', to: '/friends' },
        { label: 'Значки', to: '/profile/badges' },
      ],
    },
    // лендинг о проекте со ссылками на скачивание нужен только на сайте
    { title: 'О LUSTRE', icon: <Info size={16} />, home: '/about', routes: ['/about'], links: [], webOnly: true },
  ];
}

const IS_WEB = !(window as { electron?: unknown }).electron;

/** Нижняя строка шапки: «назад/вперёд» и вкладки разделов с меню при наведении. */
export const NavbarBottom = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [hovered, setHovered] = useState<string | null>(null);

  // F5 в лаунчере: в браузере клавиша и так перезагружает страницу
  useEffect(() => {
    if (IS_WEB) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F5') return;
      e.preventDefault();
      window.location.reload();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visible = sections(user?.username).filter((s) => (user || !s.private) && (IS_WEB || !s.webOnly));

  // на страницах вне разделов подсветка остаётся на последнем открытом (по умолчанию — магазин)
  const lastActive = useRef('МАГАЗИН');
  const current = visible.find((s) => s.routes.some((r) => pathname.startsWith(r)));
  if (current) lastActive.current = current.title;
  const active = current?.title ?? lastActive.current;

  return (
    <div className="relative flex h-14 select-none items-center border-b border-[var(--line-2)] bg-[#08040d] px-8 max-md:px-2">
      <div className="relative z-10 flex items-center gap-4 max-md:hidden">
        <button type="button" aria-label="Назад" onClick={() => navigate(-1)} className="cursor-pointer text-[var(--muted)] transition-all hover:text-accent"><ArrowLeft size={20} /></button>
        <button type="button" aria-label="Вперёд" onClick={() => navigate(1)} className="cursor-pointer text-[var(--muted)] transition-all hover:text-accent"><ArrowRight size={20} /></button>
        <button type="button" aria-label="Перезагрузить страницу" title="Перезагрузить страницу (F5)" onClick={() => window.location.reload()} className="group cursor-pointer text-[var(--muted)] transition-all hover:text-accent">
          <RotateCw size={18} className="transition-transform duration-300 group-hover:rotate-90" />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="pointer-events-auto flex items-center border border-[var(--line)] bg-[#0f0a17]">
          {visible.map((s) => (
            <BottomTab
              key={s.title}
              title={s.title}
              icon={s.icon}
              links={s.links}
              active={active === s.title}
              open={hovered === s.title}
              onSelect={() => navigate(s.home)}
              onOpen={() => setHovered(s.title)}
              onClose={() => setHovered(null)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
