import { ShoppingBag } from 'lucide-react';
import CaratIcon from '../../../components/icons/CaratIcon';

interface InventoryHeaderProps {
  ownedCount: number;
  coins: number;
  nf: (n: number) => string;
  onGoShop: () => void;
}

export function InventoryHeader({ ownedCount, coins, nf, onGoShop }: InventoryHeaderProps) {
  return (
    <div className="pt-10 pb-8 flex items-end justify-between gap-6 flex-wrap">
      <div>
        <h1 className="tl-pixel text-[24px] text-white" style={{ textShadow: 'var(--glow)' }}>
          ИНВЕНТАРЬ
        </h1>
        <p className="tl-term text-[14px] tl-muted mt-3">
          Всего предметов: <span className="text-white">{ownedCount}</span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 border" style={{ borderColor: 'var(--line-2)', background: 'rgb(var(--accent-rgb)/.08)' }}>
          <CaratIcon size={14} />
          <span className="tl-head text-[10px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>{nf(coins)}</span>
        </div>
        <button onClick={onGoShop} className="tl-btn">
          <ShoppingBag size={14} /> В магазин
        </button>
      </div>
    </div>
  );
}
