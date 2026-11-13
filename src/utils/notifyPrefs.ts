// Настройки уведомлений (вкладка «Уведомления»). Хранятся на этом устройстве, как в клиенте
// Steam: на работе можно выключить звук, дома оставить. Изменение сразу видно всем окнам
// лаунчера (событие в своём окне + storage-событие в остальных).
import { useEffect, useState } from 'react';
import notifSoundUrl from '../assets/sounds/received-mail-notification.mp3';

export type NotifyCategory = 'messages' | 'groups' | 'friends' | 'calls' | 'missed';

export interface NotifyPrefs {
  /** Системные уведомления Windows вообще */
  enabled: boolean;
  /** «Не беспокоить»: ни всплывающих уведомлений, ни звуков (окна звонков остаются) */
  dnd: boolean;
  categories: Record<NotifyCategory, boolean>;
  /** Показывать текст сообщения во всплывающем уведомлении */
  preview: boolean;
  /** Звук уведомлений и его громкость (0–100) */
  sound: boolean;
  volume: number;
  /** Мелодия входящего звонка */
  ringtone: boolean;
}

const KEY = 'lh_notify_prefs';
const EVENT = 'lh-notify-prefs';

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  enabled: true,
  dnd: false,
  categories: { messages: true, groups: true, friends: true, calls: true, missed: true },
  preview: true,
  sound: true,
  volume: 60,
  ringtone: true,
};

export function getNotifyPrefs(): NotifyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        ...DEFAULT_NOTIFY_PREFS,
        ...raw,
        categories: { ...DEFAULT_NOTIFY_PREFS.categories, ...(raw.categories || {}) },
        volume: Math.max(0, Math.min(100, Number(raw.volume ?? DEFAULT_NOTIFY_PREFS.volume))),
      };
    }
  } catch { /* повреждённое значение — берём умолчания */ }
  return DEFAULT_NOTIFY_PREFS;
}

export function setNotifyPrefs(patch: Partial<NotifyPrefs>): NotifyPrefs {
  const cur = getNotifyPrefs();
  const next: NotifyPrefs = {
    ...cur,
    ...patch,
    categories: { ...cur.categories, ...(patch.categories || {}) },
  };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
  return next;
}

/** Показывать ли уведомление этой категории сейчас */
export function shouldNotify(category: NotifyCategory): boolean {
  const p = getNotifyPrefs();
  return p.enabled && !p.dnd && p.categories[category];
}

/** Звук уведомления с учётом «не беспокоить», выключателя и громкости */
export function playNotifSound(force = false) {
  const p = getNotifyPrefs();
  if (!force && (!p.sound || p.dnd)) return;
  try {
    const a = new Audio(notifSoundUrl);
    a.volume = Math.max(0, Math.min(1, p.volume / 100));
    a.play().catch(() => {});
  } catch { /* ignore */ }
}

/** Хук: актуальные настройки с перерисовкой при изменении в любом окне */
export function useNotifyPrefs(): NotifyPrefs {
  const [prefs, setPrefs] = useState<NotifyPrefs>(getNotifyPrefs);
  useEffect(() => {
    const sync = () => setPrefs(getNotifyPrefs());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return prefs;
}
