import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** Задержка перед началом движения — сначала строку можно прочитать с начала */
const START_DELAY_MS = 1000;
/** Скорость прокрутки, пикселей в секунду */
const SPEED_PX = 45;

/**
 * Однострочный текст: если не помещается, через секунду начинает плавно ездить
 * влево-вправо, показывая конец строки. Помещается — обычный текст, без анимации.
 */
export default function MarqueeText({ text, className = '', title }: { text: string; className?: string; title?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  const [run, setRun] = useState(false);

  useLayoutEffect(() => {
    const measure = () => {
      if (!box.current || !inner.current) return;
      // ширину текста меряем без обрезки многоточием
      setShift(Math.max(0, Math.ceil(inner.current.scrollWidth - box.current.clientWidth)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [text]);

  useEffect(() => {
    setRun(false);
    if (shift <= 2) return;
    const t = setTimeout(() => setRun(true), START_DELAY_MS);
    return () => clearTimeout(t);
  }, [shift, text]);

  const style = run
    ? ({ '--mq-shift': `-${shift}px`, '--mq-time': `${Math.max(3, shift / SPEED_PX + 1.5).toFixed(1)}s` } as CSSProperties)
    : undefined;

  return (
    <span ref={box} className={`tl-marquee ${run ? 'run' : ''} ${className}`} title={title ?? text}>
      <span ref={inner} style={style}>{text}</span>
    </span>
  );
}
