import { useEffect, useState } from 'react';

export type OverlayGame = { id: string | number; name: string; catalogId: number; startedAt: number; playtimeMs: number };
export type OverlayPrefs = { enabled: boolean; hotkey: string; screenshotHotkey: string; notifications: boolean };
export type OverlayState = { game: OverlayGame | null; prefs: OverlayPrefs; hotkeyLabel: string; screenshotLabel: string };

/** Состояние игрового оверлея из main-процесса (игра, настройки) с подпиской на изменения. */
export function useOverlayState(): OverlayState | null {
  const [state, setState] = useState<OverlayState | null>(null);
  useEffect(() => {
    const electron = (window as any).electron;
    electron?.overlayGetState?.().then((s: OverlayState) => setState(s)).catch(() => {});
    const off = electron?.onOverlayState?.((s: OverlayState) => setState(s));
    return () => { if (typeof off === 'function') off(); };
  }, []);
  return state;
}

/** Длительность: живой таймер «1:02:05» или, при coarse, «1 ч 2 мин». */
export function formatDuration(ms: number, coarse = false): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (coarse) {
    if (h > 0) return `${h} ч ${m} мин`;
    return `${m} мин`;
  }
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
