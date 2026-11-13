// Оповещение «данные магазина изменились»: баланс и владение предметами
// меняются не только через /shop/* (бонус, покупка), но и через покупку
// подписки. Навигация (CurrencyPill) подписывается на это событие и сразу
// перечитывает /shop/, не дожидаясь поллера раз в минуту.
export const SHOP_CHANGED_EVENT = 'lustre:shop-changed';

export function notifyShopChanged(): void {
  try {
    window.dispatchEvent(new Event(SHOP_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
