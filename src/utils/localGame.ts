import api from '../api';
import { notifyLibraryChanged } from './libraryEvents';

// Игры, которые уже стоят на компьютере (без лаунчера): игрок указывает exe, лаунчер привязывает
// его к игре каталога и добавляет в библиотеку как установленную. Файлы игры лаунчер не трогает.

type Dialogs = {
  alert: (opts: { title?: string; message: string }) => Promise<void>;
};

const electron = () => (window as any).electron;

export const canAddLocalGames = () => !!electron()?.addLocalGame;

/** Окно выбора exe. null — игрок закрыл окно */
export async function pickGameExe(): Promise<string | null> {
  return (await electron()?.pickGameExe?.()) || null;
}

/** «D:\Games\The Witcher 3 [GOG] v4.04\bin\x64\witcher3.exe» → «The Witcher 3» — для поиска в каталоге */
export function guessTitleFromExe(exePath: string): string {
  const parts = exePath.split(/[\\/]/).filter(Boolean);
  const exe = (parts.pop() || '').replace(/\.exe$/i, '');
  // папка игры: выше служебных папок (bin, x64, Binaries, Win64…)
  const service = /^(bin|bin32|bin64|binaries|win32|win64|x64|x86|game|retail|shipping|exe|program)$/i;
  let dir = parts.pop() || '';
  while (dir && service.test(dir) && parts.length) dir = parts.pop() || '';
  const clean = (s: string) => s
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .replace(/\b(v|ver|version)\s?\d+(?:[\s._]\d+)*\w*/gi, ' ')
    .replace(/\bby\s+\S+.*$/i, ' ')
    .replace(/\b(repack|gog|steam|rip|portable|goty|dlc|update)\b/gi, ' ')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean(dir) || clean(exe);
}

/**
 * Привязать exe к игре каталога: запись в лаунчере + игра в библиотеке аккаунта.
 * Ошибка — текстом, успех — null.
 */
export async function addLocalGame(catalogId: number, title: string, exePath: string): Promise<string | null> {
  const res = await electron()?.addLocalGame?.({ catalogId, exePath, title });
  if (!res || res.error) return res?.error || 'Не удалось добавить игру';
  // в библиотеку аккаунта — чтобы игра была видна в списке; если уже там, сервер ответит ошибкой, это не страшно
  await api.post('/library/add', { game_id: catalogId }).catch(() => {});
  notifyLibraryChanged();
  return null;
}

/** Со страницы игры: выбрать exe и сразу привязать к этой игре. true — добавлена. */
export async function pickAndAddLocalGame(catalogId: number, title: string, dlg: Dialogs): Promise<boolean> {
  const exe = await pickGameExe();
  if (!exe) return false;
  const err = await addLocalGame(catalogId, title, exe);
  if (err) {
    await dlg.alert({ title: 'Не удалось добавить игру', message: err });
    return false;
  }
  await dlg.alert({
    title: 'Игра добавлена',
    message: `«${title}» добавлена как установленная: ${exe}\nЛаунчер не будет перемещать или удалять её файлы — «Удалить» уберёт только запись из лаунчера.`,
  });
  return true;
}
