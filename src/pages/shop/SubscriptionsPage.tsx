import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconArrowRight, IconBolt, IconCalendarEvent, IconCheck, IconChevronLeft, IconCoin, IconCrown,
  IconLoader2, IconMinus, IconPalette, IconSparkles, IconTag, IconUsersGroup,
} from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import AvatarFrame from '../../components/AvatarFrame';
import ProBadge, { PRO_NICK_CLASS } from '../../components/ProBadge';
import {
  getSubscription, cancelPro, redeemProPromo, getPublicPrices, guestStatus,
  type SubscriptionStatus, type ProPlan, type ProPlanId, type ProBenefit, type CoinPackage,
} from '../../api/subscriptions';
import { createProPayment, openPaymentUrl, type PaymentOrderView } from '../../api/payments';
import { PaymentModal } from '../../components/PaymentModal';
import { Loading } from '../../components/Loading';
import { currencyWord } from '../../utils/currency';
import CurrencyIcon from '../../components/icons/CaratIcon';
import { sellerLine, useSellerInfo } from '../../api/legal';

// Страница Lustre Pro: что даёт подписка (на примере профиля самого пользователя), статус
// действующей подписки, тарифы, сравнение, промокод и ответы на вопросы. Все цифры — с сервера
// (тарифы, преимущества, выплаты); таблица сравнения повторяет константы controllers/pro.go.

const nf = (n: number) => new Intl.NumberFormat('ru-RU').format(n);
const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

const GOLD = '#fbbf24';

/** Группы преимуществ: ключи из ProBenefits() на сервере */
const GROUPS: { id: string; title: string; icon: ReactNode; keys: string[] }[] = [
  { id: 'look', title: 'Внешний вид', icon: <IconPalette size={16} />, keys: ['identity', 'nick', 'cosmetics', 'banner', 'frame', 'custom_frame'] },
  { id: 'more', title: 'Больше возможностей', icon: <IconUsersGroup size={16} />, keys: ['groups', 'showcase', 'favorites', 'collections', 'upload', 'chat_files', 'early', 'season', 'quest', 'support'] },
  { id: 'coins', title: 'Плоды изгнания', icon: <IconCoin size={16} />, keys: ['bonus', 'gift', 'coins'] },
];

// Без подписки / с Pro — константы лимитов из controllers/pro.go
const COMPARE: { f: string; free: string | false; pro: string }[] = [
  { f: 'Бейдж Pro и градиентный ник', free: false, pro: 'Да' },
  { f: 'Эксклюзивные темы, рамки, баннер', free: false, pro: 'Да' },
  { f: 'Ежедневный бонус', free: '+250', pro: '+500' },
  { f: 'Ежемесячная выплата', free: false, pro: '150–300 плодов' },
  { f: 'Лимит плодов изгнания', free: '100 000', pro: '1 000 000' },
  { f: 'Группы / участников в группе', free: '5 / 10', pro: '30 / 50' },
  { f: 'Витрины / игры в избранном', free: '3 / 5', pro: '6 / 10' },
  { f: 'Коллекции', free: '10', pro: '50' },
  { f: 'Аватар и баннер', free: 'до 10 МБ', pro: 'до 25 МБ' },
  { f: 'Видео / файлы в чате', free: '50 / 25 МБ', pro: '200 / 100 МБ' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Подписка продлевается автоматически?', a: 'Нет. Списаний без вашего участия не будет: продлить можно на этой же странице, новый срок прибавится к текущему.' },
  { q: 'Как работает ежемесячная выплата?', a: 'Раз в 30 дней на счёт приходят плоды изгнания по тарифу: 300 на месячном, 150 на квартальном и годовом. Выплата начисляется, когда вы заходите в Lustre.' },
  { q: 'Что будет после окончания подписки?', a: 'Бейдж, подсветка ника, рамка и баннер Pro отключатся, лимиты вернутся к обычным. Всё купленное в магазине останется в инвентаре.' },
  { q: 'Как оплатить?', a: 'Банковской картой или через СБП в защищённом платёжном окне. Подписка включается сразу после оплаты.' },
  { q: 'Игры станут доступнее?', a: 'Нет — все игры в Lustre и так бесплатны. Pro даёт оформление, повышенные лимиты и плоды изгнания.' },
];

function SecHead({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="tl-sec-head">
      <span className="bar" />
      <h2>{children}</h2>
      {hint && <span className="tag">{hint}</span>}
      <span className="line" />
    </div>
  );
}

/** Как профиль пользователя выглядит с Pro: рамка, градиентный ник, бейдж, бонус */
function ProPreview({ name, avatarUrl, frameId, active }: { name: string; avatarUrl?: string; frameId: string; active: boolean }) {
  return (
    <div className="tl-panel relative overflow-hidden p-6" style={{ borderColor: `${GOLD}66` }}>
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-[90px]" style={{ background: 'rgba(251,191,36,.16)' }} />
      <p className="tl-head relative text-[10px] font-bold uppercase tracking-[.24em]" style={{ color: GOLD }}>
        {active ? 'Так вас видят сейчас' : 'Так вас увидят с Pro'}
      </p>
      <div className="relative mt-5 flex items-center gap-4">
        <AvatarFrame avatarUrl={avatarUrl} frameId={frameId} size="medium" isPro />
        <div className="min-w-0">
          <p className={`truncate text-lg font-black ${PRO_NICK_CLASS}`}>{name}</p>
          <div className="mt-1.5 flex items-center gap-2"><ProBadge size="md" /></div>
        </div>
      </div>
      <div className="relative mt-5 space-y-2">
        <div className="flex items-start gap-3 border border-[var(--line)] bg-black/25 px-3 py-2.5">
          <span className={`tl-head shrink-0 text-[10px] font-bold ${PRO_NICK_CLASS}`}>{name}</span>
          <span className="tl-term text-[14px] text-pearl/75">так выглядит ник в чате и комментариях</span>
        </div>
        <div className="flex items-center gap-3 border border-[var(--line)] bg-black/25 px-3 py-2.5">
          <span style={{ color: GOLD }}><CurrencyIcon size={14} /></span>
          <span className="tl-term text-[14px] text-pearl/75">Ежедневный бонус</span>
          <span className="tl-num ml-auto text-[14px] text-white">+500</span>
        </div>
      </div>
    </div>
  );
}

/** Статус действующей подписки: сколько осталось, когда выплата, что включено */
function ProStatus({ status, onExtend, onCancel }: { status: SubscriptionStatus; onExtend: () => void; onCancel: () => void }) {
  const plan = status.plans.find((p) => p.id === status.pro_plan);
  const totalDays = Math.max(status.days_left, (plan?.months || 1) * 30);
  const pct = Math.max(4, Math.min(100, Math.round((status.days_left / totalDays) * 100)));
  const ending = status.days_left <= 5;
  return (
    <section className="tl-panel mb-10 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <IconCrown size={18} style={{ color: GOLD }} />
        <h2 className="tl-head text-[12px] font-bold uppercase tracking-[.16em] text-white">Ваша подписка</h2>
        {plan && <span className="tl-chip legendary">{plan.title}</span>}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onExtend} className="tl-btn solid">Продлить</button>
          <button type="button" onClick={onCancel} className="tl-btn ghost">Отключить</button>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="tl-term text-[16px] text-white">
            Осталось <b className="tl-num text-[20px]" style={{ color: ending ? '#ff5b8a' : GOLD }}>{status.days_left}</b> дн.
          </span>
          <span className="tl-term text-[14px] text-[var(--muted)]">до {fmtDate(status.pro_until)}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden border border-[var(--line)] bg-black/30">
          <div className="h-full" style={{ width: `${pct}%`, background: ending ? '#ff5b8a' : `linear-gradient(90deg, ${GOLD}, var(--pink))` }} />
        </div>
        {ending && <p className="tl-term mt-2 text-[14px] text-[#ff8fb0]">Подписка скоро закончится — продлите, и новый срок прибавится к текущему.</p>}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="tl-stat">
          <div className="n">+{nf(status.gift_per_month)}</div>
          <div className="l">выплата в месяц</div>
        </div>
        <div className="tl-stat">
          <div className="n" style={{ fontSize: 18 }}>{status.gift_next_at ? fmtDate(status.gift_next_at) : '—'}</div>
          <div className="l">следующая выплата</div>
        </div>
        <div className="tl-stat">
          <div className="n">{status.gift_months_done}</div>
          <div className="l">выплат получено</div>
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan, current, busy, onBuy }: { plan: ProPlan; current: boolean; busy: boolean; onBuy: () => void }) {
  const hot = plan.highlight;
  return (
    <div
      className={`tl-panel relative flex flex-col p-6 ${hot ? 'tl-hot' : ''}`}
      style={hot ? { borderColor: 'var(--pink)', background: 'linear-gradient(180deg, rgb(var(--accent-rgb) / .12), transparent 55%)' } : undefined}
    >
      <div className="flex items-center gap-2">
        <h3 className="tl-head text-[12px] font-bold uppercase tracking-[.14em] text-white">{plan.title}</h3>
        {plan.badge && <span className={`tl-chip ${hot ? 'rare' : 'ok'} ml-auto`}>{plan.badge}</span>}
        {current && !plan.badge && <span className="tl-chip legendary ml-auto">Ваш тариф</span>}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <span className="tl-num text-[34px] leading-none text-white">{nf(plan.price)} ₽</span>
        {plan.old_price > plan.price && <span className="tl-num pb-1 text-[16px] text-[var(--muted)] line-through">{nf(plan.old_price)} ₽</span>}
      </div>
      <p className="tl-term mt-2 text-[15px] text-[var(--muted)]">
        {plan.months > 1 ? `${nf(plan.per_month)} ₽ в месяц · ${plan.months} мес.` : 'на 1 месяц'}
      </p>
      {plan.save_pct > 0 && (
        <p className="tl-head mt-2 text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--green2)' }}>
          −{plan.save_pct}% · экономия {nf(plan.save_total)} ₽
        </p>
      )}

      <div className="mt-5 flex items-center gap-3 border px-3.5 py-3" style={{ borderColor: 'rgba(251,191,36,.35)', background: 'rgba(251,191,36,.06)' }}>
        <span style={{ color: GOLD }}><CurrencyIcon size={16} /></span>
        <div className="min-w-0">
          <p className="tl-term text-[15px] text-white">+{nf(plan.gift_per_month)} плодов каждый месяц</p>
          {plan.months > 1 && <p className="tl-term text-[13px] text-[var(--muted-2)]">всего до {nf(plan.gift_total)} за срок</p>}
        </div>
      </div>

      <button type="button" onClick={onBuy} disabled={busy} className={`tl-btn mt-6 h-11 w-full justify-center ${hot ? 'solid tl-shine' : ''} disabled:opacity-50`}>
        {busy ? <IconLoader2 size={14} className="animate-spin" /> : current ? 'Продлить' : 'Оформить'}
      </button>
    </div>
  );
}

function BenefitGroup({ title, icon, items }: { title: string; icon: ReactNode; items: ProBenefit[] }) {
  if (!items.length) return null;
  return (
    <div className="tl-panel p-5">
      <h3 className="tl-head mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-white">
        <span className="text-accent">{icon}</span> {title}
      </h3>
      <ul className="space-y-3">
        {items.map((b) => (
          <li key={b.key} className="flex items-start gap-2.5">
            <IconCheck size={14} className="mt-1 shrink-0" style={{ color: GOLD }} />
            <span className="tl-term text-[15px] leading-snug">
              <span className="text-white">{b.title}</span>
              {b.hint && <span className="block text-[14px] text-[var(--muted)]">{b.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const dialog = useDialog();
  const { user, updateProfile, refreshUser } = useAuth();

  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ProPlanId | null>(null);
  const [paying, setPaying] = useState<PaymentOrderView | null>(null);
  const [promo, setPromo] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const plansRef = useRef<HTMLDivElement>(null);
  const seller = useSellerInfo();

  // пакеты валюты и (для гостя) тарифы — из публичных цен: страница открыта без входа
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const load = async () => {
    const pub = await getPublicPrices().catch(() => null);
    if (pub) setPackages(pub.packages || []);
    if (!user) { setStatus(pub ? guestStatus(pub) : null); return; }
    await getSubscription().then(setStatus).catch(() => setStatus(pub ? guestStatus(pub) : null));
  };
  useEffect(() => { void load().finally(() => setLoading(false)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  // ежемесячная выплата начислилась при открытии страницы — сообщаем
  useEffect(() => {
    if (status?.gift_granted && status.gift_amount > 0) {
      dialog.alert({ title: 'Ежемесячная выплата', message: `Начислено +${nf(status.gift_amount)} ${currencyWord(status.gift_amount)}`, tone: 'success' });
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.gift_granted]);

  const benefitsBy = useMemo(() => {
    const list = status?.benefits || [];
    return GROUPS.map((g) => ({ ...g, items: g.keys.map((k) => list.find((b) => b.key === k)).filter(Boolean) as ProBenefit[] }));
  }, [status?.benefits]);

  const toPlans = () => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const handleBuy = async (plan: ProPlan) => {
    if (!user) { navigate('/login'); return; }
    setBusy(plan.id);
    try {
      const order = await createProPayment(plan.id);
      setPaying(order);
      openPaymentUrl(order.payment_url);
    } catch (e: any) {
      dialog.alert({ title: 'Ошибка оплаты', message: e?.response?.data?.error || 'Не удалось создать платёж', tone: 'info' });
    } finally {
      setBusy(null);
    }
  };

  const handlePaid = async () => {
    setPaying(null);
    try { await refreshUser(); } catch { /* обновится при следующем входе */ }
    await load();
    dialog.alert({ title: 'Подписка оформлена', message: 'Lustre Pro включён. Ежемесячная выплата будет приходить по тарифу.', tone: 'success' });
  };

  const handleFailed = (order: PaymentOrderView) => {
    setPaying(null);
    dialog.alert({
      title: 'Оплата не завершена',
      message: order.status === 'canceled' ? 'Платёж отменён — можно попробовать снова.' : 'Платёж не прошёл — можно попробовать снова.',
      tone: 'info',
    });
  };

  const handleCancel = async () => {
    const ok = await dialog.confirm({
      title: 'Отключить Lustre Pro?',
      message: 'Бейдж, оформление и повышенные лимиты перестанут действовать сразу, оставшиеся дни не сохранятся.',
      confirmText: 'Отключить',
      danger: true,
    });
    if (!ok) return;
    const profile = await cancelPro().catch(() => null);
    if (profile) updateProfile(profile);
    load();
  };

  const handlePromo = async () => {
    if (!promo.trim()) return;
    if (!user) { navigate('/login'); return; }
    setPromoBusy(true);
    try {
      const res = await redeemProPromo(promo.trim());
      updateProfile(res.profile);
      dialog.alert({ title: 'Промокод активирован', message: `Подписка продлена на ${res.days} дн.`, tone: 'success' });
      setPromo('');
      load();
    } catch (e: any) {
      dialog.alert({ title: 'Промокод не подошёл', message: e?.response?.data?.error || 'Проверьте код', tone: 'info' });
    } finally {
      setPromoBusy(false);
    }
  };

  if (loading || !status) return <Loading label="Lustre Pro" />;

  const isPro = status.is_pro;
  const plans = status.plans || [];
  const minPlan = plans.length ? plans.reduce((a, b) => (a.per_month <= b.per_month ? a : b)) : null;
  const name = user?.profile?.display_name || user?.username || 'Игрок';

  return (
    <div className="min-h-screen bg-main-bg pb-24 text-left text-pearl animate-in fade-in duration-500">
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <button type="button" onClick={() => navigate(-1)} className="tl-btn ghost mb-6"><IconChevronLeft size={14} /> Назад</button>

        {/* ВСТУПЛЕНИЕ */}
        <section className="tl-panel relative mb-8 overflow-hidden p-8">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{
            backgroundImage: 'radial-gradient(560px 260px at 95% 0%, rgba(251,191,36,.14), transparent 70%), radial-gradient(520px 240px at 0% 100%, rgb(var(--accent-rgb)/.16), transparent 70%), linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
            backgroundSize: 'auto, auto, 28px 28px, 28px 28px',
          }} />
          <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.25fr_1fr]">
            <div>
              <p className="tl-head mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.3em]" style={{ color: GOLD }}>
                <IconCrown size={13} /> Lustre Pro
              </p>
              <h1 className="tl-pixel text-[30px] leading-tight text-white" style={{ textShadow: 'var(--glow)' }}>
                {isPro ? <>Pro <span className="tl-grad-text">активен</span></> : <>Выделяйтесь <span className="tl-grad-text">в Lustre</span></>}
              </h1>
              <p className="tl-term mt-3 max-w-xl text-[16px] leading-relaxed text-[var(--muted)]">
                {isPro
                  ? `Подписка действует до ${fmtDate(status.pro_until)}. Продление прибавится к текущему сроку.`
                  : 'Бейдж и градиентный ник, эксклюзивные темы и рамки, вдвое больший ежедневный бонус, ежемесячная выплата плодов изгнания и повышенные лимиты. Игры в Lustre и так бесплатны — Pro про оформление и удобство.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="button" onClick={toPlans} className="tl-btn solid tl-shine h-12 px-6">
                  {isPro ? 'Продлить' : `Оформить от ${minPlan ? nf(minPlan.per_month) : 300} ₽/мес`} <IconArrowRight size={15} />
                </button>
                <button type="button" onClick={() => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="tl-btn ghost h-12 px-5">
                  Сравнить с бесплатным
                </button>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {[
                  { icon: <IconBolt size={12} />, t: 'включается сразу' },
                  { icon: <IconCalendarEvent size={12} />, t: 'без автопродления' },
                  { icon: <IconCheck size={12} />, t: 'отключение в один клик' },
                ].map((c) => (
                  <span key={c.t} className="tl-chip age inline-flex items-center gap-1.5"><span className="text-accent">{c.icon}</span>{c.t}</span>
                ))}
              </div>
            </div>
            <ProPreview name={name} avatarUrl={user?.profile?.avatar_url} frameId={status.pro_frame_id || status.frame_id} active={isPro} />
          </div>
        </section>

        {isPro && <ProStatus status={status} onExtend={toPlans} onCancel={handleCancel} />}

        {/* ТАРИФЫ */}
        <section ref={plansRef} className="mb-12 scroll-mt-6">
          <SecHead hint="цена за весь срок">{isPro ? 'Продлить подписку' : 'Тарифы'}</SecHead>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} current={isPro && status.pro_plan === p.id} busy={busy === p.id} onBuy={() => void handleBuy(p)} />
            ))}
          </div>
          <p className="tl-term mt-4 text-center text-[14px] text-[var(--muted-2)]">
            Оплата картой или через СБП. Подписка не продлевается сама — списаний без вашего участия не будет.
          </p>
          <p className="tl-term mt-1 text-center text-[13px] text-[var(--muted-2)]">
            Оформляя подписку, вы принимаете{' '}
            <button type="button" onClick={() => navigate('/subscriber-agreement')} className="text-accent hover:underline">соглашение подписчика</button>.
            {seller && <> Продавец: {sellerLine(seller)}{seller.email ? `, ${seller.email}` : ''} · <button type="button" onClick={() => navigate('/legal')} className="text-accent hover:underline">реквизиты</button>.</>}
          </p>
        </section>

        {/* ПАКЕТЫ ВАЛЮТЫ */}
        {packages.length > 0 && (
          <section className="mb-12">
            <SecHead hint="разовая покупка">Пакеты <span style={{ color: GOLD }}>плодов изгнания</span></SecHead>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {packages.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(user ? '/shop/packages' : '/login')}
                  className={`tl-panel tl-gcard flex flex-col items-center gap-1.5 p-4 text-center ${p.popular ? 'tl-hot' : ''}`}
                  style={p.popular ? { borderColor: 'var(--pink)' } : undefined}
                >
                  <span className="tl-head text-[10px] font-bold uppercase tracking-[.14em] text-white">{p.title}</span>
                  <span className="flex items-center gap-1.5 tl-num text-[18px] text-white">
                    <span style={{ color: GOLD }}><CurrencyIcon size={14} /></span>{nf(p.coins)}
                  </span>
                  {p.bonus_pct > 0 ? <span className="tl-chip ok">+{p.bonus_pct}% бонус</span> : <span className="tl-chip age">базовый</span>}
                  <span className="tl-num mt-1 text-[20px] text-white">{nf(p.price_rub)} ₽</span>
                  <span className="tl-term text-[13px] text-[var(--muted-2)]">с Pro — {nf(p.price_pro)} ₽</span>
                </button>
              ))}
            </div>
            <p className="tl-term mt-3 text-center text-[14px] text-[var(--muted-2)]">
              Плоды изгнания — внутренняя валюта Lustre для покупки оформления в магазине. Она не выводится и не обменивается на деньги.
            </p>
          </section>
        )}

        {/* ЧТО ВХОДИТ */}
        <section className="mb-12">
          <SecHead>Что входит в <span style={{ color: GOLD }}>Pro</span></SecHead>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {benefitsBy.map((g) => <BenefitGroup key={g.id} title={g.title} icon={g.icon} items={g.items} />)}
          </div>
        </section>

        {/* СРАВНЕНИЕ */}
        <section id="compare" className="mb-12 scroll-mt-6">
          <SecHead>Без подписки и с Pro</SecHead>
          <div className="tl-panel overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="tl-head text-[10px] font-bold uppercase tracking-[.16em]">
                  <th className="border-b border-[var(--line)] px-5 py-3 text-left text-[var(--muted)]">Возможность</th>
                  <th className="border-b border-[var(--line)] px-5 py-3 text-left text-[var(--muted)]">Без подписки</th>
                  <th className="border-b px-5 py-3 text-left" style={{ color: GOLD, borderColor: `${GOLD}66`, background: 'rgba(251,191,36,.06)' }}>
                    <span className="inline-flex items-center gap-1.5"><IconCrown size={12} /> Lustre Pro</span>
                  </th>
                </tr>
              </thead>
              <tbody className="tl-term text-[15px]">
                {COMPARE.map((r) => (
                  <tr key={r.f} className="transition-colors hover:bg-white/[0.02]">
                    <td className="border-b border-[var(--line)] px-5 py-3 text-pearl/85">{r.f}</td>
                    <td className="border-b border-[var(--line)] px-5 py-3 text-[var(--muted)]">
                      {r.free === false ? <IconMinus size={14} className="text-[var(--muted-2)]" /> : r.free}
                    </td>
                    <td className="border-b border-[var(--line)] px-5 py-3 text-white" style={{ background: 'rgba(251,191,36,.04)' }}>
                      <span className="inline-flex items-center gap-1.5"><IconCheck size={13} style={{ color: GOLD }} /> {r.pro}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ПРОМОКОД И ВОПРОСЫ */}
        <section className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
          <div className="tl-panel h-fit p-6">
            <h3 className="tl-head flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-white">
              <IconTag size={15} className="text-accent" /> Промокод
            </h3>
            <p className="tl-term mt-2 text-[15px] text-[var(--muted)]">Промокод продлевает Pro на указанное в нём число дней. Ищите их в нашем Telegram-канале.</p>
            <div className="mt-4 flex gap-2">
              <input
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handlePromo(); }}
                placeholder="КОД"
                className="tl-field min-w-0 flex-1 uppercase"
              />
              <button type="button" onClick={() => void handlePromo()} disabled={!promo.trim() || promoBusy} className="tl-btn solid shrink-0 disabled:opacity-50">
                {promoBusy ? <IconLoader2 size={13} className="animate-spin" /> : 'Применить'}
              </button>
            </div>
          </div>

          <div className="tl-panel divide-y divide-[var(--line)]">
            {FAQ.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q}>
                  <button type="button" onClick={() => setOpenFaq(open ? null : i)} aria-expanded={open}
                    className="tl-head flex w-full items-center gap-3 px-5 py-4 text-left text-[11px] font-bold uppercase tracking-[.1em] text-white hover:text-accent">
                    {item.q}
                    <span className="tl-num ml-auto text-[18px] text-accent transition-transform duration-200" style={{ transform: open ? 'rotate(45deg)' : 'none' }}>+</span>
                  </button>
                  {open && <p className="tl-term px-5 pb-4 text-[15px] leading-relaxed text-[var(--muted)]">{item.a}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {!isPro && (
          <section className="tl-panel relative mb-6 overflow-hidden p-8 text-center">
            <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-24 h-48" style={{ background: 'radial-gradient(circle at 50% 100%, rgb(var(--accent-rgb) / .22), transparent 65%)' }} />
            <p className="tl-pixel relative text-[20px] text-white" style={{ textShadow: 'var(--glow)' }}>
              Попробуйте <span className="tl-grad-text">Pro</span>
            </p>
            <p className="tl-term relative mx-auto mt-3 max-w-xl text-[15px] text-[var(--muted)]">
              Месяц — {plans.find((p) => p.id === 'month') ? nf(plans.find((p) => p.id === 'month')!.price) : 249} ₽: бейдж, оформление, +300 плодов изгнания в месяц и двойной ежедневный бонус.
            </p>
            <button type="button" onClick={toPlans} className="tl-btn solid tl-shine relative mt-5 h-12 px-8">
              <IconSparkles size={15} /> Выбрать тариф
            </button>
          </section>
        )}

        {paying && <PaymentModal order={paying} onPaid={handlePaid} onFailed={handleFailed} onClose={() => setPaying(null)} />}
      </div>
    </div>
  );
}
