import { useSettings, DEFAULT_LIBRARY_SETTINGS } from '../../../context/SettingsContext';
import type { LibraryItemSize } from '../../../context/SettingsContext';
import SettingsToggle from './SettingsToggle';

const SIZE_OPTIONS: { id: LibraryItemSize; label: string }[] = [
  { id: 'auto', label: 'Автоматический' },
  { id: 'small', label: 'Маленький' },
  { id: 'medium', label: 'Средний' },
  { id: 'large', label: 'Большой' },
];

export default function LibraryTab() {
  const { settings, updateSettings } = useSettings();
  const lib = { ...DEFAULT_LIBRARY_SETTINGS, ...(settings.library || {}) };
  const set = (patch: Partial<typeof lib>) => updateSettings({ library: { ...lib, ...patch } });

  const rows: { key: keyof typeof lib; title: string; desc: string }[] = [
    { key: 'low_bandwidth', title: 'Низкая нагрузка на сеть', desc: 'Уменьшает использование интернета, выключая такие функции, как автозагрузка контента сообщества' },
    { key: 'simple_mode', title: 'Упрощённый режим', desc: 'Улучшает производительность библиотеки, отключая некоторые графические улучшения и переходы' },
    { key: 'hide_community_content', title: 'Скрыть контент сообщества', desc: 'Предотвращает автозагрузку контента сообщества при просмотре информации об игре' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>РАЗМЕР ЭЛЕМЕНТОВ</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Размер элементов в интерфейсе библиотеки</p>
        <div className="tl-tabs">
          {SIZE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => set({ item_size: o.id })}
              className={`tl-tab ${lib.item_size === o.id ? 'active' : ''}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>ДОПОЛНИТЕЛЬНЫЕ ПАРАМЕТРЫ</h3>
        <div className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <div key={r.key} className="tl-vrow">
              <div className="vt">
                <b>{r.title}</b>
                <div className="vd">{r.desc}</div>
              </div>
              <SettingsToggle
                label=""
                checked={!!lib[r.key]}
                onChange={() => set({ [r.key]: !lib[r.key] } as any)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
