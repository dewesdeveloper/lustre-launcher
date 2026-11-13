import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import api from '../../api';
import { useDialog } from '../../components/Dialogs';
import type { StorageData } from './components/types';
import { normalize } from './components/storageUtils';
import { StorageDriveCard } from './components/StorageDriveCard';
import { StorageToolbar } from './components/StorageToolbar';
import { StorageGameRow } from './components/StorageGameRow';
import SettingsToggle from './components/SettingsToggle';
import {
  getAppPaths, setAppPaths, effectiveDownloadDir, effectiveInstallDir,
  type AppPaths, type AppPathsPatch,
} from '../../utils/appPaths';
import DriveSelect from '../../components/DriveSelect';

/**
 * Подключение к qBittorrent из лаунчера: порт веб-интерфейса, логин/пароль,
 * «Подключить» (проброс типовых портов) и «Настроить автоматически» —
 * включить Web UI и порт в самом qB, не заставляя пользователя лезть в него.
 * Торрент-слуш-порт («Соединение») из лаунчера НЕ меняется — его задаёт qB.
 */
function QbPortCard() {
  const electron = (window as any).electron;
  const dlg = useDialog();
  const [port, setPort] = useState('');
  const [webPort, setWebPort] = useState<number | null>(null);
  const [listenPort, setListenPort] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState('');
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('');
  const [hasSavedPass, setHasSavedPass] = useState(false);
  const [notInstalled, setNotInstalled] = useState(false);
  const [busy, setBusy] = useState<'' | 'connect' | 'port' | 'creds' | 'setup'>('');
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const applyStatus = (r: any) => {
    setPort(String(r.port ?? ''));
    setWebPort(r.webPort ?? null);
    setListenPort(r.listenPort ?? null);
    setConnected(!!r.connected);
  };

  const load = async () => {
    setErr(''); setOkMsg('');
    try {
      const r = await electron.qbWebPortGet();
      if (r?.error) { setErr(r.error); return; }
      setDraft(String(r.port ?? ''));
      applyStatus(r);
      const c = await electron.qbWebCredsGet?.();
      if (c) { setUser(c.user || 'admin'); setHasSavedPass(!!c.hasPassword); }
    } catch {
      setErr('Не удалось получить настройки подключения');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const applyPort = async () => {
    setErr(''); setOkMsg('');
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      setErr('Порт должен быть целым числом от 1 до 65535');
      return;
    }
    setBusy('port');
    try {
      const r = await electron.qbWebPortSet(n);
      if (r?.error) { setErr(r.error); load(); return; }
      applyStatus(r);
      setDraft(String(r.port));
      setOkMsg(`Применено: лаунчер подключается к localhost:${r.port}`);
    } catch {
      setErr('Не удалось применить настройки');
    } finally {
      setBusy('');
    }
  };

  const connect = async () => {
    setErr(''); setOkMsg('');
    setBusy('connect');
    try {
      const r = await electron.qbWebConnect();
      if (r?.error) { setErr(r.error); return; }
      if (r.connected) {
        applyStatus(r);
        setDraft(String(r.port));
        setOkMsg(`Подключено к localhost:${r.port}`);
      } else {
        setConnected(false);
        setErr('Qbittorrent не найден ни на сохранённом порту, ни на типовых (9091, 8080). Запустите его или настройте автоматически.');
      }
    } catch {
      setErr('Ошибка подключения');
    } finally {
      setBusy('');
    }
  };

  const saveCreds = async () => {
    setErr(''); setOkMsg('');
    setBusy('creds');
    try {
      const r = await electron.qbWebCredsSet(user.trim() || 'admin', pass);
      if (r?.error) { setErr(r.error); return; }
      applyStatus(r);
      setPass('');
      setHasSavedPass(false);
      if (r.connected) {
        setDraft(String(r.port));
        setOkMsg(`Учётные данные сохранены, подключено к localhost:${r.port}`);
      } else {
        setErr('Данные сохранены, но подключение не удалось — проверьте логин/пароль.');
      }
    } catch {
      setErr('Не удалось сохранить учётные данные');
    } finally {
      setBusy('');
    }
  };

  const autoSetup = async () => {
    setErr(''); setOkMsg(''); setNotInstalled(false);
    const okConfirm = await dlg.confirm({
      title: 'Автонастройка qBittorrent',
      message: 'Qbittorrent будет закрыт и перезапущен: лаунчер включит Web UI и выставит порт в его конфиге. Активные загрузки продолжатся после запуска.',
      confirmText: 'Настроить',
    });
    if (!okConfirm) return;
    setBusy('setup');
    try {
      const target = Number(draft) || 9091;
      const r = await electron.qbAutoSetup(target);
      if (r?.error) {
        setErr(r.error);
        if (r.notInstalled) setNotInstalled(true);
        return;
      }
      applyStatus(r);
      setDraft(String(r.port));
      setOkMsg(`Настроено: Web UI на порту ${r.port}, подключение установлено`);
    } catch {
      setErr('Автонастройка не удалась');
    } finally {
      setBusy('');
    }
  };

  const mismatch = connected && webPort !== null && port !== '' && String(webPort) !== port;

  return (
    <section className="tl-panel p-[22px] space-y-4">
      <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.14em] text-white" style={{ textShadow: 'var(--glow-sm)' }}>
        Подключение к qBittorrent
      </h3>

      <p className="tl-term text-[15px] tl-muted">
        {busy === 'setup' ? (
          <span>Настройка: qBittorrent закрывается, включается Web UI и перезапускается…</span>
        ) : busy === 'connect' ? (
          <span>Подключение к qBittorrent…</span>
        ) : busy === 'port' ? (
          <span>Применение порта: qB перезапускает веб-интерфейс…</span>
        ) : connected ? (
          <>
            <b className="text-[var(--green)]">Подключено</b> · localhost:{port}
            {listenPort !== null && (
              <> · торрент-слуш-порт: <b className="text-white">{listenPort}</b></>
            )}
          </>
        ) : port ? (
          <>Сохранённый порт: <b className="text-white">{port}</b> · нет подключения</>
        ) : (
          'Подключение к qBittorrent…'
        )}
      </p>

      {!connected && busy === '' && (
        <p className="tl-term text-[14px] text-[#ffb020]">
          Qbittorrent не подключён — торрентные игры качаться не будут
          (прямые ссылки и itch.io работают без него).
          Нажмите «Подключить» или «Настроить автоматически».
        </p>
      )}

      {mismatch && !busy && (
        <p className="tl-term text-[14px] text-[#ffb020]">
          Внимание: в qB веб-интерфейс на порту {webPort}, а лаунчер настроен на {port}. Нажмите «Применить», чтобы синхронизировать.
        </p>
      )}

      <div className="flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1.5">
          <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">Порт веб-интерфейса (1–65535)</span>
          <input
            type="number" min={1} max={65535}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyPort(); }}
            placeholder={port || '9091'}
            disabled={busy !== ''}
            className="tl-field"
            style={{ width: 150 }}
          />
        </label>
        <button className="tl-btn solid" onClick={applyPort} disabled={busy !== '' || draft.trim() === ''}>
          {busy === 'port' ? <Loader2 size={13} className="animate-spin" /> : null} Применить
        </button>
        <button className="tl-btn ghost" onClick={connect} disabled={busy !== ''}>
          {busy === 'connect' ? <Loader2 size={13} className="animate-spin" /> : null} Подключить
        </button>
        <button className="tl-btn ghost" onClick={autoSetup} disabled={busy !== ''}>
          {busy === 'setup' ? <Loader2 size={13} className="animate-spin" /> : null} Настроить автоматически
        </button>
      </div>

      <div className="flex items-end gap-3 flex-wrap pt-1 border-t border-[rgb(var(--accent-rgb)/.12)]">
        <label className="flex flex-col gap-1.5">
          <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">Логин Web UI</span>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            disabled={busy !== ''}
            className="tl-field"
            style={{ width: 170 }}
            autoComplete="off"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
            Пароль Web UI{hasSavedPass ? ' (сохранён)' : ' (пусто = adminadmin)'}
          </span>
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveCreds(); }}
            placeholder={hasSavedPass ? '••••••••' : ''}
            disabled={busy !== ''}
            className="tl-field"
            style={{ width: 170 }}
            autoComplete="new-password"
          />
        </label>
        <button className="tl-btn ghost" onClick={saveCreds} disabled={busy !== ''}>
          {busy === 'creds' ? <Loader2 size={13} className="animate-spin" /> : null} Сохранить и подключить
        </button>
      </div>

      {okMsg && <p className="tl-term text-[14px] text-[var(--green)]">{okMsg}</p>}
      {err && <p className="tl-term text-[14px] text-red-400">{err}</p>}

      {notInstalled && (
        <button
          className="tl-btn solid"
          onClick={() => window.open('https://qbittorrent.org/download', '_blank')}
        >
          Скачать qBittorrent
        </button>
      )}

      <p className="tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)] leading-[1.7]">
        По этому порту лаунчер подключается к qBittorrent и качает торренты (по умолчанию 9091, у свежего qB — 8080).
        Торрент-слуш-порт из лаунчера не меняется — его задают в qB (Настройки → Соединение)
      </p>
    </section>
  );
}

/**
 * Встроенный qBittorrent ставится с лаунчером и настраивается сам. Подключение к своему
 * клиенту остаётся отдельным режимом для тех, кому он нужен.
 */
function TorrentClientCard() {
  const electron = (window as any).electron;
  const [info, setInfo] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = () => electron.qbModeGet().then(setInfo).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const change = async (mode: 'managed' | 'external') => {
    setBusy(true);
    try {
      await electron.qbModeSet(mode);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!info) return null;
  if (!info.available) return <QbPortCard />;
  const managed = info.mode === 'managed';

  return (
    <>
      <section className="tl-panel p-[22px] space-y-3">
        <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.14em] text-white" style={{ textShadow: 'var(--glow-sm)' }}>
          Торрент-клиент
        </h3>
        {managed ? (
          <p className="tl-term text-[15px] tl-muted">
            Используется встроенный qBittorrent, настраивать ничего не нужно.{' '}
            {info.running ? (
              <><b className="text-[var(--green)]">Запущен</b> · {info.version}{info.listenPort ? ` · порт раздачи ${info.listenPort}` : ''}</>
            ) : (
              'Запустится при первой торрент-загрузке.'
            )}
          </p>
        ) : (
          <p className="tl-term text-[15px] tl-muted">
            Лаунчер работает с вашим qBittorrent. Встроенный настраивать не нужно, но загрузки из вашего клиента в нём не появятся.
          </p>
        )}
        <button className="tl-btn ghost" disabled={busy} onClick={() => change(managed ? 'external' : 'managed')}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          {managed ? 'Использовать свой qBittorrent' : 'Использовать встроенный'}
        </button>
      </section>
      {!managed && <QbPortCard />}
    </>
  );
}

export default function StorageTab() {
  const dlg = useDialog();
  const electron = (window as any).electron;

  const [data, setData] = useState<StorageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drive, setDrive] = useState<string>('');
  const [sort, setSort] = useState('size');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [images, setImages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // Пути скачивания/установки (машинные настройки; null — веб-режим, без electron)
  const [paths, setPaths] = useState<AppPaths | null>(null);

  useEffect(() => { getAppPaths().then((p) => { if (p) setPaths(p); }); }, []);

  const [pathsError, setPathsError] = useState('');
  const savePaths = async (patch: AppPathsPatch) => {
    const next = await setAppPaths(patch);
    if (next) {
      setPaths(next);
      setPathsError(next.error || '');
      await scan(true); // сводка по диску пересчитывается с новыми путями
    }
  };

  const scan = async (force = false) => {
    if (!electron?.storageScan) { setLoading(false); return; }
    setLoading(true);
    try {
      const res: StorageData = await electron.storageScan(force);
      setData(res);
      setDrive((prev) => prev || res.gamesDir.slice(0, 3));
    } catch {
      await dlg.alert({ title: 'Ошибка', message: 'Не удалось просканировать хранилище', danger: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { scan(); }, []);

  // Обложки игр из каталога (по названию)
  useEffect(() => {
    api.get('/games/').then((res) => {
      const map: Record<string, string> = {};
      (res.data || []).forEach((g: any) => {
        if (g.header_image) map[normalize(g.title)] = g.header_image;
      });
      setImages(map);
    }).catch(() => {});
  }, []);

  const driveInfo = data?.drives.find((d) => d.root.toLowerCase() === drive.toLowerCase()) || null;

  const gamesOnDrive = useMemo(() => {
    if (!data) return [];
    const root = drive.toLowerCase();
    return data.games.filter((g) => {
      const p = (g.installPath || data.gamesDir).toLowerCase();
      return p.startsWith(root);
    });
  }, [data, drive]);

  const sorted = useMemo(() => {
    const list = [...gamesOnDrive];
    switch (sort) {
      case 'date': return list.sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
      case 'name': return list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      default: return list.sort((a, b) => b.size - a.size);
    }
  }, [gamesOnDrive, sort]);

  const gamesSum = gamesOnDrive.reduce((s, g) => s + g.size, 0);
  const downloadsOnDrive = data && data.downloadsPath.toLowerCase().startsWith(drive.toLowerCase()) ? data.downloadsSize : 0;
  const total = driveInfo?.total || 0;
  const free = driveInfo?.free || 0;
  const other = Math.max(0, total - free - gamesSum - downloadsOnDrive);
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  const segments = [
    { key: 'games', label: 'Игры', value: gamesSum, color: '#3B82F6' },
    { key: 'downloads', label: 'Загрузки', value: downloadsOnDrive, color: '#22C55E' },
    { key: 'other', label: 'Другое', value: other, color: '#EAB308' },
    { key: 'free', label: 'Свободно', value: free, color: '#4B5563' },
  ];

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const uninstallSelected = async () => {
    if (!selected.size) return;
    const ok = await dlg.confirm({
      title: 'Удалить игры',
      message: `Удалить выбранные игры (${selected.size}) с диска? Файлы будут стёрты безвозвратно.`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      for (const id of selected) await electron?.uninstallGame?.(id);
      setSelected(new Set());
      await scan(true);
    } finally {
      setBusy(false);
    }
  };

  const revealSelected = () => {
    const id = [...selected][0];
    if (id) electron?.revealGame?.(id);
  };

  const thumbFor = (name: string) => images[normalize(name)];

  if (!electron?.storageScan) {
    return (
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-2" style={{ textShadow: 'var(--glow-sm)' }}>ХРАНИЛИЩЕ</h3>
        <p className="tl-term text-[15px] tl-muted">Управление хранилищем доступно только в приложении лаунчера</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="tl-head text-[12px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>Хранилище</h3>
        <button
          onClick={() => scan(true)}
          disabled={loading}
          className="tl-btn ghost shrink-0"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Обновить
        </button>
      </div>

      {paths && (
        <section className="tl-panel p-[22px] space-y-4">
          <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.14em] text-white" style={{ textShadow: 'var(--glow-sm)' }}>
            Диски для игр
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DriveField
              label="Диск для загрузок"
              hint="Файлы игр: торренты и прямые ссылки"
              value={paths.downloadDrive}
              folder={effectiveDownloadDir(paths)}
              paths={paths}
              onChange={(downloadDrive) => savePaths({ downloadDrive })}
            />
            <DriveField
              label="Диск для установки игр"
              hint="Куда распаковываются и ставятся игры"
              value={paths.installDrive}
              folder={effectiveInstallDir(paths)}
              paths={paths}
              onChange={(installDrive) => savePaths({ installDrive })}
            />
          </div>
          {pathsError && <p className="tl-term text-[14px] text-[#ff5b8a]">{pathsError}</p>}
          <p className="tl-term text-[14px] text-[var(--muted-2)]">
            Папки на диске лаунчер создаёт сам. Уже скачанные и установленные игры остаются на месте.
          </p>

          <div className="pt-4 border-t border-[rgb(var(--accent-rgb)/.12)] space-y-3">
            <SettingsToggle
              label="Спрашивать диск при скачивании игры"
              checked={paths.askDownloadDir}
              onChange={() => savePaths({ askDownloadDir: !paths.askDownloadDir })}
            />
            <SettingsToggle
              label="Спрашивать диск при установке игры"
              checked={paths.askInstallDir}
              onChange={() => savePaths({ askInstallDir: !paths.askInstallDir })}
            />
            <p className="tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
              Выключите, чтобы вернуть окно выбора, отмеченное «Не показывать снова»
            </p>
          </div>

          <div className="pt-4 border-t border-[rgb(var(--accent-rgb)/.12)] space-y-2">
            <SettingsToggle
              label="Устанавливать игры из setup.exe автоматически"
              checked={paths.autoInstallSetups !== false}
              onChange={() => savePaths({ autoInstallSetups: paths.autoInstallSetups === false })}
            />
            <p className="tl-term text-[14px] text-[var(--muted-2)]">
              Установщики Inno Setup, NSIS и MSI ставятся без мастера в папку установки игр, а файл запуска находится сам.
              Лицензия и параметры установщика принимаются по умолчанию; если он предлагает поставить сторонние программы,
              они тоже могут установиться. Окно запроса прав администратора Windows покажет как обычно.
              Если установщик не распознан или не справился, откроется его обычный мастер.
            </p>
          </div>
        </section>
      )}

      {/* Торрент-клиент — только там, где проброшен electron */}
      {electron?.qbModeGet && <TorrentClientCard />}

      {loading && !data ? (
        <div className="tl-panel py-20 text-center">
          <Loader2 size={26} className="animate-spin text-accent mx-auto mb-3" />
          <p className="tl-head text-[10px] uppercase tracking-[0.14em] tl-muted">Сканирование диска...</p>
        </div>
      ) : (
        <>
          <StorageDriveCard
            driveInfo={driveInfo}
            drive={drive}
            drives={data?.drives || []}
            gamesDir={data?.gamesDir}
            segments={segments}
            pct={pct}
            onDriveChange={(v) => { setDrive(v); setSelected(new Set()); }}
          />

          <div className="tl-panel overflow-hidden">
            <StorageToolbar
              count={sorted.length}
              sort={sort}
              onSortChange={setSort}
              selectedCount={selected.size}
              busy={busy}
              onReveal={revealSelected}
              onUninstall={uninstallSelected}
            />

            {sorted.length === 0 ? (
              <div className="py-16 text-center tl-head text-[10px] uppercase tracking-[0.14em] tl-muted">Установленных игр нет</div>
            ) : (
              <div className="divide-y divide-[rgb(var(--accent-rgb)/.12)] max-h-[46vh] overflow-y-auto custom-scrollbar">
                {sorted.map((g) => (
                  <StorageGameRow
                    key={g.id}
                    game={g}
                    selected={selected.has(g.id)}
                    onToggle={toggle}
                    thumb={thumbFor(g.name)}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="tl-head text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
            Просканировано: {data ? new Date(data.scannedAt).toLocaleTimeString('ru-RU') : '—'}
          </p>
        </>
      )}
    </div>
  );
}

// Выбор диска: под списком — папка, которая получится на нём
function DriveField({ label, hint, value, folder, paths, onChange }: {
  label: string;
  hint: string;
  value: string;
  folder: string;
  paths: AppPaths;
  onChange: (drive: string) => void;
}) {
  return (
    <div>
      <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)] mb-2">{label}</span>
      <DriveSelect value={value} drives={paths.drives} systemDrive={paths.systemDrive} onChange={onChange} />
      <p className="tl-term text-[13px] text-[var(--muted-2)] mt-1.5 break-all">{hint} · {folder}</p>
    </div>
  );
}
