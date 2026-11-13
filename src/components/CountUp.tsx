import { useEffect, useRef, useState } from 'react';
import { motionReduced } from '../utils/uiFx';

const nf = new Intl.NumberFormat('ru-RU');

/**
 * Число, которое «докручивается» до нового значения (ease-out), а при
 * изменении подпрыгивает. Первый показ — прокрутка от нуля; при отключённых
 * анимациях — сразу итоговое значение.
 */
export default function CountUp({
  value, duration = 900, format = (n: number) => nf.format(n), className = '',
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [shown, setShown] = useState(() => (motionReduced() ? value : 0));
  const [bump, setBump] = useState(false);
  const fromRef = useRef(shown);
  const firstRef = useRef(true);

  useEffect(() => {
    const target = Math.round(value) || 0;
    const from = fromRef.current;
    if (from === target) return;
    if (motionReduced()) { fromRef.current = target; setShown(target); return; }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const cur = Math.round(from + (target - from) * eased);
      fromRef.current = cur;
      setShown(cur);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // подпрыгивание — только на изменения после первого показа
    let t = 0;
    if (!firstRef.current) {
      setBump(false);
      t = window.setTimeout(() => setBump(true), 0);
    }
    firstRef.current = false;
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [value, duration]);

  return (
    <span className={`fx-count inline-block ${bump ? 'bump' : ''} ${className}`} onAnimationEnd={() => setBump(false)}>
      {format(shown)}
    </span>
  );
}
