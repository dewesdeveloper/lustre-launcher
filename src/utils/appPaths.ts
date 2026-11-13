// Машинные настройки скачивания и установки игр — живут в userData на компьютере
// (app-paths.json), читаются/пишутся через IPC main-процесса.
// Папку пользователь не выбирает: только диск, папки на нём лаунчер задаёт сам.

export interface DriveInfo {
  /** «D:\» */
  root: string;
  total: number;
  free: number;
}

export interface AppPaths {
  /** Спрашивать диск при каждом скачивании (чекбокс «Не показывать снова») */
  askDownloadDir: boolean;
  /** Спрашивать диск при каждой установке */
  askInstallDir: boolean;
  /** Запускать лаунчер вместе с Windows (HKCU Run, старт в фоне/--hidden) */
  launchAtLogin: boolean;
  /** Ставить игры из setup.exe без мастера, в папку установки лаунчера */
  autoInstallSetups: boolean;
  /** Диск Windows: на нём игры лежат в данных лаунчера */
  systemDrive: string;
  /** Выбранные диски, «D:\» */
  downloadDrive: string;
  installDrive: string;
  drives: DriveInfo[];
  /** Папки, которые получились на выбранных дисках */
  downloadPath: string;
  installPath: string;
  /** Ответ на сохранение: диск недоступен или на нём нельзя создать папку */
  error?: string;
}

export type AppPathsPatch = Partial<Pick<AppPaths, 'askDownloadDir' | 'askInstallDir' | 'autoInstallSetups' | 'downloadDrive' | 'installDrive'>>;

const electron = () => (window as any).electron;

export const pathsAvailable = () => !!(electron()?.appPathsGet);

export async function getAppPaths(): Promise<AppPaths | null> {
  try {
    return (await electron()?.appPathsGet?.()) || null;
  } catch {
    return null;
  }
}

export async function setAppPaths(patch: AppPathsPatch): Promise<AppPaths | null> {
  try {
    return (await electron()?.appPathsSet?.(patch)) || null;
  } catch {
    return null;
  }
}

export const effectiveDownloadDir = (p: AppPaths | null): string => p?.downloadPath || '';

export const effectiveInstallDir = (p: AppPaths | null): string => p?.installPath || '';
