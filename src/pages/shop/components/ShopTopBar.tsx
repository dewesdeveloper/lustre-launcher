import { Search, ShoppingBag, Settings2 } from 'lucide-react';
import CaratIcon from '../../../components/icons/CaratIcon';
import { TYPE_META, nf } from '../constants';

interface ShopTopBarProps {
  activeType: string;
  onTypeChange: (type: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  coins: number;
  isAdmin: boolean;
  onOpenInventory: () => void;
  onOpenAdmin: () => void;
}

export function ShopTopBar({ activeType, onTypeChange, query, onQueryChange, coins, isAdmin, onOpenInventory, onOpenAdmin }: ShopTopBarProps) {
  return (
    <div className="sticky top-0 z-40 -mx-6 px-6 border-b" style={{ background: 'rgba(6,3,9,.95)', borderColor: 'var(--line-2)' }}>
      <div className="h-14 flex items-center gap-4 max-md:h-auto max-md:flex-wrap max-md:gap-2 max-md:py-2">
        {/* Вкладки-типы: одна строка с горизонтальной прокруткой, без переноса —
            иначе вторая строка вылезала за пределы панели и «съезжала». */}
        <div
          className="tl-tabs overflow-x-auto no-scrollbar min-w-0 max-md:basis-full"
          style={{ flexWrap: 'nowrap' }}
        >
          <button
            type="button"
            onClick={() => onTypeChange('')}
            className={`tl-tab whitespace-nowrap ${activeType === '' ? 'active' : ''}`}
          >
            Каталог
          </button>
          {Object.entries(TYPE_META).map(([id, m]) => (
            <button
              type="button"
              key={id}
              onClick={() => onTypeChange(id)}
              className={`tl-tab whitespace-nowrap ${activeType === id ? 'active' : ''}`}
            >
              {m.title}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2.5 shrink-0">
          <div className="relative hidden md:block w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-pearl/60 pointer-events-none z-10" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') onQueryChange(''); }}
              type="search"
              aria-label="Поиск по магазину"
              data-search-hotkey="page"
              placeholder="Поиск по названию или тегу"
              className="tl-field"
              style={{ paddingLeft: 36 }}
            />
          </div>
          <button
            onClick={onOpenInventory}
            title="Инвентарь"
            className="tl-btn ghost"
          >
            <ShoppingBag size={14} />
          </button>
          <div className="flex items-center gap-2 px-3 py-2 border" style={{ borderColor: 'var(--line-2)', background: 'rgb(var(--accent-rgb)/.08)' }}>
            <CaratIcon size={15} />
            <span className="tl-head text-[10px] font-bold" style={{ color: 'var(--pink)' }}>{nf(coins)}</span>
          </div>
          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              title="Управление магазином"
              className="tl-btn"
            >
              <Settings2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
