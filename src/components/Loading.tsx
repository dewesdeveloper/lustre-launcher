import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Элементы загрузки в стиле лаунчера.
 * Спиннер — тот же, что используется в ProtectedRoute, чтобы загрузка
 * выглядела одинаково во всём приложении.
 */

export function Loading({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`w-full flex flex-col items-center justify-center gap-3.5 py-12 ${className}`}>
      <div className="animate-spin rounded-full h-9 w-9 border-t-2 border-accent" />
      {label ? (
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-pearl/60">{label}</span>
      ) : null}
    </div>
  );
}

/** Компактный спиннер рядом с текстом: кнопки, подписи, статусы. */
export function LoadingInline({ label, size = 13, className = '' }: { label?: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Loader2 size={size} className="animate-spin" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

/** Загрузка вместо целой секции: сохраняет пропорции контента. */
export function LoadingBlock({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`w-full flex flex-col gap-3 py-6 ${className}`} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 rounded-2xl bg-white/[0.02] border border-white/5 animate-pulse" />
      ))}
    </div>
  );
}

/** Кнопка в состоянии ожидания: спиннер вместо текста. */
export function LoadingButton({ children, icon }: { children?: ReactNode; icon?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {icon ?? <Loader2 size={13} className="animate-spin" />}
      {children}
    </span>
  );
}
