// Сиды и пиры торрент-источников игры по данным трекеров. Сервер опрашивает трекеры
// раз в 30 минут (/games/:id/torrent-health), лаунчер — сам, пока открыто окно выбора.
import api from './index';

/** source_id = 0 — старый magnet самой игры (без списка источников) */
export type SourceHealth = {
  source_id: number;
  info_hash: string;
  seeds: number;
  peers: number;
  /** сколько трекеров ответило; 0 — данных нет */
  trackers: number;
  checked_at: string | null;
};

export async function getTorrentHealth(gameId: number): Promise<SourceHealth[]> {
  const { data } = await api.get<{ sources: SourceHealth[] }>(`/games/${gameId}/torrent-health`);
  return data?.sources ?? [];
}

/** Ответ лаунчера (electron.torrentHealth) по каждому magnet */
export type LiveHealth = {
  hash: string;
  seeds: number;
  peers: number;
  trackers: number;
  /** раздача уже качается в qBittorrent — сколько сидов и пиров подключено */
  connected?: { seeds: number; peers: number };
};
