import { Loader2, Pause, Play, Trash2, PackageOpen, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import type { Download } from '../../types';
import { formatBytes, formatSpeed, formatETA } from '../../constants';

interface DownloadCardProps {
  dl: Download;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
  onOpenGame?: (gameId: number) => void;
  onInstall?: (id: string) => void;
  installState?: { phase: string; percent: number; silent?: boolean; bytes?: number };
  installError?: string;
}

const STATUS: Record<string, { label: string; chip: string }> = {
  downloading: { label: 'Загрузка', chip: 'age' },
  paused: { label: 'Пауза', chip: 'warn' },
  completed: { label: 'Скачано', chip: 'ok' },
  error: { label: 'Ошибка', chip: 'nsfw' },
};

const DownloadCard = ({ dl, onPause, onResume, onRemove, onOpenGame, onInstall, installState, installError }: DownloadCardProps) => {
  const st = dl.waiting ? { label: 'Ожидание сети', chip: 'warn' }
    : dl.searching ? { label: 'Поиск раздающих', chip: 'warn' }
    : STATUS[dl.status] || STATUS.downloading;
  const pct = Math.max(0, Math.min(dl.progress * 100, 100));
  const installing = !!installState && installState.phase !== 'done';
  const installDone = installState?.phase === 'done';
  const active = dl.status === 'downloading';

  return (
    <div className="tl-panel p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {dl.gameId > 0 && onOpenGame ? (
              <button
                type="button"
                onClick={() => onOpenGame(dl.gameId)}
                className="tl-head text-[11px] font-bold uppercase tracking-[0.06em] text-white hover:text-accent transition-colors truncate text-left"
                title="Открыть страницу игры"
              >
                {dl.gameTitle}
              </button>
            ) : (
              <span className="tl-head text-[11px] font-bold uppercase tracking-[0.06em] text-white truncate">{dl.gameTitle}</span>
            )}
            <span className={`tl-chip ${st.chip} shrink-0`}>{st.label}</span>
          </div>
          <div className="tl-term text-[14px] tl-muted mt-1 flex flex-wrap gap-x-3">
            <span>{formatBytes(dl.downloaded)} / {formatBytes(dl.totalSize)}</span>
            {active && !dl.searching && <span>{formatSpeed(dl.downloadSpeed)}</span>}
            {active && !dl.searching && formatETA(dl.eta || 0) && <span>осталось примерно {formatETA(dl.eta || 0)}</span>}
            {dl.numPeers > 0 && <span className="inline-flex items-center gap-1"><Users size={12} /> {dl.numPeers}</span>}
          </div>
        </div>

        <div className="flex gap-1.5 shrink-0 items-center">
          {dl.status === 'completed' && onInstall && !installing && !installDone && (
            <button type="button" onClick={() => onInstall(dl.id)} className="tl-btn solid !py-1.5">
              <PackageOpen size={13} /> Установить
            </button>
          )}
          {active && (
            <button type="button" onClick={() => onPause(dl.id)} className="tl-btn ghost !px-2 !py-1.5" title="Пауза" aria-label="Пауза">
              <Pause size={13} />
            </button>
          )}
          {(dl.status === 'paused' || dl.status === 'error') && (
            <button type="button" onClick={() => onResume(dl.id)} className="tl-btn ghost !px-2 !py-1.5" title="Продолжить" aria-label="Продолжить">
              <Play size={13} />
            </button>
          )}
          <button type="button" onClick={() => onRemove(dl.id)} className="tl-btn ghost !px-2 !py-1.5 hover:!text-[#ff5b8a]" title="Удалить" aria-label="Удалить">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* прогресс загрузки */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 h-2 bg-white/5 border border-[var(--line)] overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: dl.status === 'paused' ? 'var(--muted-2)' : dl.status === 'error' ? '#ff5b8a' : 'var(--pink)',
              boxShadow: active ? 'var(--glow-sm)' : undefined,
            }}
          />
        </div>
        <span className="tl-head text-[10px] font-bold text-white w-12 text-right">{pct.toFixed(pct >= 100 ? 0 : 1)}%</span>
      </div>

      {dl.files && dl.files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {dl.files.slice(0, 4).map((f, i) => (
            <span key={i} className="tl-chip common max-w-[240px] truncate" title={f.name}>
              {f.name} · {formatBytes(f.size)}
            </span>
          ))}
          {dl.files.length > 4 && <span className="tl-term text-[13px] text-[var(--muted-2)] self-center">ещё {dl.files.length - 4}</span>}
        </div>
      )}

      {dl.searchingLong && (
        <p className="mt-3 tl-term text-[14px] text-[#ffb020] flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          Раздающие пока не найдены. Возможно, раздача неактивна или сеть блокирует торренты. Загрузка начнётся сама, как только появятся источники; можно также выбрать другой источник игры.
        </p>
      )}

      {dl.error && (
        <p className="mt-3 tl-term text-[14px] text-[#ff5b8a] flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {dl.error}
        </p>
      )}

      {/* установка после загрузки */}
      {installing && (
        <div className="mt-3 pt-3 border-t border-[var(--line)]">
          <div className="flex items-center gap-2 tl-term text-[14px] text-[var(--cyan,#22d3ee)]">
            <Loader2 size={13} className="animate-spin" />
            {installState!.phase === 'installer'
              ? 'Установщик запущен — завершите установку и укажите exe на странице игры'
              : installState!.silent
                ? `Установка без мастера…${installState!.bytes ? ` ${formatBytes(installState!.bytes)}` : ''}`
                : 'Установка…'}
            {installState!.phase === 'install' && installState!.percent >= 0 && (
              <span className="ml-auto tl-head text-[10px] text-white">{installState!.percent}%</span>
            )}
          </div>
          {installState!.phase === 'install' && installState!.percent >= 0 && (
            <div className="mt-2 h-1.5 bg-white/5 border border-[var(--line)] overflow-hidden">
              <div className="h-full bg-[var(--cyan,#22d3ee)] transition-all duration-300" style={{ width: `${installState!.percent}%` }} />
            </div>
          )}
        </div>
      )}
      {installDone && (
        <p className="mt-3 pt-3 border-t border-[var(--line)] tl-term text-[14px] text-[var(--green2)] flex items-center gap-1.5">
          <CheckCircle2 size={13} /> Игра установлена
        </p>
      )}
      {installError && (
        <p className="mt-3 tl-term text-[14px] text-[#ff5b8a] flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {installError}
        </p>
      )}
    </div>
  );
};

export default DownloadCard;
