import type { ReactNode } from 'react';
import type { SellerInfo } from '../../api/legal';
import { SUPPORT_EMAIL } from '../../components/OfficialLinks';

// Общие куски правовых документов: кто продавец/оператор и как с ним связаться.
// Реквизиты приходят с сервера (/legal/seller); пока их нет — нейтральные формулировки.

/** «самозанятый Иванов Иван Иванович (ИНН 000000000000)» */
export function sellerName(s: SellerInfo | null): string {
  if (!s) return 'владелец сервиса Lustre';
  const status = s.status ? `${s.status.charAt(0).toLowerCase()}${s.status.slice(1)} ` : '';
  return `${status}${s.name} (ИНН ${s.inn}${s.ogrn ? `, ОГРН ${s.ogrn}` : ''})`;
}

/** Строки реквизитов для раздела «Реквизиты» */
export function sellerRows(s: SellerInfo): ReactNode[] {
  return [
    s.status && `Статус: ${s.status}${/самозан/i.test(s.status) ? ' (плательщик налога на профессиональный доход)' : ''}`,
    `${/ооо|ао|организац/i.test(s.status) ? 'Наименование' : 'ФИО'}: ${s.name}`,
    `ИНН: ${s.inn}`,
    s.ogrn && `ОГРН / ОГРНИП: ${s.ogrn}`,
    s.address && `Адрес: ${s.address}`,
    s.email && <>Почта для обращений и претензий: <a href={`mailto:${s.email}`} className="text-accent hover:underline">{s.email}</a></>,
    s.phone && `Телефон: ${s.phone}`,
  ].filter(Boolean) as ReactNode[];
}

/** «по почте … или через раздел «Поддержка»» */
export function contactText(s: SellerInfo | null): ReactNode {
  const email = s?.email || SUPPORT_EMAIL;
  return <>по почте <a href={`mailto:${email}`} className="text-accent hover:underline">{email}</a> или через раздел «Поддержка» на сайте и в лаунчере</>;
}
