import { IconCrown } from '@tabler/icons-react';

/** Ник подписчика Pro — градиентом (фиолетовый → розовый), одинаково во всём приложении */
export const PRO_NICK_CLASS = 'bg-gradient-to-r from-violet to-accent bg-clip-text text-transparent';

const LOOK = 'inline-flex items-center align-middle whitespace-nowrap select-none tl-head font-bold uppercase text-amber-300 '
  + 'bg-amber-400/10 border border-amber-400/45 shadow-[0_0_10px_rgba(251,191,36,0.20)]';

const SIZE = {
  // рядом с ником в профиле
  md: { box: 'gap-1.5 px-2 py-[3px] text-[10px] tracking-[0.2em]', icon: 11 },
  // компактные списки: комментарии, друзья, активность
  sm: { box: 'gap-1 px-1.5 py-[2px] text-[10px] tracking-[0.14em]', icon: 8 },
};

/** Золотая плашка «Pro» подписчика Lustre Pro */
export default function ProBadge({ size = 'sm', className = '' }: { size?: 'sm' | 'md'; className?: string }) {
  const s = SIZE[size];
  return (
    <span title="Lustre Pro" className={`${LOOK} ${s.box} ${className}`}>
      <IconCrown size={s.icon} strokeWidth={2.4} />
      Pro
    </span>
  );
}
