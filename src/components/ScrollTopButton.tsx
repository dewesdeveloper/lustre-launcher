import { useEffect, useState, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';

/**
 * Кнопка «наверх» для прокручиваемой области страницы (в MainLayout это <main>).
 * Появляется, когда страницу прокрутили примерно на полтора экрана вниз.
 */
export default function ScrollTopButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    // setState с тем же значением не перерисовывает компонент, так что частые события прокрутки дёшевы
    const update = () => setVisible(el.scrollTop > el.clientHeight * 1.5);
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
    // на новой странице прокрутка начинается заново — пересчитываем видимость
  }, [target, pathname]);

  const scrollUp = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.current?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollUp}
      aria-label="Наверх"
      title="Наверх"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`absolute right-5 bottom-5 z-30 w-10 h-10 flex items-center justify-center border border-[var(--line-2)] bg-[#0b0512]/85 backdrop-blur-sm text-[var(--muted)] hover:text-white hover:border-[var(--pink)] hover:bg-[rgb(var(--accent-rgb)/.18)] shadow-[0_6px_20px_rgba(0,0,0,.45)] transition-all duration-200 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none'}`}
    >
      <ArrowUp size={18} />
    </button>
  );
}
