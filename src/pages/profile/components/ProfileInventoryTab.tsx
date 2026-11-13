import { Loader2 } from 'lucide-react';
import AvatarFrame from '../../../components/AvatarFrame';
import { PROFILE_THEMES, LAUNCHER_THEMES, isCustomThemeId, parseCustomThemeId } from '../../../components/profileThemes';
import type { ShopItem } from '../../../api/shop';
import { RARITY_COLOR, RARITY_LABEL, COSMETIC_SECTIONS, isImageUrl } from '../constants';
import SectionHeader from './SectionHeader';
import EmptyBlock from './EmptyBlock';

type ProfileInventoryTabProps = {
  inventory: ShopItem[] | null;
  viewedUser: any;
};

const RARITY_CHIP: Record<string, string> = { common: 'common', rare: 'rare', epic: 'epic', legendary: 'warn' };

export default function ProfileInventoryTab({ inventory, viewedUser }: ProfileInventoryTabProps) {
  const renderCosmeticPreview = (item: ShopItem) => {
    switch (item.type) {
      case 'avatar':
        return <img src={item.image_url || item.payload} alt="" draggable={false} className="w-16 h-16 object-cover border border-[var(--line)] bg-[#08050f]" />;
      case 'banner':
        return <img src={item.image_url || item.payload} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover opacity-90" />;
      case 'frame':
        return isImageUrl(item.payload)
          ? <AvatarFrame avatarUrl={viewedUser?.profile?.avatar_url} frameUrl={item.payload} size="large" />
          : <AvatarFrame avatarUrl={viewedUser?.profile?.avatar_url} frameId={item.payload} size="large" />;
      case 'theme': {
        const custom = isCustomThemeId(item.payload) ? parseCustomThemeId(item.payload) : null;
        const theme: any = item.scope === 'launcher'
          ? LAUNCHER_THEMES.find(t => t.id === item.payload)
          : PROFILE_THEMES.find(t => t.id === item.payload);
        const color = custom?.accent || theme?.accent || theme?.color || '#FF006E';
        const violet = custom?.violet || theme?.violet || '#8338EC';
        return <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color}33, #0d0b13 55%, ${violet}44)` }} />;
      }
      default:
        return null;
    }
  };

  return (
    <div>
      {inventory === null ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-accent" size={26} /></div>
      ) : inventory.length === 0 ? (
        <EmptyBlock text="Инвентарь пуст" />
      ) : (
        <div className="space-y-8">
          {COSMETIC_SECTIONS.map((sec) => {
            const list = inventory.filter((i) => i.type === sec.type);
            if (list.length === 0) return null;
            return (
              <div key={sec.type}>
                <SectionHeader title={sec.title} count={list.length} />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {list.map((item) => (
                    <div key={item.id} className="relative overflow-hidden bg-[var(--panel)] border border-[var(--line)]">
                      <div className="absolute top-0 left-0 right-0 h-[2px] z-10" style={{ background: RARITY_COLOR[item.rarity] }} />
                      <div className="relative h-28 overflow-hidden flex items-center justify-center">
                        {renderCosmeticPreview(item)}
                      </div>
                      <div className="p-3 border-t border-[var(--line)]">
                        <p className="tl-head text-[10px] font-bold uppercase tracking-[0.1em] text-white truncate" title={item.name}>{item.name}</p>
                        <span className={`tl-chip ${RARITY_CHIP[item.rarity] || 'common'} mt-2 inline-block`}>
                          {RARITY_LABEL[item.rarity]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
