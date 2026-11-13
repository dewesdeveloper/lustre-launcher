import api from './index';

export interface OAuthProvidersInfo {
  providers: string[];
  telegram?: { bot_username?: string };
  return_url?: string;
}

export interface OAuthStartInfo {
  url: string;
  state: string;
  poll: string;
  return_url: string;
}

export function getOAuthProviders(): Promise<OAuthProvidersInfo> {
  return api.get('/auth/oauth/providers').then((r) => r.data);
}

/** consent — отмеченные на форме входа чекбоксы согласия; бэкенд переносит их в state
 *  и фиксирует у нового пользователя при создании аккаунта. */
export function getOAuthStartUrl(provider: string, consent = false): Promise<OAuthStartInfo> {
  return api.get(`/auth/oauth/start/${provider}${consent ? '?consent=1' : ''}`).then((r) => r.data);
}

/** need_totp / need_device_approval — включена 2FA: сессии ещё нет, нужен второй фактор по login_token. */
export interface OAuthResultData {
  status: string;
  token?: string;
  reason?: string;
  username?: string;
  device_token?: string;
  login_token?: string;
  message?: string;
}

/** Результат входа: приложение опрашивает его после открытия браузера. */
export function getOAuthResult(state: string, poll: string): Promise<OAuthResultData> {
  return api.get('/auth/oauth/result', { params: { state, poll } }).then((r) => r.data);
}
