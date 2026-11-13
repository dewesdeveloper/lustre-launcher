import seoData from './routes.json';

export interface SeoMeta {
  title: string;
  description?: string;
  /** Путь страницы для канонического адреса */
  path: string;
  image?: string;
  /** Не индексировать (личные разделы, игры 18+) */
  noindex?: boolean;
}

const DEFAULT_TITLE = 'Lustre — игровой лаунчер';
const DEFAULT_DESCRIPTION = seoData.routes[0].description;

/** Текст для описания страницы: без HTML-разметки и не длиннее сниппета поисковика */
export function plainDescription(html: string | undefined, max = 160): string {
  const text = (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

/** Заголовок и мета-теги страницы. Только веб: в лаунчере поисковиков нет. */
export function applySeo(meta: SeoMeta) {
  if ((window as any).electron) return;
  const url = seoData.site + meta.path;
  const description = meta.description || DEFAULT_DESCRIPTION;
  const image = meta.image || seoData.site + seoData.defaultImage;

  document.title = meta.title;
  setMeta('name', 'description', description);
  setMeta('name', 'robots', meta.noindex ? 'noindex, nofollow' : 'index, follow');
  setMeta('property', 'og:title', meta.title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:image', image);
  setMeta('name', 'twitter:title', meta.title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url;
}

/** Мета-теги по маршруту: страницы из routes.json индексируются, остальные (личные
 *  разделы, вход, настройки) — нет. Страницы игр задают теги сами после загрузки. */
export function applyRouteSeo(pathname: string) {
  if (pathname.startsWith('/games/')) return;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const route = seoData.routes.find((r) => r.path === path);
  if (route) applySeo({ title: route.title, description: route.description, path: route.path });
  else applySeo({ title: DEFAULT_TITLE, path, noindex: true });
}
