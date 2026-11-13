// Сигнал «обнови колокольчик уведомлений» — чтобы состояние в колокольчике
// (бонус, непрочитанное) обновлялось сразу после действия, а не через опрос
// раз в минуту или повторное открытие выпадашки.
export const BELL_REFRESH_EVENT = 'lustre:bell-refresh';

export function notifyBellRefresh(): void {
  try {
    window.dispatchEvent(new Event(BELL_REFRESH_EVENT));
  } catch {
    /* ignore */
  }
}
