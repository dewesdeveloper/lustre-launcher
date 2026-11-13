import { useEffect, useState } from 'react';
import { Minus, Download, RefreshCw, CheckCircle2, AlertTriangle, Hourglass } from 'lucide-react';

// Окно обязательного обновления: прогресс загрузки и список изменений релиза.
// Закрыть, отложить или отменить нельзя — после загрузки лаунчер сам перезапускается.
type UpdateState = {
  status: 'idle' | 'checking' | 'downloading' | 'waiting' | 'ready' | 'error';
  version: string | null;
  notes: string;
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
  installAt: number;
  error?: string;
};

const RETRY_SECONDS = 30; // совпадает с UPDATE_RETRY_MS в electron/main.js

const fmtBytes = (b: number) => {
  if (!b) return '0';
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} МБ`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} КБ`;
  return `${b} Б`;
};

export default function UpdateWindow() {
  const electron = (window as any).electron;
  const [state, setState] = useState<UpdateState>({
    status: 'idle', version: null, notes: '', percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, installAt: 0,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let off: (() => void) | undefined;
    (async () => {
      try {
        const s = await electron?.getUpdateState?.();
        if (s) setState((prev) => ({ ...prev, ...s }));
      } catch { /* ignore */ }
      off = electron?.onUpdateState?.((s: UpdateState) => setState((prev) => ({ ...prev, ...s })));
    })();
    return () => off?.();
  }, [electron]);

  // тикер для отсчёта перезапуска
  useEffect(() => {
    if (state.status !== 'ready') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [state.status]);

  const pct = Math.max(0, Math.min(100, Math.round(state.percent || 0)));
  const checking = state.status === 'checking' || state.status === 'idle';
  const secondsLeft = Math.max(0, Math.ceil((state.installAt - now) / 1000));

  const title =
    state.status === 'error' ? 'Ошибка загрузки обновления'
      : state.status === 'ready' || state.status === 'waiting' ? 'Обновление загружено'
      : checking ? 'Проверка обновлений…'
      : 'Загрузка обновления…';
  const Icon =
    state.status === 'error' ? AlertTriangle
      : state.status === 'ready' ? CheckCircle2
      : state.status === 'waiting' ? Hourglass
      : Download;

  return (
    <div className="flex flex-col h-screen bg-main-bg overflow-hidden text-left font-sans text-pearl select-none">
      {/* Заголовок окна (frameless): только свернуть — закрыть нельзя */}
      <div
        className="h-9 flex items-center bg-[#0a0a0c] border-b border-white/5 shrink-0 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3 px-4 h-full">
          <RefreshCw size={13} className="text-accent" />
          <span className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] text-pearl/72">Обновление Lustre</span>
        </div>
        <div className="ml-auto flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => electron?.minimize?.()} className="h-full w-12 flex items-center justify-center text-pearl/60 hover:text-pearl hover:bg-white/10 transition-colors"><Minus size={14} /></button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 px-8 py-6 gap-4">
        <div className="tl-ticker shrink-0">
          <span className="live">// UPDATER</span>
          <span>github releases</span>
          {state.version && <span>· v{state.version}</span>}
        </div>

        {/* Статус и прогресс */}
        <div className="tl-panel p-5 shrink-0">
          <div className="flex items-center gap-3">
            <Icon size={18} className={state.status === 'error' ? 'text-red-400' : state.status === 'ready' ? 'text-[var(--green2)]' : 'text-accent'} />
            <h1 className="tl-pixel text-[15px] text-white">{title}</h1>
          </div>

          <p className="tl-term text-[14px] tl-muted mt-2">
            {state.status === 'error' ? (state.error || 'Не удалось загрузить обновление.')
              : state.status === 'ready' ? <>Лаунчер перезапустится через <span className="text-white">{secondsLeft} с</span> — настройки и библиотека сохранятся.</>
              : state.status === 'waiting' ? 'Установка начнётся, как только завершатся загрузки и установки игр.'
              : checking ? 'Сверяемся с последним релизом…'
              : 'Обновление обязательно — лаунчер перезапустится сам, когда загрузка завершится.'}
          </p>

          {!checking && state.status !== 'error' && (
            <div className="mt-4">
              <div className="h-2 w-full bg-white/5 border border-[var(--line)] overflow-hidden">
                <div
                  className="h-full transition-all duration-200"
                  style={{ width: `${pct}%`, background: 'var(--pink)', boxShadow: 'var(--glow-sm)' }}
                />
              </div>
              <div className="flex justify-between mt-2 tl-head text-[10px] uppercase tracking-[0.2em] tl-muted">
                <span>{pct}%</span>
                <span>
                  {state.transferred && state.total
                    ? `${fmtBytes(state.transferred)} / ${fmtBytes(state.total)}`
                    : state.status === 'downloading' ? 'Подключение…' : ''}
                </span>
                <span>{state.status === 'downloading' && state.bytesPerSecond ? `${fmtBytes(state.bytesPerSecond)}/с` : ''}</span>
              </div>
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-center gap-4 mt-4">
              <button onClick={() => void electron?.retryUpdate?.()} className="tl-btn solid">Повторить</button>
              <span className="tl-term text-[13px] tl-muted">Автоповтор через {RETRY_SECONDS} с</span>
            </div>
          )}
        </div>

        {/* Список изменений релиза */}
        {!checking && (
          <div className="tl-panel p-5 flex-1 min-h-0 flex flex-col">
            <div className="tl-head text-[10px] uppercase tracking-[0.2em] tl-muted shrink-0">Что нового{state.version ? ` в ${state.version}` : ''}</div>
            <div className="mt-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar select-text">
              <p className="tl-term text-[14px] text-pearl/85 whitespace-pre-wrap break-words">
                {state.notes || 'Описание изменений для этого релиза не указано.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
