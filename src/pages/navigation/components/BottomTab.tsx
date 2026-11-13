import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

/** Пункт выпадающего меню раздела; divider — черта над пунктом */
export type SectionLink = { label: string; to: string; divider?: boolean };

type BottomTabProps = {
  title: string;
  icon: ReactNode;
  active: boolean;
  open: boolean;
  links: SectionLink[];
  onSelect: () => void;
  onOpen: () => void;
  onClose: () => void;
};

/** Меню раздела, раскрывающееся при наведении на вкладку */
function SectionMenu({ links }: { links: SectionLink[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, rotateX: -15, scale: 0.9, transformOrigin: 'top' }}
      animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      exit={{ opacity: 0, y: -5, rotateX: -10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="absolute left-1/2 top-full z-[100] w-60 -translate-x-1/2 pt-2"
    >
      <nav className="flex flex-col overflow-hidden border border-[var(--line-2)] bg-[var(--panel)] py-2 shadow-[0_0_28px_rgb(var(--accent-rgb)/.3)]">
        {/* мелкая сетка на фоне меню */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.05] bg-[linear-gradient(rgb(var(--accent-rgb)/0.4)_1px,transparent_1px),linear-gradient(90deg,rgb(var(--accent-rgb)/0.4)_1px,transparent_1px)] [background-size:10px_10px]" />
        {links.map((l, i) => (
          <motion.div key={l.label} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.2 }}>
            {l.divider && <div className="mx-3 my-1.5 h-[1px] bg-white/5" />}
            <Link
              to={l.to}
              onClick={(e) => e.stopPropagation()}
              className="group/item tl-head flex items-center justify-between px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] transition-all hover:bg-accent/10 hover:text-white"
            >
              <span className="transition-transform duration-300 group-hover/item:translate-x-1">{l.label}</span>
              <span className="h-1.5 w-1.5 scale-0 bg-accent opacity-0 shadow-[0_0_10px_rgb(var(--accent-rgb)_/_0.8)] transition-all duration-300 group-hover/item:scale-100 group-hover/item:opacity-100" />
            </Link>
          </motion.div>
        ))}
      </nav>
    </motion.div>
  );
}

/** Вкладка нижней строки навигации: клик — на главную раздела, наведение — меню раздела. */
export const BottomTab = ({ title, icon, active, open, links, onSelect, onOpen, onClose }: BottomTabProps) => (
  <div onMouseEnter={onOpen} onMouseLeave={onClose} className="group relative">
    <button
      type="button"
      onClick={onSelect}
      className={`tl-head flex cursor-pointer items-center gap-2 border-l border-[var(--line)] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-all duration-150 first:border-l-0 ${active
        ? 'bg-accent/15 text-accent shadow-[inset_0_-2px_0_var(--pink)]'
        : 'text-[var(--muted)] hover:bg-accent/[0.07] hover:text-white'}`}
    >
      <span className={active ? 'text-accent' : 'text-accent/70 group-hover:text-accent'}>{icon}</span>
      <span className="hidden sm:block">{title}</span>
      {links.length > 0 && <ChevronDown size={13} className={`transition-transform duration-300 ${open ? 'rotate-180' : 'opacity-50'}`} />}
    </button>
    <AnimatePresence>{open && links.length > 0 && <SectionMenu links={links} />}</AnimatePresence>
  </div>
);
