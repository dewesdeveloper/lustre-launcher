import type { Variants } from 'framer-motion';
import type { SortKey } from './types';
import { htmlToText } from '../../utils/safeHtml';

export const modeLabels: Record<string, string> = {
  singlePlayer: 'Одиночная игра',
  multiplayer: 'Многопользовательская',
  coop: 'Кооператив',
  online: 'Онлайн',
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'title-asc', label: 'А → Я' },
  { value: 'title-desc', label: 'Я → А' },
  { value: 'date-new', label: 'Дата выхода (сначала новые)' },
  { value: 'date-old', label: 'Дата выхода (сначала старые)' },
  { value: 'added-new', label: 'Добавлено (сначала новые)' },
  { value: 'added-old', label: 'Добавлено (сначала старые)' },
];

export const AGE_RATINGS = ['3+', '7+', '10+', '12+', '16+', '18+'];

export const AGE_ORDER: Record<string, number> = { '3+': 3, '7+': 7, '10+': 10, '12+': 12, '16+': 16, '18+': 18 };

export const CONTENT_TAG_MAP: Record<string, string[]> = {
  sexual_content: ['sexual content', 'hentai', 'nsfw', 'erotic content', 'adult only'],
  nudity: ['nudity', 'nude', 'topless', 'uncensored'],
  violence: ['graphic violence', 'realistic violence', 'excessive violence'],
  gore: ['gore', 'blood and gore', 'brutal violence', 'cruelty', 'dismemberment'],
  strong_language: ['strong language', 'excessive profanity'],
  gambling: ['gambling', 'casino', 'loot box', 'real gambling'],
  horror: ['psychological horror', 'extreme horror', 'torture'],
  mature_themes: ['sexual assault', 'drug use', 'self-harm', 'suicide', 'child abuse'],
};

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

// Каскадное появление карточек: на всю страницу не больше ~0.6 с, иначе при 50 играх
// последняя карточка появлялась через 3 с
export const containerVariantsFor = (count: number): Variants => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: Math.min(0.05, 0.6 / Math.max(1, count)) } },
});

/**
 * Дата выхода → timestamp; пустая, битая или неправдоподобная дата → null
 * (такие игры сортируются в конец). В базе встречаются опечатки вроде 2924 и 0018 года.
 */
export const releaseTime = (date?: string | null): number | null => {
  if (!date) return null;
  const d = new Date(date);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  const y = d.getFullYear();
  return y < 1970 || y > new Date().getFullYear() + 10 ? null : t;
};

/** Сравнение названий: русский порядок, без учёта регистра, «Игра 2» < «Игра 10». */
export const titleCollator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });

/** Слово/фраза из фильтра контента встречается в названии целым словом (не «gore» в «Gorogoa»). */
export const containsWord = (text: string, phrase: string) => {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
};

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: "easeOut" } },
};

export const statusConfig: Record<string, { label: string; color: string }> = {
  downloading: { label: 'Загрузка', color: 'text-accent' },
  paused: { label: 'Пауза', color: 'text-yellow-400' },
  completed: { label: 'Завершено', color: 'text-green-400' },
  error: { label: 'Ошибка', color: 'text-red-400' },
};

// innerHTML на временном div загружал картинки и выполнял onerror — теперь DOMParser
export const stripHtml = (html: string) => htmlToText(html);

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 1536 → «1.5 KB»: делим на 1024, пока число не станет меньше 1024 */
export const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
};

export const formatSpeed = (bps: number) => bps === 0 ? '—' : `${formatBytes(bps)}/с`;

// Пустая строка — время неизвестно. qBittorrent отдаёт 8640000 (100 суток), когда скорости нет
export const formatETA = (seconds: number) => {
  if (!seconds || seconds <= 0 || seconds >= 8640000) return '';
  if (seconds < 60) return `${Math.round(seconds)}с`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}м ${Math.floor(seconds % 60)}с`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}ч ${m}м`;
};

// Восстановление вида каталога после возврата из игры: флаг ставится при переходе в игру,
// вид сохраняется при уходе со страницы. TTL 30 минут — дальше открываем по умолчанию.
export const STORE_VIEW_KEY = 'store:catalog:view';
export const STORE_FROM_GAME_KEY = 'store:catalog:from-game';
const VIEW_TTL_MS = 30 * 60 * 1000;

export const readSavedView = () => {
  try {
    const raw = sessionStorage.getItem(STORE_VIEW_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - (data?.savedAt || 0) > VIEW_TTL_MS) {
      sessionStorage.removeItem(STORE_VIEW_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

export const markLeavingToGame = () => {
  try { sessionStorage.setItem(STORE_FROM_GAME_KEY, '1'); } catch { /* ignore */ }
};
