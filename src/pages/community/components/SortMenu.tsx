import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { sortOptions } from '../constants';
import type { SortOption } from '../types';

/** Выпадающий выбор сортировки списка сообществ; закрывается кликом мимо */
export default function SortMenu({ value, onChange }: { value: SortOption; onChange: (v: SortOption) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const selected = sortOptions.find((o) => o.id === value) ?? sortOptions[0];
  const choose = (id: SortOption) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={box} className="relative">
      <button type="button" className="tl-btn ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {selected.label}
        <IconChevronDown size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" className="tl-panel absolute left-0 top-full z-30 mt-2 w-56 overflow-hidden py-2">
          {sortOptions.map((o) => {
            const active = o.id === value;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(o.id)}
                  className={`tl-head flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[10px] font-bold uppercase transition-colors ${active ? 'text-accent' : 'text-[var(--muted)] hover:text-white'}`}
                >
                  {o.label}
                  {active && <IconCheck size={12} className="shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
