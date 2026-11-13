import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Package, Loader2 } from 'lucide-react';
import { getAppPaths, setAppPaths, type AppPaths, type AppPathsPatch } from '../../../utils/appPaths';
import DriveSelect from '../../../components/DriveSelect';

interface Props {
  open: boolean;
  kind: 'download' | 'install';
  gameTitle?: string;
  onClose: () => void;
  onConfirm: (dir: string, dontShowAgain: boolean) => void;
}

const META = {
  download: { title: 'Диск для скачивания', hint: 'Файлы игры будут сохранены на этот диск', cta: 'Скачать', icon: Download },
  install: { title: 'Диск для установки', hint: 'Игра будет установлена на этот диск', cta: 'Установить', icon: Package },
} as const;

/**
 * Выбор диска для скачивания или установки. Папку на диске лаунчер задаёт сам.
 * Показывается при каждом действии, пока не отмечен «Не показывать снова»
 * (вернуть можно в Настройки → Хранилище).
 */
export default function PathPickerModal({ open, kind, gameTitle, onClose, onConfirm }: Props) {
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [drive, setDrive] = useState('');
  const [dontShow, setDontShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meta = META[kind];
  const driveKey = kind === 'download' ? 'downloadDrive' : 'installDrive';

  useEffect(() => {
    if (!open) return;
    setDontShow(false);
    setError('');
    setBusy(true);
    getAppPaths()
      .then((p) => {
        setPaths(p);
        setDrive(p ? p[driveKey] : '');
      })
      .finally(() => setBusy(false));
  }, [open, driveKey]);

  const canConfirm = !!paths && !!drive && !busy;

  const confirm = async () => {
    if (!paths || !canConfirm) return;
    setBusy(true);
    try {
      const patch: AppPathsPatch = { [driveKey]: drive };
      if (dontShow) patch[kind === 'download' ? 'askDownloadDir' : 'askInstallDir'] = false;
      const next = await setAppPaths(patch);
      if (next?.error) { setError(next.error); return; }
      onConfirm(kind === 'download' ? next?.downloadPath || '' : next?.installPath || '', dontShow);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className="tl-panel w-full max-w-lg p-6 max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.14em] text-white flex items-center gap-2" style={{ textShadow: 'var(--glow-sm)' }}>
              <meta.icon size={13} className="text-accent" /> {meta.title}
            </h3>
            <p className="tl-term text-[14px] tl-muted mt-1.5">{gameTitle ? `${gameTitle} — ` : ''}{meta.hint}</p>
          </div>
          <button onClick={onClose} className="tl-muted hover:text-white transition-colors cursor-pointer" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        {paths ? (
          <DriveSelect value={drive} drives={paths.drives} systemDrive={paths.systemDrive} onChange={(d) => { setDrive(d); setError(''); }} />
        ) : (
          <p className="tl-term text-[14px] tl-muted flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> Чтение настроек…
          </p>
        )}
        {error && <p className="tl-term text-[14px] text-[#ff5b8a] mt-2">{error}</p>}

        <label className="flex items-center gap-2.5 mt-4 tl-term text-[15px] tl-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            className="accent-[color:var(--color-accent)] cursor-pointer"
          />
          Не показывать снова
        </label>
        <p className="tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
          Диск всегда можно поменять в Настройки → Хранилище
        </p>

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={confirm} disabled={!canConfirm} className="tl-btn solid flex-1 disabled:opacity-50">
            {busy && paths ? <Loader2 size={13} className="animate-spin" /> : <meta.icon size={13} />} {meta.cta}
          </button>
          <button type="button" onClick={onClose} className="tl-btn ghost">Отмена</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
