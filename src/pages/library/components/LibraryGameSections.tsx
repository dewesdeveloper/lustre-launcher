import { useState, type ReactNode } from 'react';
import {
  Building2, Calendar, ChevronDown, ExternalLink, FileCode2, FolderOpen, HardDrive, Link2, Play, Shield, Tag, Trash2,
} from 'lucide-react';
import ImageLightbox from '../../../components/ImageLightbox';
import { safeHtml } from '../../../utils/safeHtml';
import type { Game, InstalledGame } from '../types';

export type GameMediaItem = { id: number; url: string; is_video?: boolean; thumbnail?: string };

const SecHead = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="tl-sec-head">
    <span className="bar" />
    <h2>{children}</h2>
    <span className="line" />
    {right}
  </div>
);

/** Плитка статистики в панели действий */
export const StatTile = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="tl-head truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
    <p className="tl-term mt-1 truncate text-[18px] leading-none text-white">{value}</p>
  </div>
);

/** Полоса скриншотов игры; клик — во весь экран */
export function ScreenshotStrip({ media }: { media: GameMediaItem[] }) {
  const images = media.filter((m) => !m.is_video && m.url).slice(0, 12);
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  return (
    <section className="mb-8">
      <SecHead>Скриншоты</SecHead>
      <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
        {images.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative h-[124px] w-[220px] shrink-0 cursor-zoom-in overflow-hidden border border-[var(--line)] hover:border-[var(--line-2)]"
          >
            <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          </button>
        ))}
      </div>
      {open !== null && <ImageLightbox images={images.map((m) => m.url)} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Описание игры: длинное — свёрнуто, по кнопке целиком */
export function AboutSection({ game }: { game: Game }) {
  const html = game.about_game || game.description;
  const [expanded, setExpanded] = useState(false);
  if (!html) {
    return <p className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted-2)]">Нет описания</p>;
  }
  const long = html.length > 1200;
  return (
    <section>
      <SecHead>Об игре</SecHead>
      <div className="relative">
        <div
          className={`game-content text-[13px] leading-relaxed tl-muted ${long && !expanded ? 'max-h-[340px] overflow-hidden' : ''}`}
          dangerouslySetInnerHTML={{ __html: safeHtml(html) }}
        />
        {long && !expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[var(--bg)] to-transparent" />}
      </div>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="tl-btn ghost mt-3">
          <ChevronDown size={13} className={expanded ? 'rotate-180' : ''} /> {expanded ? 'Свернуть' : 'Показать полностью'}
        </button>
      )}
    </section>
  );
}

const fileName = (p?: string | null) => (p ? p.split(/[\\/]/).pop() || p : '');

/** Установка на этом компьютере: папка, файл запуска, действия */
export function InstallPanel({
  installed, onReveal, onPickExe, onCreateShortcut, onUninstall, onInstall, installing, shortcutMsg,
}: {
  installed: InstalledGame | null;
  onReveal: () => void;
  onPickExe: () => void;
  onCreateShortcut: () => void;
  onUninstall: () => void;
  onInstall: () => void;
  installing: boolean;
  shortcutMsg: string;
}) {
  return (
    <div className="tl-panel p-5">
      <SecHead>Установка</SecHead>
      {installed ? (
        <>
          <div className="tl-srow">
            <span className="k flex items-center gap-2"><HardDrive size={13} className="shrink-0 text-accent" /> Папка</span>
            <button type="button" onClick={onReveal} title={installed.installPath} className="v max-w-[60%] truncate text-right hover:text-accent">
              {fileName(installed.installPath) || '—'}
            </button>
          </div>
          <div className="tl-srow">
            <span className="k flex items-center gap-2"><FileCode2 size={13} className="shrink-0 text-accent" /> Файл запуска</span>
            <button type="button" onClick={onPickExe} title={installed.exePath ? `${installed.exePath}\nНажмите, чтобы выбрать другой` : 'Указать exe игры'} className="v max-w-[60%] truncate text-right hover:text-accent">
              {fileName(installed.exePath) || 'не указан'}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={onReveal} className="tl-btn ghost justify-center"><FolderOpen size={13} /> Папка</button>
            <button type="button" onClick={onCreateShortcut} className="tl-btn ghost justify-center"><Link2 size={13} /> Ярлык</button>
            <button type="button" onClick={onUninstall} className="tl-btn ghost col-span-2 justify-center hover:text-[#ff5b8a]"><Trash2 size={13} /> Удалить с компьютера</button>
          </div>
          {shortcutMsg && <p className="tl-term mt-2 text-[14px] text-emerald-400">{shortcutMsg}</p>}
        </>
      ) : (
        <>
          <p className="tl-term text-[15px] leading-relaxed text-[var(--muted)]">Игра есть в библиотеке, но не установлена на этом компьютере.</p>
          <button type="button" onClick={onInstall} disabled={installing} className="tl-btn solid mt-3 w-full justify-center disabled:opacity-50">
            <Play size={13} className="fill-current" /> {installing ? 'Добавление…' : 'Установить'}
          </button>
        </>
      )}
    </div>
  );
}

/** Сведения об игре: разработчик, издатель, дата, рейтинг, метки, ссылка на магазин */
export function InfoPanel({ game, releaseDate, onOpenStore }: { game: Game; releaseDate: string; onOpenStore: () => void }) {
  return (
    <div className="tl-panel p-5">
      <SecHead>Информация</SecHead>
      {game.developer && (
        <div className="tl-srow">
          <span className="k flex items-center gap-2"><Building2 size={13} className="shrink-0 text-accent" /> Разработчик</span>
          <span className="v max-w-[60%] truncate text-right" title={game.developer}>{game.developer}</span>
        </div>
      )}
      {game.publisher && (
        <div className="tl-srow">
          <span className="k flex items-center gap-2"><Building2 size={13} className="shrink-0 text-accent" /> Издатель</span>
          <span className="v max-w-[60%] truncate text-right" title={game.publisher}>{game.publisher}</span>
        </div>
      )}
      {game.release_date && (
        <div className="tl-srow">
          <span className="k flex items-center gap-2"><Calendar size={13} className="shrink-0 text-accent" /> Дата выхода</span>
          <span className="v text-right">{releaseDate}</span>
        </div>
      )}
      {game.age_rating && (
        <div className="tl-srow">
          <span className="k flex items-center gap-2"><Shield size={13} className="shrink-0 text-accent" /> Возраст</span>
          <span className="v text-right">{game.age_rating}+</span>
        </div>
      )}
      {game.tags?.length > 0 && (
        <div className="mt-1 border-t border-[var(--line)] pt-3">
          <div className="mb-2 flex items-center gap-2">
            <Tag size={13} className="text-accent" />
            <p className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">Метки</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {game.tags.map((t) => <span key={t.id} className="tl-chip common">{t.name}</span>)}
          </div>
        </div>
      )}
      <button type="button" onClick={onOpenStore} className="tl-btn ghost mt-4 w-full justify-center"><ExternalLink size={13} /> Страница в магазине</button>
    </div>
  );
}
