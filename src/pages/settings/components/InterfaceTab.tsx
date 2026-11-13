import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { useSettings } from '../../../context/SettingsContext';
import { getShop, equipItem, unequipSlot } from '../../../api/shop';
import type { ShopData, ShopItem } from '../../../api/shop';
import { DEFAULT_LAUNCHER_THEME, findLauncherTheme } from '../../../components/profileThemes';
import {
  getTransitionChoice,
  setTransitionChoice,
  TRANSITION_OPTIONS,
} from '../../../utils/pageTransitionChoice';
import { useOpenPath } from '../useOpenPath';
import ThemeCard from './ThemeCard';
import SettingsToggle from './SettingsToggle';
import {
  FX_LEVEL_OPTIONS, getFxLevel, setFxLevel, getUiSounds, setUiSounds,
  getUiVolume, setUiVolume, playUi, celebrate, type FxLevel,
} from '../../../utils/uiFx';

const SCALE_PRESETS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

export default function InterfaceTab() {
  const { user, updateProfile } = useAuth();
  const { settings, updateSettings } = useSettings();
  const openPath = useOpenPath();
  const [data, setData] = useState<ShopData | null>(null);
  const [busy, setBusy] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const electron = (window as any).electron;

  const uiScale = settings.ui_scale ?? 1;
  const setScale = (v: number) => updateSettings({ ui_scale: Math.min(1.5, Math.max(0.8, v)) });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const on = await electron?.loginItemGet?.();
        if (mounted) setLaunchAtLogin(!!on);
      } catch { /* ignore */ }
    })();
    return () => { mounted = false; };
  }, [electron]);

  const toggleLaunchAtLogin = async () => {
    const next = !launchAtLogin;
    setLaunchAtLogin(next);
    try {
      const actual = await electron?.loginItemSet?.(next);
      if (typeof actual === 'boolean') setLaunchAtLogin(actual);
    } catch { /* ignore */ }
  };

  const currentId = user?.profile?.launcher_theme_id || '';
  const isDefault = !currentId || currentId === DEFAULT_LAUNCHER_THEME.id;

  useEffect(() => {
    getShop().then(setData).catch(() => setData(null));
  }, []);

  const ownedThemes = (data?.items || []).filter(
    it => it.type === 'theme' && it.scope === 'launcher' && data!.owned.includes(it.id)
  );

  const equip = async (item: ShopItem) => {
    if (busy || currentId === item.payload) return;
    setBusy(true);
    try {
      const p = await equipItem(item.id);
      updateProfile(p);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (busy || isDefault) return;
    setBusy(true);
    try {
      const p = await unequipSlot('launcher_theme');
      updateProfile(p);
    } finally {
      setBusy(false);
    }
  };

  // Выбор анимации перехода (общий для всех окон, см. utils/pageTransitionChoice)
  const [transition, setTransition] = useState(getTransitionChoice);
  const pickTransition = (value: string) => {
    setTransition(value);
    setTransitionChoice(value);
  };

  // Уровень эффектов и звуки интерфейса — локально для устройства (utils/uiFx)
  const [fxLevel, setFxLevelState] = useState<FxLevel>(getFxLevel);
  const [sounds, setSounds] = useState(getUiSounds);
  const [volume, setVolume] = useState(getUiVolume);
  const pickFx = (lvl: FxLevel) => { setFxLevelState(lvl); setFxLevel(lvl); };
  const fxSimple = !!settings.library?.simple_mode;

  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>
          ВИЗУАЛЬНЫЕ ЭФФЕКТЫ
        </h3>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mb-4">
          {fxSimple
            ? 'Сейчас включён упрощённый режим (Настройки → Библиотека) — он отключает все анимации.'
            : 'Насколько «живым» будет интерфейс. На слабых компьютерах выбирайте «Минимум».'}
        </p>
        <div className="tl-presets">
          {FX_LEVEL_OPTIONS.map(([id, label, desc]) => (
            <button
              key={id}
              type="button"
              className={`tl-preset ${fxLevel === id ? 'on' : ''}`}
              onClick={() => pickFx(id)}
            >
              <span className="pt"><span className="dot" />{label}</span>
              <span className="pd">{desc}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="tl-btn mt-4"
          onClick={(e) => celebrate({ x: e.clientX, y: e.clientY })}
        >
          Проверить салют
        </button>
      </div>

      <div className="tl-panel p-[22px] flex flex-col gap-3">
        <SettingsToggle
          label="Звуки интерфейса"
          checked={sounds}
          onChange={() => { const v = !sounds; setSounds(v); setUiSounds(v); if (v) playUi('success'); }}
        />
        <p className="tl-term text-[13px] text-[var(--muted-2)]">
          Тихие короткие сигналы при наведении, нажатии и успешных действиях. Звонки и уведомления это не затрагивает.
        </p>
        <div className={`flex items-center gap-4 ${sounds ? '' : 'opacity-40 pointer-events-none'}`}>
          <span className="tl-term text-[15px] tl-muted shrink-0">Громкость</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => { const v = Number(e.target.value); setVolume(v); setUiVolume(v); }}
            onPointerUp={() => playUi('click')}
            className="flex-1 accent-[color:var(--color-accent)] cursor-pointer"
          />
          <span className="tl-term text-[17px] tl-pink tabular-nums w-12 text-right">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>МАСШТАБ ИНТЕРФЕЙСА</h3>
          <div className="flex items-center gap-3">
            <span className="tl-term text-[17px] tl-pink tabular-nums">{Math.round(uiScale * 100)}%</span>
            {uiScale !== 1 && (
              <button
                onClick={() => setScale(1)}
                className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] tl-muted hover:text-white transition-colors"
              >
                Сбросить
              </button>
            )}
          </div>
        </div>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mb-4">Увеличивает или уменьшает элементы всего интерфейса лаунчера.</p>

        <input
          type="range"
          min={0.8}
          max={1.5}
          step={0.05}
          value={uiScale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-full accent-[color:var(--color-accent)] cursor-pointer"
        />
        <div className="flex justify-between tl-term text-[14px] text-[var(--muted-2)] mt-1">
          <span>80%</span>
          <span>100%</span>
          <span>150%</span>
        </div>

        <div className="tl-tabs mt-4">
          {SCALE_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setScale(v)}
              className={`tl-tab ${Math.abs(uiScale - v) < 0.001 ? 'active' : ''}`}
            >
              {Math.round(v * 100)}%
            </button>
          ))}
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>ТЕМА ЛАУНЧЕРА</h3>
          {!isDefault && (
            <button
              onClick={reset}
              disabled={busy}
              className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] tl-muted hover:text-white transition-colors disabled:opacity-40"
            >
              Сбросить
            </button>
          )}
        </div>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mb-4">Перекрашивает весь интерфейс. Новые темы — в магазине косметики.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <ThemeCard theme={DEFAULT_LAUNCHER_THEME} active={isDefault} busy={busy} onClick={reset} tag="Стандартная" />
          {ownedThemes.map(it => (
            <ThemeCard
              key={it.id}
              theme={findLauncherTheme(it.payload)}
              active={currentId === it.payload}
              busy={busy}
              onClick={() => equip(it)}
            />
          ))}
        </div>
        <button
          onClick={() => openPath('/cosmetics')}
          className="mt-5 tl-head text-[10px] font-bold uppercase tracking-[0.12em] text-violet hover:text-accent transition-colors"
        >
          В магазин тем →
        </button>
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>
          АНИМАЦИИ ПЕРЕХОДА
        </h3>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mb-4">
          Как новая страница появляется при переходе между разделами: интерфейс вокруг остаётся на месте, проявляется только содержимое. «Отключить» — без анимации.
        </p>
        <div className="tl-tabs flex-wrap">
          {TRANSITION_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => pickTransition(value)}
              className={`tl-tab ${transition === value ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="tl-panel p-[22px] flex flex-col gap-2.5">
        <SettingsToggle
          label="Запускать Lustre при входе в Windows"
          checked={launchAtLogin}
          onChange={() => void toggleLaunchAtLogin()}
        />
        <p className="tl-term text-[13px] text-[var(--muted-2)]">
          Лаунчер стартует в фоне (в трее) вместе с системой. Выключите, если не хотите автозапуск.
        </p>
      </div>
    </div>
  );
}
