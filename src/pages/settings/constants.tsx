import {
  User, Shield, Bell, Monitor, Store, Library,
  Cloud, Gamepad2, Headphones, EyeOff, Image,
} from 'lucide-react';

export type Tab = 'account' | 'security' | 'privacy' | 'notifications' | 'interface' | 'background' | 'store' | 'library' | 'cloud' | 'ingame' | 'audio';

export const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'account', label: 'Аккаунт', icon: <User size={18} /> },
  { id: 'security', label: 'Безопасность', icon: <Shield size={18} /> },
  { id: 'privacy', label: 'Приватность', icon: <EyeOff size={18} /> },
  { id: 'notifications', label: 'Уведомления', icon: <Bell size={18} /> },
  { id: 'interface', label: 'Интерфейс', icon: <Monitor size={18} /> },
  { id: 'background', label: 'Фон лаунчера', icon: <Image size={18} /> },
  { id: 'store', label: 'Магазин', icon: <Store size={18} /> },
  { id: 'library', label: 'Библиотека', icon: <Library size={18} /> },
  { id: 'cloud', label: 'Хранилище', icon: <Cloud size={18} /> },
  { id: 'ingame', label: 'В игре', icon: <Gamepad2 size={18} /> },
  { id: 'audio', label: 'Голос', icon: <Headphones size={18} /> },
];
