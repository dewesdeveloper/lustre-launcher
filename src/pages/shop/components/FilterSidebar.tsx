import { Coins, Heart } from 'lucide-react';
import { RARITY_COLOR, RARITY_LABEL, nf } from '../constants';

interface FilterSidebarProps {
  only: Set<string>;
  onToggleOnly: (value: string) => void;
  rarities: Set<string>;
  onToggleRarity: (value: string) => void;
  allTags: { id: number; name: string }[];
  tagFilter: Set<number>;
  onToggleTag: (id: number) => void;
  activeType: string;
  filtersActive: boolean;
  onReset: () => void;
  visibleCount: number;
  totalCount: number;
  coins: number;
  bonusReady: boolean;
  claimingBonus?: boolean;
  onTopUp: () => void;
  onBonus: () => void;
}

const HEAD = 'tl-pixel text-[10px] text-white mb-3';
const HEAD_STYLE = { textShadow: 'var(--glow-sm)' };

// Разделы (аватары, рамки, темы…) переключаются вкладками в верхней панели —
// здесь только уточняющие фильтры
export function FilterSidebar({
  only,
  onToggleOnly,
  rarities,
  onToggleRarity,
  allTags,
  tagFilter,
  onToggleTag,
  activeType,
  filtersActive,
  onReset,
  visibleCount,
  totalCount,
  coins,
  bonusReady,
  claimingBonus = false,
  onTopUp,
  onBonus,
}: FilterSidebarProps) {
  const options = [
    { id: 'owned', label: 'Куплено' },
    { id: 'not_owned', label: 'Не куплено' },
    { id: 'equipped', label: 'Надето' },
    { id: 'affordable', label: 'Хватает баланса' },
    // уточнение для тем — показываем, только когда темы вообще есть в выдаче
    ...(activeType === '' || activeType === 'theme'
      ? [{ id: 'launcher', label: 'Темы лаунчера' }, { id: 'profile_theme', label: 'Темы профиля' }]
      : []),
  ];

  return (
    <aside className="w-[300px] shrink-0 py-5">
      <div className="sticky top-20 space-y-4">
        <div className="tl-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`${HEAD} !mb-0`} style={HEAD_STYLE}>ФИЛЬТРЫ</h3>
            {filtersActive && (
              <button type="button" onClick={onReset} className="tl-head text-[10px] text-accent hover:text-white font-bold uppercase tracking-widest">
                Сбросить
              </button>
            )}
          </div>
          {options.map((o) => (
            <label key={o.id} className="tl-fopt">
              <input type="checkbox" checked={only.has(o.id)} onChange={() => onToggleOnly(o.id)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>

        <div className="tl-panel p-5">
          <h3 className={HEAD} style={HEAD_STYLE}>РЕДКОСТЬ</h3>
          {Object.keys(RARITY_LABEL).map((r) => (
            <label key={r} className="tl-fopt">
              <input type="checkbox" checked={rarities.has(r)} onChange={() => onToggleRarity(r)} />
              <span className="w-2.5 h-2.5 shrink-0" style={{ background: RARITY_COLOR[r] }} />
              <span>{RARITY_LABEL[r]}</span>
            </label>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="tl-panel p-5">
            <h3 className={HEAD} style={HEAD_STYLE}>ТЕГИ</h3>
            <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto custom-scrollbar">
              {allTags.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => onToggleTag(t.id)}
                  aria-pressed={tagFilter.has(t.id)}
                  className={`tl-chip tl-tagpick ${tagFilter.has(t.id) ? 'on' : ''}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="tl-panel p-5">
          <h3 className={HEAD} style={HEAD_STYLE}>БАЛАНС</h3>
          <div className="tl-stat" style={{ textAlign: 'left' }}>
            <div className="n tl-pixel text-[18px]">{nf(coins)}</div>
            <div className="l">плодов изгнания</div>
          </div>
          <button type="button" className="tl-btn solid block mt-3.5" onClick={onTopUp}>
            <Coins size={12} /> Пополнить
          </button>
          <button type="button" className="tl-btn ghost block mt-2.5 disabled:opacity-50" onClick={onBonus} disabled={!bonusReady}>
            <Heart size={12} /> {claimingBonus ? 'Забираем…' : bonusReady ? 'Забрать ежедневный бонус' : 'Бонус уже получен'}
          </button>
        </div>

        <p className="tl-term text-[15px] tl-muted">Показано: {visibleCount} из {totalCount}</p>
      </div>
    </aside>
  );
}
