// Наигранное время в формате «целые и десятые»: 0.5 ч, 12.0 ч.
// 0 и отсутствие значения — тоже 0.0 ч.
export const formatPlaytime = (ms?: number | null): string => {
  const hours = Math.max(0, Number(ms) || 0) / 3600000;
  return `${hours.toFixed(1)} ч`;
};
