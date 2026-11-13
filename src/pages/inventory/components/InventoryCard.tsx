import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import type { ShopItem } from '../../../api/shop';

interface InventoryCardProps {
  item: ShopItem;
  equipped: boolean;
  busy: boolean;
  rarityLabel: Record<string, string>;
  onEquip: () => void;
  onUnequip: () => void;
  renderPreview: (item: ShopItem) => ReactNode;
}

const TYPE_LABEL: Record<string, string> = {
  avatar: 'аватар',
  frame: 'рамка аватара',
  banner: 'фон профиля',
  tag: 'титул',
  background: 'фон лаунчера',
  miniprofile_bg: 'фон минипрофиля',
};

const typeLabel = (item: ShopItem) =>
  item.type === 'theme'
    ? (item.scope === 'launcher' ? 'тема лаунчера' : 'тема профиля')
    : TYPE_LABEL[item.type] || item.type;

// Карточка предмета в стиле TL: панель с уголками, чип редкости на превью,
// действие в правом нижнем углу.
export function InventoryCard({ item, equipped, busy, rarityLabel, onEquip, onUnequip, renderPreview }: InventoryCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative border transition-all ${
        equipped ? 'border-[var(--line-2)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'
      }`}
    >
      {/* превью */}
      <div className="relative h-28 overflow-hidden bg-[#0f0a17]">
        <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 50% 0%, rgb(var(--violet-rgb) / 0.18), transparent 70%)' }} />
        <div className="absolute inset-0 flex items-center justify-center">
          {renderPreview(item)}
        </div>
        <span className={`tl-chip ${item.rarity} absolute top-2 left-2 z-10`}>
          {rarityLabel[item.rarity]}
        </span>
      </div>

      {/* инфо */}
      <div className="p-3 border-t border-[var(--line)]">
        <h3 className="tl-head text-[10px] uppercase tracking-[0.12em] text-white truncate" title={item.name}>{item.name}</h3>
        <p className="tl-term text-[13px] tl-muted mt-1.5">{typeLabel(item)}</p>

        {/* действия */}
        <div className="flex items-center justify-between gap-2 mt-3 min-h-[30px]">
          <span
            className={`tl-head text-[10px] uppercase tracking-[0.16em] flex items-center gap-1.5 ${
              equipped ? 'text-[var(--green2)]' : 'text-[var(--muted-2)]'
            }`}
          >
            {equipped && <Check size={11} />}
            {equipped ? 'Надето' : 'не надет'}
          </span>
          {busy ? (
            <Loader2 size={14} className="animate-spin text-accent" />
          ) : equipped ? (
            <button
              onClick={onUnequip}
              className="tl-btn ghost"
              style={{ padding: '7px 11px' }}
            >
              Снять
            </button>
          ) : (
            <button
              onClick={onEquip}
              className="tl-btn"
              style={{ padding: '7px 11px' }}
            >
              Надеть
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
