import api from './index';

// Статистика скачиваний для администрации: лаунчер сообщает, что игра поставлена в загрузку
// и что установка завершилась. Ошибки отправки не мешают скачиванию — просто пропускаем.

type DownloadStatus = 'started' | 'installed';

// одно событие на игру за сеанс: прогресс установки приходит много раз
const sent = new Set<string>();

export function reportDownload(gameId: number | string, status: DownloadStatus, kind = ''): void {
  const id = Number(gameId);
  if (!Number.isInteger(id) || id <= 0) return;
  const key = `${id}:${status}`;
  if (status === 'installed' && sent.has(key)) return;
  sent.add(key);
  api.post(`/games/${id}/download-event`, { status, kind }).catch(() => sent.delete(key));
}
