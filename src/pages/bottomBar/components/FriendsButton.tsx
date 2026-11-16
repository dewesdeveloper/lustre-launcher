import { IconUsers } from '@tabler/icons-react';

interface FriendsButtonProps {
  onClick: () => void;
}

export const FriendsButton = ({ onClick }: FriendsButtonProps) => (
  <div className="flex shrink-0 items-center gap-4 whitespace-nowrap">
    <button
      onClick={onClick}
      title="Друзья и чат"
      className="flex items-center gap-2 text-[14px] hover:text-pearl transition-colors"
    >
      <span className="max-lg:hidden">Друзья и чат</span>
      <IconUsers size={14} />
    </button>
  </div>
);
