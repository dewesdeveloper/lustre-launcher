export interface LibraryEntry {
  id: number;
  game_id: number;
  favorite: boolean;
  created_at: string;
  playtime_ms?: number;
  last_played_at?: string;
  game: {
    ID: number;
    title: string;
    header_image: string;
    banner_url: string;
    age_rating: string;
    developer: string;
    tags: { id: number; name: string }[];
  };
}

export interface SidebarLibraryEntry {
  id: number;
  game_id: number;
  favorite: boolean;
  game: {
    ID: number;
    title: string;
    header_image: string;
  };
}

export interface InstalledGame {
  id: string;
  name: string;
  installPath: string;
  exePath: string | null;
  kind: string;
  installedAt: number;
  lastPlayedAt?: number;
  playtimeMs?: number;
}

export interface Tag { id: number; name: string }

export type GameSourceKind = 'torrent' | 'direct' | 'pixeldrain';

export interface GameSource {
  id: number;
  kind: GameSourceKind;
  label: string;
  magnet_uri: string;
  url: string;
  size: string;
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
  sources?: GameSource[];
  tags: Tag[];
}
