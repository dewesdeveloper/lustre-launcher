import { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { softThreatKind } from '../../../api/scanReports';

// Слово, которое нужно ввести вручную (как имя репозитория при удалении на GitHub):
// случайный клик или Enter не должны ставить игру, в которой Защитник нашёл угрозу.
const CONFIRM_WORD = 'Установить';

type Props = {
  gameName: string;
  threats: string[];
  onCancel: () => void;
  onConfirm: () => void;
};

/** Подтверждение установки, когда Защитник Windows нашёл угрозу в скачанных файлах */
export default function ThreatInstallDialog({ gameName, threats, onCancel, onConfirm }: Props) {
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const soft = softThreatKind(threats);
  // жёлтое окно: PUA или известные ложные срабатывания на кряки — без галочки и ввода слова
  const pua = soft !== null;
  const ready = pua || (understood && typed.trim() === CONFIRM_WORD);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="threat-title"
        className={`w-full max-w-[460px] select-none border bg-[var(--panel)] ${pua ? 'border-amber-400/60 shadow-[0_0_36px_rgba(251,191,36,.22)]' : 'border-red-500/50 shadow-[0_0_36px_rgba(239,68,68,.25)]'}`}
        onClick={(e) => e.stopPropagation()}
        // слово нужно набрать руками: текст окна нельзя выделить, скопировать, вырезать или перетащить
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex gap-4 p-6">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center border ${pua ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-red-500/50 bg-red-500/10 text-red-400'}`}>
            <ShieldAlert size={20} />
          </span>
          <div className="min-w-0">
            <h3 id="threat-title" className="tl-head text-[11px] font-bold uppercase tracking-[0.15em] text-white">
              {soft === 'pua' ? 'Защитник Windows нашёл нежелательную программу' : soft === 'likely-fp' ? 'Защитник Windows отметил файлы кряка' : 'Защитник Windows нашёл угрозу'}
            </h3>
            <p className="tl-term mt-1.5 text-[15px] leading-relaxed text-pearl/75">
              В скачанных файлах игры «{gameName}» обнаружено:{' '}
              <span className={`break-words ${pua ? 'text-amber-300' : 'text-red-300'}`}>{threats.length ? threats.join(', ') : 'угроза без названия'}</span>.
            </p>
            {soft === 'pua' && (
              <p className="tl-term mt-2 text-[14px] leading-relaxed text-amber-200/80">
                PUA — не вирус: так Защитник отмечает упаковщики и утилиты, которыми часто собраны кряки и установщики репаков.
              </p>
            )}
            {soft === 'likely-fp' && (
              <p className="tl-term mt-2 text-[14px] leading-relaxed text-amber-200/80">
                Скорее всего, это ложное срабатывание: эвристика Защитника (метка «!rfn») часто отмечает кряки,
                которые подменяют файлы Steam. Если Защитник удалит файл после установки, игра может не запуститься.
              </p>
            )}
            <p className="tl-term mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
              Файлы не удалены и не помещены в карантин. Антивирусы иногда ошибаются на репаках, но устанавливайте игру,
              только если доверяете источнику.
            </p>
          </div>
        </div>

        {!pua && <div className="space-y-3 border-t border-[var(--line)] px-6 py-4">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => { setUnderstood(e.target.checked); if (e.target.checked) setTimeout(() => inputRef.current?.focus(), 0); }}
              className="tl-check mt-1"
            />
            <span className="tl-term text-[14px] leading-snug text-pearl/85">
              Я понимаю риск и устанавливаю игру под свою ответственность
            </span>
          </label>
          <div>
            <label htmlFor="threat-confirm" className="tl-term mb-1.5 block text-[14px] text-[var(--muted)]">
              Чтобы продолжить, введите <span className="font-bold text-white">{CONFIRM_WORD}</span>
            </label>
            <input
              id="threat-confirm"
              ref={inputRef}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && ready) onConfirm(); }}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              disabled={!understood}
              autoComplete="off"
              spellCheck={false}
              className="tl-field w-full disabled:opacity-40"
            />
          </div>
        </div>}

        <div className="flex gap-2 px-6 pb-6">
          <button type="button" onClick={onCancel} className="tl-btn ghost flex-1 justify-center">Отмена</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready}
            className={`tl-btn flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-35 ${pua ? 'solid' : 'border-red-500/60 bg-red-600 text-white hover:bg-red-500 disabled:hover:bg-red-600'}`}
          >
            Установить
          </button>
        </div>
      </div>
    </div>
  );
}
