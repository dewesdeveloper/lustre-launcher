export interface StorageGame {
  id: string;
  name: string;
  installPath: string;
  exePath: string | null;
  kind: string;
  size: number;
  lastPlayedAt: number | null;
  installedAt: number | null;
  playtimeMs: number;
}

export interface StorageDrive { root: string; total: number; free: number }

export interface StorageData {
  drives: StorageDrive[];
  games: StorageGame[];
  gamesDir: string;
  downloadsPath: string;
  downloadsSize: number;
  scannedAt: number;
}

export interface StorageSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}
