// Нативные уведомления Windows (как в Steam): в Electron вызываем
// IPC → electron.Notification → системный тост поверх окна.
// В обычном вебе — фолбэк на HTML5 Notification.
import { shouldNotify, type NotifyCategory } from './notifyPrefs';

export interface NativeNotifyOptions {
  title: string;
  body?: string;
  /** Дедупликация в системе (Windows группирует по tag) */
  tag?: string;
  silent?: boolean;
  /** Данные для обработчика клика по уведомлению (main → renderer) */
  payload?: unknown;
  /** Категория для настроек «Уведомлений»; без неё (проверка) показывается всегда */
  category?: NotifyCategory;
}

export function nativeNotify(opts: NativeNotifyOptions): boolean {
  if (opts.category && !shouldNotify(opts.category)) return false;
  try {
    const electron = (window as any).electron;
    if (electron?.showNotification) {
      void electron.showNotification({
        title: opts.title,
        body: opts.body || '',
        tag: opts.tag,
        silent: !!opts.silent,
        payload: opts.payload ?? null,
      });
      return true;
    }

    if (typeof Notification !== 'undefined') {
      const show = (perm: NotificationPermission) => {
        if (perm !== 'granted') return;
        try {
          const n = new Notification(opts.title, { body: opts.body, tag: opts.tag });
          n.onclick = () => {
            try { window.focus(); } catch { /* ignore */ }
            n.close();
          };
        } catch { /* ignore */ }
      };
      if (Notification.permission === 'granted') show('granted');
      else if (Notification.permission === 'default') {
        void Notification.requestPermission().then(show);
      }
      return true;
    }
  } catch { /* ignore */ }
  return false;
}
