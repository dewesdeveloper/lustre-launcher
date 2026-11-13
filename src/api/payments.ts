import api from './index';

export type PaymentStatus = 'pending' | 'succeeded' | 'canceled' | 'refunded' | 'failed';

/** Клиент, для которого создаётся платёж: web-версия возвращается
 *  на страницу результата в браузере, десктоп — через lustre:// deep-link. */
const paymentClient = (): string => ((window as any).electron ? 'desktop' : 'web');

export interface PaymentOrderView {
  order_id: number;
  status: PaymentStatus | string;
  product_type: 'pro' | 'coins';
  product_id: string;
  amount: number; // копейки
  currency: string;
  coins: number;
  plan: string;
  payment_url: string;
  paid_at: string | null;
  created_at: string;
}

/** Создать платёжную сессию за подписку Lustre Pro. */
export async function createProPayment(plan: string): Promise<PaymentOrderView> {
  const res = await api.post('/payments/pro', { plan, client: paymentClient() });
  return res.data;
}

/** Создать платёжную сессию за пакет валюты. */
export async function createCoinPayment(packageId: string): Promise<PaymentOrderView> {
  const res = await api.post('/payments/coins', { package_id: packageId, client: paymentClient() });
  return res.data;
}

/** Статус заказа (для поллинга после оплаты в браузере). */
export async function getPayment(orderId: number | string): Promise<PaymentOrderView> {
  const res = await api.get(`/payments/order/${orderId}`);
  return res.data;
}

/** Сумма заказа в рублях для отображения. */
export function formatOrderAmount(order: PaymentOrderView): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(order.amount / 100));
}

/** Открыть платёжную форму: системный браузер (Electron) или новая вкладка (web). */
export function openPaymentUrl(url: string): void {
  if (!url) return;
  const electron = (window as any).electron;
  if (electron?.openExternal) {
    void electron.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
