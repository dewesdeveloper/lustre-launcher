import { IconCopy, IconX } from '@tabler/icons-react';
import { buildInviteLink } from '../../../api/community';

type InviteModalProps = { name: string; code: string; copied: boolean; onClose: () => void; onCopy: () => void };

/** Окно со ссылкой-приглашением в приватное сообщество (видит только владелец). */
export default function InviteModal({ name, code, copied, onClose, onCopy }: InviteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={onClose}>
      <div role="dialog" aria-modal className="tl-panel w-full max-w-xl p-8" onClick={(e) => e.stopPropagation()}>
        <header className="mb-1 flex items-start justify-between">
          <div>
            <h2 className="text-[20px] text-white">Ссылка-<span className="text-accent">приглашение</span></h2>
            <p className="tl-head tl-muted mt-1.5 text-[10px] font-bold uppercase tracking-[.2em]">{name}</p>
          </div>
          <button type="button" onClick={onClose} className="tl-btn ghost" aria-label="Закрыть"><IconX size={16} /></button>
        </header>
        <p className="tl-term tl-muted mb-5 text-[16px]">
          Приватное сообщество не видно в общем списке. Поделитесь ссылкой с игроками — вступить можно только по ней.
        </p>
        <div className="flex gap-2">
          <input readOnly value={buildInviteLink(code)} onFocus={(e) => e.currentTarget.select()} className="tl-field min-w-0 flex-1" />
          <button type="button" onClick={onCopy} className={`inline-flex shrink-0 cursor-pointer items-center gap-2 ${copied ? 'tl-chip ok' : 'tl-btn'}`}>
            <IconCopy size={14} /> {copied ? 'Готово' : 'Копировать'}
          </button>
        </div>
      </div>
    </div>
  );
}
