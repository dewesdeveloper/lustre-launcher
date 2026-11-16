// Слабая графика: если видеокарта не ускоряет отрисовку (нет драйвера, стандартный «Базовый
// видеоадаптер Майкрософт», видеокарта в чёрном списке Chromium), интерфейс рисуется процессором
// и анимации с размытием заметно тормозят. Лаунчер один раз предлагает упрощённый режим.
import { useEffect } from 'react';
import { useDialog } from '../components/Dialogs';
import { useSettings } from '../context/SettingsContext';

const ASKED_KEY = 'lustre_weak_gpu_asked';
/** Не мешаем первым секундам запуска (окно обновления, вход, окно 18+) */
const PROMPT_DELAY_MS = 6000;
/** «Базовый видеоадаптер (Майкрософт)» — драйвер видеокарты не установлен */
const MS_BASIC_RENDER_VENDOR = 0x1414;

export type GpuStatus = {
  feature: Record<string, string>;
  vendorId?: number;
  deviceId?: number;
  driver?: string;
};

/** Причина, по которой отрисовка идёт без видеокарты; null — всё в порядке */
export function weakGpuReason(s: GpuStatus | null | undefined): string | null {
  if (!s) return null;
  if (s.vendorId === MS_BASIC_RENDER_VENDOR) return 'не установлен драйвер видеокарты (используется «Базовый видеоадаптер Майкрософт»)';
  const compositing = s.feature?.gpu_compositing || '';
  if (/^(disabled|unavailable)/.test(compositing)) return 'видеокарта не ускоряет отрисовку интерфейса (старый драйвер или видеокарта не поддерживается)';
  return null;
}

/** Один раз за установку: проверить графику и предложить упрощённый режим */
export function useWeakGpuPrompt(enabled: boolean) {
  const dialog = useDialog();
  const { getLibrary, updateSettings } = useSettings();

  useEffect(() => {
    const electron = (window as any).electron;
    if (!enabled || !electron?.gpuStatus) return;
    try { if (localStorage.getItem(ASKED_KEY)) return; } catch { return; }

    let alive = true;
    const timer = setTimeout(async () => {
      if (!alive || getLibrary().simple_mode) return;
      let status: GpuStatus | null = null;
      try { status = await electron.gpuStatus(); } catch { return; }
      const reason = weakGpuReason(status);
      if (!alive || !reason) return;
      try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* не запомним — спросим в следующий раз */ }
      const ok = await dialog.confirm({
        title: 'Интерфейс может тормозить',
        message: `Похоже, ${reason}. Из-за этого анимации и размытие рисует процессор. ` +
          'Включить упрощённый режим? Он отключает анимации и эффекты, вернуть их можно в Настройки → Библиотека. ' +
          'Также стоит обновить драйвер видеокарты.',
        confirmText: 'Включить упрощённый режим',
        cancelText: 'Оставить как есть',
      });
      if (ok) await updateSettings({ library: { ...getLibrary(), simple_mode: true } });
    }, PROMPT_DELAY_MS);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
