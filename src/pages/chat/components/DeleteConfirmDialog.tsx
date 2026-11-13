import { useState } from 'react';

interface DeleteConfirmDialogProps {
  title: string;
  message: string;
  /** Показывать чекбокс «Удалить у всех» (скрыт, когда действие недоступно) */
  showForAll?: boolean;
  defaultForAll?: boolean;
  confirmLabel?: string;
  onConfirm: (forAll: boolean) => void;
  onClose: () => void;
}

/** Подтверждение удаления с чекбоксом «Удалить у всех». */
export const DeleteConfirmDialog = ({
  title, message, showForAll = true, defaultForAll = true, confirmLabel = 'Удалить', onConfirm, onClose,
}: DeleteConfirmDialogProps) => {
  const [forAll, setForAll] = useState(defaultForAll && showForAll);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className="w-[360px] max-w-[92vw] bg-[#0d0a14] border border-[var(--line)] shadow-2xl p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="tl-head text-[11px] uppercase tracking-[0.16em] text-white mb-2">{title}</h3>
        <p className="tl-term text-[13px] tl-muted leading-relaxed mb-3">{message}</p>

        {showForAll && (
          <label className="flex items-center gap-2.5 mb-4 cursor-pointer select-none group/cb">
            <span
              onClick={() => setForAll((v) => !v)}
              className={`w-4 h-4 rounded-none border flex items-center justify-center transition-colors ${
                forAll ? 'bg-accent border-accent' : 'border-[var(--line-2)] bg-[#08050f] group-hover/cb:border-pearl/40'
              }`}
            >
              {forAll && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5.5L4 8L8.5 2" stroke="black" strokeWidth="1.6" strokeLinecap="square" />
                </svg>
              )}
            </span>
            <span onClick={() => setForAll((v) => !v)} className="tl-term text-[13px] text-pearl/85">Удалить у всех</span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 h-8 rounded-none border border-[var(--line)] tl-term text-[13px] text-pearl/70 hover:text-white hover:border-[var(--line-2)] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => onConfirm(forAll)}
            className="px-3 h-8 rounded-none bg-accent hover:brightness-110 tl-term text-[13px] text-black transition-all"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
