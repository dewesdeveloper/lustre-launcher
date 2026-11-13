export interface ProfileTheme {
  id: string;
  name: string;
  color: string;
  ambient: string;
  overlay?: string;
}

import { useEffect } from 'react';

export const PROFILE_THEMES: ProfileTheme[] = [
  { id: 'lustre', name: 'Lustre Original', color: '#FF006E', ambient: 'from-[#FF006E]/20 via-black to-black' },
  { id: 'cyan-overdrive', name: 'Циан-драйв', color: '#3A86FF', ambient: 'from-[#3A86FF]/20 via-black to-black' },
  { id: 'toxic-acid', name: 'Токсичная кислота', color: '#39FF14', ambient: 'from-[#39FF14]/15 via-black to-black' },
  { id: 'nuclear-orange', name: 'Ядерный оранжевый', color: '#FF4D00', ambient: 'from-[#FF4D00]/15 via-black to-black' },
  { id: 'phantom-violet', name: 'Фантомный фиолет', color: '#8338EC', ambient: 'from-[#8338EC]/20 via-black to-black' },
  { id: 'deep-space', name: 'Глубокий космос', color: '#ffffff', ambient: 'from-white/5 via-black to-black' },
];

/* ===== Темы всего лаунчера — переопределяют CSS-переменные Tailwind ===== */
export interface LauncherTheme {
  id: string;
  name: string;
  accent: string;   // --color-accent
  violet: string;   // --color-violet
  cyan: string;     // --color-cyan
  mainBg: string;   // --color-main-bg
}

export const LAUNCHER_THEMES: LauncherTheme[] = [
  { id: 'aurora-pink', name: 'Аврора розовая', accent: '#FF006E', violet: '#8338EC', cyan: '#3A86FF', mainBg: '#050407' },
  { id: 'azure-rush', name: 'Лазурный порыв', accent: '#3A86FF', violet: '#00C2FF', cyan: '#00f5d4', mainBg: '#04070d' },
  { id: 'toxic-reactor', name: 'Токсичный реактор', accent: '#39FF14', violet: '#00E5A0', cyan: '#39FF14', mainBg: '#040805' },
  { id: 'ember-forge', name: 'Кузница углей', accent: '#FF4D00', violet: '#FF8A00', cyan: '#FF4D00', mainBg: '#080504' },
  { id: 'phantom-pulse', name: 'Фантомный пульс', accent: '#8338EC', violet: '#FF006E', cyan: '#8338EC', mainBg: '#070510' },
];

export const DEFAULT_LAUNCHER_THEME = LAUNCHER_THEMES[0];

/* ===== Кастомные темы (сделанные в админке): id = "custom#АЦЦЕНТ#ВИОЛЕТ" ===== */

export const CUSTOM_THEME_PREFIX = 'custom#';

export const isCustomThemeId = (id?: string | null) => !!id && id.startsWith(CUSTOM_THEME_PREFIX);

/** custom#FF006E#8338EC -> { accent: '#FF006E', violet: '#8338EC' } */
export function parseCustomThemeId(id: string): { accent: string; violet: string } | null {
  const parts = id.split('#');
  if (parts.length !== 3) return null;
  const hex = (s: string) => /^[0-9a-fA-F]{6}$/.test(s);
  if (!hex(parts[1]) || !hex(parts[2])) return null;
  return { accent: `#${parts[1]}`, violet: `#${parts[2]}` };
}

/** Собирает id кастомной темы из двух цветов (без # внутри) */
export const buildCustomThemeId = (accent: string, violet: string) =>
  `${CUSTOM_THEME_PREFIX}${accent.replace('#', '')}#${violet.replace('#', '')}`;

export function findLauncherTheme(id?: string | null): LauncherTheme {
  if (isCustomThemeId(id)) {
    const c = parseCustomThemeId(id!);
    if (c) return { id: id!, name: 'Своя палитра', accent: c.accent, violet: c.violet, cyan: c.violet, mainBg: DEFAULT_LAUNCHER_THEME.mainBg };
  }
  return LAUNCHER_THEMES.find(t => t.id === id) || DEFAULT_LAUNCHER_THEME;
}

const rgbTriplet = (hex: string): string => {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

/** Применяет тему лаунчера ко всем CSS-переменным Tailwind (весь интерфейс перекрашивается) */
export function applyLauncherTheme(themeId?: string | null) {
  const t = findLauncherTheme(themeId);
  const s = document.documentElement.style;
  s.setProperty('--color-accent', t.accent);
  s.setProperty('--color-violet', t.violet);
  s.setProperty('--color-cyan', t.cyan);
  s.setProperty('--color-main-bg', t.mainBg);
  s.setProperty('--accent-rgb', rgbTriplet(t.accent));
  s.setProperty('--violet-rgb', rgbTriplet(t.violet));
  s.setProperty('--cyan-rgb', rgbTriplet(t.cyan));
  s.setProperty('--shadow-neon', `0 0 20px ${t.accent}4D`);
  s.setProperty('--shadow-neon-strong', `0 0 30px ${t.accent}99`);
}

const LAUNCHER_THEME_STORAGE_KEY = 'lustre_launcher_theme';

export function broadcastLauncherTheme(themeId?: string | null) {
  try {
    localStorage.setItem(LAUNCHER_THEME_STORAGE_KEY, themeId || '');
  } catch { /* localStorage может быть недоступен */ }
}

export function useLauncherThemeSync() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAUNCHER_THEME_STORAGE_KEY) applyLauncherTheme(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
}

/** Глобальная инициализация для всех окон лаунчера (чат, друзья, звонки и т.д.):
 *  применяет сохранённую тему и слушает её смену из других окон */
export function initLauncherThemeSync() {
  try {
    const saved = localStorage.getItem(LAUNCHER_THEME_STORAGE_KEY);
    if (saved !== null) applyLauncherTheme(saved);
  } catch { /* localStorage может быть недоступен */ }
  window.addEventListener('storage', (e) => {
    if (e.key === LAUNCHER_THEME_STORAGE_KEY) applyLauncherTheme(e.newValue);
  });
}

/**
 * Два цвета темы для превью товара: акцент и вторичный.
 * Собственная тема (custom#…) — из id, иначе из каталога тем лаунчера или профиля.
 */
export function themeSwatch(themeId: string, scope?: string): [accent: string, violet: string] {
  const custom = isCustomThemeId(themeId) ? parseCustomThemeId(themeId) : null;
  if (custom) return [custom.accent, custom.violet];
  if (scope === 'launcher') {
    const t = LAUNCHER_THEMES.find((x) => x.id === themeId);
    return [t?.accent || '#FF006E', t?.violet || '#8338EC'];
  }
  return [PROFILE_THEMES.find((x) => x.id === themeId)?.color || '#FF006E', '#8338EC'];
}
