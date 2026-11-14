// Дополнительные фильтры каталога: год выхода, русский язык, разработчик, источник скачивания,
// режим тегов и «скрыть игры из библиотеки». Фильтрация — на клиенте, по уже загруженному каталогу.
import { releaseTime } from '../../constants';

export type YearRange = '' | 'recent' | '2020' | '2010' | '2000' | 'old' | 'none';
export type RuLang = '' | 'any' | 'interface' | 'audio' | 'subtitles';
export type GameKind = '' | 'regular' | 'adult';

export type ExtraFilters = {
  /** обычные игры или NSFW (is_adult) */
  kind: GameKind;
  year: YearRange;
  ru: RuLang;
  developer: string;
  sources: string[];
  /** выбранные теги: все сразу или хотя бы один */
  tagMode: 'all' | 'any';
  hideOwned: boolean;
};

export const EMPTY_EXTRA: ExtraFilters = { kind: '', year: '', ru: '', developer: '', sources: [], tagMode: 'all', hideOwned: false };

export const YEAR_OPTIONS: { id: Exclude<YearRange, ''>; label: string }[] = [
  { id: 'recent', label: 'Последний год' },
  { id: '2020', label: '2020-е' },
  { id: '2010', label: '2010-е' },
  { id: '2000', label: '2000-е' },
  { id: 'old', label: 'До 2000' },
  { id: 'none', label: 'Без даты' },
];

export const KIND_OPTIONS: { id: Exclude<GameKind, ''>; label: string }[] = [
  { id: 'regular', label: 'Обычные игры' },
  { id: 'adult', label: 'NSFW игры' },
];

export const RU_OPTIONS: { id: Exclude<RuLang, ''>; label: string }[] = [
  { id: 'any', label: 'Есть русский' },
  { id: 'interface', label: 'Интерфейс' },
  { id: 'audio', label: 'Озвучка' },
  { id: 'subtitles', label: 'Субтитры' },
];

export const SOURCE_LABEL: Record<string, string> = {
  torrent: 'Торрент', direct: 'Прямая ссылка', itch: 'itch.io', pixeldrain: 'Pixeldrain',
  mega: 'MEGA', mediafire: 'MediaFire', gofile: 'Gofile', mixdrop: 'Mixdrop', browser: 'Через браузер',
};

/** Виды источников игры (у старых игр без источников — торрент по magnet) */
export function sourceKinds(game: any): string[] {
  const kinds = (game.sources || []).map((s: any) => String(s.kind || 'torrent'));
  if (kinds.length === 0 && game.magnet_uri) kinds.push('torrent');
  return kinds;
}

const YEAR_MS = 365 * 24 * 3600 * 1000;

function matchYear(game: any, year: YearRange): boolean {
  if (!year) return true;
  const t = releaseTime(game.release_date);
  if (year === 'none') return t === null;
  if (t === null) return false;
  if (year === 'recent') return t >= Date.now() - YEAR_MS;
  const y = new Date(t).getFullYear();
  if (year === 'old') return y < 2000;
  const from = Number(year);
  return y >= from && y < from + 10;
}

function matchRu(game: any, ru: RuLang): boolean {
  if (!ru) return true;
  const lang = (game.languages || []).find((l: any) => /^рус|^russian/i.test(String(l.name || '')));
  if (!lang) return false;
  if (ru === 'any') return true;
  return !!lang[ru];
}

/** Подходит ли игра под дополнительные фильтры (кроме режима тегов — он в общем фильтре тегов) */
export function matchExtra(game: any, f: ExtraFilters, owned: Set<number>): boolean {
  if (f.kind && !!game.is_adult !== (f.kind === 'adult')) return false;
  if (!matchYear(game, f.year)) return false;
  if (!matchRu(game, f.ru)) return false;
  if (f.developer && game.developer !== f.developer && game.publisher !== f.developer) return false;
  if (f.sources.length > 0 && !sourceKinds(game).some((k) => f.sources.includes(k))) return false;
  if (f.hideOwned && owned.has(game.ID)) return false;
  return true;
}

export function extraActive(f: ExtraFilters): boolean {
  return !!(f.kind || f.year || f.ru || f.developer || f.sources.length || f.hideOwned);
}

/** Подписи активных доп. фильтров для строки «чипов» над каталогом */
export function extraChips(f: ExtraFilters, set: (patch: Partial<ExtraFilters>) => void): { label: string; onRemove: () => void }[] {
  const out: { label: string; onRemove: () => void }[] = [];
  if (f.kind) out.push({ label: KIND_OPTIONS.find((o) => o.id === f.kind)?.label || f.kind, onRemove: () => set({ kind: '' }) });
  if (f.year) out.push({ label: YEAR_OPTIONS.find((o) => o.id === f.year)?.label || f.year, onRemove: () => set({ year: '' }) });
  if (f.ru) out.push({ label: `Русский: ${RU_OPTIONS.find((o) => o.id === f.ru)?.label.toLowerCase()}`, onRemove: () => set({ ru: '' }) });
  if (f.developer) out.push({ label: f.developer, onRemove: () => set({ developer: '' }) });
  for (const s of f.sources) out.push({ label: SOURCE_LABEL[s] || s, onRemove: () => set({ sources: f.sources.filter((x) => x !== s) }) });
  if (f.hideOwned) out.push({ label: 'Без моей библиотеки', onRemove: () => set({ hideOwned: false }) });
  return out;
}
