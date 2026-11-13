import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps {
  value: string | number;
  options: SelectOption[];
  onChange: (value: any) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  panelClassName?: string;
  disabled?: boolean;
  title?: string;
}

const PANEL_MAX_H = 288; // max-h-72
const GAP = 8;

/**
 * Стилизованный выпадающий список (замена нативного <select>, который в Electron
 * рисует системное окно и не поддаётся оформлению).
 *
 * Панель рисуется поверх страницы (портал в body, fixed-позиция по кнопке): внутри
 * модальных окон с прокруткой она раньше обрезалась, а длинные пункты давали
 * горизонтальную полосу. Если снизу места мало, панель открывается вверх.
 */
const Select = ({
  value,
  options,
  onChange,
  placeholder = 'Выбрать...',
  className = '',
  buttonClassName = '',
  panelClassName = '',
  disabled = false,
  title,
}: SelectProps) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Позиция панели по кнопке: ниже или выше, в пределах окна
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - GAP * 2;
    const above = r.top - GAP * 2;
    const up = below < Math.min(PANEL_MAX_H, 180) && above > below;
    const room = Math.max(120, Math.min(PANEL_MAX_H, up ? above : below));
    // Панель ровно по ширине поля и не шире окна: длинные пункты сокращаются
    // многоточием (полный текст — во всплывающей подсказке)
    const width = Math.min(r.width, window.innerWidth - GAP * 2);
    const left = Math.max(GAP, Math.min(r.left, window.innerWidth - width - GAP));
    setPos({
      position: 'fixed',
      left,
      width,
      maxHeight: room,
      ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
    });
  };

  useLayoutEffect(() => {
    if (open) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // прокрутка списка внутри панели её не двигает; прокрутка страницы/модалки — пересчёт позиции
    const onScroll = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) place(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', place);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const current = options.find((o) => String(o.value) === String(value));

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        title={title}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-3 bg-black/55 border rounded-2xl px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.15em] text-pearl/75 cursor-pointer transition-all outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
          open ? 'border-accent/40 text-pearl bg-black/70' : 'border-white/10 hover:border-accent/30'
        } ${buttonClassName}`}
      >
        <span className="truncate">{current ? current.label : placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-pearl/60 transition-transform ${open ? 'rotate-180 text-accent' : ''}`} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -6, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              style={pos}
              className={`z-[1000] rounded-2xl bg-[#0c0c0c]/95 backdrop-blur-3xl border border-white/10 shadow-[0_25px_50px_rgba(0,0,0,0.9)] py-1.5 overflow-y-auto overflow-x-hidden custom-scrollbar ${panelClassName}`}
            >
              {options.length === 0 ? (
                <p className="px-4 py-3 text-[11px] text-pearl/60">Нет вариантов</p>
              ) : (
                options.map((o) => {
                  const active = String(o.value) === String(value);
                  return (
                    <button
                      key={String(o.value)}
                      type="button"
                      title={o.label}
                      onClick={() => { onChange(o.value); setOpen(false); }}
                      className={`w-full px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-left flex items-center justify-between gap-3 whitespace-nowrap transition-all cursor-pointer ${
                        active ? 'text-accent bg-accent/10' : 'text-pearl/70 hover:text-white hover:bg-violet/10'
                      }`}
                    >
                      <span className="truncate min-w-0">{o.label}</span>
                      {active && <Check size={14} className="shrink-0" />}
                    </button>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default Select;
