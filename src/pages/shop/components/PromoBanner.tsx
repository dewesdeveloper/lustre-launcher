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
    <div className="tl-panel relative overflow-hidden mb-[18px] px-7 py-6" style={{ background: promo.gradient }}>
      <span className="tl-spark" style={{ top: 14, right: 18 }}><Sparkles size={16} /></span>

      <div className="tl-head text-[10px] tracking-[.28em] text-white/85 uppercase flex items-center gap-2">
        {promo.icon} {promo.eyebrow}
      </div>
      <h3 className="tl-pixel text-[16px] text-white mt-3 mb-2" style={{ textShadow: 'var(--glow)' }}>{promo.title}</h3>
      <p className="text-[13px] text-white/85 max-w-[520px] leading-[1.55]">{promo.subtitle}</p>

      <button
        onClick={promo.onClick}
        disabled={promo.disabled}
        className="tl-btn solid static mt-3.5 sm:absolute sm:right-7 sm:bottom-7 sm:mt-0"
      >
        {promo.cta}
      </button>

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
