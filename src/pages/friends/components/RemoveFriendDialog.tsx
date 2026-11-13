import { IconX, IconAlertTriangle } from '@tabler/icons-react';

interface RemoveFriendDialogProps {
  friendName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const RemoveFriendDialog = ({ friendName, onConfirm, onClose }: RemoveFriendDialogProps) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-in fade-in duration-200 p-4">
    <div className="tl-panel tl-danger w-full max-w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)]">
        <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.18em] text-white">Удалить друга</h3>
        <button onClick={onClose} className="text-[var(--muted)] hover:text-white transition-colors">
          <IconX size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="p-8">
        <div className="flex justify-center mb-4" style={{ color: 'var(--pink)' }}>
          <IconAlertTriangle size={48} />
        </div>
        <p className="text-center tl-term text-[16px] leading-relaxed" style={{ color: 'rgba(247,233,243,.85)' }}>
          Вы уверены, что хотите удалить <span className="font-bold" style={{ color: 'var(--pink)' }}>{friendName}</span> из списка друзей?
        </p>
      </div>

      {/* Footer / Actions */}
      <div className="px-6 py-4 flex gap-3 border-t border-[var(--line)]">
        <button
          onClick={onConfirm}
          className="tl-btn danger flex-1"
        >
          УДАЛИТЬ ДРУГА
        </button>
        <button
          onClick={onClose}
          className="tl-btn ghost flex-1"
        >
          ОТМЕНИТЬ
        </button>
      </div>
    </div>
  </div>
);
