import { createRoot } from 'react-dom/client';
import { TitleCardPreview, TitleTilePreview, TitleChip } from '../../src/pages/shop/components/TitlePreview';
import type { ShopItem } from '../../src/api/shop';

const items: ShopItem[] = [
  { id: 35, type: 'tag', name: 'Новичок', price: 100, rarity: 'common', image_url: '', payload: 'Новичок' },
  { id: 38, type: 'tag', name: 'Ветеран', price: 500, rarity: 'rare', image_url: '', payload: 'Ветеран' },
  { id: 40, type: 'tag', name: 'Мастер', price: 900, rarity: 'epic', image_url: '', payload: 'Мастер' },
  { id: 42, type: 'tag', name: 'Бессмертный', price: 1500, rarity: 'legendary', image_url: '', payload: 'Бессмертный' },
  { id: 43, type: 'tag', name: 'Очень длинный титул', price: 700, rarity: 'epic', image_url: '', payload: 'Очень длинный титул' },
];

function Shell() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-pearl/40 mb-3">
          Витрина: карточка товара (TitleCardPreview)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: '#121216' }}
            >
              <TitleCardPreview item={it} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-pearl/40 mb-3">
          Внешний вид: плитка (TitleTilePreview)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {items.slice(0, 4).map((it) => (
            <div
              key={it.id}
              style={{ position: 'relative', height: 140, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', background: '#121216' }}
            >
              <TitleTilePreview item={it} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-pearl/40 mb-3">
          Админка: плашка (TitleChip)
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {items.map((it) => (
            <TitleChip key={it.id} text={it.payload} rarity={it.rarity} />
          ))}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Shell />);
