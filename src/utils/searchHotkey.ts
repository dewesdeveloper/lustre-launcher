import { useEffect } from 'react';

/**
 * Ctrl+F (⌘F) — фокус на поле поиска текущей страницы.
 *
 * Поля помечаются атрибутом data-search-hotkey: сначала ищется поиск самой страницы
 * ("page"), затем поиск раздела ("section"), затем боковой панели ("sidebar").
 * Клавиша определяется по e.code, поэтому сочетание работает и в русской раскладке.
 * Если на странице нет видимого поля, событие не трогаем (в браузере откроется
 * обычный поиск по странице).
 */
export const isSearchHotkey = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyF';

const LEVELS = ['page', 'section', 'sidebar'] as const;

const isVisible = (el: HTMLElement) => el.getClientRects().length > 0 && !(el as HTMLInputElement).disabled;

export function focusPageSearch(): boolean {
  for (const level of LEVELS) {
    const field = Array.from(document.querySelectorAll<HTMLElement>(`[data-search-hotkey="${level}"]`)).find(isVisible);
    if (field) {
      field.focus();
      if (field instanceof HTMLInputElement) field.select();
      return true;
    }
  }
  return false;
}

export function useSearchHotkey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !isSearchHotkey(e)) return;
      if (focusPageSearch()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
