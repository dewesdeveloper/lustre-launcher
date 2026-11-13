import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Clock, ExternalLink, FolderOpen, Gamepad2, NotebookPen, X } from 'lucide-react';
import api from '../../api';
import FriendsStandalone from '../friends/FriendsStandalone';
import ChatWindow from '../chat/ChatWindow';
import { useOverlayState, formatDuration, type OverlayGame } from './overlayState';

type Shot = { name?: string; file: string; at?: number; thumb: string };

const electron = () => (window as any).electron;

/**
 * Игровой оверлей в духе Steam: затемнённая подложка поверх игры на весь экран,
 * сверху — игра, время сессии и часы; панели «Друзья», «Чат», «Игра», «Скриншоты»,
 * «Заметки». Открывается/закрывается горячей клавишей (по умолчанию Shift+Tab) или Esc.
 */
export default function OverlayPage() {
  const state = useOverlayState();
  const game = state?.game ?? null;
  const [chatTarget, setChatTarget] = useState<{ id: number; n: number } | null>(null);

  useTransparentBackground();

  // Esc — вернуться в игру
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) electron()?.hideGameOverlay?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hotkey = state?.hotkeyLabel || 'Shift+Tab';

  return (
    <div className="fixed inset-0 flex flex-col text-pearl select-none" style={{ background: 'rgba(3, 2, 7, 0.82)' }}>
      <TopBar game={game} hotkey={hotkey} />

      <main
        className="flex-1 min-h-0 grid gap-4 px-5 pb-4"
        style={{ gridTemplateColumns: 'minmax(260px, 320px) minmax(420px, 1fr) minmax(280px, 360px)' }}
      >
        <Panel title="Друзья" className="min-h-0">
          <FriendsStandalone embedded onOpenFriend={(id) => setChatTarget((t) => ({ id, n: (t?.n ?? 0) + 1 }))} />
        </Panel>

        <Panel title="Чат" className="min-h-0">
          <ChatWindow embedded targetUserId={chatTarget?.id} targetNonce={chatTarget?.n} />
        </Panel>

        <div className="min-h-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          <GamePanel game={game} screenshotHotkey={state?.screenshotLabel || ''} />
          <NotesPanel game={game} />
        </div>
      </main>

      <footer className="shrink-0 flex items-center justify-center gap-6 py-2.5 border-t border-white/10 bg-black/40 text-[14px] text-pearl/75">
        <span><Kbd>{hotkey}</Kbd> вернуться в игру</span>
        {state?.screenshotLabel && <span><Kbd>{state.screenshotLabel}</Kbd> скриншот</span>}
        <span><Kbd>Esc</Kbd> закрыть оверлей</span>
      </footer>
    </div>
  );
}

function TopBar({ game, hotkey }: { game: OverlayGame | null; hotkey: string }) {
  const now = useNow();
  return (
    <header className="shrink-0 flex items-center gap-5 px-5 py-3.5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-11 h-11 shrink-0 flex items-center justify-center border border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.14)]">
          <Gamepad2 size={22} className="text-[var(--pink)]" />
        </div>
        <div className="min-w-0">
          <div className="tl-head text-[15px] font-bold text-white uppercase truncate leading-tight">
            {game?.name || 'Оверлей Lustre'}
          </div>
          <div className="text-[14px] text-pearl/75 mt-0.5">
            {game ? <>Текущая сессия: <span className="text-white tabular-nums">{formatDuration(now - game.startedAt)}</span></> : 'Игра не запущена'}
          </div>
        </div>
      </div>

      <div className="tl-num text-[30px] text-white tabular-nums leading-none" title="Текущее время">
        {new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
      </div>

      <div className="flex-1 flex items-center justify-end gap-3">
        <span className="text-[14px] text-pearl/75 hidden lg:inline">
          <Kbd>{hotkey}</Kbd> — в игру
        </span>
        <button
          onClick={() => electron()?.hideGameOverlay?.()}
          className="w-10 h-10 flex items-center justify-center border border-white/15 text-pearl/80 hover:text-white hover:bg-[var(--pink)] hover:border-[var(--pink)] transition-colors"
          title="Закрыть оверлей (Esc)"
        >
          <X size={18} />
        </button>
      </div>
    </header>
  );
}

function GamePanel({ game, screenshotHotkey }: { game: OverlayGame | null; screenshotHotkey: string }) {
  const now = useNow();
  const [cover, setCover] = useState('');
  const [totalMs, setTotalMs] = useState<number | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const catalogId = game?.catalogId || 0;

  useEffect(() => {
    setCover('');
    setTotalMs(null);
    if (!catalogId) return;
    api.get(`/games/${catalogId}`)
      .then((r) => setCover(r.data?.header_image || r.data?.banner_url || ''))
      .catch(() => {});
    api.get(`/library/status/${catalogId}`)
      .then((r) => setTotalMs(Number(r.data?.playtime_ms) || 0))
      .catch(() => {});
  }, [catalogId]);

  const loadShots = useCallback(() => {
    electron()?.overlayListScreenshots?.().then((list: Shot[]) => setShots(list || [])).catch(() => {});
  }, []);

  // список скриншотов — при каждом открытии оверлея (могли сделать по F12 в игре)
  useEffect(() => {
    loadShots();
    const off = electron()?.onOverlayOpen?.(loadShots);
    return () => { if (typeof off === 'function') off(); };
  }, [loadShots, game?.id]);

  const takeShot = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await electron()?.overlayScreenshot?.();
      if (r?.ok) setShots((s) => [{ file: r.file, thumb: r.thumb, at: Date.now() }, ...s].slice(0, 12));
      else setError(r?.error || 'Не удалось сделать скриншот');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Игра" icon={<Gamepad2 size={16} />} className="shrink-0">
      <div className="p-4 flex flex-col gap-4 bg-main-bg h-full">
        {cover && (
          <img src={cover} alt="" draggable={false} className="w-full aspect-[460/215] object-cover border border-white/10" />
        )}
        {game ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Сессия" value={formatDuration(now - game.startedAt)} />
            <Stat label="Всего в игре" value={totalMs === null ? '—' : formatDuration(totalMs, true)} />
          </div>
        ) : (
          <p className="text-[14px] text-pearl/75 leading-relaxed">
            Запустите игру из библиотеки Lustre — здесь появится время сессии, скриншоты и заметки к игре.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={takeShot} disabled={busy} className="tl-btn">
            <Camera size={14} /> Скриншот{screenshotHotkey ? ` (${screenshotHotkey})` : ''}
          </button>
          {catalogId > 0 && (
            <button onClick={() => electron()?.overlayOpenInLauncher?.(`/games/${catalogId}`)} className="tl-btn ghost">
              <ExternalLink size={14} /> Страница игры
            </button>
          )}
        </div>
        {error && <p className="text-[14px] text-red-300">{error}</p>}

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-pearl/80">Скриншоты</span>
            <button
              onClick={() => electron()?.overlayOpenScreenshotsFolder?.()}
              className="flex items-center gap-1.5 text-[13px] text-pearl/75 hover:text-white transition-colors"
            >
              <FolderOpen size={14} /> Папка
            </button>
          </div>
          {shots.length === 0 ? (
            <p className="text-[13px] text-pearl/65">Пока нет снимков{screenshotHotkey ? ` — нажмите ${screenshotHotkey} в игре` : ''}.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
              {shots.map((s) => (
                <button
                  key={s.file}
                  onClick={() => electron()?.overlayOpenScreenshot?.(s.file)}
                  className="aspect-video bg-black border border-white/10 hover:border-[var(--pink)] transition-colors overflow-hidden"
                  title="Открыть"
                >
                  {s.thumb && <img src={s.thumb} alt="" draggable={false} className="w-full h-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function NotesPanel({ game }: { game: OverlayGame | null }) {
  const key = `lh_overlay_notes:${game?.catalogId || game?.name || 'general'}`;
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try { setText(localStorage.getItem(key) || ''); } catch { setText(''); }
    setSaved(true);
  }, [key]);

  const onChange = (v: string) => {
    setText(v);
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try { localStorage.setItem(key, v); } catch { /* переполнено — не критично */ }
      setSaved(true);
    }, 500);
  };

  return (
    <Panel
      title={game ? 'Заметки к игре' : 'Заметки'}
      icon={<NotebookPen size={16} />}
      aside={<span className="text-[12px] text-pearl/65">{saved ? 'Сохранено' : 'Сохраняем…'}</span>}
      className="flex-1 min-h-[160px]"
    >
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        maxLength={10000}
        placeholder="Пароли от сейфов, маршруты, планы на сессию…"
        className="w-full h-full resize-none bg-main-bg p-4 text-[15px] leading-relaxed text-pearl placeholder:text-pearl/70 outline-none select-text"
        spellCheck={false}
      />
    </Panel>
  );
}

function Panel({ title, icon, aside, className = '', children }: {
  title: string; icon?: React.ReactNode; aside?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col border border-[var(--line)] bg-[rgba(10,7,16,0.94)] shadow-[0_10px_40px_rgba(0,0,0,0.55)] ${className}`}>
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--line)] bg-black/40">
        <div className="flex items-center gap-2 text-[var(--pink)]">
          {icon}
          <h2 className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] text-white">{title}</h2>
        </div>
        {aside}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-black/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[12px] text-pearl/70"><Clock size={12} /> {label}</div>
      <div className="text-[18px] text-white tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 mr-1 border border-white/25 bg-white/10 text-[13px] text-white font-sans">
      {children}
    </kbd>
  );
}

/** Тикающее «сейчас» — для часов и таймера сессии */
function useNow(stepMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}

/** Окно оверлея прозрачное: сквозь подложку видна игра */
export function useTransparentBackground() {
  useEffect(() => {
    const html = document.documentElement.style.background;
    const body = document.body.style.background;
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      document.documentElement.style.background = html;
      document.body.style.background = body;
    };
  }, []);
}
