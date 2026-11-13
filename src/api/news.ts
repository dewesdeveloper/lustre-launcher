// Лента новостей (/news): общая лента и подборка «для вас», плюс публикация для админки.
import api from './index';

/** Тег новости (общий словарь тегов каталога) */
export type NewsTag = { id: number; name: string; category?: string };

/** Новость; score и for_you сервер считает под текущего пользователя */
export type NewsItem = {
  id: number;
  title: string;
  content: string;
  category: string;
  image_url: string;
  link: string;
  tags?: NewsTag[];
  created_at: string;
  updated_at?: string;
  score: number;
  for_you: boolean;
};

export type NewNews = Pick<NewsItem, 'title' | 'content' | 'category'> & {
  image_url?: string;
  link?: string;
  tag_ids?: number[];
};

/** Новости; category — фильтр по разделу ('all' или пусто — все разделы) */
export async function getNews(category?: string): Promise<NewsItem[]> {
  const filter = category && category !== 'all' ? { category } : {};
  const { data } = await api.get<NewsItem[]>('/news/', { params: filter });
  return data;
}

export async function createNews(payload: NewNews): Promise<NewsItem> {
  const { data } = await api.post<NewsItem>('/news', payload);
  return data;
}

export async function deleteNews(id: number): Promise<void> {
  await api.delete(`/news/${id}`);
}
