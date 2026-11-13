import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconArrowDownLeft, IconArrowUpRight, IconCrown, IconGift, IconListCheck,
  IconTargetArrow, IconPackage, IconChevronRight, IconLoader2, IconCheck,
} from '@tabler/icons-react';
import { getCoinHistory, getCoinPackages, type CoinTx, type CoinPackagesData } from '../../../api/coinHistory';
import { createCoinPayment, openPaymentUrl, type PaymentOrderView } from '../../../api/payments';
import type { ShopData } from '../../../api/shop';
import { useDialog } from '../../../components/Dialogs';
import { PaymentModal } from '../../../components/PaymentModal';
import { nf } from '../constants';
import CurrencyIcon from '../../../components/icons/CaratIcon';

const nfRu = (n: number) => `${nf(n)} ₽`;

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

/** Панель «Касса»: баланс, заработок, последние операции */
export function CashDeskPanel({ data, onBonus, claiming = false }: { data: ShopData | null; onBonus: () => void; claiming?: boolean }) {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<CoinTx[]>([]);
  const [pkgs, setPkgs] = useState<CoinPackagesData | null>(null);

  useEffect(() => {
    getCoinHistory({ limit: 4 })
      .then((history) => setRecent(history.items))
      .catch(() => setRecent([]));
    getCoinPackages().then(setPkgs).catch(() => setPkgs(null));
  }, [data?.coins]);

  const balance = data?.coins ?? 0;
  const limits = data?.limits;
  const isPro = !!data?.is_pro;

  const earn = [
    { icon: <IconListCheck size={15} />, title: 'Квесты', value: 'до 250 за задание', tint: 'text-violet', to: '/subscriptions' },
    { icon: <IconCrown size={15} />, title: 'Premium', value: isPro ? `${limits?.gift_per_month ?? 150} в месяц` : 'до 300 в месяц', tint: 'text-amber-400', to: '/subscriptions' },
    { icon: <IconTargetArrow size={15} />, title: 'Достижения', value: 'за активность', tint: 'text-emerald-400', to: '/profile/badges' },
    { icon: <IconPackage size={15} />, title: 'Пакеты', value: `от ${nfRu(pkgs?.packages[0]?.price_rub ?? 99)}`, tint: 'tl-muted', to: '/shop/packages' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_1fr] gap-4">
      {/* Баланс */}
      <div className="tl-panel p-6 flex flex-col">
        <p className="tl-head text-[10px] font-bold uppercase tracking-[0.25em] tl-muted flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-accent" /> Баланс
        </p>
        <div className="flex items-center gap-3 mt-4">
          <CurrencyIcon size={30} />
          <span className="tl-pixel text-[28px] text-white leading-none">{nf(balance)}</span>
        </div>
        <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] mt-2" style={{ color: 'var(--muted-2)' }}>плодов изгнания</p>

        <button
          onClick={onBonus}
          disabled={!data?.bonus_ready || claiming}
          className="tl-btn solid block mt-5"
        >
          {claiming ? 'Забираем…' : data?.bonus_ready ? 'Забрать ежедневный бонус' : 'Бонус уже получен'}
        </button>
        <p className="tl-term text-[15px] tl-muted mt-2 text-center">
          {isPro ? `Доступно сегодня: ${nf(limits?.daily_bonus ?? 500)}` : 'Доступно сегодня'}
        </p>
      </div>

      {/* Заработать */}
      <div className="tl-panel p-6">
        <p className="tl-head text-[10px] font-bold uppercase tracking-[0.25em] tl-muted flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-violet" /> Заработать
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          {earn.map((e) => (
            <button
              key={e.title}
              type="button"
              onClick={() => navigate(e.to)}
              className="group border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.03)] px-4 py-3 text-left transition-colors cursor-pointer hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.06)]"
            >
              <p className="tl-head text-[10px] font-bold text-pearl/85 flex items-center gap-2">
                <span className={e.tint}>{e.icon}</span> {e.title}
                <IconChevronRight size={12} className="ml-auto text-[var(--muted-2)] transition-colors group-hover:text-[var(--pink)]" />
              </p>
              <p className="tl-term text-[15px] tl-muted mt-1">{e.value}</p>
            </button>
          ))}
        </div>
      </div>

      {/* История */}
      <div className="tl-panel p-6">
        <p className="tl-head text-[10px] font-bold uppercase tracking-[0.25em] tl-muted flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-emerald-400" /> История
        </p>
        <div className="mt-4 space-y-2">
          {recent.length === 0 ? (
            <p className="tl-term text-[15px] tl-muted py-4">Операций пока нет</p>
          ) : (
            recent.map((tx) => (
              <div key={tx.id} className="flex items-center gap-2.5">
                <span
                  className={`w-6 h-6 shrink-0 flex items-center justify-center border ${
                    tx.kind === 'earn' ? 'text-emerald-400' : 'tl-muted'
                  }`}
                  style={{ borderColor: 'var(--line)' }}
                >
                  {tx.kind === 'earn' ? <IconArrowDownLeft size={12} /> : <IconArrowUpRight size={12} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="tl-term text-[15px] text-pearl/70 truncate">{tx.title}</p>
                  <p className="tl-term text-[13px]" style={{ color: 'var(--muted-2)' }}>{ago(tx.created_at)}</p>
                </div>
                <span className={`tl-head text-[10px] font-bold ${tx.kind === 'earn' ? 'text-emerald-400' : 'tl-muted'}`}>
                  {tx.kind === 'earn' ? '+' : '−'}{nf(Math.abs(tx.amount))}
                </span>
              </div>
            ))
          )}
        </div>
        <button
          onClick={() => navigate('/shop/history')}
          className="tl-btn ghost block mt-4"
        >
          Вся история <IconChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

/** Секция «Пакеты монет» */
export function CoinPackagesSection({ isPro, onPaid }: { isPro: boolean; onPaid?: () => void }) {
  const navigate = useNavigate();
  const dialog = useDialog();
  const [pkgs, setPkgs] = useState<CoinPackagesData | null>(null);
  const [busy, setBusy] = useState('');
  const [paying, setPaying] = useState<PaymentOrderView | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    getCoinPackages().then(setPkgs).catch(() => setPkgs(null));
  }, [isPro, refreshKey]);

  if (!pkgs) return null;

  const buy = async (id: string, title: string) => {
    setBusy(id);
    try {
      const order = await createCoinPayment(id);
      setPaying(order);
      openPaymentUrl(order.payment_url);
    } catch (e: any) {
      dialog.alert({
        title: 'Ошибка оплаты',
        message: e?.response?.data?.error || `Пакет «${title}» нельзя купить прямо сейчас`,
        tone: 'info',
      });
    } finally {
      setBusy('');
    }
  };

  const handlePaid = () => {
    setPaying(null);
    setRefreshKey((k) => k + 1);
    onPaid?.();
    dialog.alert({ title: 'Пакет оплачен', message: 'Валюта зачислена на баланс', tone: 'success' });
  };

  const handleFailed = (order: PaymentOrderView) => {
    setPaying(null);
    dialog.alert({
      title: 'Оплата не завершена',
      message: order.status === 'canceled' ? 'Платёж отменён — можно попробовать снова.' : 'Платёж не прошёл — можно попробовать снова.',
      tone: 'info',
    });
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <h2 className="tl-pixel text-[16px] text-white" style={{ textShadow: 'var(--glow)' }}>ПАКЕТЫ ВАЛЮТЫ</h2>
        <button
          onClick={() => dialog.alert({
            title: 'Подарить пакет',
            message: 'Подарочные пакеты будут доступны вместе с промокодами в поддержке',
            tone: 'info',
          })}
          className="tl-btn ghost"
        >
          <IconGift size={14} /> Подарить пакет
        </button>
      </div>

      {/* Premium-пакет */}
      <div
        className="tl-panel relative overflow-hidden p-6 mb-6"
        style={{ background: 'linear-gradient(135deg, rgba(131,56,236,.22), rgb(var(--accent-rgb)/.05) 55%, transparent)' }}
      >
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-[240px] flex-1">
            <p className="tl-head text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400 flex items-center gap-1.5">
              <IconCrown size={12} /> Premium · выплата валютой
            </p>
            <h3 className="tl-pixel text-[16px] text-white mt-3">Premium платит плодами</h3>
            <p className="tl-term text-[15px] tl-muted mt-2 max-w-lg leading-relaxed">
              Подарок падает на баланс в день оплаты, дальше валюта капает каждый месяц — без квестов и просмотров.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 flex-1 min-w-[300px]">
            <div className="border px-4 py-3" style={{ borderColor: 'rgba(131,56,236,.5)', background: 'rgba(131,56,236,.12)' }}>
              <p className="tl-head text-[10px] font-bold uppercase tracking-widest tl-muted">Сразу при активации</p>
              <p className="tl-pixel text-[18px] text-white mt-2">{nf(pkgs.premium.gift_now)}</p>
              <p className="tl-term text-[13px] tl-muted">бонусом на баланс</p>
            </div>
            <div className="border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'rgb(var(--accent-rgb)/.03)' }}>
              <p className="tl-head text-[10px] font-bold uppercase tracking-widest tl-muted">Каждый месяц</p>
              <p className="tl-pixel text-[18px] text-white mt-2">+{nf(pkgs.premium.gift_per_day)}</p>
              <p className="tl-term text-[13px] tl-muted">за 30 дней подписки</p>
            </div>
            <div className="border px-4 py-3" style={{ borderColor: 'var(--line)', background: 'rgb(var(--accent-rgb)/.03)' }}>
              <p className="tl-head text-[10px] font-bold uppercase tracking-widest tl-muted">За год</p>
              <p className="tl-pixel text-[18px] text-white mt-2">до {nf(pkgs.premium.gift_total)}</p>
              <p className="tl-term text-[13px] tl-muted">если забирать каждый месяц</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-6 pt-5" style={{ borderTop: '1px solid var(--line)' }}>
          <button
            onClick={() => navigate('/subscriptions')}
            className="tl-btn solid"
          >
            {pkgs.premium.can_buy ? 'Подключить Premium' : 'Управление Premium'}
          </button>
          <span className="tl-pixel text-[14px] text-white">
            {nf(pkgs.premium.price_rub)} ₽ <span className="tl-head text-[10px] tl-muted font-bold">за год</span>
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-4 tl-head text-[10px] font-bold uppercase tracking-[0.15em] tl-muted">
            <span>Кроме валюты</span>
            <span className="flex items-center gap-1.5"><IconCheck size={12} className="text-violet" /> 4К качества</span>
            <span className="flex items-center gap-1.5"><IconCheck size={12} className="text-violet" /> Рамки и стикеры</span>
          </div>
        </div>
      </div>

      {/* Сетка пакетов */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {pkgs.packages.map((p) => (
          <div
            key={p.id}
            className="tl-panel relative p-5 flex flex-col"
            style={p.popular
              ? { background: 'linear-gradient(180deg, rgba(131,56,236,.25), transparent)', borderColor: 'rgba(131,56,236,.5)' }
              : undefined}
          >
            {p.badge && (
              <span className="tl-chip" style={{ position: 'absolute', top: 14, right: 14, color: '#c084fc', borderColor: 'rgba(192,132,252,.5)', background: 'rgba(192,132,252,.12)' }}>
                {p.badge}
              </span>
            )}
            {p.popular && (
              <span className="tl-chip age" style={{ position: 'absolute', top: -10, left: 14 }}>
                Наш выбор
              </span>
            )}

            <CurrencyIcon size={34} />
            <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] tl-muted mt-4">{p.title}</p>
            {p.bonus_pct > 0 && (
              <span className="tl-chip mt-1.5 self-start" style={{ color: '#c084fc', borderColor: 'rgba(192,132,252,.5)', background: 'rgba(192,132,252,.12)' }}>
                +{p.bonus_pct}% монет
              </span>
            )}

            <p className="flex items-center gap-2 tl-pixel text-[20px] text-white mt-3">
              <CurrencyIcon size={18} /> {nf(p.coins)}
            </p>
            <p className="tl-head text-[10px] font-bold text-emerald-400 mt-1">+{nf(p.coins)}</p>
            <p className="tl-term text-[13px] tl-muted">подарком за первую покупку</p>

            <div className="mt-auto pt-5 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--line)' }}>
              <div>
                <p className="tl-head text-[11px] font-bold text-white">{nf(p.price_rub)} ₽</p>
                {p.price_pro > 0 && <p className="tl-term text-[13px] text-amber-400/80 font-bold">{nf(p.price_pro)} ★</p>}
              </div>
              <button
                onClick={() => buy(p.id, p.title)}
                disabled={busy === p.id}
                className="tl-btn"
              >
                {busy === p.id ? <IconLoader2 size={13} className="animate-spin" /> : 'Купить'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {paying && (
        <PaymentModal
          order={paying}
          onPaid={handlePaid}
          onFailed={handleFailed}
          onClose={() => setPaying(null)}
        />
      )}
    </section>
  );
}
