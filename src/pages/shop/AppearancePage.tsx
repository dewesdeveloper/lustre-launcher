import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  IconCheck, IconChevronLeft, IconLoader2, IconPalette, IconPhoto, IconPhotoVideo,
  IconPlus, IconShoppingBag, IconSparkles, IconUser, IconWorld,
} from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import AvatarFrame from '../../components/AvatarFrame';
import { equipItem, getShop, reloadShop, unequipSlot, type ShopData, type ShopItem, type ShopRarity } from '../../api/shop';
import { setLauncherBackground } from '../../api/launcherBackground';
import { applyShopProfileVisuals } from '../../utils/shopVisuals';
import { themeSwatch } from '../../components/profileThemes';
import { TitleTilePreview } from './components/TitlePreview';
import { parseTags } from '../profile/constants';

type Scope = 'all' | 'launcher' | 'profile';

const RARITY: Record<ShopRarity, string> = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };

const KIND: Record<string, string> = {
  avatar: 'аватар',
  frame: 'рамка аватара',
  banner: 'баннер профиля',
  tag: 'титул',
  background: 'фон лаунчера',
  miniprofile_bg: 'фон минипрофиля',
};

const isLauncherTheme = (i: ShopItem) => i.type === 'theme' && i.scope === 'launcher';
const isProfileTheme = (i: ShopItem) => i.type === 'theme' && i.scope !== 'launcher';

function kindOf(item: ShopItem) {
  if (item.type === 'theme') return isLauncherTheme(item) ? 'тема лаунчера' : 'тема профиля';
  return KIND[item.type] ?? item.type;
}

/** Слот, который сервер снимает для этого товара */
const slotOf = (item: ShopItem) => (item.type === 'theme' ? (isLauncherTheme(item) ? 'launcher_theme' : 'theme') : item.type);

/** В payload лежит готовая ссылка на картинку (а не id встроенного пресета) */
const isUrl = (payload: string) => /^(https?:\/\/|data:)/i.test(payload);
const pictureOf = (item: ShopItem) => (isUrl(item.payload) ? item.payload : item.image_url);

/** Группы приобретённого: где действует, заголовок, подсказка, иконка и отбор товаров */
const GROUPS: { key: string; scope: Exclude<Scope, 'all'>; title: string; hint: string; icon: ReactNode; match: (i: ShopItem) => boolean }[] = [
  { key: 'launcher-theme', scope: 'launcher', title: 'Темы лаунчера', hint: 'Оформление всего интерфейса', icon: <IconSparkles size={18} className="text-violet" />, match: isLauncherTheme },
  { key: 'background', scope: 'launcher', title: 'Фоны лаунчера', hint: 'Фоновая картинка или видео вместо сетки', icon: <IconPhotoVideo size={18} className="text-accent" />, match: (i) => i.type === 'background' },
  { key: 'theme', scope: 'profile', title: 'Темы профиля', hint: 'Цвета и оформление страницы', icon: <IconPalette size={18} className="text-accent" />, match: isProfileTheme },
  { key: 'frame', scope: 'profile', title: 'Рамки аватара', hint: 'Обрамление вашего аватара', icon: <IconUser size={18} className="text-cyan" />, match: (i) => i.type === 'frame' },
  { key: 'banner', scope: 'profile', title: 'Баннеры', hint: 'Фон шапки профиля', icon: <IconPhoto size={18} className="text-emerald-400" />, match: (i) => i.type === 'banner' },
  { key: 'avatar', scope: 'profile', title: 'Аватары', hint: 'Ваше изображение профиля', icon: <IconUser size={18} className="text-amber-400" />, match: (i) => i.type === 'avatar' },
];

const SCOPES: { id: Scope; label: string; icon: ReactNode }[] = [
  { id: 'all', label: 'Все', icon: <IconWorld size={14} /> },
  { id: 'launcher', label: 'Лаунчер', icon: <IconSparkles size={14} /> },
  { id: 'profile', label: 'Профиль', icon: <IconUser size={14} /> },
];

const FALLBACK = <div className="w-full h-full bg-gradient-to-br from-violet/30 via-[#121017] to-accent/20" />;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- профиль приходит с сервера с полями сверх типа AuthContext
type WornProfile = Record<string, any>;

/** Превью товара в карточке — своё для каждого типа */
function ItemPreview({ item, avatar }: { item: ShopItem; avatar?: string }) {
  switch (item.type) {
    case 'frame':
      return (
        <div className="w-full h-full flex items-center justify-center">
          {isUrl(item.payload)
            ? <AvatarFrame avatarUrl={avatar} frameUrl={item.payload} size="large" />
            : <AvatarFrame avatarUrl={avatar} frameId={item.payload} size="large" />}
        </div>
      );
    case 'avatar':
      return (
        <div className="w-full h-full flex items-center justify-center">
          <img src={pictureOf(item)} alt="" className="w-24 h-24 rounded-full object-cover ring-2 ring-white/10" />
        </div>
      );
    case 'banner':
      return (
        <div className="absolute inset-0">
          <img src={pictureOf(item)} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09070c] via-transparent to-transparent" />
        </div>
      );
    case 'theme': {
      const [accent, violet] = themeSwatch(item.payload, item.scope);
      return (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}40, #0d0b13 55%, ${violet}55)` }}>
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl opacity-50" style={{ background: accent }} />
          <div className="absolute bottom-3 left-4 flex items-center gap-2">
            {[accent, violet].map((c) => <span key={c} className="w-3 h-3 rounded-full ring-1 ring-white/30" style={{ background: c }} />)}
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">{isLauncherTheme(item) ? 'Лаунчер' : 'Профиль'}</span>
          </div>
        </div>
      );
    }
    case 'background': {
      if (item.is_video) return <video src={item.payload} autoPlay loop muted playsInline className="w-full h-full object-cover" />;
      const src = item.image_url || item.payload;
      return src ? <img src={src} alt="" className="w-full h-full object-cover" /> : FALLBACK;
    }
    case 'tag':
      return <TitleTilePreview item={item} />;
    default:
      return item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : FALLBACK;
  }
}

/** Плашка «что надето» в шапке: подпись, название и цвет темы */
function WornChip({ label, item }: { label: string; item?: ShopItem }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 border" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.03)' }}>
      {item && <span className="w-2.5 h-2.5 shrink-0" style={{ background: themeSwatch(item.payload, item.scope)[0] }} />}
      <span className="tl-head text-[10px] uppercase tracking-[0.16em] tl-muted">{label}:</span>
      <span className="tl-term text-[14px] text-white max-w-[160px] truncate">{item?.name ?? 'Стандартная тема'}</span>
    </span>
  );
}

function ItemCard({ item, worn, busy, avatar, onToggle }: { item: ShopItem; worn: boolean; busy: boolean; avatar?: string; onToggle: () => void }) {
  return (
    <div className={`group border transition-all ${worn ? 'border-[var(--line-2)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}>
      <div className="relative aspect-video overflow-hidden bg-[#0f0a17] border-b border-[var(--line)]">
        <ItemPreview item={item} avatar={avatar} />
        <span className={`tl-chip ${item.rarity} absolute top-2 left-2 z-10`}>{RARITY[item.rarity] ?? item.rarity}</span>
        {worn && (
          <span className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 tl-head text-[10px] uppercase tracking-[0.16em] text-[var(--green2)] border bg-[#0f0a17]/85" style={{ borderColor: 'rgba(52,211,153,.4)' }}>
            <IconCheck size={10} /> Надето
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 title={item.name} className="tl-head text-[10px] uppercase tracking-[0.12em] text-white truncate">{item.name}</h3>
        <p className="tl-term text-[13px] tl-muted mt-1.5">{kindOf(item)}</p>
        <div className="flex items-center justify-between gap-2 mt-3">
          <span className="tl-head text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--muted-2)' }}>{worn ? 'используется' : 'не используется'}</span>
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            style={{ padding: '7px 11px' }}
            className={`disabled:opacity-50 disabled:pointer-events-none ${worn ? 'tl-btn ghost' : 'tl-btn'}`}
          >
            {busy ? <IconLoader2 size={12} className="animate-spin" /> : worn ? 'Снять' : <><IconPlus size={12} /> Надеть</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/** «Внешний вид»: приобретённые кастомизации, что надето сейчас, надеть/снять. */
export default function AppearancePage() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const dialog = useDialog();

  const [shop, setShop] = useState<ShopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>('all');

  // fresh — мимо кэша: после надевания/снятия статусы должны обновиться сразу
  const fetchShop = useCallback(async (fresh = false) => {
    try {
      setShop(await (fresh ? reloadShop() : getShop()));
    } catch {
      dialog.alert({ title: 'Ошибка', message: 'Не удалось загрузить кастомизации', danger: true });
    } finally {
      setLoading(false);
    }
  }, [dialog]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- загрузка один раз при открытии
  useEffect(() => { fetchShop(); }, []);

  const me: WornProfile = user?.profile ?? {};
  // «куплен» сервер присылает в самом товаре; старый ответ — списком owned
  const owned = (shop?.items ?? []).filter((i) => i.owned ?? shop?.owned?.includes(i.id) ?? false);

  const isWorn = (item: ShopItem): boolean => {
    switch (item.type) {
      case 'theme': return isLauncherTheme(item) ? me.launcher_theme_id === item.payload : me.theme_id === item.payload;
      case 'frame': return isUrl(item.payload) ? me.avatar_frame_url === item.payload : me.frame_id === item.payload && !me.avatar_frame_url;
      case 'avatar': return me.avatar_url === item.payload;
      case 'banner': return me.banner_url === item.payload;
      case 'tag': return parseTags(me).some((t) => t.item_id === item.id);
      case 'background': return me.launcher_background_item_id === item.id;
      case 'miniprofile_bg': return me.miniprofile_background_item_id === item.id;
      default: return false;
    }
  };

  const toggle = async (item: ShopItem, worn: boolean) => {
    setBusyId(item.id);
    try {
      const bg = item.type === 'background';
      const next = worn
        ? await (bg ? setLauncherBackground({}) : unequipSlot(slotOf(item), item.id))
        : await (bg ? setLauncherBackground({ item_id: item.id }) : equipItem(item.id));
      updateProfile(next);
      applyShopProfileVisuals(next); // тема и фон лаунчера меняются сразу, в том числе в других окнах
      await fetchShop(true);
    } catch (e) {
      const reason = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      dialog.alert({ title: 'Ошибка', message: reason || (worn ? 'Не удалось снять предмет' : 'Не удалось надеть предмет'), danger: true });
    } finally {
      setBusyId(null);
    }
  };

  const groups = GROUPS
    .filter((g) => scope === 'all' || g.scope === scope)
    .map((g) => ({ ...g, items: owned.filter(g.match) }))
    .filter((g) => g.items.length > 0);

  const wornCount = owned.filter(isWorn).length;
  const profileTheme = owned.find((i) => isProfileTheme(i) && me.theme_id === i.payload);
  const launcherTheme = owned.find((i) => isLauncherTheme(i) && me.launcher_theme_id === i.payload);
  const banner = owned.find((i) => i.type === 'banner' && isWorn(i));

  return (
    <div className="p-8 max-w-[1300px] mx-auto animate-in fade-in duration-700 text-left">
      <header className="flex items-center justify-between gap-4 mb-6">
        <div>
          <button type="button" onClick={() => navigate(-1)} className="tl-btn ghost mb-4"><IconChevronLeft size={14} /> Назад</button>
          <h1 className="tl-pixel text-[24px] text-white" style={{ textShadow: 'var(--glow)' }}>ВНЕШНИЙ <span style={{ color: 'var(--pink)' }}>ВИД</span></h1>
          <p className="tl-head text-[10px] uppercase tracking-[0.3em] tl-muted mt-3">Приобретённые кастомизации · {owned.length}</p>
        </div>
        <button type="button" onClick={() => navigate('/cosmetics')} className="tl-btn shrink-0"><IconShoppingBag size={14} /> В магазин</button>
      </header>

      {loading ? (
        <div className="flex justify-center py-24"><IconLoader2 className="animate-spin text-accent" size={30} /></div>
      ) : owned.length === 0 ? (
        <div className="tl-panel py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-5 flex items-center justify-center border" style={{ borderColor: 'var(--line)', color: 'var(--muted-2)' }}>
            <IconPalette size={28} />
          </div>
          <p className="tl-head text-[10px] uppercase tracking-[0.2em] tl-muted">Пока ничего не приобретено</p>
          <p className="tl-term text-[14px] mt-2" style={{ color: 'var(--muted-2)' }}>Купите темы, рамки и баннеры в магазине кастомизаций</p>
          <button type="button" onClick={() => navigate('/cosmetics')} className="tl-btn solid mt-6"><IconShoppingBag size={14} /> Перейти в магазин</button>
        </div>
      ) : (
        <>
          <section className="tl-panel relative overflow-hidden p-7 mb-6">
            <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full blur-[120px] pointer-events-none" style={{ background: 'rgb(var(--accent-rgb) / .15)' }} />
            <div className="absolute -bottom-24 -left-20 w-72 h-72 rounded-full blur-[120px] pointer-events-none" style={{ background: 'rgb(var(--violet-rgb) / .15)' }} />
            <div className="relative flex flex-col md:flex-row items-center gap-7">
              <AvatarFrame avatarUrl={me.avatar_url} frameId={me.frame_id} frameUrl={me.avatar_frame_url} size="xl" />
              <div className="flex-1 min-w-0 text-center md:text-left">
                <p className="tl-head text-[10px] uppercase tracking-[0.3em] tl-muted">Надето сейчас</p>
                <h2 className="tl-pixel text-[20px] text-white mt-2" style={{ textShadow: 'var(--glow)' }}>{me.display_name || user?.username || 'Игрок'}</h2>
                <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-3">
                  <WornChip label="Профиль" item={profileTheme} />
                  <WornChip label="Лаунчер" item={launcherTheme} />
                </div>
              </div>
              {banner && (
                <div className="hidden lg:block relative w-64 shrink-0 aspect-video overflow-hidden border border-[var(--line)]">
                  <img src={pictureOf(banner)} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#09070c] to-transparent" />
                  <span className="absolute bottom-2 left-3 tl-head text-[10px] uppercase tracking-[0.25em] text-white/70">Баннер</span>
                </div>
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="tl-tabs">
              {SCOPES.map((s) => (
                <button key={s.id} type="button" onClick={() => setScope(s.id)} className={`tl-tab ${scope === s.id ? 'active' : ''}`}>{s.icon} {s.label}</button>
              ))}
            </div>
            <span className="tl-head text-[10px] uppercase tracking-[0.25em] tl-muted">Надето: {wornCount}</span>
          </div>

          {groups.length === 0 ? (
            <div className="tl-panel py-12 text-center">
              <p className="tl-head text-[10px] uppercase tracking-[0.2em] tl-muted">В этом разделе пока нет приобретённых предметов</p>
            </div>
          ) : (
            <div className="space-y-10">
              {groups.map((g, gi) => (
                <motion.section key={g.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: gi * 0.05 }}>
                  <div className="tl-sec-head">
                    <span className="bar" />
                    <h2>{g.icon}{g.title}</h2>
                    <span className="tl-term text-[14px] tl-muted hidden md:inline">{g.hint}</span>
                    <span className="count">{g.items.length}</span>
                    <span className="line" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {g.items.map((item) => {
                      const worn = isWorn(item);
                      return <ItemCard key={item.id} item={item} worn={worn} busy={busyId === item.id} avatar={me.avatar_url} onToggle={() => toggle(item, worn)} />;
                    })}
                  </div>
                </motion.section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
