import { useCallback, useEffect, useState } from 'react';
import { Languages, Loader2, RotateCcw, X } from 'lucide-react';
import { useDialog } from '../../../components/Dialogs';

// Автоперевод установленной игры на русский: офлайн-модель Bergamot в главном процессе
// (electron/translator). Поддерживаются Ren'Py и RPG Maker MV/MZ.

interface Status {
  supported: boolean;
  engine?: string;
  engineTitle?: string;
  applied?: boolean;
  nativeRussian?: boolean;
  runtime?: boolean;
  backend?: string;
  blocked?: string | null;
}

interface Stats {
  runtime?: boolean;
  backend?: string;
  strings: number;
  translated: number;
  failed: number;
  badFonts: string[];
  ms: number;
}

interface Progress {
  id: string;
  phase: 'scan' | 'model' | 'install' | 'translate' | 'apply' | 'done' | 'error';
  done?: number;
  total?: number;
  stats?: Stats;
  error?: string;
}

const PHASE_LABEL: Record<string, string> = {
  scan: 'Поиск текста в игре…',
  model: 'Загрузка модели перевода…',
  install: 'Установка плагина перевода (BepInEx + XUnity)…',
  translate: 'Перевод…',
  apply: 'Установка перевода…',
};

const label = 'tl-head text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]';

const formatMB = (b = 0) => `${(b / 1048576).toFixed(1)} МБ`;
const formatDuration = (ms: number) => (ms < 60000 ? `${Math.max(1, Math.round(ms / 1000))} с` : `${Math.round(ms / 60000)} мин`);

export default function GameTranslatePanel({ installedId }: { installedId: string }) {
  const electron = (window as any).electron;
  const dlg = useDialog();
  const [status, setStatus] = useState<Status | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    electron?.translatorStatus?.(installedId).then((s: Status) => setStatus(s)).catch(() => setStatus(null));
  }, [electron, installedId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const off = electron?.onTranslatorProgress?.((p: Progress) => {
      if (p.id !== installedId) return;
      setProgress(p);
      if (p.phase !== 'done' && p.phase !== 'error') setBusy(true);
    });
    return () => { if (typeof off === 'function') off(); };
  }, [electron, installedId]);

  if (!electron?.translatorStatus || !status?.supported) return null;

  const run = async () => {
    setError('');
    setResult(null);
    setBusy(true);
    setProgress({ id: installedId, phase: 'scan' });
    const res = await electron.translatorRun(installedId);
    setBusy(false);
    setProgress(null);
    if (res?.error) {
      if (res.error !== 'Отменено') setError(res.error);
    } else {
      setResult(res.stats);
    }
    refresh();
  };

  const revert = async () => {
    const ok = await dlg.confirm({
      title: 'Откатить перевод?',
      message: 'Игра вернётся к оригинальному тексту. Перевести её заново можно в любой момент.',
      confirmText: 'Откатить',
    });
    if (!ok) return;
    setError('');
    setResult(null);
    const res = await electron.translatorRevert(installedId);
    if (res?.error) setError(res.error);
    refresh();
  };

  const pct = progress?.total ? Math.min(100, Math.round(((progress.done || 0) / progress.total) * 100)) : 0;

  return (
    <div className="tl-panel p-5">
      <div className="tl-sec-head">
        <span className="bar" />
        <h2>Перевод</h2>
        <span className="line" />
      </div>

      <div className="tl-srow">
        <span className="k">Движок</span>
        <span className="v text-right">{status.engineTitle}</span>
      </div>
      <div className="tl-srow">
        <span className="k">Русский</span>
        <span className={`tl-st ${status.applied ? 'ok' : 'no'}`}>
          <span className="led" />
          {status.applied ? 'Установлен' : 'Нет'}
        </span>
      </div>

      {status.blocked && !status.applied && (
        <p className="text-[12px] text-[#ff5b8a] mt-3 leading-relaxed">
          Перевод для этой игры недоступен: {status.blocked}
        </p>
      )}

      {status.nativeRussian && (
        <p className="text-[12px] text-[var(--green2)] mt-3 leading-relaxed">
          В игре уже есть русский перевод от авторов — он лучше машинного. Включите его в настройках игры (Язык / Language).
        </p>
      )}

      {busy && progress ? (
        <div className="mt-3">
          <p className={label}>{PHASE_LABEL[progress.phase] || 'Подготовка…'}</p>
          {(progress.phase === 'model' || progress.phase === 'translate' || progress.phase === 'install') && progress.total ? (
            <>
              <div className="tl-prog mt-2"><div className="t"><div className="f" style={{ width: `${pct}%` }} /></div></div>
              <p className="tl-term text-[13px] tl-muted mt-1">
                {progress.phase === 'model'
                  ? `${formatMB(progress.done)} из ${formatMB(progress.total)}`
                  : progress.phase === 'install'
                    ? `${Math.min(progress.total, Math.floor(progress.done || 0) + 1)} из ${progress.total} пакетов`
                    : `${progress.done} из ${progress.total} строк`}
              </p>
            </>
          ) : (
            <Loader2 size={14} className="animate-spin text-accent mt-2" />
          )}
          <button onClick={() => electron.translatorCancel()} className="tl-btn ghost mt-3 w-full justify-center">
            <X size={13} /> Остановить
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <button onClick={run} disabled={busy || (!!status.blocked && !status.applied)} className="tl-btn solid w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed">
            <Languages size={14} />
            {status.applied ? 'Перевести заново' : 'Перевести на русский'}
          </button>
          {status.applied && (
            <button onClick={revert} disabled={busy} className="tl-btn ghost w-full justify-center">
              <RotateCcw size={13} /> Откатить перевод
            </button>
          )}
        </div>
      )}

      {result?.runtime && (
        <p className="text-[12px] tl-muted mt-3 leading-relaxed">
          Плагин перевода установлен. Запустите игру — тексты переводятся на лету, пока Lustre открыт,
          и запоминаются в игре.
          {result.backend === 'il2cpp' && ' Первый запуск займёт 1–3 минуты: BepInEx готовит игру (нужен интернет).'}
        </p>
      )}
      {result && !result.runtime && (
        <p className="text-[12px] tl-muted mt-3 leading-relaxed">
          Готово за {formatDuration(result.ms)}: переведено {result.translated} из {result.strings} строк
          {result.failed > 0 && `, не удалось ${result.failed}`}.
          {result.badFonts?.length > 0 && ' Шрифты без кириллицы заменены на стандартный.'}
        </p>
      )}
      {error && <p className="text-[12px] text-[#ff5b8a] mt-3 leading-relaxed">{error}</p>}

      <p className="text-[11px] text-[var(--muted-2)] mt-3 leading-relaxed">
        {status.runtime
          ? 'Unity: ставится плагин XUnity.AutoTranslator (BepInEx), он переводит текст во время игры через офлайн-модель в Lustre. Откат удаляет плагин.'
          : 'Машинный перевод прямо на компьютере, без интернета (нужен один раз, чтобы скачать модель ~21 МБ). Файлы оригинала сохраняются, перевод можно откатить.'}
      </p>
    </div>
  );
}
