import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft, IconArrowDownLeft, IconArrowUpRight, IconLoader2, IconCoin } from '@tabler/icons-react';
import { getCoinHistory, type CoinTx } from '../../api/coinHistory';
import { Loading } from '../../components/Loading';
import CurrencyIcon from '../../components/icons/CaratIcon';

const nf = (n: number) => new Intl.NumberFormat('ru-RU').format(n);

type Filter = 'all' | 'earn' | 'spend';

function fmtWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return `сегодня, ${time}`;
  if (days === 1) return `вчера, ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString('ru-RU', { weekday: 'short' })}, ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
}

export default function CoinHistoryPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<CoinTx[]>([]);
  const [totals, setTotals] = useState({ earned: 0, spent: 0, bought: 0 });
  const [balance, setBalance] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (kind: Filter, off = 0, append = false) => {
    const data = await getCoinHistory({ limit: 25, offset: off, kind });
    setItems((prev) => (append ? [...prev, ...data.items] : data.items));
    setTotals(data.totals);
    setBalance(data.balance);
    setHasMore(data.has_more);
    setOffset(off);
  }, []);

  useEffect(() => {
    setLoading(true);
    load(filter)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter, load]);

  return (
    <div className="min-h-screen bg-main-bg text-pearl pb-24 animate-in fade-in duration-500">
      <div className="max-w-5xl mx-auto px-6 pt-8">
        <button onClick={() => navigate(-1)} className="tl-btn ghost mb-6">
          <IconChevronLeft size={14} /> Назад
        </button>

        <h1 className="tl-pixel text-[22px] text-white" style={{ textShadow: 'var(--glow)' }}>
          ИСТОРИЯ ОПЕРАЦИЙ
        </h1>
        <p className="tl-term text-[15px] tl-muted mt-3 mb-8 max-w-2xl leading-relaxed">
          Каждое начисление и каждая трата плодов изгнания — с суммой, причиной и балансом после операции.
        </p>

        {/* ИТОГИ */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <TotalCard label="Заработано" value={totals.earned} tint="text-emerald-400" icon={<IconArrowDownLeft size={13} />} />
          <TotalCard label="Потрачено" value={totals.spent} tint="text-pearl" icon={<IconArrowUpRight size={13} />} />
          <TotalCard label="Куплено в магазине" value={totals.bought} tint="text-accent" icon={<IconCoin size={13} />} />
        </section>

        {/* ФИЛЬТРЫ */}
        <div className="tl-tabs mb-3" style={{ width: '100%' }}>
          {([['all', 'Все'], ['earn', 'Приход'], ['spend', 'Расход']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`tl-tab flex-1 justify-center ${filter === id ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4 tl-head text-[10px] tracking-[0.22em] uppercase tl-muted">
          <span>Источник: все источники</span>
          <span className="flex items-center gap-1.5">
            Баланс:
            <span className="tl-term text-[15px] tracking-normal normal-case text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {nf(balance)}
            </span>
          </span>
        </div>

        {/* СПИСОК */}
        {loading ? (
          <Loading label="История" />
        ) : items.length === 0 ? (
          <div className="tl-panel py-16 text-center">
            <CurrencyIcon size={40} className="mx-auto opacity-60" />
            <p className="tl-head text-[10px] tracking-[0.2em] uppercase tl-muted mt-4">Операций пока нет</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((tx) => <TxRow key={tx.id} tx={tx} />)}
          </div>
        )}

        {hasMore && !loading && (
          <button
            onClick={async () => {
              setLoadingMore(true);
              try {
                await load(filter, offset + 25, true);
              } finally {
                setLoadingMore(false);
              }
            }}
            disabled={loadingMore}
            className="tl-btn ghost w-full mt-4 disabled:opacity-50"
          >
            {loadingMore ? <IconLoader2 size={14} className="animate-spin" /> : 'Показать ещё'}
          </button>
        )}
      </div>
    </div>
  );
}

function TotalCard({ label, value, tint, icon }: { label: string; value: number; tint: string; icon: React.ReactNode }) {
  return (
    <div className="tl-panel px-5 py-4">
      <p className={`tl-head text-[10px] tracking-[0.2em] uppercase flex items-center gap-1.5 ${tint}`}>
        {icon} {label}
      </p>
      <p className="tl-num text-[26px] text-white mt-2 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {nf(value)}
      </p>
    </div>
  );
}

function TxRow({ tx }: { tx: CoinTx }) {
  const isEarn = tx.kind === 'earn';
  return (
    <div className="tl-panel flex items-center gap-4 p-4 hover:border-[var(--line-2)] transition-colors">
      <div
        className={`w-10 h-10 shrink-0 flex items-center justify-center border ${
          isEarn
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
            : 'border-[var(--line)] bg-white/5 text-pearl/72'
        }`}
      >
        {isEarn ? <IconArrowDownLeft size={17} /> : <IconArrowUpRight size={17} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="tl-head text-[10px] uppercase tracking-[0.12em] text-white truncate">{tx.title || 'Операция'}</p>
        <p className="tl-term text-[14px] tl-muted truncate">{tx.source}</p>
        <p className="tl-term text-[13px] tl-muted opacity-70 mt-0.5">{fmtWhen(tx.created_at)}</p>
      </div>

      <div className="text-right shrink-0">
        <p className={`tl-num text-[15px] ${isEarn ? 'text-emerald-400' : 'text-white'}`}>
          {isEarn ? '+' : '−'}{nf(Math.abs(tx.amount))}
        </p>
        <p className="tl-term text-[14px] tl-muted mt-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
          <span className="opacity-70">остаток </span>{nf(tx.balance_after)}
        </p>
      </div>
    </div>
  );
}
