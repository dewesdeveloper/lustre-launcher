import { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, FolderOpen, Trash2, WifiOff } from 'lucide-react';
import type { InstalledGame } from '../../market/types';
import { useDialog } from '../../../components/Dialogs';
import { Loading } from '../../../components/Loading';
import OfflineArcade from '../../../components/arcade/OfflineArcade';

export default function LibraryOffline() {
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [launching, setLaunching] = useState('');
  const electron = (window as any).electron;
  const dlg = useDialog();

  const refresh = () => {
    if (!electron?.installedGames) { setLoading(false); return; }
    electron.installedGames()
      .then((list: InstalledGame[]) => setGames(list || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => (g.name || '').toLowerCase().includes(q));
  }, [games, search]);

  const play = async (g: InstalledGame) => {
    setLaunching(g.id);
    try {
      const res = await electron?.launchGame?.(g.id);
      if (res?.error) console.error('Launch failed:', res.error);
    } finally {
      setLaunching('');
    }
  };

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
    setGames((prev) => prev.filter((x) => x.id !== g.id));
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="p-8 animate-in fade-in duration-500">
      <div className="tl-sec-head">
        <span className="bar" />
        <h2>БИБЛИОТЕКА</h2>
        <span className="count">// {filtered.length} установлено</span>
        <span className="line" />
        <span className="tag">OFFLINE</span>
      </div>

      <div className="tl-toolbar">
        <span className="tl-chip warn inline-flex items-center gap-2">
          <WifiOff size={12} /> Автономный режим
        </span>
        <input
          className="tl-field"
          style={{ flex: 1, minWidth: 220, maxWidth: 380 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-search-hotkey="page"
          placeholder="Поиск по установленным играм"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="tl-term tl-muted text-sm uppercase tracking-[0.2em]">
            {games.length === 0 ? 'Нет установленных игр' : 'Ничего не найдено'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((g) => (
            <div key={g.id} className="tl-panel p-5">
              <h3 className="text-sm font-bold text-white truncate">{g.name}</h3>
              <p className="tl-term tl-muted text-xs mt-1 truncate" title={g.installPath}>
                {g.installPath}
              </p>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => play(g)}
                  disabled={launching === g.id}
                  className="tl-btn block flex-1"
                >
                  {launching === g.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  Играть
                </button>
                <button
                  onClick={() => electron?.revealGame?.(g.id)}
                  title="Открыть папку"
                  className="tl-btn ghost"
                  style={{ padding: '9px 11px' }}
                >
                  <FolderOpen size={15} />
                </button>
                <button
                  onClick={() => uninstall(g)}
                  title="Удалить"
                  className="tl-btn danger"
                  style={{ padding: '9px 11px' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <OfflineArcade />
      </div>
    </div>
  );
}
