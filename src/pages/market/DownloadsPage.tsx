import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download as DownloadIcon } from 'lucide-react';
import { useDialog } from '../../components/Dialogs';
import type { Download, InstalledGame, InstallProgress } from './types';
import DownloadsSection from './components/downloads/DownloadsSection';
import PathPickerModal from './components/PathPickerModal';
import { getAppPaths } from '../../utils/appPaths';
import { formatSpeed } from './constants';

export default function DownloadsPage() {
  const navigate = useNavigate();
  const dlg = useDialog();
  const electron = (window as any).electron;
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [installed, setInstalled] = useState<InstalledGame[]>([]);
  const [installStates, setInstallStates] = useState<Record<string, { phase: string; percent: number; silent?: boolean; bytes?: number }>>({});
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({});
  // Выбор пути: показывается при каждом действии, пока не отмечено
  // «Не показывать снова» (вернуть можно в Настройки → Хранилище).
  // Храним отложенную задачу и выполняем её после подтверждения.
  const [pathPrompt, setPathPrompt] = useState<{ kind: 'download' | 'install'; run: () => void } | null>(null);

  const withPathPrompt = async (kind: 'download' | 'install', run: () => void) => {
    const paths = await getAppPaths();
    const ask = kind === 'download' ? paths?.askDownloadDir : paths?.askInstallDir;
    if (ask) {
      setPathPrompt({ kind, run });
      return;
    }
    run();
  };

  const refreshInstalled = useCallback(() => {
    electron?.installedGames?.().then((list: InstalledGame[]) => {
      if (list) setInstalled(list);
    });
  }, [electron]);

  useEffect(() => {
    electron?.torrentList?.().then((list: Download[]) => {
      if (list) setDownloads(list);
    });
    const offUpdates = electron?.onTorrentUpdate?.((list: Download[]) => setDownloads(list || []));
    refreshInstalled();
    const offInstall = electron?.onInstallProgress?.((p: InstallProgress) => {
      if (p.phase === 'idle') {
        setInstallStates(prev => {
          const next = { ...prev };
          delete next[p.gameId];
          return next;
        });
        return;
      }
      setInstallStates(prev => ({ ...prev, [p.gameId]: { phase: p.phase, percent: p.percent, silent: p.silent, bytes: p.bytes } }));
      if (p.phase === 'done') refreshInstalled();
    });
    // отписка при уходе со страницы (раньше обработчики копились при каждом заходе)
    return () => {
      if (typeof offUpdates === 'function') offUpdates();
      if (typeof offInstall === 'function') offInstall();
    };
  }, [electron, refreshInstalled]);

  const pause = (id: string) => electron?.torrentPause?.(id);
  const resume = (id: string) => electron?.torrentResume?.(id);
  const remove = async (id: string) => {
    const ok = await dlg.confirm({
      title: 'Удалить загрузку',
      message: 'Удалить загрузку из списка и стереть скачанные файлы с диска?',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    await electron?.torrentRemove?.({ id, deleteFiles: true });
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  const install = async (id: string) => {
    await withPathPrompt('install', () => runInstall(id));
  };

  const runInstall = async (id: string) => {
    setInstallErrors(prev => ({ ...prev, [id]: '' }));
    setInstallStates(prev => ({ ...prev, [id]: { phase: 'install', percent: -1 } }));
    const res = await electron?.installGame?.(id);
    if (res?.error) {
      setInstallErrors(prev => ({ ...prev, [id]: res.error }));
      setInstallStates(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
    refreshInstalled();
  };

  const play = (id: string) => electron?.launchGame?.(id);
  const reveal = (id: string) => electron?.revealGame?.(id);
  const uninstall = async (g: InstalledGame) => {
    const ok = await dlg.confirm({
      title: 'Удалить игру',
      message: `Удалить «${g.name}» и все её файлы?`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    const res = await electron?.uninstallGame?.(g.id);
    if (res?.keptFiles) {
      await dlg.alert({ title: 'Игра убрана из библиотеки', message: `Игра была установлена своим установщиком, поэтому её файлы остались в ${res.path}. Удалите их её деинсталлятором или вручную.` });
    }
    setInstalled(prev => prev.filter(x => x.id !== g.id));
  };

  const stats = useMemo(() => {
    const active = downloads.filter(d => d.status === 'downloading');
    return {
      active: active.length,
      paused: downloads.filter(d => d.status === 'paused').length,
      speed: active.reduce((s, d) => s + (d.downloadSpeed || 0), 0),
    };
  }, [downloads]);

  const empty = downloads.length === 0 && installed.length === 0;

  return (
    <div className="max-w-[1240px] mx-auto px-6 pt-8 pb-16 text-left animate-in fade-in duration-500">
      <div className="tl-ticker">
        <span className="live">// DOWNLOADS MODULE</span>
        <span>qbittorrent · http</span>
        <span>· {stats.active > 0 ? 'transfer: on' : 'idle'}</span>
      </div>

      <div className="tl-sec-head mt-1">
        <span className="bar" />
        <h2>ЗАГРУЗКИ</h2>
        <span className="count">// {downloads.length}</span>
        <span className="line" />
        <span className="tag">QUEUE</span>
      </div>

      {/* сводка */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { n: formatSpeed(stats.speed), l: 'общая скорость' },
          { n: String(stats.active), l: 'скачиваются' },
          { n: String(stats.paused), l: 'на паузе' },
          { n: String(installed.length), l: 'установлено игр' },
        ].map(s => (
          <div key={s.l} className="tl-panel tl-stat p-4" style={{ textAlign: 'left' }}>
            <div className="n tl-pixel text-[18px] truncate">{s.n}</div>
            <div className="l">{s.l}</div>
          </div>
        ))}
      </div>

      {empty ? (
        <div className="tl-panel py-20 text-center">
          <DownloadIcon size={36} className="mx-auto mb-3 text-[var(--muted-2)]" />
          <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] tl-muted">Нет загрузок и установленных игр</p>
          <button type="button" onClick={() => navigate('/store')} className="tl-btn ghost mt-4">Перейти в магазин</button>
        </div>
      ) : (
        <DownloadsSection
          downloads={downloads}
          installed={installed}
          installStates={installStates}
          installErrors={installErrors}
          onPause={pause}
          onResume={resume}
          onRemove={remove}
          onInstall={install}
          onOpenGame={(gameId) => navigate(`/games/${gameId}`)}
          onPlay={play}
          onReveal={reveal}
          onUninstall={uninstall}
        />
      )}

      <PathPickerModal
        open={!!pathPrompt}
        kind={pathPrompt?.kind || 'download'}
        onClose={() => setPathPrompt(null)}
        onConfirm={() => {
          const p = pathPrompt;
          setPathPrompt(null);
          p?.run();
        }}
      />
    </div>
  );
}
