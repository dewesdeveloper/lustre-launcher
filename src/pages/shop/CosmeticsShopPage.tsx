import { useEffect, useMemo, useState } from 'react';
import { celebrate } from '../../utils/uiFx';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, SlidersHorizontal, Gift, Sparkles, Frame } from 'lucide-react';
import AvatarFrame from '../../components/AvatarFrame';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import { PROFILE_THEMES, LAUNCHER_THEMES, isCustomThemeId, parseCustomThemeId } from '../../components/profileThemes';
import { getShop, reloadShop, shopResourceFetcher, shopResourceKey, buyItem, equipItem, claimDailyBonus, unequipSlot } from '../../api/shop';
import type { ShopData, ShopItem } from '../../api/shop';
import { CACHE_POLICY } from '../../api/catalog';
import { useCachedResource } from '../../hooks/useCachedResource';
import api from '../../api';
import { notifyBellRefresh } from '../../utils/bell';
import { RARITY_WEIGHT, SORTS } from './constants';
import { parseTags } from '../profile/constants';
import { ShopTopBar } from './components/ShopTopBar';
import { PromoBanner } from './components/PromoBanner';
import type { Promo } from './components/PromoBanner';
import { FilterSidebar } from './components/FilterSidebar';
import { setLauncherBackground } from '../../api/launcherBackground';
import { applyShopProfileVisuals } from '../../utils/shopVisuals';
import { ShopItemCard } from './components/ShopItemCard';
import { TitleCardPreview } from './components/TitlePreview';
import MiniProfileCard from '../../components/MiniProfileCard';
import { PreviewModal } from './components/PreviewModal';
import Select from '../../components/ui/Select';
import { formatCurrency } from '../../utils/currency';
import { CashDeskPanel, CoinPackagesSection } from './components/CoinShop';
import { IconLayoutGrid, IconCoins, IconCash } from '@tabler/icons-react';
import { hasAdmin } from '../../admin';

export default function CosmeticsShopPage() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const dialog = useDialog();

  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState('');
  const [rarities, setRarities] = useState<Set<string>>(new Set());
  const [only, setOnly] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState('new');
  const [showFilters, setShowFilters] = useState(true);
  const [previewItem, setPreviewItem] = useState<ShopItem | null>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // Вкладка — из адреса (а не из локального состояния): переход по ссылке /cosmetics?tab=cash
  // или «назад» в истории, пока страница открыта, переключает вкладку
  const tab: 'cash' | 'packages' | 'showcase' =
    location.pathname === '/shop/packages' ? 'packages'
      : searchParams.get('tab') === 'cash' ? 'cash'
      : searchParams.get('tab') === 'packages' ? 'packages'
      : 'showcase';
  const setTab = (next: 'cash' | 'packages' | 'showcase') => {
    if (next === 'packages') navigate('/shop/packages', { replace: true });
    else if (next === 'cash') navigate('/cosmetics?tab=cash', { replace: true });
    else navigate('/cosmetics', { replace: true });
  };

  // Витрина читается из общего кэша, а не из локального снимка:
  // статус «куплен», баланс и инвентарь всегда совпадают с тем, что лежит в кэше,
  // и обновляются сразу после покупки, а также когда валютная пилюля в навбаре
  // или другое окно обновят этот же ключ.
  const uid = (user as any)?.id;
  const { data, loading } = useCachedResource<ShopData>(
    uid ? shopResourceKey(uid) : null,
    shopResourceFetcher(),
    CACHE_POLICY.shop,
  );

  const load = async (force = false) => {
    try {
      if (force) {
        await reloadShop();
      }
      if (!force) {
        await getShop();
      }
    } catch {
      dialog.alert({ title: 'Ошибка', message: 'Не удалось загрузить магазин', danger: true });
    }
  };

  // При открытии витрины один раз обновляем кэш принудительно, дальше страница
  // живёт на общем кэше и сама подхватывает изменения.
  useEffect(() => { load(true); }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!previewItem) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewItem(null); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [previewItem]);

  const items = useMemo(() => data?.items || [], [data]);
  const profile: any = user?.profile || {};
  const role = (user as any)?.role;
  const isAdmin = hasAdmin && (role === 'admin' || role === 'manager');

  const isImagePayload = (p: string) => /^(https?:\/\/|data:)/i.test(p);

  const isEquipped = (item: ShopItem) => {
    switch (item.type) {
      case 'theme':
        return item.scope === 'launcher' ? profile.launcher_theme_id === item.payload : profile.theme_id === item.payload;
      case 'frame':
        return isImagePayload(item.payload)
          ? profile.avatar_frame_url === item.payload
          : profile.frame_id === item.payload && !profile.avatar_frame_url;
      case 'avatar': return profile.avatar_url === item.payload;
      case 'banner': return profile.banner_url === item.payload;
      case 'tag': return parseTags(profile).some((t) => t.item_id === item.id);
      case 'background': return profile.launcher_background_item_id === item.id;
      case 'miniprofile_bg':
        return profile.miniprofile_background_item_id
          ? profile.miniprofile_background_item_id === item.id
          : !!item.payload && profile.miniprofile_background_url === item.payload;
      default: return false;
    }
  };

  // Статус «куплен» берём из карточки товара (его присылает сервер),
  // а не сопоставляем id со списком owned на клиенте — так статус не может разъехаться.
  const isOwned = (item: ShopItem) =>
    item.owned ?? !!data?.owned.includes(item.id);

  /** Нехватка средств: алерт + переход на покупку валюты */
  const goToPackages = async (need: number) => {
    const missing = Math.max(0, need - (data?.coins ?? 0));
    await dialog.alert({
      title: 'Не хватает плодов изгнания',
      message: `Не хватает ещё ${formatCurrency(missing)}. Переходим к пакетам валюты — там можно пополнить баланс.`,
      tone: 'info',
    });
    setPreviewItem(null);
    setTab('packages');
  };

  const handleBuy = async (item: ShopItem, skipConfirm = false) => {
    if (item.locked) {
      dialog.alert({ title: 'Только для Pro', message: 'Этот товар доступен с подпиской Lustre Pro', tone: 'info' });
      return;
    }
    if (!skipConfirm) {
      const ok = await dialog.confirm({ title: 'Покупка', message: `Купить «${item.name}» за ${formatCurrency(item.price)}?`, confirmText: 'Купить' });
      if (!ok) return;
    }
    setBusyId(item.id);
    try {
      // Баланс не проверяем заранее: кэш витрины может быть устаревшим,
      // и предварительный отказ не дал бы купить даже при достатке средств.
      // Решение принимает сервер — он отвечает insufficient_funds с точным остатком.
      const res = await buyItem(item.id);
      // Визуал обновляется сразу: сервер вернул уже обновлённый профиль,
      // тема и фон применяются в этом окне и в соседних.
      if (res?.profile) {
        updateProfile(res.profile);
        applyShopProfileVisuals(res.profile);
      }
      await load(true);
      // подстраховка: если профиль не пришёл — берём его отдельно
      if (!res?.profile) {
        try {
          const me = await api.get('/auth/me');
          updateProfile(me.data.user.profile);
          applyShopProfileVisuals(me.data.user.profile);
        } catch { /* профиль обновится при следующей загрузке */ }
      }
      setPreviewItem(null);
      celebrate();
      dialog.alert({
        title: 'Покупка оформлена',
        message: res?.equipped
          ? `«${item.name}» надет и уже применён. Остаток: ${formatCurrency(res?.coins ?? 0)}.`
          : `«${item.name}» теперь в инвентаре. Остаток: ${formatCurrency(res?.coins ?? 0)}.`,
        tone: 'success',
      });
    } catch (e: any) {
      const code = e?.response?.data?.code;
      const serverError = e?.response?.data?.error;
      if (code === 'insufficient_funds') {
        // реально не хватает средств — сервер вернул точный остаток
        await goToPackages(e?.response?.data?.need || item.price);
        return;
      }
      if (code === 'pro_required' || code === 'early_access') {
        dialog.alert({ title: 'Только для Pro', message: serverError || 'Нужна подписка Lustre Pro', tone: 'info' });
        return;
      }
      // Остальные 400 — это не нехватка валюты: «Уже куплено», «Некорректный товар» и т.п.
      // Показываем настоящую причину и обновляем витрину.
      if (e?.response?.status === 400) {
        await load();
        dialog.alert({ title: 'Покупка не выполнена', message: serverError || 'Не удалось купить товар', danger: true });
        return;
      }
      dialog.alert({ title: 'Ошибка', message: serverError || 'Не удалось купить товар', danger: true });
    } finally {
      setBusyId(null);
    }
  };

  const handleEquip = async (item: ShopItem) => {
    setBusyId(item.id);
    try {
      // Фон лаунчера ставится отдельным эндпоинтом (сохраняет настройки отображения)
      const p = item.type === 'background'
        ? await setLauncherBackground({ item_id: item.id })
        : await equipItem(item.id);
      updateProfile(p);
      // тема лаунчера и фон применяются мгновенно, в т.ч. в соседних окнах
      applyShopProfileVisuals(p);
      await load(true);
    } catch (e: any) {
      dialog.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось надеть предмет', danger: true });
    } finally {
      setBusyId(null);
    }
  };

  const unequipTypeFor = (item: ShopItem) =>
    item.type === 'theme' ? (item.scope === 'launcher' ? 'launcher_theme' : 'theme') : item.type;

  const handleUnequip = async (item: ShopItem) => {
    setBusyId(item.id);
    try {
      const p = item.type === 'background'
        ? await setLauncherBackground({})
        : await unequipSlot(unequipTypeFor(item), item.id);
      updateProfile(p);
      applyShopProfileVisuals(p);
      await load(true);
    } catch (e: any) {
      dialog.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось снять предмет', danger: true });
    } finally {
      setBusyId(null);
    }
  };

  // Кнопки бонуса гаснут сразу по нажатию — до ответа сервера; повторный клик игнорируется
  const [claimingBonus, setClaimingBonus] = useState(false);
  const handleBonus = async () => {
    if (claimingBonus) return;
    setClaimingBonus(true);
    try {
      // claimDailyBonus сам отмечает бонус полученным в общем кэше и обновляет баланс
      const res = await claimDailyBonus();
      notifyBellRefresh(); // колокольчик гасит уведомление о бонусе сразу
      // сумму называет сервер: у Pro она больше (раньше всем писалось «+250»)
      const amount = res?.amount ?? data?.limits?.daily_bonus;
      celebrate();
      dialog.alert({
        title: 'Бонус получен',
        message: amount ? `+${formatCurrency(amount)} зачислено!` : 'Бонус зачислен на баланс!',
        tone: 'success',
      });
      // сверка с сервером — в фоне, окно и кнопки её не ждут
      void load(true);
      api.get('/auth/me').then((me) => updateProfile(me.data.user.profile)).catch(() => {});
    } catch (e: any) {
      dialog.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Бонус уже получен', danger: true });
      // Даже при ошибке (бонус уже забран) синхронизируем состояние кнопки
      void load(true);
      notifyBellRefresh();
    } finally {
      setClaimingBonus(false);
    }
  };

  const renderPreview = (item: ShopItem) => {
    switch (item.type) {
      case 'avatar':
        return <img src={item.image_url} alt="" draggable={false} className="select-none w-20 h-20 object-cover bg-black/40 border-2 border-[var(--pink)]" />;
      case 'banner':
        return <img src={item.image_url} alt="" draggable={false} className="select-none absolute inset-0 w-full h-full object-cover" />;
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
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${a}40, #0d0b13 55%, ${v}55)` }}>
            <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full blur-2xl opacity-50" style={{ background: a }} />
            <div className="absolute bottom-2 left-3 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full ring-1 ring-white/30" style={{ background: a }} />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80">{item.scope === 'launcher' ? 'Лаунчер' : 'Профиль'}</span>
            </div>
          </div>
        );
      }
      case 'background':
        return (
          <div className="absolute inset-0">
            {item.is_video ? (
              <video src={item.payload} autoPlay loop muted playsInline
                className="select-none absolute inset-0 w-full h-full object-cover" />
            ) : (
              <img src={item.image_url || item.payload} alt="" draggable={false}
                className="select-none absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 0%, #050407 100%)' }} />
            <div className="absolute inset-0 opacity-60" style={{
              backgroundImage:
                'linear-gradient(to right, #8338EC22 1px, transparent 1px), linear-gradient(to bottom, #8338EC22 1px, transparent 1px)',
              backgroundSize: '14px 14px',
            }} />
            <div className="absolute bottom-2 left-3 flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/80">
                {item.is_video ? 'Видео-фон' : 'Фон лаунчера'}
              </span>
            </div>
          </div>
        );
      case 'tag':
        return <TitleCardPreview item={item} />;
      case 'miniprofile_bg':
        return (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div className="origin-center scale-[0.68] pointer-events-none">
              <MiniProfileCard
                preview
                username={user?.username || 'player'}
                data={{
                  id: 0,
                  username: user?.username || 'player',
                  display_name: profile.display_name || user?.username,
                  avatar_url: profile.avatar_url,
                  frame_id: profile.frame_id,
                  avatar_frame_url: profile.avatar_frame_url,
                  avatar_frame_scale: profile.avatar_frame_scale,
                  miniprofile_background_url: item.payload,
                  level: profile.level || 1,
                  level_xp: (profile.xp || 0) % 30,
                  level_goal: 30,
                  stats: { games: 0, achievements: 0, friends: 0 },
                }}
              />
            </div>
          </div>
        );
      default: return null;
    }
  };

  const toggleIn = (set: Set<string>, value: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    apply(next);
  };

  // взаимоисключающие пары: «куплено/не куплено», «темы лаунчера/профиля» —
  // раньше обе галочки сразу давали пустую витрину
  const EXCLUSIVE: Record<string, string> = {
    owned: 'not_owned', not_owned: 'owned', launcher: 'profile_theme', profile_theme: 'launcher',
  };
  const toggleOnly = (value: string) => {
    const next = new Set(only);
    if (next.has(value)) next.delete(value);
    else { next.add(value); if (EXCLUSIVE[value]) next.delete(EXCLUSIVE[value]); }
    setOnly(next);
  };
  const toggleRarity = (value: string) => toggleIn(rarities, value, setRarities);

  // Смена раздела: фильтры «темы лаунчера/профиля» имеют смысл только для тем —
  // иначе после промо «Темы лаунчера» вкладка «Рамки» оставалась пустой
  const changeType = (type: string) => {
    setActiveType(type);
    if (type !== 'theme' && type !== '' && (only.has('launcher') || only.has('profile_theme'))) {
      const next = new Set(only);
      next.delete('launcher');
      next.delete('profile_theme');
      setOnly(next);
    }
  };

  const resetAll = () => {
    setQuery('');
    setActiveType('');
    setRarities(new Set());
    setOnly(new Set());
    setTagFilter(new Set());
  };

  const toggleTagId = (id: number) => {
    const next = new Set(tagFilter);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTagFilter(next);
  };

  // Все теги, встречающиеся у товаров (для фильтра)
  const allTags = useMemo(() => {
    const m = new Map<number, string>();
    items.forEach(i => (i.tags || []).forEach(t => m.set(t.id, t.name)));
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter(i => {
      if (i.hidden && !data?.is_pro) return false;
      if (activeType && i.type !== activeType) return false;
      if (rarities.size > 0 && !rarities.has(i.rarity)) return false;
      if (tagFilter.size > 0 && !(i.tags || []).some(t => tagFilter.has(t.id))) return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.tags || []).some(t => t.name.toLowerCase().includes(q))) return false;
      if (only.has('owned') && !isOwned(i)) return false;
      if (only.has('not_owned') && isOwned(i)) return false;
      if (only.has('equipped') && !isEquipped(i)) return false;
      if (only.has('affordable') && (data?.coins ?? 0) < i.price) return false;
      if (only.has('launcher') && !(i.type === 'theme' && i.scope === 'launcher')) return false;
      if (only.has('profile_theme') && !(i.type === 'theme' && i.scope !== 'launcher')) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'price_asc': return a.price - b.price;
        case 'price_desc': return b.price - a.price;
        case 'rarity': return (RARITY_WEIGHT[b.rarity] || 0) - (RARITY_WEIGHT[a.rarity] || 0);
        case 'name': return a.name.localeCompare(b.name, 'ru');
        default: return b.id - a.id;
      }
    });
    return list;
    // isOwned/isEquipped читают data и profile — они в зависимостях
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeType, rarities, tagFilter, query, only, sort, data, profile]);

  const bonusReady = !!data?.bonus_ready && !claimingBonus;
  const bonusLeft = data?.next_bonus_at ? new Date(data.next_bonus_at).getTime() + 24 * 3600000 - now : 0;
  const bonusLeftText = bonusLeft > 0 ? `${Math.floor(bonusLeft / 3600000)} ч ${Math.floor((bonusLeft % 3600000) / 60000)} мин` : '';
  const bonusAmount = data?.limits?.daily_bonus;

  const promos: Promo[] = [
    {
      key: 'bonus',
      eyebrow: 'Каждый день',
      title: 'Ежедневный бонус',
      subtitle: bonusReady
        ? `Тебя ждёт ${bonusAmount ? `+${formatCurrency(bonusAmount)}` : 'бонус'} — забери в один клик`
        : bonusLeftText ? `Следующий бонус через ${bonusLeftText}` : 'Следующий бонус скоро будет доступен',
      gradient: 'linear-gradient(120deg, #FF006E55, #8338EC44 55%, #3A86FF33)',
      icon: <Gift size={22} />,
      cta: claimingBonus ? 'Забираем…' : bonusReady ? 'Забрать бонус' : 'Уже получен',
      onClick: () => { if (bonusReady) handleBonus(); },
      disabled: !bonusReady,
    },
    {
      key: 'launcher',
      eyebrow: 'Подборка',
      title: 'Темы лаунчера',
      subtitle: 'Перекрась весь интерфейс — акценты, свечения, фон',
      gradient: 'linear-gradient(120deg, #8338EC55, #3A86FF44 55%, #22D3EE33)',
      icon: <Sparkles size={22} />,
      cta: 'Смотреть темы',
      onClick: () => { setActiveType('theme'); setOnly(new Set(['launcher'])); },
    },
    {
      key: 'frames',
      eyebrow: 'Подборка',
      title: 'Рамки аватара',
      subtitle: 'Обрами свой аватар — его увидят все в профиле',
      gradient: 'linear-gradient(120deg, #22D3EE44, #8338EC44 55%, #FF006E33)',
      icon: <Frame size={22} />,
      cta: 'Смотреть рамки',
      onClick: () => { setActiveType('frame'); setOnly(new Set()); },
    },
  ];
  const promo = promos[bannerIdx % promos.length];

  const filtersActive = rarities.size > 0 || only.size > 0 || tagFilter.size > 0;

  const openPreview = (item: ShopItem) => {
    setPreviewItem(item);
  };

  return (
    <div className="mx-auto max-w-[1240px] px-6 pt-8 pb-16 text-left">
      {/* ===== ЗАГОЛОВОК + ВКЛАДКИ ===== */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <h1 className="tl-pixel text-[24px] text-white" style={{ textShadow: 'var(--glow)' }}>МАГАЗИН</h1>
          <p className="tl-muted text-[13px] mt-2.5">Касса и витрина: темы, рамки, фоны и титулы.</p>
        </div>
        <div className="tl-tabs ml-auto">
          {([
            ['showcase', 'Витрина', <IconLayoutGrid key="i" size={14} />],
            ['packages', 'Пакеты', <IconCoins key="i" size={14} />],
            ['cash', 'Касса', <IconCash key="i" size={14} />],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`tl-tab ${tab === id ? 'active' : ''}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== ВЕРХНЯЯ ПАНЕЛЬ: разделы витрины и поиск — только на витрине ===== */}
      {tab === 'showcase' && <ShopTopBar
        activeType={activeType}
        onTypeChange={changeType}
        query={query}
        onQueryChange={setQuery}
        coins={data?.coins ?? 0}
        isAdmin={isAdmin}
        onOpenInventory={() => navigate('/inventory')}
        onOpenAdmin={() => navigate('/admin-shop')}
      />}

      <div className="flex gap-6">
        {/* ===== ОСНОВНАЯ ОБЛАСТЬ ===== */}
        <main className="flex-1 min-w-0 pt-5">
          {tab === 'cash' && (
            <CashDeskPanel data={data} onBonus={handleBonus} claiming={claimingBonus} />
          )}
          {tab === 'packages' && (
            <CoinPackagesSection isPro={!!data?.is_pro} onPaid={() => void load()} />
          )}
          {tab === 'showcase' && (<>
          {/* Тулбар: сортировка */}
          <div className="tl-toolbar">
            <span className="tl-head text-[10px] tracking-[.18em] tl-muted uppercase">Витрина · {visible.length}</span>
            <div className="spacer" />
            <span className="tl-head text-[10px] tracking-[.18em] tl-muted uppercase">Сортировка</span>
            <Select
              value={sort}
              onChange={(v) => setSort(v as string)}
              buttonClassName="rounded-none! bg-[#08050f]! border-[color:var(--line)]! px-3.5 py-2.5 text-[10px]"
              options={SORTS.map(s => ({ value: s.id, label: s.label }))}
            />
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              aria-pressed={showFilters}
              className="tl-btn ghost hidden lg:inline-flex"
            >
              {showFilters ? 'Скрыть фильтры' : 'Показать фильтры'} <SlidersHorizontal size={13} />
            </button>
          </div>

          {/* Баннер */}
          <PromoBanner promo={promo} onNext={() => setBannerIdx((bannerIdx + 1) % promos.length)} />

          {/* Сетка товаров */}
          {loading ? (
            <div className="flex justify-center py-24"><Loader2 className="animate-spin text-accent" size={28} /></div>
          ) : visible.length === 0 ? (
            <div className="tl-panel py-24 text-center">
              <p className="tl-head text-[11px] tracking-[.2em] tl-muted uppercase">
                {items.length === 0 ? 'Витрина пока пуста' : 'Ничего не найдено'}
              </p>
              {items.length > 0 && (
                <button type="button" onClick={resetAll} className="tl-btn ghost mt-4">
                  Сбросить фильтры и поиск
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((item) => {
                const owned = isOwned(item);
                const equipped = isEquipped(item);
                const canAfford = (data?.coins ?? 0) >= item.price;
                return (
                  <ShopItemCard
                    key={item.id}
                    item={item}
                    owned={owned}
                    equipped={equipped}
                    canAfford={canAfford}
                    onOpen={() => openPreview(item)}
                    renderPreview={renderPreview}
                  />
                );
              })}
            </div>
          )}
          </>)}
        </main>

        {/* ===== ПРАВАЯ ПАНЕЛЬ ФИЛЬТРОВ =====
            Только на «Витрине» и на широком окне; «Скрыть фильтры» убирает колонку целиком
            (раньше пряталось лишь содержимое, а пустые 300 px оставались). */}
        <AnimatePresence initial={false}>
          {tab === 'showcase' && showFilters && (
            <motion.div
              key="shop-filters"
              initial={{ width: 0, opacity: 0, x: 28 }}
              animate={{ width: 300, opacity: 1, x: 0 }}
              exit={{ width: 0, opacity: 0, x: 28 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 overflow-hidden hidden lg:block"
            >
              <div className="w-[300px]">
                <FilterSidebar
                  only={only}
                  onToggleOnly={toggleOnly}
                  rarities={rarities}
                  onToggleRarity={toggleRarity}
                  allTags={allTags}
                  tagFilter={tagFilter}
                  onToggleTag={toggleTagId}
                  activeType={activeType}
                  filtersActive={filtersActive}
                  onReset={() => { setRarities(new Set()); setOnly(new Set()); setTagFilter(new Set()); }}
                  visibleCount={visible.length}
                  totalCount={items.filter(i => !(i.hidden && !data?.is_pro)).length}
                  coins={data?.coins ?? 0}
                  bonusReady={bonusReady}
                  claimingBonus={claimingBonus}
                  onTopUp={() => setTab('packages')}
                  onBonus={handleBonus}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== ФУТЕР ===== */}
      <footer className="tl-footer">
        <div className="status">SYSTEM STATUS: <b>ONLINE</b><br />STORE SYNCED</div>
        <div className="left">
          <span className="keep">KEEP GOING.EXE</span>
          <div className="tl-barcode">
            {Array.from({ length: 20 }).map((_, i) => <i key={i} />)}
          </div>
        </div>
      </footer>

      {/* ===== МОДАЛКА ПРЕДПРОСМОТРА ===== */}
      <AnimatePresence>
        {previewItem && (
          <PreviewModal
            item={previewItem}
            profile={profile}
            username={user?.username}
            owned={isOwned(previewItem)}
            equipped={isEquipped(previewItem)}
            canAfford={(data?.coins ?? 0) >= previewItem.price}
            busy={busyId === previewItem.id}
            onClose={() => setPreviewItem(null)}
            onBuy={() => handleBuy(previewItem, true)}
            onEquip={() => handleEquip(previewItem)}
            onUnequip={() => handleUnequip(previewItem)}
            onGetPro={() => { setPreviewItem(null); navigate('/subscriptions'); }}
            onTagClick={(id) => { setTagFilter(new Set([id])); setPreviewItem(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
