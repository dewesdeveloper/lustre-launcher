/**
 * Валюта лаунчера: «Плод изгнания».
 * Название склоняется по числам: 1 плод изгнания, 2 плода изгнания, 5 плодов изгнания.
 */

export const CURRENCY_NAME = 'плод изгнания';
export const CURRENCY_NAME_PLURAL = 'плодов изгнания';

/** Правильная форма названия валюты для числа n. */
export function currencyWord(n: number): string {
  const abs = Math.abs(Math.trunc(n)) % 100;
  if (abs >= 11 && abs <= 14) return CURRENCY_NAME_PLURAL;
  switch (abs % 10) {
    case 1:
      return CURRENCY_NAME;
    case 2:
    case 3:
    case 4:
      return 'плода изгнания';
    default:
      return CURRENCY_NAME_PLURAL;
  }
}

const nf = new Intl.NumberFormat('ru-RU');

/** «1 250 плодов изгнания» */
export function formatCurrency(n: number): string {
  const value = Number(n) || 0;
  return `${nf.format(value)} ${currencyWord(value)}`;
}

/** Компактный вариант для тесных мест: «1 250 плодов». */
export function formatCurrencyShort(n: number): string {
  const value = Number(n) || 0;
  const abs = Math.abs(Math.trunc(value)) % 100;
  const short = abs >= 11 && abs <= 14 ? CURRENCY_NAME_PLURAL : abs % 10 === 1 ? CURRENCY_NAME : 'плода изгнания';
  return `${nf.format(value)} ${short}`;
}
