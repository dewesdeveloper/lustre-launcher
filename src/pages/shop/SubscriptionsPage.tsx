import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  IconChevronLeft, IconCheck, IconGift, IconLoader2, IconTag,
  IconCrown, IconBolt, IconSparkles,
} from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import AvatarFrame from '../../components/AvatarFrame';
import ProBadge from '../../components/ProBadge';
import {
  getSubscription, cancelPro, redeemProPromo,
  type SubscriptionStatus, type ProPlan, type ProPlanId,
} from '../../api/subscriptions';
import { createProPayment, openPaymentUrl, type PaymentOrderView } from '../../api/payments';
import { PaymentModal } from '../../components/PaymentModal';
import { Loading } from '../../components/Loading';
import { currencyWord } from '../../utils/currency';
import CurrencyIcon from '../../components/icons/CaratIcon';
import { admin } from '../../admin';

const RUB = new Intl.NumberFormat('ru-RU');
/** Число с разделителями разрядов: 12 500 */
const nf = (n: number) => RUB.format(n);
/** Дата словами: 05 марта 2027 (пусто, если даты нет) */
function fmtDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
}

// Акцент Pro — золотой
const GOLD = '#fbbf24';

/** Цена за день подписки — грубая оценка для маркетинговой плашки. */
const perDay = (plan: ProPlan) => Math.max(1, Math.round(plan.price / Math.max(1, plan.months * 30)));

// Сравнение «без подписки vs Pro» — константы лимитов из controllers/pro.go
const COMPARE_ROWS: { f: string; free: string; pro: string }[] = [
  { f: 'Бейдж Pro и подсветка ника', free: '—', pro: 'Градиент фиолет → розовый' },
  { f: 'Эксклюзивная косметика', free: 'Базовый каталог', pro: 'Темы, рамки, баннер Pro' },
  { f: 'Ежедневный бонус', free: '+250 плодов', pro: '+500 плодов' },
  { f: 'Ежемесячная выплата', free: '—', pro: '150–300 плодов' },
  { f: 'Группы / участников', free: '5 / 10', pro: '30 / 50' },
  { f: 'Витрины / избранное', free: '3 / 5', pro: '6 / 10' },
  { f: 'Коллекции', free: '10', pro: '50' },
  { f: 'Аватар и баннер (размер)', free: 'до 10 МБ', pro: 'до 25 МБ' },
  { f: 'Видео в чате', free: 'до 50 МБ', pro: 'до 200 МБ' },
  { f: 'Ранний доступ и приоритет', free: '—', pro: 'Новые темы и поддержка первыми' },
];

// Витрина эксклюзивной косметики (предметы из магазина с ProOnly)
const COSMOS = [
  { cap: 'Рамка «Тернии»', rar: 'EPIC', cls: 'text-[#a78bfa]', bg: 'linear-gradient(135deg,#8338ec,#ff2d8f)' },
  { cap: 'Рамка «Крылья»', rar: 'LEGENDARY', cls: 'text-amber-300', bg: 'linear-gradient(135deg,#ff2d8f,#ffb020)' },
  { cap: 'Баннер Pro', rar: 'LEGENDARY', cls: 'text-amber-300', bg: 'linear-gradient(135deg,#22d3ee,#8338ec)' },
  { cap: 'Тема «Deep Space»', rar: 'LEGENDARY', cls: 'text-amber-300', bg: 'linear-gradient(135deg,#0f0a17,#8338ec)' },
  { cap: 'Тема «Phantom»', rar: 'EPIC', cls: 'text-[#a78bfa]', bg: 'linear-gradient(135deg,#120c1c,#ff2d8f)' },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Продлевается ли подписка автоматически?',
    a: 'Нет. Подписка не продлевается автоматически — ты сам решаешь, когда продлить. Доступ сохраняется до конца оплаченного срока.',
  },
  {
    q: 'Что будет с косметикой после отмены?',
    a: 'Премиум-рамка и баннер Pro деактивируются вместе с подпиской. Остальная косметика остаётся в инвентаре — вернуться можно в любой момент.',
  },
  {
    q: 'Какие способы оплаты доступны?',
    a: 'Банковские карты и СБП через защищённое платёжное окно. Оплата занимает меньше минуты, активация — мгновенная.',
  },
  {
    q: 'Что такое плоды изгнания и зачем они?',
    a: 'Это внутренняя валюта Lustre: за неё берут косметику в магазине. Pro каждый месяц возвращает её часть выплатой, а ежедневный бонус удваивается.',
  },
  {
    q: 'Продление сложное?',
    a: 'Один клик на этой же странице. Время продления суммируется к текущей подписке, ничего не сгорает.',
  },
];

// --- Анимированный счётчик ---
function CountUp({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setVal(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);

  return <span ref={ref}>{prefix}{nf(val)}{suffix}</span>;
}

/** Блок, плавно появляющийся при прокрутке до него. */
function Reveal({ children, className, delay = 0, style }: { children: React.ReactNode; className?: string; delay?: number; style?: React.CSSProperties }) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="tl-head text-[11px] uppercase tracking-[0.2em] text-white mb-4 flex items-center gap-3" style={{ textShadow: 'var(--glow-sm)' }}>
      {children}
      <span className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, var(--line-2), transparent)' }} />
    </h2>
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

  // Липкая кнопка: показываем после прокрутки мимо тарифов, прячем у финального CTA
  const [sticky, setSticky] = useState(false);
  const plansRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);

  const load = () => getSubscription().then(setStatus).catch(() => setStatus(null));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  // бонус monthly: показываем тост сразу после начисления
  useEffect(() => {
    if (status?.gift_granted && status.gift_amount > 0) {
      dialog.alert({
        title: 'Ежемесячная выплата',
        message: `Начислено +${nf(status.gift_amount)} ${currencyWord(status.gift_amount)}`,
        tone: 'success',
      });
      load();
    }
  }, [status?.gift_granted]);

  useEffect(() => {
    const a = plansRef.current;
    const b = finalRef.current;
    if (!a || !b) return;
    // страница скроллится внутри <main class="overflow-y-auto">, слушаем его (или window)
    const scroller = a.closest('.overflow-y-auto') || window;
    const onScroll = () => {
      const pastPlans = a.getBoundingClientRect().bottom < 0;
      const nearFinal = b.getBoundingClientRect().top < window.innerHeight * 0.85;
      setSticky(pastPlans && !nearFinal);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [loading]);

  const isPro = !!status?.is_pro;
  const isAdmin = user?.role === 'admin';
  const plans = status?.plans || [];
  const benefits = status?.benefits || [];
  const limits = status?.limits;

  const scrollToPlans = () => plansRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const scrollToCompare = () => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const handleBuy = async (plan: ProPlan) => {
    setBusy(plan.id);
    try {
      const order = await createProPayment(plan.id);
      setPaying(order);
      openPaymentUrl(order.payment_url);
    } catch (e: any) {
      dialog.alert({
        title: 'Ошибка оплаты',
        message: e?.response?.data?.error || 'Не удалось создать платёж',
        tone: 'info',
      });
    } finally {
      setBusy(null);
    }
  };

  const handlePaymentPaid = async () => {
    setPaying(null);
    try { await refreshUser(); } catch { /* ignore */ }
    await load();
    dialog.alert({
      title: 'Подписка оформлена',
      message: 'Lustre Pro активен. Ежемесячная выплата начисляется по тарифу.',
      tone: 'success',
    });
  };

  const handlePaymentFailed = (order: PaymentOrderView) => {
    setPaying(null);
    dialog.alert({
      title: 'Оплата не завершена',
      message: order.status === 'canceled' ? 'Платёж отменён — можно попробовать снова.' : 'Платёж не прошёл — можно попробовать снова.',
      tone: 'info',
    });
  };

  const handleCancel = async () => {
    const ok = await dialog.confirm({
      title: 'Отключить подписку',
      message: 'Все преимущества Lustre Pro перестанут действовать сразу. Продолжить?',
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
    setPromoBusy(true);
    try {
      const res = await redeemProPromo(promo.trim());
      updateProfile(res.profile);
      dialog.alert({ title: 'Промокод активирован', message: `Подписка продлена на ${res.days} дней`, tone: 'success' });
      setPromo('');
      load();
    } catch (e: any) {
      dialog.alert({ title: 'Промокод не найден', message: e?.response?.data?.error || 'Проверьте код', tone: 'info' });
    } finally {
      setPromoBusy(false);
    }
  };

  if (loading) return <Loading label="Lustre Pro" />;
  if (!status) return <Loading label="Lustre Pro" />;

  const minPlan = plans.length ? plans.reduce((a, b) => (a.price <= b.price ? a : b)) : null;

  return (
    <div className="min-h-screen bg-main-bg text-pearl pb-24 animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto px-6 pt-8">
        <button onClick={() => navigate(-1)} className="tl-btn ghost mb-6">
          <IconChevronLeft size={14} /> Назад
        </button>

        {/* ШАПКА */}
        <div className="flex items-end gap-4 flex-wrap mb-8">
          <div>
            <h1 className="tl-pixel text-[22px] text-white" style={{ textShadow: 'var(--glow)' }}>
              ПОДПИСКА
            </h1>
            <p className="tl-term text-[15px] tl-muted mt-3">
              Lustre Pro: статус, косметика, лимиты и выплаты.
            </p>
          </div>
        </div>

        {/* HERO */}
        <Reveal className="tl-panel relative overflow-hidden p-7 md:p-9 mb-6">
          <span className="tl-sweep-bg absolute inset-0 pointer-events-none" aria-hidden />
          <span
            className="inline-flex items-center gap-2 px-3 py-1.5 tl-head text-[10px] uppercase tracking-[0.28em]"
            style={{ color: 'var(--pink)', border: '1px solid var(--line-2)', background: 'rgb(var(--accent-rgb) / .1)' }}
          >
            <span className="tl-live-dot" /> LUSTRE PRO · Статус выше
          </span>
          <h2 className="tl-pixel text-[26px] md:text-[34px] text-white mt-4 leading-tight" style={{ textShadow: 'var(--glow)' }}>
            {isPro ? (
              <>ПРОДЛИ СВОЙ <span className="tl-grad-text">PREMIUM</span></>
            ) : (
              <>ТВОЙ ПРОФИЛЬ. <br /><span className="tl-grad-text">ТВОИ ПРАВИЛА.</span></>
            )}
          </h2>
          <p className="tl-term text-[16px] tl-muted mt-3 max-w-2xl leading-relaxed">
            {isPro
              ? 'Время продления добавится к текущей подписке. Premium продолжает работать без перерыва.'
              : 'Эксклюзивные рамки, темы и баннеры, подсветка ника, двойной ежедневный бонус и ежемесячная выплата плодов изгнания. Все игры и так бесплатны — Pro покупает статус и комфорт.'}
          </p>
          <div className="flex gap-3 flex-wrap items-center mt-6">
            <button onClick={scrollToPlans} className="tl-btn solid tl-shine px-6 h-12">
              {isPro ? 'ПРОДЛИТЬ' : `ОФОРМИТЬ ОТ ${minPlan ? nf(minPlan.price) : 399} ₽`}
            </button>
            {!isPro && (
              <button onClick={scrollToCompare} className="tl-btn ghost px-5 h-12">
                СРАВНИТЬ ВОЗМОЖНОСТИ
              </button>
            )}
            {isPro && status.days_left > 0 && (
              <span className="tl-head text-[10px] uppercase tracking-[0.16px] px-4 h-12 inline-flex items-center gap-2 border" style={{ borderColor: `${GOLD}66`, color: GOLD }}>
                <IconCrown size={14} /> Активна ещё {status.days_left} дн.
              </span>
            )}
          </div>
          <div className="flex gap-2.5 flex-wrap mt-5">
            {[
              { icon: <IconCrown size={12} />, t: 'Бейдж и подсветка ника' },
              { icon: <CurrencyIcon size={12} />, t: 'Выплата 150–300 плодов/мес' },
              { icon: <IconBolt size={12} />, t: 'Ранний доступ к контенту' },
              { icon: <IconCheck size={12} />, t: 'Отмена в один клик' },
            ].map((c, i) => (
              <span key={i} className="inline-flex items-center gap-2 px-3 py-2 border tl-head text-[10px] uppercase tracking-[0.14em]" style={{ borderColor: 'var(--line)', background: 'rgba(255,255,255,.03)', color: '#e2e2e2' }}>
                <span style={{ color: 'var(--pink)' }}>{c.icon}</span> {c.t}
              </span>
            ))}
          </div>
        </Reveal>
        {/* Статус подписки */}
        {isPro && (
          <Reveal className="tl-panel p-5 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <AvatarFrame avatarUrl={status.avatar_frame_url || user?.profile?.avatar_url} frameId={status.frame_id} size="small" />
              <div>
                <p className="tl-head text-[10px] uppercase tracking-[0.18em] tl-muted">Подписка активна</p>
                <p className="tl-head text-[10px] uppercase tracking-[0.12em] text-white mt-1 flex items-center gap-2">
                  до {fmtDate(status.pro_until)} · {status.days_left} дн. <ProBadge />
                </p>
              </div>
              <button onClick={handleCancel} className="tl-btn ghost ml-auto">Отключить Pro</button>
            </div>
          </Reveal>
        )}

        {/* ТАРИФЫ */}
        <div ref={plansRef} className="scroll-mt-6">
          <SecTitle>Выбери тариф</SecTitle>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                active={status.pro_plan === plan.id}
                busy={busy === plan.id}
                onBuy={() => handleBuy(plan)}
              />
            ))}
          </div>
        </div>

        {/* СРАВНЕНИЕ */}
        <div id="compare" className="scroll-mt-6">
          <SecTitle>Без подписки vs Pro</SecTitle>
          <Reveal className="tl-panel p-5 mb-10 overflow-x-auto">
            <table className="w-full border-collapse text-[12px] min-w-[560px]">
              <thead>
                <tr>
                  <th className="tl-head text-[10px] uppercase tracking-[0.16em] tl-muted text-left border p-3" style={{ borderColor: 'var(--line)', background: 'rgb(var(--accent-rgb) / .05)' }}>Возможность</th>
                  <th className="tl-head text-[10px] uppercase tracking-[0.16em] tl-muted text-left border p-3" style={{ borderColor: 'var(--line)', background: 'rgb(var(--accent-rgb) / .05)' }}>Без подписки</th>
                  <th className="tl-head text-[10px] uppercase tracking-[0.16em] text-left border p-3" style={{ borderColor: 'var(--pink)', background: 'var(--pink)', color: '#0b0210' }}>Lustre Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((r) => (
                  <tr key={r.f} className="hover:bg-white/[0.02] transition-colors">
                    <td className="border p-3 text-pearl/85" style={{ borderColor: 'var(--line)' }}>{r.f}</td>
                    <td className="border p-3 tl-muted" style={{ borderColor: 'var(--line)' }}>{r.free}</td>
                    <td className="border p-3 text-white" style={{ borderColor: 'var(--line)', background: 'rgb(var(--accent-rgb) / .05)' }}>{r.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
        </div>

        {/* ВИТРИНА КОСМЕТИКИ */}
        <SecTitle>Что открывается</SecTitle>
        <Reveal className="tl-panel p-5 mb-10">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {COSMOS.map((c) => (
              <div key={c.cap} className="tl-lift border p-3 text-center" style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
                <div className="h-16 mb-3 border" style={{ borderColor: 'var(--line)', background: c.bg }} />
                <p className="tl-head text-[10px] uppercase tracking-[0.1em] text-white">{c.cap}</p>
                <p className={`tl-term text-[14px] mt-1 ${c.cls}`}>{c.rar}</p>
              </div>
            ))}
          </div>
          <p className="tl-term text-[13px] tl-muted text-center mt-4">
            Эксклюзивная косметика Pro <b className="text-white">не продаётся за плоды</b> — она выдаётся только с подпиской.
          </p>
        </Reveal>

        {/* СЧИТАЕМ ВЫГОДУ */}
        <SecTitle>Считаем выгоду</SecTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          <Reveal className="tl-panel stat px-4 py-5 text-center">
            <div className="tl-num text-[24px] text-white"><CountUp to={500} prefix="+" /></div>
            <div className="tl-head text-[10px] uppercase tracking-[0.14em] tl-muted mt-2">плодов в день вместо +250</div>
          </Reveal>
          <Reveal delay={0.08} className="tl-panel stat px-4 py-5 text-center">
            <div className="tl-num text-[24px] text-white"><CountUp to={plans.find(p => p.id === 'year')?.gift_total ?? 1800} /></div>
            <div className="tl-head text-[10px] uppercase tracking-[0.14em] tl-muted mt-2">плодов возвращается за год подписки</div>
          </Reveal>
          <Reveal delay={0.16} className="tl-panel stat px-4 py-5 text-center">
            <div className="tl-num text-[24px] text-white"><CountUp to={minPlan ? perDay(minPlan) : 10} suffix=" ₽" /></div>
            <div className="tl-head text-[10px] uppercase tracking-[0.14em] tl-muted mt-2">в день — столько стоит статус</div>
          </Reveal>
        </div>

        {/* ПРЕИМУЩЕСТВА — акцентный блок подписки */}
        <Reveal className="tl-panel relative overflow-hidden p-7 mb-8" style={{ borderColor: `${GOLD}73` }}>
          <span className="absolute -top-24 -right-16 w-72 h-72 rounded-full blur-[110px] pointer-events-none" style={{ background: 'rgba(251,191,36,.14)' }} />
          <span className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full blur-[110px] pointer-events-none" style={{ background: 'rgb(var(--accent-rgb) / .12)' }} />
          <div className="relative">
            <span className="tl-head text-[10px] uppercase tracking-[0.3em]" style={{ color: GOLD }}>Акцент подписки</span>
            <h2 className="tl-pixel text-[15px] text-white mt-3" style={{ textShadow: 'var(--glow)' }}>ЧТО ВХОДИТ В LUSTRE PRO</h2>
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {benefits.map((b) => (
                <li key={b.key} className="flex items-start gap-3">
                  <IconCheck size={15} style={{ color: GOLD }} className="mt-0.5 shrink-0" />
                  <span className="tl-term text-[15px] leading-snug">
                    <span className="text-white">{b.title}</span>
                    {b.hint ? <span className="tl-muted"> {b.hint}</span> : null}
                    {b.pro_only && (
                      <span className="ml-2 tl-head text-[10px] uppercase tracking-[0.14em] align-middle px-1.5 py-0.5" style={{ color: GOLD, border: `1px solid ${GOLD}66`, background: `${GOLD}1a` }}>
                        только подписка
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {limits && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-7">
                <LimitChip label="Групп" value={`${limits.groups}`} />
                <LimitChip label="Участников" value={`${limits.group_members}`} />
                <LimitChip label="Витрин" value={`${limits.showcases}`} />
                <LimitChip label="Избранного" value={`${limits.favorites}`} />
              </div>
            )}
          </div>
        </Reveal>

        {/* ОТЗЫВЫ */}
        <SecTitle>Что говорят</SecTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {[
            { t: 'Оформил квартал ради рамки, а остался из-за выплат и лимитов — витрин теперь хватает на всю коллекцию.', n: '@void_runner', m: 'Pro 4 мес.' },
            { t: 'Ник в ленте светится — сразу видно кто тут главный. Подсветка стоит своих копеек в день.', n: '@neon_fox', m: 'Pro 1 мес.' },
            { t: 'Годовой взял: выплата каждый месяц копится, косметику за это время не догонишь покупками.', n: '@pixel_witch', m: 'Pro 7 мес.' },
          ].map((q, i) => (
            <Reveal key={q.n} delay={i * 0.08} className="tl-panel p-5 flex flex-col gap-3">
              <p className="tl-term text-[15px] text-pearl/85 leading-relaxed">«{q.t}»</p>
              <div className="flex items-center gap-3 mt-auto">
                <span className="w-7 h-7 border shrink-0" style={{ borderColor: 'var(--line-2)', background: 'linear-gradient(135deg, var(--pink), var(--violet2))' }} />
                <div>
                  <div className="tl-head text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--pink)' }}>{q.n}</div>
                  <div className="tl-term text-[13px] tl-muted">{q.m}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* ПОДАРОК ДРУГУ */}
        <Reveal className="tl-panel p-6 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="w-12 h-12 shrink-0 flex items-center justify-center border" style={{ borderColor: 'var(--line)', background: 'rgb(var(--accent-rgb) /.08)', color: 'var(--pink)' }}>
              <IconGift size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="tl-head text-[11px] uppercase tracking-[0.14em] text-white">
                Подарить <span style={{ color: 'var(--pink)' }}>Premium</span> другу
              </h3>
              <p className="tl-term text-[14px] tl-muted mt-1.5">
                От {nf(399)} ₽. Мгновенная активация. Получи прогресс в бейдже «Меценат».
              </p>
            </div>
            <button
              onClick={() => dialog.alert({
                title: 'Подарочные коды',
                message: 'Промокоды выдаются в поддержке. Пока можно активировать промокод ниже.',
                tone: 'info',
              })}
              className="tl-btn ghost shrink-0"
            >
              Подарить <IconChevronLeft size={13} className="rotate-180" />
            </button>
          </div>
        </Reveal>

        {/* ПРОМОКОД */}
        <Reveal className="tl-panel p-6 mb-8">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="w-12 h-12 shrink-0 flex items-center justify-center border" style={{ borderColor: 'var(--line)', background: 'rgb(var(--accent-rgb) /.08)', color: 'var(--pink)' }}>
              <IconTag size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="tl-head text-[11px] uppercase tracking-[0.14em] text-white">Есть промокод?</h3>
              <p className="tl-term text-[14px] tl-muted mt-1.5">Введи код и получи скидку прямо сейчас</p>
              <p className="tl-term text-[13px] mt-1" style={{ color: 'var(--muted-2)' }}>
                Подсказка: ищи промокоды в нашем Telegram-канале
              </p>
              <div className="flex gap-2 mt-3 flex-wrap">
                <input
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handlePromo(); }}
                  placeholder="ВВЕДИТЕ ПРОМОКОД"
                  className="tl-field flex-1 min-w-[220px] uppercase"
                />
                <button
                  onClick={handlePromo}
                  disabled={!promo.trim() || promoBusy}
                  className="tl-btn disabled:opacity-50"
                >
                  {promoBusy ? <IconLoader2 size={13} className="animate-spin" /> : 'Применить'}
                </button>
              </div>
            </div>
          </div>
        </Reveal>

        {/* FAQ */}
        <SecTitle>Вопросы</SecTitle>
        <div className="max-w-3xl mx-auto mb-10 flex flex-col gap-2.5">
          {FAQ_ITEMS.map((item, i) => (
            <Reveal key={item.q} delay={i * 0.05}>
              <details className="group tl-panel">
                <summary className="cursor-pointer list-none p-4 flex items-center gap-3 tl-head text-[10px] uppercase tracking-[0.1em] text-white">
                  {item.q}
                  <span className="ml-auto tl-num text-[18px] transition-transform duration-200 group-open:rotate-45" style={{ color: 'var(--pink)' }}>+</span>
                </summary>
                <p className="px-4 pb-4 tl-term text-[14px] tl-muted leading-relaxed">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>

        {/* ФИНАЛЬНЫЙ CTA */}
        <div ref={finalRef}>
          <Reveal className="tl-panel relative overflow-hidden p-8 text-center mb-6">
            <span className="absolute inset-x-0 -bottom-24 h-48 pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 100%, rgb(var(--accent-rgb) / .22), transparent 65%)' }} />
            <h3 className="tl-pixel text-[20px] text-white relative" style={{ textShadow: 'var(--glow)' }}>
              ХВАТИТ СМОТРЕТЬ. <span className="tl-grad-text">ПОРА ВЫДЕЛЯТЬСЯ.</span>
            </h3>
            <p className="tl-term text-[15px] tl-muted mt-3 mx-auto max-w-xl relative">
              Оформи Lustre Pro и забери приветственный набор: рамка, баннер и двойной бонус уже ждут.
            </p>
            <button onClick={scrollToPlans} className="tl-btn solid tl-shine px-8 h-12 mt-5 relative">
              <IconSparkles size={15} /> ОФОРМИТЬ LUSTRE PRO
            </button>
          </Reveal>
        </div>

        <p className="tl-term text-[13px] text-center mb-5" style={{ color: 'var(--muted-2)' }}>
          Подписка не продлевается автоматически. Вы можете отменить её в любой момент.
        </p>

        {isAdmin && admin && <admin.ProGrantPanel onGranted={load} />}

        {paying && (
          <PaymentModal
            order={paying}
            onPaid={handlePaymentPaid}
            onFailed={handlePaymentFailed}
            onClose={() => setPaying(null)}
          />
        )}
      </div>

      {/* Липкая кнопка (приподнята над BottomBar h-16 в Electron) */}
      <div
        className="fixed left-1/2 bottom-20 z-40 flex items-center gap-4 px-5 py-3 border transition-transform duration-300"
        style={{
          background: 'rgb(13 7 20 / 0.94)',
          borderColor: 'var(--pink)',
          boxShadow: '0 0 26px rgb(var(--accent-rgb) / 0.3)',
          transform: sticky ? 'translate(-50%, 0)' : 'translate(-50%, 200%)',
        }}
      >
        <div>
          <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-white">LUSTRE PRO</span>
          <span className="tl-num text-[18px] ml-2" style={{ color: 'var(--pink)' }}>от {minPlan ? nf(minPlan.price) : 399} ₽</span>
          <span className="tl-term text-[14px] ml-2 tl-muted">· отмена в один клик</span>
        </div>
        <button onClick={scrollToPlans} className="tl-btn solid tl-shine">Оформить</button>
      </div>
    </div>
  );
}
// --- карточка тарифа ---
function PlanCard({ plan, active, busy, onBuy }: { plan: ProPlan; active: boolean; busy: boolean; onBuy: () => void }) {
  const hot = plan.highlight;
  return (
    <div
      className={`relative tl-panel tl-lift p-6 flex flex-col ${hot ? 'tl-hot' : ''}`}
      style={hot ? { borderColor: 'var(--pink)', background: 'linear-gradient(180deg, rgb(var(--accent-rgb) / .12), transparent 60%)' } : undefined}
    >
      {plan.badge && (
        <span
          className={`absolute -top-px left-6 px-2 py-1 tl-head text-[10px] uppercase tracking-[0.16em] ${hot ? 'tl-badge-pulse' : ''}`}
          style={hot
            ? { background: 'var(--pink)', color: '#0b0210' }
            : { background: 'rgb(var(--accent-rgb) /.16)', color: 'var(--pink)', border: '1px solid var(--line-2)' }}
        >
          {plan.badge}
        </span>
      )}

      <h3 className={`tl-head text-[12px] uppercase tracking-[0.14em] text-white ${plan.badge ? 'mt-6' : ''}`}>{plan.title}</h3>

      <div className="flex items-end gap-2 mt-4 flex-wrap">
        <span className="tl-num text-[32px] text-white leading-none">{nf(plan.price)} ₽</span>
        {plan.old_price > plan.price && (
          <span className="tl-num text-[16px] tl-muted line-through pb-1">{nf(plan.old_price)} ₽</span>
        )}
      </div>

      <div className="tl-term text-[14px] tl-muted mt-2">
        {nf(plan.per_month)} ₽ / мес{plan.months > 1 ? ` · ${plan.months} мес` : ' · без обязательств'}
      </div>

      <span
        className="inline-flex items-center gap-1.5 mt-2.5 w-fit px-2.5 py-1 tl-head text-[10px] uppercase tracking-[0.12em]"
        style={{ color: 'var(--cyan2)', border: '1px solid rgb(var(--cyan-rgb) / .35)', background: 'rgb(var(--cyan-rgb) / .08)' }}
      >
        ≈ {perDay(plan)} ₽ в день
      </span>

      {plan.save_pct > 0 && (
        <p className="tl-head text-[10px] uppercase tracking-[0.14em] mt-2.5" style={{ color: 'var(--green2)' }}>
          Выгода {plan.save_pct}% · экономия {nf(plan.save_total)} ₽
        </p>
      )}

      {/* Выплата */}
      <div className="mt-4 p-3.5 border flex flex-col gap-1.5" style={{ borderColor: 'rgba(251,191,36,.35)', background: 'rgba(251,191,36,.07)' }}>
        <p className="flex items-center gap-2 tl-term text-[15px]">
          <span style={{ color: GOLD }}><CurrencyIcon size={15} /></span>
          <span className="text-white">+{nf(plan.gift_per_month)}</span>
          <span className="tl-muted text-[13px]">плодов изгнания каждый месяц</span>
        </p>
        {plan.months > 1 && (
          <p className="tl-term text-[13px]" style={{ color: 'var(--muted-2)' }}>
            до {nf(plan.gift_total)} плодов за {plan.months} мес — если забирать каждый месяц
          </p>
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {(planFeatures(plan.id)).map((f) => (
          <li key={f} className="flex gap-2 items-start tl-term text-[14px] tl-muted">
            <IconCheck size={13} style={{ color: 'var(--pink)' }} className="mt-1 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onBuy}
        disabled={busy}
        className={`mt-5 w-full h-11 tl-btn ${hot ? 'solid tl-shine' : ''} disabled:opacity-50`}
      >
        {busy ? <IconLoader2 size={14} className="animate-spin" /> : active ? 'Продлить' : 'Оформить'}
      </button>
    </div>
  );
}

/** Ключевые фичи тарифа — короткий маркетинговый список на карточке. */
function planFeatures(id: ProPlanId): string[] {
  if (id === 'year') return ['Всё из квартального тарифа', 'Бейдж «Меценат»', 'Максимальная выгода 25%'];
  if (id === 'quarter') return ['Всё из месячного тарифа', 'Баннер Pro в подписке', 'Приоритетная поддержка'];
  return ['Бейдж Pro и подсветка ника', 'Эксклюзивные темы и рамки', 'Двойной ежедневный бонус'];
}

function LimitChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="tl-panel px-4 py-3 text-center">
      <p className="tl-num text-[20px] text-white leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <p className="tl-head text-[10px] uppercase tracking-[0.16em] tl-muted mt-2">{label}</p>
    </div>
  );
}
