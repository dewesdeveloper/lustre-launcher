/** Абсолютный базовый URL веб-приложения (origin + путь).
 *  Vite собирает с base './' — прямая конкатенация дала бы «lustrehub.pro./»,
 *  поэтому './' нормализуем в '/'. */
export function webBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalized = base === './' || base === '.' ? '/' : base;
  return window.location.origin + normalized;
}

/** Файл из public/. Веб (BrowserRouter): путь от корня сайта — относительный «logo.svg»
 *  на /store/news превращался в /store/logo.svg и картинка пропадала. Electron (file://,
 *  HashRouter): относительный путь от index.html — абсолютный «/x.svg» указал бы в корень диска. */
export function publicAsset(name: string): string {
  const file = name.replace(/^\.?\//, '');
  return window.location.protocol === 'file:' ? `./${file}` : `/${file}`;
}
