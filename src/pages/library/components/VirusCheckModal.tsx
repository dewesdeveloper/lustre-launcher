import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, ShieldCheck, ShieldQuestion, X } from 'lucide-react';
import { getScanSummary, sourceKeyFor, type ScanSourceSummary } from '../../../api/scanReports';
import type { DownloadSource } from '../../market/components/SourcePickerModal';

const KIND_LABEL: Record<string, string> = {
  torrent: 'Торрент', direct: 'Прямая ссылка', pixeldrain: 'Pixeldrain', itch: 'itch.io',
  mega: 'MEGA', mediafire: 'MediaFire', browser: 'Скачивание на сайте',
};

const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });

/** Итог по одному источнику: угрозы, «чисто у N игроков» или «ещё не проверяли» */
function Verdict({ s }: { s?: ScanSourceSummary }) {
  if (!s || s.clean_users + s.threat_users === 0) {
    return (
      <p className="flex items-start gap-2 tl-term text-[14px] tl-muted">
        <ShieldQuestion size={15} className="mt-0.5 shrink-0" />
        Ещё никто не проверял. Защитник Windows проверит файлы автоматически после скачивания.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {s.threat_users > 0 && (
        <p className="flex items-start gap-2 tl-term text-[14px] text-[#ff8fab]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Защитник нашёл угрозы у {s.threat_users} {s.threat_users === 1 ? 'игрока' : 'игроков'}
            {s.threats.length > 0 && <>: <span className="text-white">{s.threats.join(', ')}</span></>}
          </span>
        </p>
      )}
      {s.clean_users > 0 && (
        <p className="flex items-start gap-2 tl-term text-[14px] text-[var(--green2)]">
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          Проверено у {s.clean_users} {s.clean_users === 1 ? 'игрока' : 'игроков'} — угроз не найдено
        </p>
      )}
      <p className="tl-term text-[13px] text-[var(--muted-2)]">
        Последняя проверка {day(s.last_at)}
        {s.hashes > 1 && ` · у игроков ${s.hashes} разные версии файла`}
      </p>
    </div>
  );
}

type Props = {
  open: boolean;
  gameId: number;
  gameTitle: string;
  sources: DownloadSource[];
  onClose: () => void;
};

/**
 * «Проверка на вирусы»: по каждому источнику игры — что нашёл Защитник Windows у игроков,
 * которые уже скачали её. Файлы проверяются на их компьютерах, в каталог уходит только итог.
 */
export default function VirusCheckModal({ open, gameId, gameTitle, sources, onClose }: Props) {
  const [summary, setSummary] = useState<ScanSourceSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setSummary(null);
    setError(false);
    getScanSummary(gameId).then((s) => alive && setSummary(s), () => alive && setError(true));
    return () => { alive = false; };
  }, [open, gameId]);

  if (!open) return null;
  const byKey = new Map((summary ?? []).map((s) => [s.source_key, s]));

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div className="tl-panel w-full max-w-xl p-6 text-left" onMouseDown={(e) => e.stopPropagation()}>
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="tl-head flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-white">
              <ShieldCheck size={16} className="text-accent" /> Проверка на вирусы
            </h3>
            <p className="tl-term mt-1 text-[14px] tl-muted">{gameTitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="tl-btn ghost"><X size={14} /></button>
        </header>

        {error ? (
          <p className="tl-term text-[14px] text-[#ff8fab]">Не удалось получить результаты проверок. Попробуйте позже.</p>
        ) : summary === null ? (
          <div className="flex items-center gap-2 tl-term text-[14px] tl-muted"><Loader2 size={14} className="animate-spin" /> Загружаем результаты…</div>
        ) : (
          <ul className="space-y-3">
            {sources.map((s, i) => {
              const key = sourceKeyFor(s);
              return (
                <li key={`${key}-${i}`} className="border border-[var(--line)] p-3.5">
                  <p className="tl-head mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                    {s.label || `Источник ${i + 1}`} · <span className="tl-muted">{KIND_LABEL[s.kind || 'torrent'] ?? s.kind}</span>
                  </p>
                  <Verdict s={key ? byKey.get(key) : undefined} />
                </li>
              );
            })}
          </ul>
        )}

        <p className="tl-term mt-4 text-[13px] text-[var(--muted-2)] leading-relaxed">
          Файлы проверяет Защитник Windows на компьютерах игроков после скачивания — сами файлы никуда
          не отправляются. Антивирусы иногда ошибаются на репаках и кряках, поэтому смотрите и на число проверок.
        </p>
      </div>
    </div>,
    document.body,
  );
}
