import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Folder, Loader2, ShieldCheck, Trophy, X } from 'lucide-react';

export type CrackOption = { id: string; label: string; path: string; kind: 'dir' | 'archive' };

const shortPath = (p: string) => {
  const parts = p.split(/[\\/]/);
  return parts.length > 3 ? '…\\' + parts.slice(-3).join('\\') : p;
};

/**
 * В раздаче нашлось несколько кряков (например, RUNE и FLT): игрок выбирает, какой поставить.
 * RUNE — первым и с пометкой: с ним в лаунчере работают достижения.
 */
export default function CrackChoiceDialog({ gameName, options, onPick, onClose }: {
  gameName: string;
  options: CrackOption[];
  onPick: (option: CrackOption) => Promise<string | void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(options[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const pick = async () => {
    const opt = options.find((o) => o.id === selected);
    if (!opt) return;
    setBusy(true);
    setError('');
    const err = await onPick(opt);
    setBusy(false);
    if (err) setError(err);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crack-choice-title"
        className="w-full max-w-[520px] border border-[var(--line-2)] bg-[var(--panel)] shadow-[0_0_36px_rgb(var(--accent-rgb)/.25)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 p-6 pb-3">
          <div className="flex gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.1)] text-accent">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h3 id="crack-choice-title" className="tl-head text-[11px] font-bold uppercase tracking-[0.15em] text-white">Найдено несколько кряков</h3>
              <p className="tl-term mt-1.5 text-[15px] leading-relaxed text-pearl/75">
                В раздаче «{gameName}» лежат разные кряки. Игра без кряка откроет Steam — выберите, какой поставить.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Закрыть" className="tl-btn ghost"><X size={14} /></button>
        </header>

        <ul className="space-y-2 px-6">
          {options.map((o, i) => {
            const active = o.id === selected;
            const rune = /^rune$/i.test(o.label);
            return (
              <li key={o.id}>
                <label className={`flex cursor-pointer items-center gap-3 border p-3 transition-colors ${active ? 'border-[var(--pink)] bg-[rgb(var(--accent-rgb)/.08)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}>
                  <input type="radio" name="crack" className="tl-check" checked={active} onChange={() => setSelected(o.id)} />
                  {o.kind === 'archive' ? <Archive size={16} className="shrink-0 text-[var(--muted)]" /> : <Folder size={16} className="shrink-0 text-[var(--muted)]" />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 tl-head text-[11px] font-bold uppercase tracking-[0.12em] text-white">
                      {o.label}
                      {rune && <span className="inline-flex items-center gap-1 text-[10px] text-amber-300"><Trophy size={11} /> достижения</span>}
                      {i === 0 && <span className="text-[10px] text-accent">рекомендуем</span>}
                    </span>
                    <span className="block truncate tl-term text-[13px] text-[var(--muted)]" title={o.path}>{shortPath(o.path)}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="tl-term px-6 pt-3 text-[13px] leading-relaxed text-[var(--muted-2)]">
          Если версии игры одинаковые, разницы почти нет. С RUNE лаунчер показывает открытые достижения.
          Заменённые файлы игры сохраняются в папке .lustre-original.
        </p>
        {error && <p className="tl-term px-6 pt-2 text-[14px] text-[#ff5b8a]">{error}</p>}

        <div className="flex gap-2 p-6 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className="tl-btn ghost flex-1 justify-center">Позже</button>
          <button type="button" onClick={pick} disabled={busy || !selected} className="tl-btn solid flex-1 justify-center">
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Поставить кряк
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
