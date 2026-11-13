/**
 * Фон лаунчера — общий «bus», как и тема оформления.
 * Нужен потому, что настройки открыты в отдельном окне Electron:
 * фон должен примениться в главном окне сразу после сохранения.
 */

import { useEffect, useState } from 'react';

export interface LauncherBackground {
  url: string;
  isVideo: boolean;
  scale: number;
  blur: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
}

export const EMPTY_BACKGROUND: LauncherBackground = {
  url: '', isVideo: false, scale: 1, blur: 0, opacity: 1, offsetX: 0, offsetY: 0,
};

const STORAGE_KEY = 'lustre_launcher_background';

/** Применяет фон из профиля (вызывается в главном окне) */
export function applyLauncherBackground(bg?: Partial<LauncherBackground> | null) {
  if (!bg || !bg.url) {
    localStorage.setItem(STORAGE_KEY, '');
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    url: bg.url,
    isVideo: !!bg.isVideo,
    scale: Number(bg.scale ?? 1) || 1,
    blur: Number(bg.blur ?? 0) || 0,
    opacity: Number(bg.opacity ?? 1) || 1,
    offsetX: Number(bg.offsetX ?? 0) || 0,
    offsetY: Number(bg.offsetY ?? 0) || 0,
  }));
}

export function readLauncherBackground(): LauncherBackground {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_BACKGROUND };
    return { ...EMPTY_BACKGROUND, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_BACKGROUND };
  }
}

/** Рассылает фон в остальные окна лаунчера */
export function broadcastLauncherBackground(bg?: Partial<LauncherBackground> | null) {
  applyLauncherBackground(bg);
}

type Listener = (bg: LauncherBackground) => void;
const listeners = new Set<Listener>();

export function onLauncherBackground(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify() {
  const bg = readLauncherBackground();
  listeners.forEach((fn) => { try { fn(bg); } catch { /* ignore */ } });
}

/** Подписка окна на изменения фона (в том числе из соседних окон) */
export function useLauncherBackgroundSync(): LauncherBackground {
  const [bg, setBg] = useState<LauncherBackground>(() => readLauncherBackground());

  useEffect(() => {
    const update = (next: LauncherBackground) => setBg(next);
    listeners.add(update);
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) update(readLauncherBackground());
    });
    return () => {
      listeners.delete(update);
    };
  }, []);

  return bg;
}

/** Ручное уведомление (после сохранения в этом же окне) */
export function emitLauncherBackgroundChanged() {
  notify();
}
