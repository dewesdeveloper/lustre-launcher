import { isWeb } from '../App';
import { webBaseUrl } from './webBase';

/**
 * Ссылка-приглашение друга по коду.
 * Десктоп: lustre:// deep-link (открывает лаунчер).
 * Web: обычная ссылка на страницу добавления с префиллом кода.
 */
export function friendInviteUrl(friendCode?: string): string {
  const code = friendCode || '';
  if (isWeb) {
    return `${webBaseUrl()}friends/add${code ? `?code=${encodeURIComponent(code)}` : ''}`;
  }
  return `lustre://add/${code}`;
}
