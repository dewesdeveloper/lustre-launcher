import type { ReactNode } from 'react';

type TooltipProps = {
  children: ReactNode;
  /** Основная строка подсказки. */
  label: ReactNode;
  /** Второстепенная строка (мелким шрифтом). */
  hint?: ReactNode;
  /** Сторона появления относительно элемента. */
  side?: 'bottom' | 'top';
  /** Выравнивание по горизонтали, чтобы тултип не уезжал за окно. */
  align?: 'center' | 'left' | 'right';
  className?: string;
};

/**
 * Всплывающая подсказка в стиле лаунчера: тёмная карточка,
 * жирная первая строка и приглушённая вторая.
 * Показ сделан на чистом CSS (group-hover), поэтому не требует состояния
 * и не вызывает перерисовок при движении мыши.
 */
export default function Tooltip({
  children, label, hint, side = 'bottom', align = 'center', className = '',
}: TooltipProps) {
  const pos = side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2';
  const alignCls =
    align === 'center' ? 'left-1/2 -translate-x-1/2' : align === 'left' ? 'left-0' : 'right-0';

  return (
    <span className={`relative inline-flex group/tip ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${pos} ${alignCls} z-[200] w-max max-w-[240px] rounded-xl border border-white/10 bg-[#0b0b0e] px-3 py-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)] opacity-0 translate-y-[-2px] group-hover/tip:opacity-100 group-hover/tip:translate-y-0 transition-all duration-150 delay-200`}
      >
        <span className="block text-[12px] font-black text-pearl leading-tight">{label}</span>
        {hint ? <span className="block text-[10px] font-bold text-pearl/70 leading-tight mt-1">{hint}</span> : null}
      </span>
    </span>
  );
}
