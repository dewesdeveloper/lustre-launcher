import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';
import { SELECT_BUTTON_IDLE, SELECT_BUTTON_OPEN, SELECT_PANEL } from '../../../../components/ui/Select';

// Поле «Разработчик или издатель»: ввод вручную с подсказками. Выглядит как выпадающие списки
// каталога (язык): раньше подсказки показывал системный список браузера (datalist).

const FIELD =
  'w-full bg-[#08050f] border pl-3.5 pr-14 py-2.5 tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-white outline-none transition-colors placeholder:text-[var(--muted)] placeholder:normal-case placeholder:tracking-normal placeholder:font-normal placeholder:text-[12px]';
const PANEL_MAX_H = 288;
const GAP = 8;
const ROW =
  'w-full px-3 py-2 border-l-2 tl-head text-[10px] font-bold uppercase tracking-[0.1em] text-left flex items-center justify-between gap-3 whitespace-nowrap transition-colors cursor-pointer';

export default function DeveloperInput({ value, options, onChange }: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  // Панель — поверх страницы (портал, fixed по полю), как у выпадающего списка языков:
  // внутри колонки фильтров она раздвигала панель. Снизу мало места — открываем вверх.
  const posFor = (): CSSProperties | null => {
    const el = wrap.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP * 2;
    const above = r.top - GAP * 2;
    const up = below < Math.min(PANEL_MAX_H, 180) && above > below;
    const room = Math.max(120, Math.min(PANEL_MAX_H, up ? above : below));
    const width = Math.min(r.width, window.innerWidth - GAP * 2);
    const left = Math.max(GAP, Math.min(r.left, window.innerWidth - width - GAP));
    return { position: 'fixed', left, width, maxHeight: room, ...(up ? { bottom: window.innerHeight - r.top + GAP, top: 'auto' } : { top: r.bottom + GAP, bottom: 'auto' }) };
  };
  const place = () => { const p = posFor(); if (p) setPos(p); };
  // при прокрутке двигаем панель напрямую, в кадре отрисовки — через состояние React она отставала
  const frame = useRef(0);
  const follow = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const p = posFor();
      const el = panel.current;
      if (!p || !el) return;
      for (const [k, v] of Object.entries(p)) (el.style as any)[k] = typeof v === 'number' ? `${v}px` : v;
    });
    // прокрутка закончилась — сохраняем позицию в состоянии, чтобы перерисовка (ввод) не вернула старую
    clearTimeout(sync.current);
    sync.current = setTimeout(place, 150);
  };
  const sync = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? options.filter((d) => d.toLowerCase().includes(q)) : options;
    return list.slice(0, 200);
  }, [value, options]);

  useEffect(() => setActive(0), [value]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    // прокрутка самой панели её не двигает; прокрутка страницы — пересчёт позиции
    const onScroll = (e: Event) => { if (!panel.current?.contains(e.target as Node)) follow(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', follow);
    return () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(sync.current);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', follow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (d: string) => { onChange(d); setOpen(false); };

  return (
    <div ref={wrap} className="relative">
      <input
        ref={input}
        value={value}
        placeholder="Начните вводить…"
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setOpen(false); return; }
          if (!shown.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && open) { e.preventDefault(); pick(shown[active] ?? shown[0]); }
        }}
        className={`${FIELD} ${open ? SELECT_BUTTON_OPEN : SELECT_BUTTON_IDLE}`}
        aria-expanded={open}
        aria-autocomplete="list"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value && (
          <button type="button" onClick={() => { onChange(''); input.current?.focus(); }} className="p-0.5 text-[var(--muted)] hover:text-white" aria-label="Очистить" title="Очистить">
            <X size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={() => { setOpen((o) => !o); input.current?.focus(); }}
          className="p-0.5 text-[var(--muted)] hover:text-white"
          aria-label="Показать список"
        >
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180 text-accent' : ''}`} />
        </button>
      </div>

      {open && pos && createPortal(
        <div ref={panel} style={pos} className={`z-[1000] overflow-y-auto overflow-x-hidden p-1 custom-scrollbar ${SELECT_PANEL}`}>
          {shown.length === 0 ? (
            <p className="px-3 py-2.5 tl-term text-[14px] text-[var(--muted)]">Ничего не найдено</p>
          ) : (
            shown.map((d, i) => {
              const selected = d === value;
              return (
                <button
                  key={d}
                  type="button"
                  title={d}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()} // не терять фокус поля
                  onClick={() => pick(d)}
                  className={`${ROW} ${selected || i === active
                    ? 'text-accent bg-accent/10 border-[var(--pink)]'
                    : 'text-pearl/70 border-transparent hover:text-white hover:bg-[rgb(var(--accent-rgb)/.08)] hover:border-[var(--pink)]'}`}
                >
                  <span className="min-w-0 truncate">{d}</span>
                  {selected && <Check size={14} className="shrink-0" />}
                </button>
              );
            })
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
