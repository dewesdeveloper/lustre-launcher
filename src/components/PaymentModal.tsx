import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { formatOrderAmount, getPayment, openPaymentUrl, type PaymentOrderView } from '../api/payments';

interface PaymentModalProps {
  order: PaymentOrderView;
  onPaid: (order: PaymentOrderView) => void | Promise<void>;
  onFailed: (order: PaymentOrderView) => void | Promise<void>;
  onClose: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  pending: 'Ожидаем подтверждение оплаты…',
  succeeded: 'Оплата подтверждена',
  canceled: 'Платёж отменён',
  refunded: 'Платёж возвращён',
  failed: 'Платёж не прошёл',
};

/**
 * Окно ожидания оплаты: открывает платёжную форму в браузере и поллит
 * GET /payments/order/:id каждые 3 секунды, пока заказ pending.
 */
export function PaymentModal({ order, onPaid, onFailed, onClose }: PaymentModalProps) {
  const [status, setStatus] = useState<string>(order.status);
  const [checkError, setCheckError] = useState(false);
  const [manualCheck, setManualCheck] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const cbRef = useRef({ onPaid, onFailed });
  cbRef.current = { onPaid, onFailed };

  const check = useCallback(async (manual = false) => {
    if (manual) setManualCheck(true);
    try {
      const fresh = await getPayment(order.order_id);
      statusRef.current = fresh.status;
      setStatus(fresh.status);
      setCheckError(false);
      if (fresh.status === 'succeeded') {
        void cbRef.current.onPaid(fresh);
        return;
      }
      if (fresh.status === 'canceled' || fresh.status === 'failed' || fresh.status === 'refunded') {
        void cbRef.current.onFailed(fresh);
      }
    } catch {
      setCheckError(true);
    } finally {
      if (manual) setManualCheck(false);
    }
  }, [order.order_id]);

  useEffect(() => {
    void check();
    const t = setInterval(() => {
      if (statusRef.current === 'pending') void check();
    }, 3000);
    return () => clearInterval(t);
  }, [check]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pending = status === 'pending';
  const failed = status === 'canceled' || status === 'failed' || status === 'refunded';

  // Рендерим через портал: страницы обёрнуты в анимации с transform,
  // а из-за transform position:fixed позиционируется по контейнеру, а не по экрану.
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div className="tl-panel w-full max-w-md p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          title="Закрыть"
          className="absolute right-3 top-3 w-7 h-7 border border-[var(--line)] bg-white/[0.04] hover:bg-red-600 hover:border-red-600 text-pearl/72 hover:text-white flex items-center justify-center transition-all"
        >
          <X size={13} />
        </button>

        <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] tl-muted pr-8">
          Оплата заказа №{order.order_id}
        </p>
        <h3 className="tl-pixel text-[15px] text-white mt-2" style={{ textShadow: 'var(--glow)' }}>
          {order.product_type === 'pro'
            ? `Lustre Pro · ${order.plan}`
            : `Пакет: ${order.coins} плодов изгнания`}
        </h3>

        <div
          className="flex items-center gap-3 mt-4 px-4 py-3 border"
          style={{ borderColor: failed ? 'rgba(239,68,68,.5)' : 'var(--line-2)', background: 'rgb(var(--accent-rgb)/.06)' }}
        >
          {pending ? (
            <Loader2 size={15} className="animate-spin text-accent shrink-0" />
          ) : failed ? (
            <AlertTriangle size={15} className="text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="text-[var(--green2)] shrink-0" />
          )}
          <div className="min-w-0">
            <p className="tl-term text-[15px] text-white leading-tight">{STATUS_TEXT[status] || status}</p>
            <p className="tl-term text-[13px] tl-muted mt-0.5">
              {formatOrderAmount(order)} ₽{pending ? ' · проверка каждые 3 с' : ''}
            </p>
          </div>
        </div>

        {checkError && (
          <p className="tl-term text-[13px] text-red-400 mt-3">Не удалось проверить статус — попробуем снова</p>
        )}

        <p className="tl-term text-[13px] tl-muted mt-4 leading-relaxed">
          Платёжная форма открылась в браузере. После оплаты статус обновится автоматически — это окно можно держать открытым.
        </p>

        <div className="flex gap-2 mt-5 flex-wrap">
          <button
            onClick={() => openPaymentUrl(order.payment_url)}
            disabled={!order.payment_url}
            className="tl-btn disabled:opacity-50"
          >
            <ExternalLink size={13} /> Открыть оплату
          </button>
          <button
            onClick={() => void check(true)}
            disabled={!pending || manualCheck}
            className="tl-btn ghost disabled:opacity-50"
          >
            {manualCheck ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Проверить
          </button>
          <button onClick={onClose} className="tl-btn ghost">Закрыть</button>
        </div>

        {!pending && !failed && (
          <p className="tl-term text-[13px] text-[var(--green2)] mt-3">Можно вернуться в приложение.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
