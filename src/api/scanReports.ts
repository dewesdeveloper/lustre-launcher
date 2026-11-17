import api from './index';

// Проверка игр силами сообщества: после скачивания лаунчер проверяет файлы Защитником Windows
// и отправляет только итог (без файлов). Перед скачиванием видно, что нашли у других игроков.

export type ScanSourceSummary = {
  source_key: string;
  clean_users: number;
  threat_users: number;
  threats: string[];
  /** сколько разных версий файла прислали игроки (больше одной — файлы у людей различаются) */
  hashes: number;
  top_hash_users: number;
  last_at: string;
};

export type ScanResult = {
  gameId: number;
  sourceKey: string;
  sha256: string;
  verdict: 'clean' | 'threat';
  threats: string[];
  engine: string;
};

/**
 * Все находки — «PUA:» (потенциально нежелательная программа): Защитник так отмечает упаковщики
 * и утилиты, которыми часто собраны кряки и установщики репаков. Это не вирус, и показываем мягче.
 */
export function isPuaOnly(threats: string[]): boolean {
  const named = threats.filter((t) => !/^unknown$/i.test(t));
  return named.length > 0 && named.every((t) => /^PUA:/i.test(t));
}

/**
 * Находки Защитника, которые на кряках почти всегда ложные: эвристика «!rfn» без описания
 * у Microsoft, срабатывает на подменённые steam_api и exe. Установку не блокируем — мягкое окно.
 * Дополнять по отчётам в админке («Угрозы»), когда у других игроков те же файлы чистые.
 */
const LIKELY_FALSE_POSITIVES = [
  /^Trojan:Win32\/Kepavll!rfn$/i,
  /^Trojan:Win32\/Pomal!rfn$/i,
];

export const isLikelyFalsePositive = (threat: string) => LIKELY_FALSE_POSITIVES.some((re) => re.test(threat.trim()));

/**
 * Насколько строго показывать находки: 'pua' — только нежелательные программы,
 * 'likely-fp' — только известные ложные срабатывания на кряки (и PUA), null — настоящая угроза.
 */
export function softThreatKind(threats: string[]): 'pua' | 'likely-fp' | null {
  const named = threats.filter((t) => !/^unknown$/i.test(t.trim()));
  if (named.length === 0) return null;
  if (named.every((t) => /^PUA:/i.test(t))) return 'pua';
  if (named.every((t) => /^PUA:/i.test(t) || isLikelyFalsePositive(t))) return 'likely-fp';
  return null;
}

type SourceLike ={ kind?: string; magnet_uri?: string; url?: string };

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** btih в base32 (32 символа) → hex (40 символов) */
function base32ToHex(b32: string): string {
  let bits = '';
  for (const ch of b32.toLowerCase()) {
    const v = BASE32.indexOf(ch);
    if (v < 0) return '';
    bits += v.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex.slice(0, 40);
}

/** Ключ источника, общий для лаунчера и сервера: btih:<hex> для торрента, url:<ссылка> для остальных */
export function sourceKeyFor(source: SourceLike): string {
  const kind = source.kind || 'torrent';
  if (kind === 'torrent') {
    const m = /xt=urn:btih:([a-z0-9]+)/i.exec(source.magnet_uri || '');
    if (!m) return '';
    const raw = m[1];
    const hex = raw.length === 40 ? raw.toLowerCase() : raw.length === 32 ? base32ToHex(raw) : '';
    return /^[0-9a-f]{40}$/.test(hex) ? `btih:${hex}` : '';
  }
  const url = (source.url || '').trim();
  return /^https?:\/\//i.test(url) ? `url:${url.slice(0, 290)}` : '';
}

export async function getScanSummary(gameId: number): Promise<ScanSourceSummary[]> {
  return (await api.get(`/games/${gameId}/scan-summary`)).data?.sources ?? [];
}

export function reportScan(r: ScanResult): void {
  api.post(`/games/${r.gameId}/scan-report`, {
    source_key: r.sourceKey, sha256: r.sha256, verdict: r.verdict, threats: r.threats, engine: r.engine,
  }).catch(() => { /* не удалось — следующая проверка отправит заново */ });
}
