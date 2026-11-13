/**
 * Подбор лучшего изображения для баннера на странице игры.
 * Приоритет: крупный баннер (banner_url) → апгрейд мелкого Steam-заголовка
 * (header.jpg) до крупного library_hero.jpg → что есть.
 *
 * Мелкий header Steam (460×215) при растягивании на всю ширину сильно
 * пикселится — поэтому его стараемся заменить на крупное изображение.
 */
export function gameBannerUrl(game: {
  banner_url?: string | null;
  header_image?: string | null;
} | null | undefined): string {
  const banner = String(game?.banner_url || '').trim();
  const header = String(game?.header_image || '').trim();

  // 1) Явный баннер, если это не мелкий header
  if (banner && !/header\.jpg/i.test(banner)) return banner;

  // 2) Steam-заголовок канонического вида (/steam/apps/<id>/header.jpg) —
  //    у большинства игр есть крупный library_hero.jpg
  const hero = steamHeaderToHero(header) || steamHeaderToHero(banner);
  if (hero) return hero;

  // 3) Баннер как есть, затем заголовок
  return banner || header;
}

function steamHeaderToHero(url: string): string | null {
  if (!url) return null;
  // /steam/apps/123/header.jpg или /steam/apps/123/<hash>/header.jpg
  const m = url.match(/\/steam\/apps\/(\d+)\/(?:[0-9a-f]+\/)?header\.jpg/i);
  if (!m) return null;
  // Канонический крупный баннер (без хэша ассета). Если его нет —
  // сработает onError и вернёт header.
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${m[1]}/library_hero.jpg`;
}

/** Запасное изображение, если основной баннер не загрузился. */
export function gameBannerFallback(game: {
  banner_url?: string | null;
  header_image?: string | null;
} | null | undefined): string {
  return String(game?.header_image || game?.banner_url || '').trim();
}

/**
 * Обложка (портретное изображение для «рамки» на странице игры).
 * Для Steam берём настоящую вертикальную обложку library_600x900.jpg,
 * иначе — header_image (обложка). Баннер-герой для рамки не используется.
 */
export function gameCoverUrl(game: {
  banner_url?: string | null;
  header_image?: string | null;
} | null | undefined): string {
  const header = String(game?.header_image || '').trim();
  const banner = String(game?.banner_url || '').trim();
  const src = header || banner;
  const m = src.match(/\/steam\/apps\/(\d+)\//i);
  if (m) {
    return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${m[1]}/library_600x900.jpg`;
  }
  return header || banner;
}

/**
 * Ключевой арт игры (горизонтальная обложка с артом и логотипом) — то, что
 * пользователь узнаёт как «картинку игры». library_hero у Steam — это фон без
 * логотипа (часто тёмный), поэтому для витрины берём capsule_616x353 —
 * та же обложка, что header.jpg, но крупнее. Не Steam — header_image.
 */
export function gameKeyArtUrl(game: {
  banner_url?: string | null;
  header_image?: string | null;
} | null | undefined): string {
  const header = String(game?.header_image || '').trim();
  const banner = String(game?.banner_url || '').trim();
  const m = (header || banner).match(/\/steam\/apps\/(\d+)\//i);
  if (m) {
    return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${m[1]}/capsule_616x353.jpg`;
  }
  return header || banner;
}
