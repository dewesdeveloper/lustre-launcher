// Важные новости в колокольчике: сервер отдаёт важные новости за две недели (GET /news/important),
// а при публикации присылает событие «news.important» всем, кто в сети, — показываем всплывашку.
// Что уже открыто, помним на этом устройстве (localStorage), как и прочие отметки колокольчика.
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api';
import { onChatEvent } from '../../api/chat';
import { nativeNotify } from '../../utils/nativeNotify';

export type ImportantNews = { id: number; title: string; preview: string; created_at: string };

const seenKey = (uid: number) => `lh_news_seen_${uid}`;

function readSeen(uid: number): Set<number> {
  try { return new Set((JSON.parse(localStorage.getItem(seenKey(uid)) || '[]') as number[]).map(Number)); } catch { return new Set(); }
}
function writeSeen(uid: number, ids: Set<number>) {
  // хранится только несколько последних — старые новости из выборки сервера всё равно уходят
  try { localStorage.setItem(seenKey(uid), JSON.stringify([...ids].slice(-50))); } catch { /* приватный режим */ }
}

export function useImportantNews(uid: number | undefined) {
  const [items, setItems] = useState<ImportantNews[]>([]);
  const [seen, setSeen] = useState<Set<number>>(() => (uid ? readSeen(uid) : new Set()));

  const load = useCallback(() => {
    if (!uid) return;
    api.get<{ news: ImportantNews[] }>('/news/important')
      .then(({ data }) => setItems(data?.news || []))
      .catch(() => { /* офлайн — покажем при следующей попытке */ });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    setSeen(readSeen(uid));
    load();
    const timer = setInterval(load, 10 * 60 * 1000);
    const off = onChatEvent((data: any) => {
      if (data?.type !== 'news.important' || !data.news) return;
      const n = data.news as ImportantNews;
      setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 5));
      // показываем всегда, даже если окно в фокусе: новость важная
      nativeNotify({
        title: 'Важная новость Lustre',
        body: n.title,
        tag: `lh-news-${n.id}`,
        payload: { type: 'news', id: n.id },
        kind: 'notify',
      });
    });
    return () => { clearInterval(timer); off(); };
  }, [uid, load]);

  const unseen = useMemo(() => items.filter((n) => !seen.has(n.id)), [items, seen]);

  const markSeen = useCallback((ids: number[]) => {
    if (!uid || ids.length === 0) return;
    setSeen((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      writeSeen(uid, next);
      return next;
    });
  }, [uid]);

  return { unseen, markSeen, reload: load };
}
