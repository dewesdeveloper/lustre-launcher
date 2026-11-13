/**
 * Кэш ресурсов: мгновенная выдача + ревалидация + защита от спама.
 *
 * Как это работает
 *  - stale-while-revalidate: если данные есть в кэше — отдаём сразу и обновляем в фоне
 *  - TTL: как часто считать данные устаревшими
 *  - cooldown: минимальный интервал между сетевыми запросами по ключу
 *    (даже если данные просрочены — чаще не ходим)
 *  - дедупликация: параллельные вызовы одного ключа используют один запрос
 *  - ETag: ответы с ETag отправляются с If-None-Match → сервер отвечает 304 (дёшево)
 *  - localStorage-зеркало: при старте приложения статика рисуется мгновенно,
 *    даже без сети; запись в хранилище с дебаунсом, чтобы не писать на каждый рендер
 */

type Entry<T> = {
  data: T | null;
  storedAt: number;
  etag: string | null;
  pending: boolean;
  lastError: unknown;
};

export type ResourceOptions = {
  /** Как долго данные считаются свежими (мс). */
  ttl: number;
  /** Минимальный интервал между сетевыми запросами (мс). */
  cooldown: number;
  /** Сохранять в localStorage для мгновенной отрисовки при следующем запуске. */
  persist?: boolean;
};

type Listener = () => void;

const memory = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<Listener>>();
const etags = new Map<string, string>();
const lastFetch = new Map<string, number>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Поколение ключа: invalidate() его увеличивает. Ответ запроса, начатого в прошлом поколении,
// не сохраняется (запрос повторяется) — иначе запрос, ушедший ДО изменения (покупки, бонуса),
// записал бы в кэш старые данные как свежие, и они держались бы до конца TTL.
const generation = new Map<string, number>();
const genOf = (key: string) => generation.get(key) || 0;

const STORAGE_PREFIX = 'lustre:res:';

function canPersist(): boolean {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readPersisted<T>(key: string): Entry<T> | null {
  if (!canPersist()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; storedAt: number; etag?: string };
    if (parsed?.data == null) return null;
    return { data: parsed.data, storedAt: parsed.storedAt || 0, etag: parsed.etag || null, pending: false, lastError: null };
  } catch {
    return null;
  }
}

function schedulePersist<T>(key: string, entry: Entry<T>, persist: boolean) {
  const existing = persistTimers.get(key);
  if (existing) clearTimeout(existing);
  if (!persist || !canPersist()) return;
  // пишем в хранилище не чаще раза в 3 секунды
  persistTimers.set(
    key,
    setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_PREFIX + key,
          JSON.stringify({ data: entry.data, storedAt: entry.storedAt, etag: entry.etag }),
        );
      } catch {
        /* переполнено хранилище — не критично */
      }
      persistTimers.delete(key);
    }, 3000),
  );
}

function get<T>(key: string): Entry<T> {
  let entry = memory.get(key) as Entry<T> | undefined;
  if (!entry) {
    entry = readPersisted<T>(key) || { data: null, storedAt: 0, etag: null, pending: false, lastError: null };
    memory.set(key, entry as Entry<unknown>);
  }
  return entry;
}

function set<T>(key: string, data: T, etag: string | null, persist: boolean) {
  const entry: Entry<T> = { data, storedAt: Date.now(), etag, pending: false, lastError: null };
  memory.set(key, entry as Entry<unknown>);
  if (etag) etags.set(key, etag);
  schedulePersist(key, entry, persist);
  notify(key);
}

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => {
    try {
      fn();
    } catch {
      /* игнорируем ошибки подписчиков */
    }
  });
}

/** Подписка на изменение конкретного ключа (для React useSyncExternalStore). */
export function subscribe(key: string, fn: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(key);
  };
}

/** Данные из кэша без сетевого запроса. */
export function peek<T>(key: string): T | null {
  return get<T>(key).data;
}

/** Пометить ключ устаревшим и уведомить подписчиков (следующая выборка обновит данные). */
export function invalidate(key: string): void {
    generation.set(key, genOf(key) + 1);
    const entry = get<unknown>(key);
    entry.storedAt = 0;
    // ETag тоже сбрасываем: иначе условный запрос мог бы вернуть 304
    // и оставить у клиента данные, которые уже изменились.
    entry.etag = null;
    lastFetch.delete(key);
    etags.delete(key);
  memory.set(key, entry);
  if (canPersist()) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      /* ignore */
    }
  }
  notify(key);
}

/** Сбросить устаревание сразу во всех ключах, содержащих подстроку. */
export function invalidateWhere(fragment: string): void {
  for (const key of Array.from(memory.keys())) {
    if (key.includes(fragment)) invalidate(key);
  }
}

function shouldFetch(key: string, ttl: number, cooldown: number): boolean {
  const entry = get<unknown>(key);
  const now = Date.now();
  if (entry.pending) return false; // запрос уже идёт
  if (entry.data != null && now - entry.storedAt < ttl) return false; // свежее
  const last = lastFetch.get(key) || 0;
  if (now - last < cooldown) return false; // кулдаун
  return true;
}

export type Fetcher<T> = (opts: { etag: string | null; signal: 'conditional' | 'full' }) => Promise<{ data: T; etag: string | null; notModified: boolean }>;

type ReadResult<T> = { data: T | null; fromCache: boolean; revalidating: boolean; promise: Promise<void> | null };

const inflight = new Map<string, Promise<void>>();

/**
 * Основная функция чтения ресурса.
 *  - если есть свежие данные — сетевого запроса не будет вовсе;
 *  - если данные устарели (но есть) — отдаём кэш сразу и обновляем в фоне;
 *  - если данных нет — ждём сеть, но кулдаун не даёт долбить при частом рендере.
 */
export function readResource<T>(key: string, fetcher: Fetcher<T>, options: ResourceOptions): ReadResult<T> {
  const { ttl, cooldown, persist = false } = options;
  const entry = get<T>(key);

  const fetchNow = (): Promise<void> => {
    const existing = inflight.get(key);
    if (existing) return existing;

    entry.pending = true;
    memory.set(key, entry as Entry<unknown>);
    lastFetch.set(key, Date.now());

    const p = (async () => {
      try {
        // Данные изменились, пока шёл запрос (invalidate сменил поколение) — ответ устарел:
        // не сохраняем его и сразу запрашиваем заново в рамках того же промиса,
        // чтобы все, кто его ждёт, получили уже свежие данные.
        let res: Awaited<ReturnType<Fetcher<T>>>;
        let attempts = 0;
        for (;;) {
          const startGen = genOf(key);
          const etag = etags.get(key) || entry.etag || null;
          res = await fetcher({ etag, signal: etag ? 'conditional' : 'full' });
          attempts += 1;
          if (genOf(key) === startGen || attempts >= 3) break;
          entry.pending = true; // invalidate мог заменить запись — держим флаг запроса
          memory.set(key, entry as Entry<unknown>);
        }
        if (res.notModified) {
          // 304: обновляем только время хранения, тело не присылаем
          entry.storedAt = Date.now();
          entry.pending = false;
          entry.lastError = null;
          memory.set(key, entry as Entry<unknown>);
          schedulePersist(key, entry, persist);
          notify(key);
          return;
        }
        set(key, res.data, res.etag, persist);
      } catch (e) {
        entry.pending = false;
        entry.lastError = e;
        memory.set(key, entry as Entry<unknown>);
        notify(key);
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, p);
    return p;
  };

  let promise: Promise<void> | null = null;
  if (shouldFetch(key, ttl, cooldown)) {
    promise = fetchNow();
  } else if (entry.pending) {
    // Запрос по этому ключу уже идёт — отдаём его, а не устаревший кэш.
    // Иначе вызывающий получил бы старые данные: например, после покупки
    // предмет продолжал бы выглядеть непроданным.
    promise = inflight.get(key) || null;
  }

  return { data: entry.data, fromCache: entry.data != null, revalidating: entry.pending, promise };
}

/** Принудительное обновление (игнорирует TTL и кулдаун, но не дублирует активный запрос). */
export function refreshResource<T>(key: string, fetcher: Fetcher<T>, options: ResourceOptions): Promise<void> | null {
  const entry = get<T>(key);
  // идущий запрос сам перезапросит данные, если они изменились после его старта
  if (entry.pending) return inflight.get(key) || null;
  entry.storedAt = 0;
  memory.set(key, entry as Entry<unknown>);
  lastFetch.set(key, 0);
  return readResource<T>(key, fetcher, { ...options, ttl: 0, cooldown: 0 }).promise;
}

/**
 * Локально поправить данные ключа (оптимистичное обновление): например, сразу после
 * ответа сервера на «забрать бонус», не дожидаясь перечитывания всего ресурса.
 * Свежесть не меняется — следом обычно идёт invalidate() и фоновая сверка с сервером.
 */
export function mutateResource<T>(key: string, update: (prev: T | null) => T | null, persist = false): void {
  const entry = get<T>(key);
  entry.data = update(entry.data);
  memory.set(key, entry as Entry<unknown>);
  schedulePersist(key, entry, persist);
  notify(key);
}

/** Полная очистка кэша (например, при выходе из аккаунта). */
export function clearResourceCache(): void {
  memory.clear();
  etags.clear();
  lastFetch.clear();
  generation.clear();
  listeners.clear();
  for (const t of persistTimers.values()) clearTimeout(t);
  persistTimers.clear();
  if (!canPersist()) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
