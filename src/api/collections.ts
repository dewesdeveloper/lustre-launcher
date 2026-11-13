import api from './index';

export interface CollectionGameItem {
  id: number;
  collection_id: number;
  game_id: number;
  position: number;
  added_at: string;
  game: {
    ID: number;
    title: string;
    header_image?: string;
    banner_url?: string;
    age_rating?: string;
  };
}

export interface Collection {
  id: number;
  user_id: number;
  name: string;
  description: string;
  cover_url: string;
  is_public: boolean;
  created_at: string;
  games_count: number;
  is_owner: boolean;
}

export interface CollectionDetails extends Collection {
  games: CollectionGameItem[];
}

export async function getUserCollections(username: string): Promise<Collection[]> {
  const res = await api.get(`/collections/user/${username}`);
  return res.data || [];
}

export async function getCollection(id: number): Promise<CollectionDetails> {
  const res = await api.get(`/collections/${id}`);
  return res.data;
}

export async function createCollection(payload: {
  name: string;
  description?: string;
  is_public?: boolean;
}): Promise<Collection> {
  const res = await api.post('/collections/', payload);
  return res.data;
}

export async function updateCollection(id: number, payload: {
  name?: string;
  description?: string;
  cover_url?: string;
  is_public?: boolean;
}): Promise<void> {
  await api.put(`/collections/${id}`, payload);
}

export async function deleteCollection(id: number): Promise<void> {
  await api.delete(`/collections/${id}`);
}

export async function addGameToCollection(collectionId: number, gameId: number): Promise<void> {
  await api.post(`/collections/${collectionId}/games`, { game_id: gameId });
}

export async function removeGameFromCollection(collectionId: number, gameId: number): Promise<void> {
  await api.delete(`/collections/${collectionId}/games/${gameId}`);
}

export async function setFavoritesOrder(gameIds: number[], limit = 5): Promise<void> {
  await api.put('/library/favorites', { game_ids: gameIds.slice(0, limit) });
}
