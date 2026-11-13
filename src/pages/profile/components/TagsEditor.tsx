import { useState } from 'react';
import { X, Plus, Lock } from 'lucide-react';
import type { ShopItem } from '../../../api/shop';
import { RARITY_COLOR } from '../../shop/constants';
import { MAX_TAGS, MAX_CUSTOM_TAGS, MAX_SHOP_TAGS, type ProfileTag } from '../constants';

const PRESET_COLORS = ['#A78BFA', '#22D3EE', '#F472B6', '#FBBF24', '#34D399', '#F87171'];

type TagsEditorProps = {
  tags: ProfileTag[];
  onChange: (tags: ProfileTag[]) => void;
  shopTagItems: ShopItem[]; // только купленные титулы
};

export default function TagsEditor({ tags, onChange, shopTagItems }: TagsEditorProps) {
  const [text, setText] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);

  const customCount = tags.filter((t) => t.custom).length;
  const shopCount = tags.filter((t) => !t.custom).length;
  const full = tags.length >= MAX_TAGS;
  const canAddCustom = customCount < MAX_CUSTOM_TAGS && !full && text.trim().length > 0;

  const removeTag = (i: number) => onChange(tags.filter((_, idx) => idx !== i));

  const addCustom = () => {
    if (!canAddCustom) return;
    onChange([...tags, { text: text.trim().slice(0, 16), color, custom: true, item_id: 0 }]);
    setText('');
  };

  const addShopTag = (item: ShopItem) => {
    if (full || shopCount >= MAX_SHOP_TAGS) return;
    if (tags.some((t) => t.item_id === item.id)) return;
    onChange([...tags, { text: item.payload, color: RARITY_COLOR[item.rarity] || '#9CA3AF', custom: false, item_id: item.id }]);
  };

  const addedItemIds = new Set(tags.filter((t) => !t.custom).map((t) => t.item_id));

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted">Титулы · {tags.length}/{MAX_TAGS}</label>
        <span className="tl-term text-[14px] text-[var(--muted-2)]">1 свой + до {MAX_SHOP_TAGS} из магазина</span>
      </div>

      {/* Текущие титулы */}
      {tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {tags.map((t, i) => (
            <span
              key={`${t.text}-${i}`}
              className="tl-chip inline-flex items-center gap-1.5"
              style={{ color: t.color || 'var(--violet2)', borderColor: `${t.color || '#8338EC'}99`, background: `${t.color || '#8338EC'}22` }}
            >
              {t.text}
              <button type="button" onClick={() => removeTag(i)} className="hover:text-white transition-colors" title="Убрать">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Свой титул */}
      <div className="mb-4">
        <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted block mb-2">Свой титул</label>
        {customCount >= MAX_CUSTOM_TAGS ? (
          <p className="tl-term text-[15px] text-[var(--muted-2)]">Свой титул уже добавлен.</p>
        ) : (
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 16))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="Например: GOLD"
              maxLength={16}
              className="tl-field flex-1 min-w-[160px] uppercase"
            />
            <label className="relative w-11 h-11 border border-[var(--line-2)] overflow-hidden cursor-pointer shrink-0" style={{ background: color }} title="Цвет">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </label>
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className="w-5 h-5 border border-[var(--line-2)] transition-transform hover:scale-110" style={{ background: c }} />
              ))}
            </div>
            <button
              type="button"
              onClick={addCustom}
              disabled={!canAddCustom}
              className="tl-btn"
            >
              <Plus size={13} /> Добавить
            </button>
          </div>
        )}
      </div>

      {/* Титулы из магазина */}
      <div>
        <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted block mb-2">Титулы из магазина</label>
        {shopTagItems.length === 0 ? (
          <p className="tl-term text-[15px] text-[var(--muted-2)] flex items-center gap-1.5"><Lock size={12} /> Нет купленных титулов — их можно приобрести в магазине.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {shopTagItems.map((item) => {
              const added = addedItemIds.has(item.id);
              const disabled = added || full || shopCount >= MAX_SHOP_TAGS;
              const c = RARITY_COLOR[item.rarity] || '#9CA3AF';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => addShopTag(item)}
                  disabled={disabled}
                  className={`relative border px-3 py-2.5 text-left transition-all ${added ? 'border-accent bg-[rgb(var(--accent-rgb)/.08)]' : disabled ? 'border-[var(--line)] opacity-40' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
                >
                  <span className="block tl-head text-[10px] font-bold uppercase tracking-[0.08em] truncate" style={{ color: c }}>{item.payload}</span>
                  <span className="block tl-term text-[13px] text-[var(--muted-2)] mt-0.5">{added ? 'Добавлен' : item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
