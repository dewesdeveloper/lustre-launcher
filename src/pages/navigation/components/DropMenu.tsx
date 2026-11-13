import { motion } from 'framer-motion';
import type { MenuEntry, MenuItem } from './menuItems';
import { itemVariants, wrapperVariants } from './menuMotion';

const ROW = 'flex items-center gap-3 px-3 py-2 rounded-none border-l-2 border-transparent text-[11px] font-bold uppercase tracking-wider transition-all';
const ROW_HOVER = 'hover:bg-[rgb(var(--accent-rgb)/.08)] hover:border-[var(--pink)] hover:text-white';

/** Пункт-переключатель (например «Автономный режим»): меню после клика не закрывается */
function SwitchRow({ item }: { item: MenuItem }) {
  const off = !!item.disabled;
  return (
    <motion.li
      variants={itemVariants}
      onClick={() => !off && item.onClick()}
      className={`${ROW} text-pearl/60 ${off ? 'cursor-not-allowed' : `${ROW_HOVER} cursor-pointer`}`}
    >
      <span className={off ? 'text-pearl/60' : 'text-violet'}>{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      <span className={`relative h-4 w-8 shrink-0 rounded-full transition-all ${item.checked ? 'bg-accent' : 'bg-white/10'}`}>
        <span className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${item.checked ? 'translate-x-4' : ''}`} />
      </span>
    </motion.li>
  );
}

function ActionRow({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  return (
    <motion.li
      variants={itemVariants}
      onClick={() => { item.onClick(); onDone(); }}
      className={`${ROW} cursor-pointer ${item.danger ? 'text-red-400 hover:bg-red-500/10 hover:border-red-400' : `text-pearl/60 ${ROW_HOVER}`}`}
    >
      <span className={item.danger ? 'text-red-400' : 'text-violet'}>{item.icon}</span>
      <span>{item.label}</span>
    </motion.li>
  );
}

type DropMenuProps = {
  open: boolean;
  entries: MenuEntry[];
  onClose: () => void;
  /** положение, ширина и слой: например 'left-0 mt-2 w-60 z-[120]' */
  place: string;
};

/** Выпадающий список пунктов шапки: действия, переключатели и разделители. */
export function DropMenu({ open, entries, onClose, place }: DropMenuProps) {
  return (
    <motion.ul
      initial="closed"
      animate={open ? 'open' : 'closed'}
      variants={wrapperVariants}
      style={{ originY: 'top' }}
      className={`absolute top-full flex flex-col gap-0.5 overflow-hidden border border-[var(--line-2)] bg-[var(--panel)] p-1.5 shadow-[0_0_24px_rgb(var(--accent-rgb)/.25)] ${place} ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
    >
      {entries.map((e, i) => (e === 'sep'
        ? <div key={`sep-${i}`} className="my-1 h-px bg-white/5" />
        : e.toggle ? <SwitchRow key={e.label} item={e} /> : <ActionRow key={e.label} item={e} onDone={onClose} />))}
    </motion.ul>
  );
}
