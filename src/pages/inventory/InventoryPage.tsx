import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, PackageOpen, Image as ImageIcon, Frame, Wallpaper, Palette as PaletteIcon, Tags, ShoppingBag } from 'lucide-react';
import { getShop, equipItem, unequipSlot } from '../../api/shop';
import type { ShopData, ShopItem } from '../../api/shop';
import AvatarFrame from '../../components/AvatarFrame';
import { LAUNCHER_THEMES, PROFILE_THEMES, isCustomThemeId, parseCustomThemeId } from '../../components/profileThemes';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import { InventoryHeader } from './components/InventoryHeader';
import { InventoryCard } from './components/InventoryCard';
import { parseTags } from '../profile/constants';

const RARITY_COLOR: Record<string, string> = { common: '#9CA3AF', rare: '#3B82F6', epic: '#8338EC', legendary: '#FFB020' };
const RARITY_LABEL: Record<string, string> = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };

const SECTIONS: { type: string; title: string; icon: any }[] = [
  { type: 'avatar', title: 'Аватары', icon: ImageIcon },
  { type: 'frame', title: 'Рамки аватара', icon: Frame },
  { type: 'banner', title: 'Фоны профиля', icon: Wallpaper },
  { type: 'theme', title: 'Темы', icon: PaletteIcon },
  { type: 'tag', title: 'Титулы', icon: Tags },
];

const nf = (n: number) => n.toLocaleString('ru-RU');

export default function InventoryPage() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const dialog = useDialog();

  const [data, setData] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const profile: any = user?.profile || {};

  const load = async () => {
    try {
      setData(await getShop());
    } catch {
      dialog.alert({ title: 'Ошибка', message: 'Не удалось загрузить инвентарь', danger: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isImagePayload = (p: string) => /^(https?:\/\/|data:)/i.test(p);

  const isEquipped = (item: ShopItem) => {
    switch (item.type) {
      case 'theme':
        return item.scope === 'launcher'
          ? profile.launcher_theme_id === item.payload
          : profile.theme_id === item.payload;
      case 'frame':
        return isImagePayload(item.payload)
          ? profile.avatar_frame_url === item.payload
          : profile.frame_id === item.payload && !profile.avatar_frame_url;
      case 'avatar': return profile.avatar_url === item.payload;
      case 'banner': return profile.banner_url === item.payload;
      case 'tag': return parseTags(profile).some((t) => t.item_id === item.id);
      case 'background': return profile.launcher_background_item_id === item.id;
      case 'miniprofile_bg': return profile.miniprofile_background_item_id === item.id;
      default: return false;
    }
  };

  const unequipTypeFor = (item: ShopItem) =>
    item.type === 'theme' ? (item.scope === 'launcher' ? 'launcher_theme' : 'theme') : item.type;

  const handleEquip = async (item: ShopItem) => {
    setBusyId(item.id);
    try {
      const p = await equipItem(item.id);
      updateProfile(p);
      await load();
    } catch (e: any) {
      dialog.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось надеть предмет', danger: true });
    } finally {
      setBusyId(null);
    }
  };

  const handleUnequip = async (item: ShopItem) => {
    setBusyId(item.id);
    try {
      const p = await unequipSlot(unequipTypeFor(item), item.id);
      updateProfile(p);
      await load();
    } catch (e: any) {
      dialog.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось снять предмет', danger: true });
    } finally {
      setBusyId(null);
    }
  };

  const ownedItems = useMemo(
    () => (data?.items || []).filter((i) => data!.owned.includes(i.id)),
    [data]
  );

  const grouped = useMemo(() => {
    const m: Record<string, ShopItem[]> = {};
    for (const s of SECTIONS) m[s.type] = ownedItems.filter((i) => i.type === s.type);
    return m;
  }, [ownedItems]);

  const renderPreview = (item: ShopItem) => {
    switch (item.type) {
      case 'avatar':
        return <img src={item.image_url} alt="" draggable={false} className="w-16 h-16 object-cover bg-black/40 border border-[var(--line)]" />;
      case 'banner':
        return <img src={item.image_url} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover opacity-90" />;
      case 'frame':
        return isImagePayload(item.payload)
          ? <AvatarFrame avatarUrl={profile.avatar_url} frameUrl={item.payload} size="large" />
          : <AvatarFrame avatarUrl={profile.avatar_url} frameId={item.payload} size="large" />;
      case 'theme': {
        const custom = isCustomThemeId(item.payload) ? parseCustomThemeId(item.payload) : null;
        const a = custom?.accent || (item.scope === 'launcher'
          ? LAUNCHER_THEMES.find(x => x.id === item.payload)?.accent
          : PROFILE_THEMES.find(x => x.id === item.payload)?.color) || '#FF006E';
        const v = custom?.violet || (item.scope === 'launcher'
          ? LAUNCHER_THEMES.find(x => x.id === item.payload)?.violet
          : undefined) || '#8338EC';
        return (
          <div className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${a}2E, #0d0b13 55%, ${v}33)` }}>
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-50" style={{ background: a }} />
            <div className="absolute inset-x-6 bottom-2 top-3 rounded-lg bg-black/50 border border-white/10 flex items-center justify-center">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">
                {item.scope === 'launcher' ? 'Лаунчер' : 'Профиль'}
              </span>
            </div>
          </div>
        );
      }
      case 'tag': {
        const c = RARITY_COLOR[item.rarity] || '#9CA3AF';
        return (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border" style={{ color: c, borderColor: `${c}55`, background: `${c}1a` }}>{item.payload}</span>
          </div>
        );
      }
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-accent" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-pearl pb-24 text-left">
      <div className="max-w-5xl mx-auto px-8">
        {/* Шапка */}
        <InventoryHeader
          ownedCount={ownedItems.length}
          coins={data?.coins ?? 0}
          nf={nf}
          onGoShop={() => navigate('/cosmetics')}
        />

        {ownedItems.length === 0 ? (
          <div className="tl-panel py-20 text-center">
            <PackageOpen size={40} className="mx-auto mb-4" style={{ color: 'var(--muted-2)' }} />
            <p className="tl-head text-[10px] uppercase tracking-[0.2em] tl-muted">Инвентарь пуст</p>
            <p className="tl-term text-[14px] mt-2" style={{ color: 'var(--muted-2)' }}>Купи что-нибудь в магазине кастомизаций</p>
            <button onClick={() => navigate('/cosmetics')} className="tl-btn solid mt-6">
              <ShoppingBag size={14} /> Открыть магазин
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {SECTIONS.map((section) => {
              const list = grouped[section.type] || [];
              if (list.length === 0) return null;
              const Icon = section.icon;
              return (
                <section key={section.type}>
                  <div className="tl-sec-head">
                    <span className="bar" />
                    <h2><Icon size={14} /> {section.title}</h2>
                    <span className="count">{list.length}</span>
                    <span className="line" />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {list.map((item) => {
                      const equipped = isEquipped(item);
                      const busy = busyId === item.id;
                      return (
                        <InventoryCard
                          key={item.id}
                          item={item}
                          equipped={equipped}
                          busy={busy}
                          rarityLabel={RARITY_LABEL}
                          onEquip={() => handleEquip(item)}
                          onUnequip={() => handleUnequip(item)}
                          renderPreview={renderPreview}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
