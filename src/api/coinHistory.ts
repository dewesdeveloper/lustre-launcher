import api from './index';

export interface CoinTx {
  id: number;
  kind: 'earn' | 'spend';
  amount: number; // положительное = приход, отрицательное = расход
  balance_after: number;
  source: string;
  title: string;
  created_at: string;
}

export interface CoinHistory {
  items: CoinTx[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  balance: number;
  totals: {
    earned: number;
    spent: number;
    bought: number;
  };
}

export async function getCoinHistory(params: {
  limit?: number;
  offset?: number;
  kind?: 'all' | 'earn' | 'spend';
} = {}): Promise<CoinHistory> {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.offset) q.set('offset', String(params.offset));
  if (params.kind && params.kind !== 'all') q.set('kind', params.kind);
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const res = await api.get(`/shop/history${suffix}`);
  return res.data;
}

export interface CoinPackage {
  id: string;
  title: string;
  coins: number;
  bonus_pct: number;
  price_rub: number;
  price_pro: number;
  badge: string;
  popular: boolean;
  sort_weight: number;
}

export interface CoinPackagesData {
  packages: CoinPackage[];
  premium: {
    id: string;
    title: string;
    subtitle: string;
    gift_now: number;
    gift_per_day: number;
    gift_total: number;
    price_rub: number;
    can_buy: boolean;
  };
  is_pro: boolean;
}

export async function getCoinPackages(): Promise<CoinPackagesData> {
  const res = await api.get('/shop/packages');
  return res.data;
}

export async function buyCoinPackage(id: string): Promise<void> {
  await api.post('/shop/packages/buy', { id });
}
