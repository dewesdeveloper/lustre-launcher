import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { getMiniProfile, type MiniProfile } from '../api/miniProfile';
import MiniProfileCard from './MiniProfileCard';

interface UserAvatarHoverProps {
  username?: string;
  children: ReactNode;
  /** данные, которые уже есть рядом с аватаром — карточка показывается сразу */
  displayName?: string;
  avatarUrl?: string;
  /** живой онлайн из WS-presence */
  online?: boolean;
  className?: string;
}

const SHOW_DELAY = 200;
const HIDE_DELAY = 250;
const CARD_W = 300;
const CARD_H = 270;
const GAP = 12;

/**
 * Обёртка для аватара другого пользователя: при наведении показывает
 * окно с минипрофилем. Карточка рендерится порталом в body, поэтому
 * не обрезается прокручиваемыми списками.
 */
export function UserAvatarHover({ username, children, displayName, avatarUrl, online, className = '' }: UserAvatarHoverProps) {
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [data, setData] = useState<MiniProfile | null>(null);

  // карточка показывается и для своего аватара — это удобный вход в профиль
  const active = !!username;

  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const clearShow = () => { if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; } };
  const clearHide = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };

  const computePos = (r: DOMRect) => {
    let x = r.left;
    let y = r.bottom + GAP;
    if (x + CARD_W > window.innerWidth - 8) x = window.innerWidth - CARD_W - 8;
    if (y + CARD_H > window.innerHeight - 8) y = r.top - GAP - CARD_H;
    return { x: Math.max(8, x), y: Math.max(8, y) };
  };

  const show = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos(computePos(r));
    setOpen(true);
    // данные подгружаем отдельно — известные поля показываем сразу
    setData(null);
    getMiniProfile(username).then(setData).catch(() => setData(null));
  };

  const scheduleHide = () => {
    clearHide();
    hideTimer.current = setTimeout(() => { setOpen(false); setData(null); hideTimer.current = null; }, HIDE_DELAY);
  };

  const onMouseEnter = () => {
    if (!active) return;
    clearHide();
    clearShow();
    showTimer.current = setTimeout(() => { showTimer.current = null; show(); }, SHOW_DELAY);
  };

  const onMouseLeave = () => {
    clearShow();
    if (active) scheduleHide();
  };

  // клик по кнопке карточки закрывает окно
  const onOpen = () => { setOpen(false); setData(null); navigate(`/profile/${username}`); };

  return (
    <>
      <span
        ref={wrapRef}
        className={`relative inline-flex ${className}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </span>

      {active && open &&
        createPortal(
          <div
            className="fixed z-[400] animate-in fade-in slide-in-from-bottom-1 duration-150"
            style={{ left: pos.x, top: pos.y }}
            onMouseEnter={clearHide}
            onMouseLeave={scheduleHide}
          >
            <MiniProfileCard
              data={data}
              username={username}
              displayName={displayName}
              avatarUrl={avatarUrl}
              online={online}
              onOpen={onOpen}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

export default UserAvatarHover;
