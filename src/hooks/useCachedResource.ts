import { useCallback, useEffect, useRef, useState } from 'react';
import { readResource, refreshResource, subscribe, peek, type Fetcher, type ResourceOptions } from '../utils/resourceCache';

/**
 * React-обёртка над кэшем ресурсов.
 * Данные отдаются мгновенно из кэша, ревалидация идёт в фоне,
 * а кулдаун и дедупликацию запросов обеспечивает сам кэш.
 */
export function useCachedResource<T>(
  key: string | null,
  fetcher: Fetcher<T>,
  options: ResourceOptions,
): {
  data: T | null;
  loading: boolean;
  revalidating: boolean;
  refresh: () => void;
} {
  const [data, setData] = useState<T | null>(() => (key ? peek<T>(key) : null));
  const [revalidating, setRevalidating] = useState(false);
  const optsRef = useRef(options);
  const fetcherRef = useRef(fetcher);
  optsRef.current = options;
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!key) {
      setData(null);
      return;
    }

    let mounted = true;
    const read = () => {
      const res = readResource<T>(key, fetcherRef.current, optsRef.current);
      if (!mounted) return;
      setData(res.data);
      setRevalidating(res.revalidating);
      // если данных ещё не было — дожидаемся сетевой загрузки
      if (res.promise && res.data == null) {
        res.promise.then(() => {
          if (!mounted) return;
          setData(peek<T>(key));
          setRevalidating(false);
        });
      }
    };

    read();
    // кэш сам уведомляет подписчиков, когда данные обновились
    const unsub = subscribe(key, read);

    return () => {
      mounted = false;
      unsub();
    };
  }, [key]);

  const refresh = useCallback(() => {
    if (!key) return;
    const p = refreshResource<T>(key, fetcherRef.current, optsRef.current);
    if (p) {
      p.then(() => {
        setData(peek<T>(key));
        setRevalidating(false);
      });
    }
  }, [key]);

  return { data, loading: data == null && revalidating, revalidating, refresh };
}
