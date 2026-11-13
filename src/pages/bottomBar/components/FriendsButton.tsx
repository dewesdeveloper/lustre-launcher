import { IconUsers } from '@tabler/icons-react';

interface FriendsButtonProps {
  onClick: () => void;
}

export const FriendsButton = ({ onClick }: FriendsButtonProps) => (
  <div className="flex items-center gap-4">
    <button
      onClick={onClick}
      className="flex items-center gap-2 text-[14px] hover:text-pearl transition-colors"
    >
      <span>Друзья и чат</span>
      <IconUsers size={14} />
    </button>
  </div>
);
