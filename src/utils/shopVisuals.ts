import { broadcastLauncherTheme } from '../components/profileThemes';
import { broadcastLauncherBackground, emitLauncherBackgroundChanged } from '../components/launcherBackground';

/**
 * Мгновенное обновление визуала после покупки/надения предмета.
 * Профиль обновляется в AuthContext (аватар, рамка, баннер, титулы, значки),
 * а тема лаунчера и его фон применяются в этом окне и расходятся в соседние окна.
 */
export function applyShopProfileVisuals(profile: any): void {
  if (!profile) return;

  // Тема лаунчера — мгновенно в текущем окне + broadcast в остальные
  broadcastLauncherTheme(profile.launcher_theme_id ?? '');

  // Фон лаунчера (изображение или видео)
  broadcastLauncherBackground({
    url: profile.launcher_background_url,
    isVideo: profile.launcher_background_is_video,
    scale: profile.launcher_background_scale,
    blur: profile.launcher_background_blur,
    opacity: profile.launcher_background_opacity,
    offsetX: profile.launcher_background_offset_x,
    offsetY: profile.launcher_background_offset_y,
  });
  emitLauncherBackgroundChanged();
}
