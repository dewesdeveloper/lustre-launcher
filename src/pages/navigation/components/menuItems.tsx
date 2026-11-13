import type { ReactNode } from 'react';
import {
  FileText, Gamepad2, Info, LifeBuoy, Library, LogOut, Plus, Scale, Settings, Shield,
  ShieldAlert, ShieldCheck, Store, User, UserPlus, Users, WifiOff, X,
} from 'lucide-react';
import { hasAdmin } from '../../../admin';

export type MenuItem = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  /** переключатель: checked — состояние, disabled — недоступен */
  toggle?: boolean;
  checked?: boolean;
  disabled?: boolean;
};

/** Пункт меню или разделитель */
export type MenuEntry = MenuItem | 'sep';

export type OfflineMenuState = { manualOffline: boolean; disabled: boolean; onToggle: () => void };

type Go = (path: string) => void;

type ElectronBridge = { openSettings?: () => void; openAccountPicker?: (add: boolean) => void; quitApp?: () => void };
const bridge = (): ElectronBridge | undefined => (window as { electron?: ElectronBridge }).electron;

/** Ссылки верхней панели лаунчера (кроме «Справки» — у неё своё меню) */
export const TOP_LINKS: { label: string; hint: string; to: string }[] = [
  { label: 'Вид', hint: 'Темы, рамки, баннеры', to: '/appearance' },
  { label: 'Друзья', hint: 'Список и заявки', to: '/friends' },
  { label: 'Игры', hint: 'Магазин игр', to: '/store' },
];

const offlineSwitch = (o: OfflineMenuState): MenuItem => ({
  label: 'Автономный режим', icon: <WifiOff size={14} />, onClick: o.onToggle, toggle: true, checked: o.manualOffline, disabled: o.disabled,
});

/** Смена аккаунта: в лаунчере — окно выбора аккаунтов, на сайте — страница входа */
const switchAccount = (go: Go): MenuItem => ({
  label: 'Сменить аккаунт',
  icon: <UserPlus size={14} />,
  onClick: () => {
    const b = bridge();
    if (b) b.openAccountPicker?.(true);
    else go('/login');
  },
});

const signOut = (logout: () => void): MenuItem => ({ label: 'Выйти', icon: <LogOut size={14} />, onClick: logout, danger: true });

/** Поддержка и правовые документы */
export const helpMenu = (go: Go): MenuItem[] => [
  { label: 'Служба поддержки', icon: <LifeBuoy size={14} />, onClick: () => go('/support') },
  { label: 'Политика конфиденциальности', icon: <Shield size={14} />, onClick: () => go('/privacy') },
  { label: 'Правовая информация', icon: <Scale size={14} />, onClick: () => go('/legal') },
  { label: 'Соглашение подписчика', icon: <FileText size={14} />, onClick: () => go('/subscriber-agreement') },
];

export type MenuRoles = { staff: boolean; admin: boolean; moderator: boolean };

/** Главное меню под логотипом: разделы, служебные страницы по ролям, настройки и выход */
export function logoMenu(go: Go, logout: () => void, offline: OfflineMenuState, roles: MenuRoles): MenuEntry[] {
  const b = bridge();
  const entries: MenuEntry[] = [
    { label: 'Магазин', icon: <Store size={14} />, onClick: () => go('/store') },
    { label: 'Библиотека', icon: <Library size={14} />, onClick: () => go('/library') },
    { label: 'Друзья', icon: <Users size={14} />, onClick: () => go('/friends') },
  ];
  if (roles.moderator) entries.push({ label: 'Модерация', icon: <ShieldAlert size={14} />, onClick: () => go('/moderation') });
  if (roles.staff) entries.push({ label: 'Тикеты поддержки', icon: <ShieldCheck size={14} />, onClick: () => go('/support/manage') });
  // страницы закрытого модуля администрирования — только если он есть в сборке
  if (roles.staff && hasAdmin) {
    entries.push(
      { label: 'Все игры', icon: <Gamepad2 size={14} />, onClick: () => go('/admin/games') },
      { label: 'Добавить игру', icon: <Plus size={14} />, onClick: () => go('/add-game') },
      { label: 'Управление магазином', icon: <Store size={14} />, onClick: () => go('/admin-shop') },
    );
  }
  if (roles.admin && hasAdmin) entries.push({ label: 'Админ-панель', icon: <ShieldCheck size={14} />, onClick: () => go('/admin') });

  entries.push(
    'sep',
    // в лаунчере настройки открываются отдельным окном
    { label: 'Настройки', icon: <Settings size={14} />, onClick: () => (b ? b.openSettings?.() : go('/settings')) },
    offlineSwitch(offline),
    'sep',
    switchAccount(go),
    signOut(logout),
  );
  // закрыть приложение можно только в лаунчере
  if (b) entries.push({ label: 'Выход', icon: <X size={14} />, onClick: () => b.quitApp?.(), danger: true });
  return entries;
}

/** Меню профиля; на сайте «Справки» в шапке нет, поэтому её пункты и «О Lustre» переезжают сюда */
export function profileMenu(username: string | undefined, go: Go, logout: () => void, offline: OfflineMenuState): MenuEntry[] {
  const entries: MenuEntry[] = [
    { label: 'Профиль', icon: <User size={14} />, onClick: () => username && go(`/profile/${username}`) },
    { label: 'Настройки', icon: <Settings size={14} />, onClick: () => go('/profile/edit') },
    offlineSwitch(offline),
    'sep',
    switchAccount(go),
    signOut(logout),
  ];
  if (!bridge()) entries.push('sep', ...helpMenu(go), { label: 'О Lustre', icon: <Info size={14} />, onClick: () => go('/about') });
  return entries;
}
