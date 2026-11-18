import { useEffect, useRef, useState } from 'react';
import api from '../api';

// Примерное время установки. Тихий установщик репака не сообщает прогресс — видно только, сколько
// уже записано в папку игры. Сколько всего будет, берём из требований игры («Место на диске»),
// а если их нет — размер загрузки × степень сжатия репака. Скорость — по записи за последнюю минуту.

/** Репаки сжаты примерно вдвое: 56 ГБ раздачи GTA V → ~105 ГБ игры */
const REPACK_RATIO = 1.8;
/** Скорость считаем по последним секундам: распаковка идёт рывками */
const WINDOW_MS = 60_000;
/** Раньше этого время не показываем — первые секунды скорость скачет */
const MIN_SAMPLE_MS = 15_000;

/** «105 GB», «9 ГБ», «1.5 TB», «200 MB» → байты */
export function parseStorage(text?: string | null): number | null {
  const m = /([\d]+(?:[.,]\d+)?)\s*(TB|ТБ|GB|ГБ|MB|МБ)/i.exec(String(text || ''));
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toUpperCase();
  const mul = /T/.test(unit) || /Т/.test(unit) ? 1024 ** 4 : /G/.test(unit) || /Г/.test(unit) ? 1024 ** 3 : 1024 ** 2;
  return n > 0 ? Math.round(n * mul) : null;
}

const storageCache = new Map<number, Promise<number | null>>();

/** Место на диске из требований игры каталога (берём большее из минимальных и рекомендуемых) */
export function catalogInstallSize(catalogId: number): Promise<number | null> {
  if (!catalogId) return Promise.resolve(null);
  let p = storageCache.get(catalogId);
  if (!p) {
    p = api.get(`/games/${catalogId}`)
      .then(({ data }) => {
        const sizes = ((data?.requirements || []) as { storage?: string }[]).map((r) => parseStorage(r.storage) || 0);
        const best = Math.max(0, ...sizes);
        return best > 0 ? best : null;
      })
      .catch(() => null);
    storageCache.set(catalogId, p);
  }
  return p;
}

export type InstallEta = {
  /** примерный процент (0–99) или null, если оценить нельзя */
  percent: number | null;
  /** секунд до конца или null, пока скорость не ясна */
  seconds: number | null;
  /** сколько всего ожидается, байт (для подписи «из ~105 ГБ») */
  expectedBytes: number | null;
  /** размер известен из требований игры, а не прикинут по загрузке */
  fromCatalog: boolean;
};

type Progress = { phase: string; percent: number; silent?: boolean; bytes?: number } | undefined;

/**
 * Оценка процента и оставшегося времени установки.
 * - Распаковка архива: процент приходит от 7-Zip — по нему считаем только время.
 * - Тихий установщик: процент = записано / ожидаемый размер игры.
 */
export function useInstallEta(state: Progress, catalogId: number, downloadBytes: number): InstallEta {
  const [catalogBytes, setCatalogBytes] = useState<number | null>(null);
  const samples = useRef<{ t: number; v: number }[]>([]);
  const phaseKey = state ? `${state.phase}:${state.silent ? 's' : 'a'}` : '';
  const lastKey = useRef('');

  const silent = !!state?.silent && state.phase === 'install';
  useEffect(() => {
    if (!silent) return;
    let alive = true;
    catalogInstallSize(catalogId).then((b) => { if (alive) setCatalogBytes(b); });
    return () => { alive = false; };
  }, [silent, catalogId]);

  const expectedBytes = silent
    ? (catalogBytes ?? (downloadBytes > 0 ? Math.round(downloadBytes * REPACK_RATIO) : null))
    : null;

  // текущее значение прогресса: доля 0..1
  let fraction: number | null = null;
  if (state?.phase === 'install') {
    if (state.percent >= 0) fraction = state.percent / 100;
    else if (silent && expectedBytes && state.bytes) fraction = Math.min(0.99, state.bytes / expectedBytes);
  }

  // смена этапа — новая серия замеров
  if (lastKey.current !== phaseKey) {
    lastKey.current = phaseKey;
    samples.current = [];
  }
  const now = Date.now();
  if (fraction !== null) {
    const s = samples.current;
    if (!s.length || s[s.length - 1].v !== fraction) s.push({ t: now, v: fraction });
    while (s.length > 2 && now - s[1].t > WINDOW_MS) s.shift();
  }

  let seconds: number | null = null;
  const s = samples.current;
  if (fraction !== null && fraction < 0.99 && s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    const dt = (last.t - first.t) / 1000;
    const dv = last.v - first.v;
    if (last.t - first.t >= MIN_SAMPLE_MS && dv > 0) seconds = Math.round(((1 - last.v) / dv) * dt);
  }

  return {
    percent: fraction === null ? null : Math.floor(fraction * 100),
    seconds,
    expectedBytes,
    fromCatalog: catalogBytes !== null,
  };
}

/** «≈ 1 ч 20 мин», «≈ 15 мин», «меньше минуты» */
export function formatEtaApprox(seconds: number): string {
  if (seconds < 60) return 'меньше минуты';
  const min = Math.round(seconds / 60);
  if (min < 60) return `≈ ${min} мин`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `≈ ${h} ч ${m} мин` : `≈ ${h} ч`;
}
