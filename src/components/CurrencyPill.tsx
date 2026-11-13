import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RESOURCE_KEYS, CACHE_POLICY, makeResourceFetcher, currentUserId } from '../api/catalog';
import type { ShopData } from '../api/shop';
import { useCachedResource } from '../hooks/useCachedResource';
import { SHOP_CHANGED_EVENT } from '../utils/shopEvents';
import { currencyWord } from '../utils/currency';
import CurrencyIcon from './icons/CaratIcon';
import Tooltip from './Tooltip';
import CountUp from './CountUp';

const nf = new Intl.NumberFormat('ru-RU');

/**
 * Счётчик валюты в верхнем навбаре: иконка плода + количество.
 * Данные берутся из кэша магазина (без лишних запросов) и обновляются
 * сразу после покупки/бонуса, так как мутации инвалидируют кэш.
 * Раз в минуту — только при видимом окне, чтобы счётчик не устаревал
 * после операций в других окнах лаунчера.
 */
export default function CurrencyPill() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id ?? currentUserId();

  const { data, refresh } = useCachedResource<ShopData>(
    uid ? RESOURCE_KEYS.shop(uid) : null,
    makeResourceFetcher<ShopData>('/shop/'),
    CACHE_POLICY.shop,
  );

  useEffect(() => {
    const sync = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(sync, 60_000);
    window.addEventListener('focus', sync);
    // Баланс изменился (покупка/бонус/награда/подписка) — обновляем сразу,
    // не дожидаясь поллера
    window.addEventListener(SHOP_CHANGED_EVENT, sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', sync);
      window.removeEventListener(SHOP_CHANGED_EVENT, sync);
    };
  }, [refresh]);

  const coins = data?.coins ?? 0;

  return (
    <Tooltip
      label={`${nf.format(coins)} ${currencyWord(coins)}`}
      hint="Открыть магазин"
      align="right"
    >
      <button
        onClick={() => navigate('/cosmetics')}
        className="h-7 px-3 flex items-center gap-2 bg-accent/10 border border-[var(--line-2)] hover:bg-accent/25 transition-colors cursor-pointer group"
        style={{ clipPath: 'polygon(0 5px, 5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%)' }}
      >
        <CurrencyIcon size={14} />
        <span className="tl-head text-[11px] font-bold tabular-nums text-accent group-hover:text-white transition-colors">
          <CountUp value={coins} />
        </span>
      </button>
    </Tooltip>
  );
}
