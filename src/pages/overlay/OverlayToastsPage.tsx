import { useEffect, useRef, useState } from 'react';
import { Bell, Camera, Gamepad2, Keyboard, MessageSquare, Phone, Trophy, UserPlus, Users, X } from 'lucide-react';
import { useTransparentBackground } from './OverlayPage';

type ToastKind = 'hint' | 'notify' | 'screenshot' | 'message' | 'group' | 'friend' | 'game' | 'call' | 'achievement';
type Toast = { id: number; kind?: ToastKind; title: string; body?: string; thumb?: string; icon?: string; payload?: unknown };

const LIFETIME_MS = 6000;
const MAX_TOASTS = 4;

const KIND_ICON: Record<ToastKind, typeof Bell> = {
  hint: Keyboard, notify: Bell, screenshot: Camera, message: MessageSquare,
  group: Users, friend: UserPlus, game: Gamepad2, call: Phone, achievement: Trophy,
};

/**
 * Уведомления в правом нижнем углу (как в Steam): на рабочем столе и в игре. Окно не забирает
 * фокус и пропускает клики насквозь; над карточкой — ловит клик (на рабочем столе открывает
 * лаунчер), таймер исчезновения на это время замирает. Пусто — main прячет окно.
 */
export default function OverlayToastsPage() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const had = useRef(false);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const electron = (window as any).electron;

  useTransparentBackground();

  const remove = (id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  };
  const schedule = (id: number, ms = LIFETIME_MS) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.set(id, setTimeout(() => remove(id), ms));
  };

  useEffect(() => {
    const off = electron?.onOverlayToast?.((t: Toast) => {
      had.current = true;
      setToasts((list) => [...list, t].slice(-MAX_TOASTS));
      schedule(t.id);
    });
    return () => { if (typeof off === 'function') off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (had.current && toasts.length === 0) {
      electron?.overlayToastsHover?.(false);
      electron?.overlayToastsEmpty?.();
    }
  }, [toasts.length, electron]);

  const hover = (t: Toast, on: boolean) => {
    electron?.overlayToastsHover?.(on);
    if (on) {
      const timer = timers.current.get(t.id);
      if (timer) clearTimeout(timer);
    } else {
      schedule(t.id, 2500);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col justify-end items-end gap-2.5 p-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = KIND_ICON[t.kind || 'notify'] || Bell;
        const clickable = t.payload != null;
        return (
          <div
            key={t.id}
            onMouseEnter={() => hover(t, true)}
            onMouseLeave={() => hover(t, false)}
            onClick={() => {
              if (!clickable) return;
              electron?.overlayToastClick?.(t.payload);
              remove(t.id);
            }}
            className={`group relative w-full flex items-center gap-3 p-3 pr-8 pointer-events-auto border border-[var(--line-2)] bg-[rgba(12,8,19,0.97)] shadow-[0_8px_30px_rgba(0,0,0,0.6)] animate-[lhToastIn_.25s_ease-out] ${clickable ? 'cursor-pointer hover:border-[rgb(var(--accent-rgb)/.6)]' : ''}`}
          >
            <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${t.kind === 'achievement' ? 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,.6)]' : 'bg-[var(--pink)]'}`} />
            {t.thumb ? (
              <img src={t.thumb} alt="" className="w-20 aspect-video object-cover border border-white/15 shrink-0" />
            ) : t.icon ? (
              <img src={t.icon} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} className="w-12 h-12 object-cover shrink-0 border border-white/10" />
            ) : (
              <div className="w-12 h-12 shrink-0 flex items-center justify-center bg-[rgb(var(--accent-rgb)/.18)] text-[var(--pink)]">
                <Icon size={20} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-white truncate">{t.title}</div>
              {t.icon && t.kind !== 'notify' && (
                <Icon size={13} className="text-[var(--pink)] mt-0.5" />
              )}
              {t.body && <div className="text-[14px] text-pearl/80 mt-0.5 line-clamp-2 break-words">{t.body}</div>}
            </div>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={(e) => { e.stopPropagation(); remove(t.id); }}
              className="absolute top-2 right-2 p-0.5 text-white/40 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
      <style>{`@keyframes lhToastIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
