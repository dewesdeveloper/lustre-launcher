import api from '../../api';

// Файл игры itch.io, полученный через /games/itch/resolve.
// Порядок файлов определяет бэкенд: Windows первым, мобильные последними,
// хостинг itch важнее external-ссылок.
export interface ItchFile {
  url: string;
  filename?: string;
  size?: number;
  platform?: string;
  external?: boolean;
}

export const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
};

export const fetchItchFiles = async (pageUrl: string): Promise<ItchFile[]> => {
  const res = await api.get('/games/itch/resolve', { params: { url: pageUrl } });
  const raw: unknown = res.data?.files;
  if (!Array.isArray(raw)) return [];
  return (raw as any[])
    .filter((f) => f && typeof f.url === 'string' && f.url)
    .map((f) => ({
      url: String(f.url),
      filename: f.filename ? String(f.filename) : '',
      size: typeof f.size === 'number' ? f.size : 0,
      platform: f.platform ? String(f.platform) : '',
      external: !!f.external,
    }));
};
