import { secureStorage } from './secureStorage';

const MAP_KEY = 'deviceTokens';
const LEGACY_KEY = 'deviceToken';

type TokenMap = Record<string, string>;

export function getDeviceTokenMap(): TokenMap {
  const value = secureStorage.getItem(MAP_KEY);
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as TokenMap;
  return {};
}

function saveMap(map: TokenMap) {
  secureStorage.setItem(MAP_KEY, map);
}

export function saveDeviceToken(username: string, token: string) {
  if (!username || !token) return;
  const map = getDeviceTokenMap();
  map[username] = token;
  saveMap(map);
}

export function getDeviceToken(username?: string): string {
  if (username) {
    const map = getDeviceTokenMap();
    if (map[username]) return map[username];
  }
  return (secureStorage.getItem(LEGACY_KEY) as string) || '';
}

export function allDeviceTokens(): string[] {
  const tokens = Object.values(getDeviceTokenMap());
  const legacy = secureStorage.getItem(LEGACY_KEY);
  if (legacy && !tokens.includes(legacy)) tokens.push(legacy);
  return tokens;
}

export function removeDeviceToken(username?: string) {
  if (username) {
    const map = getDeviceTokenMap();
    delete map[username];
    saveMap(map);
  }
  secureStorage.removeItem(LEGACY_KEY);
}

/** Удаляет токен доверенного устройства только одного аккаунта (не legacy-ключ). */
export function removeDeviceTokenForAccount(username: string) {
  if (!username) return;
  const map = getDeviceTokenMap();
  if (map[username]) {
    delete map[username];
    saveMap(map);
  }
}

export function clearDeviceTokens() {
  saveMap({});
  secureStorage.removeItem(LEGACY_KEY);
}
