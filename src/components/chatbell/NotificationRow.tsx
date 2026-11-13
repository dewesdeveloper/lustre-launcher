import type { ReactNode } from 'react';

export const avatarUrl = (u: { avatar_url?: string; username?: string }) =>
  u?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u?.username || 'User'}`;

export const Avatar = ({ src, size = 'w-8 h-8' }: { src: string; size?: string }) => (
  <img src={src} alt="" className={`${size} rounded-lg object-cover bg-black/40 border border-white/10 shrink-0`} draggable={false} />
);

interface NotificationRowProps {
  onClick?: () => void;
  className: string;
  children: ReactNode;
}

export const NotificationRow = ({ onClick, className, children }: NotificationRowProps) => {
  if (onClick) {
    return <button onClick={onClick} className={className}>{children}</button>;
  }
  return <div className={className}>{children}</div>;
};
