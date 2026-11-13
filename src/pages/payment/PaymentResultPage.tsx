import { useCallback, useEffect, useRef, useState } from 'react';
import { celebrate } from '../../utils/uiFx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { formatOrderAmount, getPayment, openPaymentUrl, type PaymentOrderView } from '../../api/payments';

const STATUS_TEXT: Record<string, string> = {
  pending: 'Ожидаем подтверждение оплаты…',
  succeeded: 'Оплата подтверждена',
  canceled: 'Платёж отменён',
  refunded: 'Платёж возвращён',
  failed: 'Платёж не прошёл',
};

/**
 * Результат оплаты: открывается из lustre://payment/result?order=N
 * (после возврата из платёжной формы) и поллит статус заказа.
 */
export default function PaymentResultPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = searchParams.get('order') || '';

  const [order, setOrder] = useState<PaymentOrderView | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const statusRef = useRef('');

  const loadOrder = useCallback(async (manual = false) => {
    if (!orderId) {
      setError('Заказ не найден — вернитесь в магазин.');
      return;
    }
    if (manual) setChecking(true);
    try {
      const fresh = await getPayment(orderId);
      setOrder(fresh);
      statusRef.current = fresh.status;
      setError('');
    } catch {
      setError('Не удалось получить статус платежа');
    } finally {
      if (manual) setChecking(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
    const t = setInterval(() => {
      if (statusRef.current === 'pending' || !statusRef.current) void loadOrder();
    }, 3000);
    return () => clearInterval(t);
  }, [loadOrder]);

  const status = order?.status || '';
  // Салют один раз, когда оплата подтвердилась
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (status === 'succeeded' && !celebratedRef.current) {
      celebratedRef.current = true;
      celebrate();
    }
  }, [status]);
  const isPro = order?.product_type === 'pro';

  return (
    <div className="min-h-screen text-pearl animate-in fade-in duration-500">
      <div className="max-w-[640px] mx-auto px-6 py-8">
        <div className="tl-ticker">
          <span className="live">// PAYMENT RESULT</span>
          <span>order {orderId || '—'}</span>
        </div>

        <div className="tl-sec-head mt-4">
          <span className="bar" />
          <h2>РЕЗУЛЬТАТ ОПЛАТЫ</h2>
          <span className="line" />
        </div>

        <div className="tl-panel p-6">
          {!orderId ? (
            <>
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="text-red-400" />
                <p className="tl-head text-[11px] uppercase tracking-[0.14em] text-white">Заказ не найден</p>
              </div>
              <p className="tl-term text-[15px] tl-muted mt-3">В ссылке нет номера заказа. Вернитесь в магазин.</p>
            </>
          ) : !order ? (
            <div className="flex items-center gap-3">
              <Loader2 size={16} className="animate-spin text-accent" />
              <p className="tl-term text-[15px] tl-muted">{error || 'Проверяем статус платежа…'}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {status === 'pending' ? (
                  <Loader2 size={16} className="animate-spin text-accent" />
                ) : status === 'succeeded' ? (
                  <CheckCircle2 size={16} className="text-[var(--green2)]" />
                ) : (
                  <AlertTriangle size={16} className="text-red-400" />
                )}
                <p className="tl-head text-[11px] uppercase tracking-[0.14em] text-white">
                  {STATUS_TEXT[status] || status}
                </p>
              </div>

              <p className="tl-pixel text-[18px] text-white mt-4" style={{ textShadow: 'var(--glow)' }}>
                {formatOrderAmount(order)} ₽
              </p>
              <p className="tl-term text-[14px] tl-muted mt-1">
                {isPro ? `Lustre Pro · тариф ${order.plan}` : `Пакет: ${order.coins} плодов изгнания`}
              </p>

              {error && <p className="tl-term text-[13px] text-red-400 mt-3">{error}</p>}

              <div className="flex flex-wrap gap-2 mt-6">
                {status === 'pending' && order.payment_url && (
                  <button onClick={() => openPaymentUrl(order.payment_url)} className="tl-btn">
                    <ExternalLink size={13} /> Открыть оплату
                  </button>
                )}
                {status === 'pending' && (
                  <button onClick={() => void loadOrder(true)} disabled={checking} className="tl-btn ghost disabled:opacity-50">
                    {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Проверить
                  </button>
                )}
                {status === 'succeeded' && (
                  <button onClick={() => navigate(isPro ? '/subscriptions' : '/cosmetics?tab=packages')} className="tl-btn">
                    {isPro ? 'К подписке' : 'Открыть магазин'}
                  </button>
                )}
                <button onClick={() => navigate('/')} className="tl-btn ghost">
                  <ArrowLeft size={13} /> На главную
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
