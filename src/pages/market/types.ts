export interface GameMedia {
  id: number;
  url: string;
  is_video: boolean;
  /** обложка видео (кадр из Steam, превью YouTube) */
  thumbnail?: string;
}

export interface Requirement {
  id: number;
  type: string;
  os: string;
  processor: string;
  graphics_card: string;
  ram: string;
  storage: string;
}

export interface GameLanguage {
  id: number;
  name: string;
  interface: boolean;
  audio: boolean;
  subtitles: boolean;
}

export interface Tag {
  id: number;
  name: string;
}

export type GameSourceKind = 'torrent' | 'direct' | 'pixeldrain' | 'itch';

export interface GameSource {
  id: number;
  kind: GameSourceKind;
  label: string;
  magnet_uri: string;
  url: string;
  size: string;
  sort_order: number;
}

export interface GameStoreLink {
  id: number;
  store: 'steam' | 'itch' | 'gamejolt' | string;
  url: string;
  sort_order: number;
}

export interface Game {
  ID: number;
  title: string;
  developer: string;
  publisher: string;
  release_date: string;
  description: string;
  about_game: string;
  banner_url: string;
  header_image: string;
  age_rating: string;
  magnet_uri: string;
  is_adult: boolean;
  media: GameMedia[];
  requirements: Requirement[];
  languages: GameLanguage[];
  sources: GameSource[];
  store_links: GameStoreLink[];
  tags: Tag[];
  features: string;
}

export interface TorrentFile {
  name: string;
  size: number;
  path: string;
}

export interface Download {
  /** Прямая загрузка: связь потеряна, ждём и продолжим сами */
  waiting?: boolean;
  /** торрент: качать пока не у кого */
  searching?: boolean;
  searchingLong?: boolean;
  id: string;
  gameId: number;
  gameTitle: string;
  magnetURI: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  downloaded: number;
  totalSize: number;
  numPeers: number;
  status: string;
  path: string;
  files: TorrentFile[];
  addedAt: number;
  /** секунд до конца загрузки по текущей скорости */
  eta?: number;
  error?: string;
}

export interface InstalledGame {
  id: string;
  name: string;
  installPath: string;
  exePath: string | null;
  kind: string;
  installedAt: number;
}

export interface InstallProgress {
  gameId: string;
  phase: string;
  percent: number;
  /** установка setup.exe без мастера */
  silent?: boolean;
  /** сколько уже записано в папку игры при тихой установке */
  bytes?: number;
}

export type SortKey = 'title-asc' | 'title-desc' | 'date-new' | 'date-old' | 'added-new' | 'added-old';
