import { useEffect, useState } from 'react';

/**
 * Обратный отсчёт для ограничения повторной отправки кода.
 * start(seconds) запускает отсчёт; label — строка вида «9:59».
 */
export function useCooldown() {
  const [left, setLeft] = useState(0);
  const active = left > 0;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);

  const start = (seconds: number) => setLeft(Math.max(0, Math.ceil(seconds || 0)));
  const reset = () => setLeft(0);
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  const label = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return { left, active, label, start, reset };
}
