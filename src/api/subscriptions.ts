// Подписка Lustre Pro (/subscriptions): статус, тарифы и лимиты, оформление и отмена,
// промокоды; для админки — выдача, отзыв и корректировка баланса.
import api from './index';
import { notifyShopChanged } from '../utils/shopEvents';

export type ProPlanId = 'month' | 'quarter' | 'year';

/** Тариф: цена за период, выгода и ежемесячный подарок монетами */
export type ProPlan = {
  id: ProPlanId;
  title: string;
  months: number;
  price: number;
  old_price: number;
  per_month: number;
  save_pct: number;
  save_total: number;
  gift_per_month: number;
  gift_total: number;
  badge: string;
  highlight: boolean;
  gift_notice: string;
};

/** Преимущество подписки для списка «что даёт Pro» */
export type ProBenefit = { key: string; title: string; hint: string; pro_only: boolean };

/** Действующие лимиты пользователя (с подпиской или без) */
export type ProLimits = {
  groups: number;
  group_members: number;
  showcases: number;
  favorites: number;
  collections: number;
  upload_mb: number;
  coin_limit: number;
  daily_bonus: number;
  plan: ProPlanId | '';
  gift_per_month: number;
};

export type SubscriptionStatus = {
  is_pro: boolean;
  pro_until: string | null;
  pro_plan: ProPlanId | '';
  days_left: number;
  coins: number;
  bonus_ready: boolean;
  next_bonus_at: string | null;
  coin_limit: number;
  base_limit: number;
  daily_bonus: number;
  base_bonus: number;
  pro_frame_id: string;
  frame_id: string;
  avatar_frame_url: string;
  plans: ProPlan[];
  benefits: ProBenefit[];
  limits: ProLimits;
  gift_granted: boolean;
  gift_amount: number;
  gift_per_month: number;
  gift_total: number;
  gift_next_at: string | null;
  gift_months_done: number;
};

export async function getSubscription(): Promise<SubscriptionStatus> {
  return (await api.get<SubscriptionStatus>('/subscriptions/')).data;
}

type Order = { plan?: ProPlanId; method?: string; months?: number };

/** Оформить подписку (по умолчанию — месяц картой); возвращает обновлённый профиль */
export async function subscribePro(order: Order = {}): Promise<any> {
  const body = { plan: order.plan || 'month', method: order.method || 'card', months: order.months || 1 };
  const { data } = await api.post('/subscriptions/subscribe', body);
  notifyShopChanged(); // подписка сразу начисляет монеты — магазину пора обновиться
  return data.profile;
}

export async function cancelPro(): Promise<any> {
  return (await api.post('/subscriptions/cancel')).data.profile;
}

/** Активировать промокод: сколько дней подписки добавлено и обновлённый профиль */
export async function redeemProPromo(code: string): Promise<{ days: number; profile: any }> {
  const { data } = await api.post('/subscriptions/promo', { code });
  notifyShopChanged();
  return data;
}
