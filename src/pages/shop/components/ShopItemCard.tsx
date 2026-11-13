import type { ReactNode } from 'react';
import { Check, Crown, Clock, Lock, ShoppingCart } from 'lucide-react';
import CaratIcon from '../../../components/icons/CaratIcon';
import { RARITY_LABEL, TYPE_META, nf } from '../constants';
import type { ShopItem } from '../../../api/shop';

interface ShopItemCardProps {
  item: ShopItem;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  onOpen: () => void;
  renderPreview: (item: ShopItem) => ReactNode;
}

const RARITY_CHIP: Record<string, string> = {
  common: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'warn',
};

export function ShopItemCard({ item, owned, equipped, canAfford, onOpen, renderPreview }: ShopItemCardProps) {
  const typeLabel = item.type === 'theme'
    ? (item.scope === 'launcher' ? 'Тема лаунчера' : 'Тема профиля')
    : TYPE_META[item.type]?.label;

  return (
    <button
      onClick={onOpen}
      className={`tl-panel tl-scard w-full cursor-pointer ${item.hidden ? 'opacity-40' : ''}`}
    >
      <span className={`rarity tl-chip z-10 ${RARITY_CHIP[item.rarity] || 'common'}`}>
        {RARITY_LABEL[item.rarity] || item.rarity}
      </span>

      <div className="absolute top-2.5 right-2.5 z-10 flex flex-col items-end gap-1.5">
        {item.locked && (
          <span className="tl-chip warn inline-flex items-center gap-1"><Crown size={10} /> Только Pro</span>
        )}
        {!item.locked && !!item.early_days && (
          <span className="tl-chip warn inline-flex items-center gap-1"><Clock size={10} /> Ранний доступ</span>
        )}
        {equipped && (
          <span className="tl-chip ok inline-flex items-center gap-1"><Check size={10} /> Надето</span>
        )}
        {!equipped && owned && (
          <span className="tl-chip age">Куплено</span>
        )}
      </div>

      <div className="preview flex items-center justify-center">
        {renderPreview(item)}
      </div>

      <h4 className="truncate" title={item.name}>{item.name}</h4>
      <div className="type">{typeLabel}</div>

      {(item.tags || []).length > 0 && (
        <div className="flex flex-wrap justify-center gap-1 mt-2.5">
          {(item.tags || []).slice(0, 3).map(t => (
            <span key={t.id} className="tl-chip" style={{ fontSize: 10, padding: '2px 5px' }}>{t.name}</span>
          ))}
        </div>
      )}

      <div className="row">
        {item.locked ? (
          <span className="tl-owned inline-flex items-center gap-1" style={{ color: '#ffb020' }}>
            <Lock size={11} /> Нужна подписка
          </span>
        ) : equipped ? (
          <span className="tl-owned">◆ НАДЕТО</span>
        ) : owned ? (
          <span className="tl-owned">◆ В ИНВЕНТАРЕ</span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <CaratIcon size={13} />
            <span className="tl-price" style={canAfford ? undefined : { color: 'rgba(248,113,113,.85)' }}>{nf(item.price)}</span>
          </span>
        )}
        <span className="tl-btn" style={{ padding: '6px 10px', fontSize: 10 }}>
          {item.locked ? 'Pro' : owned ? (equipped ? 'Снять' : 'Надеть') : (<><ShoppingCart size={11} /> Купить</>)}
        </span>
      </div>
    </button>
  );
}
