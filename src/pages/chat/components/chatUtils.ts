export const FALLBACK_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Moby';

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
}

/** «Был(а) сегодня в 10:54» / «вчера в 22:10» / «12 октября в 09:05». */
export function formatLastSeen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = formatTime(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return `сегодня в ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `вчера в ${time}`;
  const sameYear = d.getFullYear() === today.getFullYear();
  const date = d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  return `${date} в ${time}`;
}
