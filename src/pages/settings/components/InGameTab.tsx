import { useEffect, useState } from 'react';
import SettingsToggle from './SettingsToggle';
import type { OverlayPrefs } from '../../overlay/overlayState';

const OVERLAY_KEYS: [string, string][] = [
  ['Shift+Tab', 'Shift+Tab'],
  ['CommandOrControl+Shift+Space', 'Ctrl+Shift+Space'],
  ['Alt+`', 'Alt+`'],
  ['F10', 'F10'],
];
const SHOT_KEYS: [string, string][] = [
  ['F12', 'F12'],
  ['CommandOrControl+F12', 'Ctrl+F12'],
  ['off', 'Выключено'],
];

/** Настройки игрового оверлея (только приложение для ПК: в вебе оверлея нет). */
export default function InGameTab() {
  const electron = (window as any).electron;
  const [prefs, setPrefs] = useState<OverlayPrefs | null>(null);

  useEffect(() => {
    electron?.overlayGetState?.().then((s: { prefs: OverlayPrefs }) => setPrefs(s.prefs)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!electron?.overlayGetState) {
    return (
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[15px] font-bold text-white mb-2">ИГРОВОЙ ОВЕРЛЕЙ</h3>
        <p className="tl-term text-[17px] text-[var(--muted)]">
          Оверлей поверх игр доступен в приложении Lustre для ПК.
        </p>
      </div>
    );
  }
  if (!prefs) return null;

  const update = async (patch: Partial<OverlayPrefs>) => {
    setPrefs({ ...prefs, ...patch });
    const next = await electron.overlaySetPrefs(patch).catch(() => null);
    if (next) setPrefs(next);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px] flex flex-col gap-4">
        <div>
          <h3 className="tl-head text-[15px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>ИГРОВОЙ ОВЕРЛЕЙ</h3>
          <p className="tl-term text-[17px] text-[var(--muted)] mt-1.5 leading-relaxed">
            Друзья, чат, скриншоты и заметки поверх игры — без выхода из неё. Работает в играх, запущенных
            из библиотеки Lustre, в оконном и «полноэкранном оконном» режимах.
          </p>
        </div>
        <SettingsToggle label="Включить оверлей в играх" checked={prefs.enabled} onChange={() => update({ enabled: !prefs.enabled })} />
        <SettingsToggle label="Уведомления в игре (вместо системных)" checked={prefs.notifications} onChange={() => update({ notifications: !prefs.notifications })} />
      </div>

      <div className="tl-panel p-[22px] flex flex-col gap-4">
        <h3 className="tl-head text-[15px] font-bold text-white">ГОРЯЧИЕ КЛАВИШИ</h3>
        <p className="tl-term text-[17px] text-[var(--muted)] -mt-2 leading-relaxed">
          Действуют только пока идёт игра — в остальное время сочетания остаются за другими программами.
        </p>
        <KeyPicker label="Открыть оверлей" options={OVERLAY_KEYS} value={prefs.hotkey} disabled={!prefs.enabled} onChange={(v) => update({ hotkey: v })} />
        <KeyPicker label="Скриншот" options={SHOT_KEYS} value={prefs.screenshotHotkey} disabled={!prefs.enabled} onChange={(v) => update({ screenshotHotkey: v })} />
        <p className="tl-term text-[16px] text-[var(--muted)]">
          Скриншоты сохраняются в «Изображения\Lustre\&lt;название игры&gt;».
        </p>
      </div>
    </div>
  );
}

function KeyPicker({ label, options, value, onChange, disabled }: {
  label: string; options: [string, string][]; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <div className="tl-term text-[17px] text-[var(--muted)] mb-2">{label}</div>
      <div className="tl-tabs flex-wrap">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(v)} className={`tl-tab ${value === v ? 'active' : ''}`}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
