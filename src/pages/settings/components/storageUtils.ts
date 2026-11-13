import { formatPlaytime } from '../../../utils/playtime';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const fmtBytes = (b: number) => {
  if (!b || b <= 0) return '0 МБ';
  if (b >= GB) return `${(b / GB).toFixed(2).replace('.', ',')} ГБ`;
  if (b >= MB) return `${Math.round(b / MB)} МБ`;
  return `${Math.round(b / 1024)} КБ`;
};

export const fmtDate = (ts: number | null) => {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
};

export const fmtPlaytime = (ms: number) => (ms > 0 ? formatPlaytime(ms) : '');

export const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim();

export const driveLabel = (root: string) => {
  const letter = root.replace(/[\\/]/g, '').replace(':', '');
  return `Локальный диск (${letter}:)`;
};
