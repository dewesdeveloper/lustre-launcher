import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FolderDown, Gamepad2, HardDrive, Loader2 } from 'lucide-react';
import { getAppPaths, pathsAvailable, setAppPaths, type AppPaths, type DriveInfo } from '../utils/appPaths';

const GB = 1024 ** 3;
const fmtGb = (n: number) => `${(n / GB).toFixed(n >= 100 * GB ? 0 : 1)} ГБ`;

/** Папка, которая получится на диске (как в electron/installer.cjs: folderOnDrive) */
function folderFor(paths: AppPaths, drive: string, kind: 'Games' | 'Downloads') {
  if (!drive || drive === paths.systemDrive) {
    return kind === 'Games' ? paths.installPath : paths.downloadPath;
  }
  return `${drive}Lustre\\${kind}`;
}

function DriveCard({ d, active, system, disabled, onPick }: {
  d: DriveInfo; active: boolean; system: boolean; disabled: boolean; onPick: () => void;
}) {
  const used = d.total > 0 ? Math.min(100, Math.round(((d.total - d.free) / d.total) * 100)) : 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onPick}
      className={`flex items-center gap-3 border px-3 py-2.5 text-left transition-colors ${active ? 'border-[var(--pink)] bg-[rgb(var(--accent-rgb)/.08)] shadow-[var(--glow-sm)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
    >
      <HardDrive size={18} className={active ? 'shrink-0 text-accent' : 'shrink-0 text-[var(--muted)]'} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 tl-head text-[11px] font-bold uppercase tracking-[0.12em] text-white">
          Диск {d.root.slice(0, 2)}
          {system && <span className="text-[10px] text-[var(--muted)]">Windows</span>}
        </span>
        <span className="mt-1.5 block h-1.5 bg-black/40">
          <span className={`block h-full ${used > 90 ? 'bg-[#ff5b8a]' : 'bg-[var(--pink)]'}`} style={{ width: `${used}%` }} />
        </span>
        <span className="mt-1 block tl-term text-[13px] text-[var(--muted)]">Свободно {fmtGb(d.free)} из {fmtGb(d.total)}</span>
      </span>
      {active && <Check size={16} className="shrink-0 text-accent" />}
    </button>
  );
}

/**
 * Первый запуск: где хранить игры. Игры занимают десятки гигабайт, а по умолчанию лаунчер
 * кладёт их в скрытую папку AppData на диске Windows. Предлагаем выбрать диск — лаунчер создаст
 * на нём Lustre\Games и Lustre\Downloads. Показывается один раз (storageSetupDone).
 */
export default function FirstRunStorageModal() {
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [drive, setDrive] = useState('');
  const [askEach, setAskEach] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pathsAvailable()) return;
    getAppPaths().then((p) => {
      if (!p || p.storageSetupDone) return;
      setPaths(p);
      // по умолчанию — диск, где больше всего свободного места
      const best = [...p.drives].sort((a, b) => b.free - a.free)[0];
      setDrive(best?.root || p.installDrive || p.systemDrive);
    });
  }, []);

  if (!paths) return null;

  const save = async (chosen: string) => {
    setBusy(true);
    setError('');
    const next = await setAppPaths({
      installDrive: chosen,
      downloadDrive: chosen,
      askDownloadDir: askEach,
      askInstallDir: askEach,
      storageSetupDone: true,
    });
    setBusy(false);
    if (!next || next.error) { setError(next?.error || 'Не удалось сохранить настройки'); return; }
    setPaths(null);
  };

  const systemOnly = paths.drives.length <= 1;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="first-run-storage" className="tl-panel w-full max-w-lg p-6">
        <h3 id="first-run-storage" className="tl-head flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-white" style={{ textShadow: 'var(--glow-sm)' }}>
          <HardDrive size={15} className="text-accent" /> Где хранить игры?
        </h3>
        <p className="tl-term mt-2 text-[15px] leading-relaxed text-pearl/75">
          Игры занимают десятки гигабайт. Выберите диск — лаунчер создаст на нём свою папку и будет
          скачивать и ставить игры туда. Удобнее всего диск, где больше свободного места.
        </p>

        {/* все диски сразу — карточками со шкалой свободного места */}
        <div role="radiogroup" aria-label="Диск для игр" className="mt-4 grid gap-2">
          {paths.drives.map((d) => (
            <DriveCard
              key={d.root}
              d={d}
              active={d.root === drive}
              system={d.root === paths.systemDrive}
              disabled={busy}
              onPick={() => { setDrive(d.root); setError(''); }}
            />
          ))}
        </div>

        <div className="mt-4 space-y-1.5 border border-[var(--line)] p-3">
          <p className="flex items-center gap-2 tl-term text-[14px] text-pearl/85">
            <Gamepad2 size={14} className="shrink-0 text-accent" /> Игры:
            <span className="min-w-0 truncate text-white" title={folderFor(paths, drive, 'Games')}>{folderFor(paths, drive, 'Games')}</span>
          </p>
          <p className="flex items-center gap-2 tl-term text-[14px] text-pearl/85">
            <FolderDown size={14} className="shrink-0 text-accent" /> Загрузки:
            <span className="min-w-0 truncate text-white" title={folderFor(paths, drive, 'Downloads')}>{folderFor(paths, drive, 'Downloads')}</span>
          </p>
          {drive === paths.systemDrive && !systemOnly && (
            <p className="tl-term text-[13px] text-amber-300">
              На диске Windows игры лягут в скрытую папку AppData — её сложнее найти, и место на системном диске обычно заканчивается первым.
            </p>
          )}
        </div>

        <label className="mt-4 flex cursor-pointer select-none items-center gap-2.5 tl-term text-[15px] tl-muted">
          <input type="checkbox" className="tl-check" checked={askEach} onChange={(e) => setAskEach(e.target.checked)} />
          Спрашивать диск перед каждым скачиванием
        </label>
        <p className="mt-1 tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
          Диск можно поменять в Настройки → Хранилище
        </p>
        {error && <p className="mt-2 tl-term text-[14px] text-[#ff5b8a]">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => save(drive)} disabled={busy || !drive} className="tl-btn solid flex-1 justify-center">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <HardDrive size={13} />} Сохранить
          </button>
          {drive !== paths.systemDrive && (
            <button type="button" onClick={() => save(paths.systemDrive)} disabled={busy} className="tl-btn ghost">
              Оставить на диске Windows
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
