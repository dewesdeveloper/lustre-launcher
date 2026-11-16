import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, CloudUpload, FolderOpen, History, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useDialog } from '../../../components/Dialogs';
import {
  apiErrorText, deleteCloudSave, findSaveFolder, formatBytes, gameMeta, getCloudSaves, localState,
  restoreSaves, setLocalState, uploadSaves, cloudSavesAvailable,
  type CloudSaveVersion, type CloudSavesInfo, type SaveFolder,
} from '../../../api/cloudSaves';

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const SOURCE: Record<SaveFolder['source'], string> = { user: 'выбрана вами', catalog: 'из каталога', emulator: 'папка репака', guess: 'угадана по названию' };

const folderWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'папка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'папки' : 'папок');

/** Облачные сохранения игры: папка, последняя версия в облаке, ручная загрузка, история и восстановление */
export default function CloudSavesPanel({ gameId, gameDir }: { gameId: number; gameDir: string }) {
  const navigate = useNavigate();
  const dlg = useDialog();
  const [info, setInfo] = useState<CloudSavesInfo | null>(null);
  const [folder, setFolder] = useState<SaveFolder | null>(null);
  const [searching, setSearching] = useState(true);
  const [busy, setBusy] = useState<'' | 'upload' | 'restore'>('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [auto, setAuto] = useState(localState(gameId).auto !== false);
  const [title, setTitle] = useState('');

  const load = useCallback(async () => {
    setSearching(true);
    setError('');
    try {
      const [i, meta] = await Promise.all([getCloudSaves(gameId), gameMeta(gameId)]);
      setInfo(i);
      setTitle(meta.title);
      const { best } = await findSaveFolder(gameId, { ...meta, gameDir });
      setFolder(best);
    } catch (e) {
      setError(apiErrorText(e, 'Не удалось загрузить облачные сохранения'));
    } finally {
      setSearching(false);
    }
  }, [gameId, gameDir]);
  useEffect(() => { void load(); }, [load]);

  if (!cloudSavesAvailable()) return null;

  const latest = info?.versions[0];
  const changedSinceSync = !!folder && folder.files > 0 && folder.fingerprint !== localState(gameId).fingerprint;

  const pickFolder = async () => {
    const dir = await (window as any).electron?.cloudSaves?.pickDir?.();
    if (!dir) return;
    setLocalState(gameId, { override: dir, fingerprint: undefined });
    await load();
  };

  const resetFolder = async () => {
    setLocalState(gameId, { override: undefined, fingerprint: undefined });
    await load();
  };

  const upload = async () => {
    if (!folder) return;
    setBusy('upload');
    setError('');
    setNote('');
    try {
      await uploadSaves(gameId, folder, gameDir);
      setNote('Сохранения загружены в облако');
      await load();
    } catch (e) {
      setError(apiErrorText(e, 'Не удалось загрузить сохранения'));
    } finally {
      setBusy('');
    }
  };

  const restore = async (v: CloudSaveVersion) => {
    const ok = await dlg.confirm({
      title: 'Восстановить сохранения?',
      message: `Сохранения от ${when(v.created_at)}${v.device_name ? ` (${v.device_name})` : ''} заменят текущие. Текущие файлы сначала будут упакованы в локальную копию.`,
      confirmText: 'Восстановить',
    });
    if (!ok) return;
    setBusy('restore');
    setError('');
    setNote('');
    try {
      const res = await restoreSaves(gameId, v, folder, title, gameDir);
      setNote(res.backup ? 'Сохранения восстановлены. Прежние файлы — в локальной копии.' : 'Сохранения восстановлены');
      await load();
    } catch (e) {
      setError(apiErrorText(e, 'Не удалось восстановить сохранения'));
    } finally {
      setBusy('');
    }
  };

  const remove = async (v: CloudSaveVersion) => {
    const ok = await dlg.confirm({ title: 'Удалить версию?', message: `Сохранение от ${when(v.created_at)} будет удалено из облака без возможности восстановления.`, confirmText: 'Удалить', danger: true });
    if (!ok) return;
    try {
      await deleteCloudSave(gameId, v.id);
      await load();
    } catch (e) {
      setError(apiErrorText(e, 'Не удалось удалить версию'));
    }
  };

  const toggleAuto = () => {
    const next = !auto;
    setAuto(next);
    setLocalState(gameId, { auto: next });
  };

  return (
    <div className="tl-panel p-5">
      <div className="tl-sec-head">
        <span className="bar" />
        <h2>Облачные сохранения</h2>
        <span className="line" />
      </div>

      {searching && !info ? (
        <p className="tl-term flex items-center gap-2 text-[14px] text-[var(--muted)]"><Loader2 size={13} className="animate-spin" /> Ищем сохранения…</p>
      ) : !info?.enabled && !latest ? (
        <>
          <p className="tl-term text-[15px] leading-relaxed text-[var(--muted)]">
            Сохранения игры загружаются в облако после каждой сессии и подтягиваются на другом компьютере. Доступно с подпиской Lustre Pro.
          </p>
          <button type="button" onClick={() => navigate('/subscriptions')} className="tl-btn solid mt-3 w-full justify-center"><Cloud size={13} /> Lustre Pro</button>
        </>
      ) : (
        <>
          <div className="tl-srow">
            <span className="k">Папка</span>
            <span className="v max-w-[60%] truncate text-right" title={folder?.dirs.join('\n') || ''}>
              {folder
                ? `${folder.files} файл.${folder.dirs.length > 1 ? ` · ${folder.dirs.length} ${folderWord(folder.dirs.length)}` : ''} · ${SOURCE[folder.source]}`
                : 'не найдена'}
            </span>
          </div>
          {folder && (folder.dirs.length > 1 || folder.source === 'guess') && (
            <ul className="mt-1.5 space-y-1">
              {folder.dirs.map((d) => (
                <li key={d} className="flex items-center gap-2">
                  <span className="tl-term min-w-0 flex-1 truncate text-[12px] text-[var(--muted)]" title={d}>{d}</span>
                  <button type="button" title="Открыть папку" onClick={() => void (window as any).electron?.cloudSaves?.openDir?.(d)} className="text-[var(--muted)] hover:text-white"><FolderOpen size={12} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="tl-srow">
            <span className="k">В облаке</span>
            <span className="v text-right">{latest ? `${when(latest.created_at)} · ${formatBytes(latest.size)}` : 'пусто'}</span>
          </div>
          {latest?.device_name && (
            <div className="tl-srow"><span className="k">Устройство</span><span className="v max-w-[60%] truncate text-right">{latest.device_name}</span></div>
          )}
          {info && (
            <div className="tl-srow"><span className="k">Место</span><span className="v text-right">{formatBytes(info.used)} из {formatBytes(info.quota)}</span></div>
          )}

          {folder?.source === 'guess' && (
            <p className="tl-term mt-3 text-[14px] leading-relaxed text-amber-300">
              Для этой игры в каталоге нет пути к сохранениям — папка найдена по названию. Проверьте, что в ней действительно сохранения, или укажите нужную.
            </p>
          )}
          {!folder && (
            <p className="tl-term mt-3 text-[14px] leading-relaxed text-[var(--muted)]">
              Лаунчер не нашёл папку сохранений этой игры. Укажите её — обычно это папка в «Документах», AppData или в папке игры.
            </p>
          )}
          {!info?.enabled && (
            <p className="tl-term mt-3 text-[14px] text-amber-300">Подписка Pro закончилась: загружать новые версии нельзя, но сохранённые можно скачать.</p>
          )}

          <div className="mt-4 flex flex-col gap-2">
            {info?.enabled && folder && (
              <button type="button" disabled={!!busy} onClick={() => void upload()} className="tl-btn solid w-full justify-center disabled:opacity-50">
                {busy === 'upload' ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} />}
                {changedSinceSync ? 'Загрузить изменения' : 'Загрузить сейчас'}
              </button>
            )}
            {latest && (
              <button type="button" disabled={!!busy} onClick={() => void restore(latest)} className="tl-btn ghost w-full justify-center disabled:opacity-50">
                {busy === 'restore' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Восстановить последнее
              </button>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => void pickFolder()} className="tl-btn ghost flex-1 justify-center"><FolderOpen size={13} /> {folder ? 'Другая папка' : 'Указать папку'}</button>
              {folder && (
                <button type="button" title="Открыть папку" onClick={() => void (window as any).electron?.cloudSaves?.openDir?.(folder.dir)} className="tl-btn ghost justify-center"><FolderOpen size={13} /></button>
              )}
            </div>
            {localState(gameId).override && (
              <button type="button" onClick={() => void resetFolder()} className="tl-term text-[13px] text-[var(--muted)] hover:text-white">Искать папку автоматически</button>
            )}
          </div>

          {info?.enabled && (
            <label className="mt-4 flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" checked={auto} onChange={toggleAuto} className="accent-[var(--pink)]" />
              <span className="tl-term text-[14px] text-pearl/80">Синхронизировать автоматически</span>
            </label>
          )}

          {(info?.versions.length || 0) > 1 && (
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <button type="button" onClick={() => setShowHistory((v) => !v)} className="tl-head flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--muted)] hover:text-white">
                <History size={12} /> История ({info?.versions.length})
              </button>
              {showHistory && (
                <ul className="mt-2 space-y-1.5">
                  {info?.versions.map((v) => (
                    <li key={v.id} className="flex items-center gap-2">
                      <span className="tl-term min-w-0 flex-1 truncate text-[13px] text-pearl/80" title={v.device_name}>
                        {when(v.created_at)} · {formatBytes(v.size)}{v.device_name ? ` · ${v.device_name}` : ''}
                      </span>
                      <button type="button" title="Восстановить эту версию" disabled={!!busy} onClick={() => void restore(v)} className="text-[var(--muted)] hover:text-accent"><RotateCcw size={12} /></button>
                      <button type="button" title="Удалить из облака" onClick={() => void remove(v)} className="text-[var(--muted)] hover:text-[#ff5b8a]"><Trash2 size={12} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {note && <p className="tl-term mt-3 text-[14px] text-emerald-400">{note}</p>}
      {error && <p className="tl-term mt-3 text-[14px] text-[#ff5b8a]">{error}</p>}
    </div>
  );
}
