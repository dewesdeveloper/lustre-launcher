import { motion } from 'framer-motion';
import { Check, Crown, Loader2, X } from 'lucide-react';
import CaratIcon from '../../../components/icons/CaratIcon';
import { PreviewMockup } from './PreviewMockup';
import { TYPE_META, RARITY_LABEL, DESCRIPTIONS, DESCRIPTIONS_THEME } from '../constants';
import type { ShopItem } from '../../../api/shop';
import { formatCurrency } from '../../../utils/currency';

interface PreviewModalProps {
  item: ShopItem;
  profile: any;
  username?: string;
  owned: boolean;
  equipped: boolean;
  canAfford: boolean;
  busy: boolean;
  onClose: () => void;
  onBuy: () => void;
  onEquip: () => void;
  onUnequip: () => void;
  onGetPro: () => void;
  onTagClick: (id: number) => void;
}

const RARITY_CHIP: Record<string, string> = {
  common: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'warn',
};

export function PreviewModal({
  item,
  profile,
  username,
  owned,
  equipped,
  canAfford,
  busy,
  onClose,
  onBuy,
  onEquip,
  onUnequip,
  onGetPro,
  onTagClick,
}: PreviewModalProps) {
  const meta = TYPE_META[item.type];
  return (
    <motion.div
      key="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        className="tl-panel w-[min(94vw,540px)] max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <div className="p-5 pb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="tl-head text-[15px] font-bold uppercase tracking-[.12em] text-white truncate" title={item.name}>{item.name}</h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="tl-head text-[10px] tl-muted inline-flex items-center gap-1.5">
                <meta.icon size={11} /> {item.type === 'theme' ? (item.scope === 'launcher' ? 'Тема лаунчера' : 'Тема профиля') : meta.label}
              </span>
              <span className={`tl-chip ${RARITY_CHIP[item.rarity] || 'common'}`}>
                {RARITY_LABEL[item.rarity]}
              </span>
            </div>
            {(item.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {(item.tags || []).map(t => (
                  <button
                    key={t.id}
                    onClick={() => onTagClick(t.id)}
                    className="tl-chip tl-tagpick"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="tl-btn ghost shrink-0 p-2">
            <X size={14} />
          </button>
        </div>

        <div className="px-5">
          <PreviewMockup item={item} profile={profile} username={username} />
        </div>

        <div className="px-5 pt-4 pb-1">
          <p className="tl-term text-[15px] tl-muted leading-relaxed">
            {item.type === 'theme' ? DESCRIPTIONS_THEME[item.scope === 'launcher' ? 'launcher' : 'profile'] : DESCRIPTIONS[item.type]}
          </p>
          {!owned && !item.locked && (
            <p className="tl-term text-[14px] mt-2" style={{ color: 'var(--muted-2)' }}>Средства за этот предмет вернуть нельзя.</p>
          )}
          {item.locked && (
            <p className="tl-term text-[14px] mt-2" style={{ color: '#ffb020' }}>Этот предмет доступен только с подпиской Lustre Pro.</p>
          )}
        </div>

        <div className="p-5 pt-4 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="tl-btn ghost"
          >
            {owned ? 'Закрыть' : 'Отмена'}
          </button>
          {busy ? (
            <span className="tl-btn">
              <Loader2 size={15} className="animate-spin" />
            </span>
          ) : owned ? (
            equipped ? (
              <>
                <span className="tl-chip ok inline-flex items-center gap-1.5">
                  <Check size={13} /> Надето
                </span>
                <button
                  onClick={onUnequip}
                  className="tl-btn danger"
                >
                  Снять
                </button>
              </>
            ) : (
              <button
                onClick={onEquip}
                className="tl-btn solid"
              >
                Надеть
              </button>
            )
          ) : item.locked ? (
            <button type="button" onClick={onGetPro} className="tl-btn solid">
              <Crown size={13} /> Оформить Pro
            </button>
          ) : (
            <button
              type="button"
              onClick={onBuy}
              title={canAfford ? 'Купить' : 'Не хватает плодов изгнания — перейти к пакетам'}
              className={`tl-btn ${canAfford ? 'solid' : 'ghost'}`}
            >
              <CaratIcon size={13} /> {formatCurrency(item.price)}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
