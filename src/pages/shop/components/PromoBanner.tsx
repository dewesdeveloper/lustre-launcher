import type { ReactNode } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';

export interface Promo {
  key: string;
  /** Надпись над заголовком («Каждый день», «Подборка») */
  eyebrow: string;
  title: string;
  subtitle: string;
  gradient: string;
  icon: ReactNode;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
}

interface PromoBannerProps {
  promo: Promo;
  onNext: () => void;
}

export function PromoBanner({ promo, onNext }: PromoBannerProps) {
  return (
    // pr-12 — место под стрелку «следующее предложение» справа
    <div className="tl-panel relative overflow-hidden mb-[18px] py-6 pl-7 pr-12" style={{ background: promo.gradient }}>
      <span className="tl-spark" style={{ top: 14, right: 18 }}><Sparkles size={16} /></span>

      {/* Текст и кнопка в одном ряду; если места мало, кнопка уходит под текст.
          Раньше кнопка была прибита к углу и в узкой колонке закрывала подпись. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3.5">
        <div className="min-w-0 flex-1 basis-[240px]">
          <div className="tl-head text-[10px] tracking-[.28em] text-white/85 uppercase flex items-center gap-2">
            {promo.icon} {promo.eyebrow}
          </div>
          <h3 className="tl-pixel text-[16px] text-white mt-3 mb-2" style={{ textShadow: 'var(--glow)' }}>{promo.title}</h3>
          <p className="text-[13px] text-white/85 max-w-[520px] leading-[1.55]">{promo.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={promo.onClick}
          disabled={promo.disabled}
          className="tl-btn solid shrink-0"
        >
          {promo.cta}
        </button>
      </div>

      <button
        type="button"
        onClick={onNext}
        aria-label="Следующее предложение"
        title="Следующее предложение"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
