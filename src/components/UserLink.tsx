import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAvatarHover } from './UserAvatarHover';

interface UserLinkProps {
  /** логин пользователя; без него — обычный текст (аноним, удалённый аккаунт) */
  username?: string;
  children: ReactNode;
  className?: string;
  /** при наведении показать минипрофиль (по умолчанию — да) */
  hoverCard?: boolean;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Ник или аватар пользователя, по клику — его профиль. Раньше имена в сообществах, поддержке,
 * голосовом чате и модерации были просто текстом. Клик не всплывает: внутри кликабельной
 * карточки (пост, обсуждение) открывается профиль, а не сама карточка.
 */
export default function UserLink({ username, children, className = '', hoverCard = true, displayName, avatarUrl }: UserLinkProps) {
  const navigate = useNavigate();
  if (!username) return <>{children}</>;

  const open = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/profile/${encodeURIComponent(username)}`);
  };

  const link = (
    <span
      role="link"
      tabIndex={0}
      title="Открыть профиль"
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open(e); }}
      className={`cursor-pointer underline-offset-2 hover:underline ${className}`}
    >
      {children}
    </span>
  );

  if (!hoverCard) return link;
  return (
    <UserAvatarHover username={username} displayName={displayName} avatarUrl={avatarUrl}>
      {link}
    </UserAvatarHover>
  );
}
