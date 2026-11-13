import { useEffect, useRef, useState } from 'react';
import { Bell, Camera, Keyboard } from 'lucide-react';
import { useTransparentBackground } from './OverlayPage';

type Toast = { id: number; kind?: 'hint' | 'notify' | 'screenshot'; title: string; body?: string; thumb?: string };

const LIFETIME_MS = 6000;
const MAX_TOASTS = 4;

/**
 * Игровые уведомления в правом нижнем углу (как в Steam). Окно не забирает фокус у
 * игры и пропускает клики насквозь; когда уведомлений не остаётся — main прячет окно.
 */
export default function OverlayToastsPage() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const had = useRef(false);

  useTransparentBackground();

  useEffect(() => {
    const electron = (window as any).electron;
    const off = electron?.onOverlayToast?.((t: Toast) => {
      had.current = true;
      setToasts((list) => [...list, t].slice(-MAX_TOASTS));
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), LIFETIME_MS);
    });
    return () => { if (typeof off === 'function') off(); };
  }, []);

  useEffect(() => {
    if (had.current && toasts.length === 0) (window as any).electron?.overlayToastsEmpty?.();
  }, [toasts.length]);

  return (
    <div className="fixed inset-0 flex flex-col justify-end items-end gap-3 p-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="w-full flex items-center gap-3 p-3.5 border border-[var(--line-2)] bg-[rgba(12,8,19,0.96)] shadow-[0_8px_30px_rgba(0,0,0,0.6)] animate-[lhToastIn_.25s_ease-out]"
        >
          {t.thumb ? (
            <img src={t.thumb} alt="" className="w-20 aspect-video object-cover border border-white/15 shrink-0" />
          ) : (
            <div className="w-11 h-11 shrink-0 flex items-center justify-center bg-[rgb(var(--accent-rgb)/.18)] text-[var(--pink)]">
              {t.kind === 'hint' ? <Keyboard size={20} /> : t.kind === 'screenshot' ? <Camera size={20} /> : <Bell size={20} />}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-white truncate">{t.title}</div>
            {t.body && <div className="text-[14px] text-pearl/80 mt-0.5 line-clamp-2 break-words">{t.body}</div>}
          </div>
        </div>
      ))}
      <style>{`@keyframes lhToastIn { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
