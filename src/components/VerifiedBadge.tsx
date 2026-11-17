import { BadgeCheck } from 'lucide-react';

/**
 * Галочка официального аккаунта или сообщества (команда Lustre, разработчики, партнёры).
 * Ставит администратор; значок — рядом с именем, одинаково во всём приложении.
 */
export default function VerifiedBadge({ kind = 'user', size = 14, className = '' }: {
  kind?: 'user' | 'community';
  size?: number;
  className?: string;
}) {
  const title = kind === 'community' ? 'Официальное сообщество Lustre' : 'Официальный аккаунт Lustre';
  return (
    <span title={title} aria-label={title} role="img" className={`inline-flex shrink-0 items-center align-middle text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,.55)] ${className}`}>
      <BadgeCheck size={size} strokeWidth={2.4} />
    </span>
  );
}
