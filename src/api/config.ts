// Адрес бэкенда подставляется при сборке из VITE_API_URL
// (см. .env для разработки и .env.production для боевой сборки).
// localhost — значение ТОЛЬКО для локальной разработки.

const DEV_API = 'http://localhost:8080';

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.DEV ? DEV_API : '');

/** WebSocket для чата — тот же хост, что и API */
export const WS_BASE: string = API_URL ? `${API_URL.replace(/^http/, 'ws')}/ws/chat` : '';

// Боевая сборка без адреса сервера: клиент ходит на свой же origin —
// это работает только если API лежит на том же домене.
// В Electron обязательно нужен полный URL (VITE_API_URL).
if (import.meta.env.PROD && !API_URL) {
  console.warn(
    '[config] VITE_API_URL не задан — запросы пойдут на origin самого клиента. ' +
      'Для Electron-сборки укажи полный адрес API в .env.production.',
  );
}
