import type { ChatConversation } from '../../../api/chat';
import type { GroupSummary } from '../../../api/groups';
import { Users } from 'lucide-react';
import { FALLBACK_AVATAR } from './chatUtils';
import { GROUP_FALLBACK } from '../model';

interface ForwardPickerDialogProps {
  conversations: ChatConversation[];
  groups: GroupSummary[];
  count: number;
  onPick: (targetType: 'dm' | 'group', targetId: number) => void;
  onClose: () => void;
}

/** Выбор цели пересылки: список диалогов и групп. */
export const ForwardPickerDialog = ({
  conversations, groups, count, onPick, onClose,
}: ForwardPickerDialogProps) => (
  <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center" onMouseDown={onClose}>
    <div
      className="w-[360px] max-w-[92vw] max-h-[70vh] bg-[#0d0a14] border border-[var(--line)] shadow-2xl flex flex-col"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="px-4 py-3 border-b border-[var(--line)] flex items-center justify-between">
        <h3 className="tl-head text-[11px] uppercase tracking-[0.16em] text-white">
          Переслать — {count}
        </h3>
        <button onClick={onClose} className="tl-term text-[13px] text-pearl/72 hover:text-white transition-colors">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {conversations.map((c) => (
          <button
            key={`dm-${c.id}`}
            onClick={() => onPick('dm', c.id)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[rgb(var(--accent-rgb)/.12)] transition-colors text-left"
          >
            <img src={c.other_user.avatar_url || FALLBACK_AVATAR} className="w-8 h-8 rounded-none object-cover bg-black border border-[var(--line)]" alt="" />
            <span className="tl-term text-[13px] text-pearl/85 truncate">{c.other_user.display_name || c.other_user.username}</span>
          </button>
        ))}
        {groups.map((g) => (
          <button
            key={`grp-${g.id}`}
            onClick={() => onPick('group', g.id)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[rgb(var(--accent-rgb)/.12)] transition-colors text-left"
          >
            <span className="relative shrink-0">
              <img src={g.avatar_url || GROUP_FALLBACK} className="w-8 h-8 rounded-none object-cover bg-black border border-[var(--line)]" alt="" />
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-none bg-[var(--panel)] border border-[var(--line)] flex items-center justify-center text-pearl/60">
                <Users size={8} />
              </span>
            </span>
            <span className="tl-term text-[13px] text-pearl/85 truncate">{g.name}</span>
          </button>
        ))}
        {conversations.length === 0 && groups.length === 0 && (
          <p className="p-4 tl-term text-[13px] tl-muted text-center">Нет доступных чатов</p>
        )}
      </div>
    </div>
  </div>
);
