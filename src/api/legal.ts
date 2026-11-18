// Реквизиты продавца (/legal/seller): задаются на сервере, показываются на странице
// «Правовая информация» и рядом с оплатой подписки — этого требуют правила продаж на расстоянии.
import { useEffect, useState } from 'react';
import api from './index';

export type SellerInfo = {
  configured: boolean;
  status: string;
  name: string;
  inn: string;
  ogrn: string;
  email: string;
  phone: string;
  address: string;
};

let cache: SellerInfo | null = null;

export async function getSellerInfo(): Promise<SellerInfo> {
  if (cache) return cache;
  const { data } = await api.get<SellerInfo>('/legal/seller');
  cache = data;
  return data;
}

/** Реквизиты для показа; null — ещё не загружены или не заданы на сервере */
export function useSellerInfo(): SellerInfo | null {
  const [info, setInfo] = useState<SellerInfo | null>(cache);
  useEffect(() => {
    let alive = true;
    getSellerInfo().then((d) => alive && setInfo(d)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return info?.configured ? info : null;
}

/** «Самозанятый Иванов Иван Иванович, ИНН 000000000000» — одной строкой */
export function sellerLine(s: SellerInfo): string {
  return [[s.status, s.name].filter(Boolean).join(' '), `ИНН ${s.inn}`, s.ogrn && `ОГРН ${s.ogrn}`].filter(Boolean).join(', ');
}
