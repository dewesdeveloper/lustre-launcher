import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconFlame, IconLogin2, IconMessage2, IconPhoto, IconPlus, IconSearch, IconTools, IconUpload, IconX } from '@tabler/icons-react';
import type { Community, CommunityStats } from '../../../api/community';
import { categoryLabel, formatOf } from '../formats';

/** Значок «трансляция» (треугольник play) — в наборе tabler нет подходящего по стилю */
function PlayGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4v16l13-8z" />
    </svg>
  );
}

const SECTIONS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'trending', label: 'Сообщества', icon: <IconFlame size={18} /> },
  { id: 'screenshots', label: 'Скриншоты', icon: <IconPhoto size={18} /> },
  { id: 'discussions', label: 'Обсуждения', icon: <IconMessage2 size={18} /> },
  { id: 'workshop', label: 'Мастерская', icon: <IconTools size={18} /> },
  { id: 'broadcasts', label: 'Трансляции', icon: <PlayGlyph size={18} /> },
];

const nf = new Intl.NumberFormat('ru-RU');

/** Живые цифры платформы: подпись, ключ в ответе сервера, цвет */
const STATS: { label: string; key: keyof CommunityStats; color: string }[] = [
  { label: 'в сети', key: 'online_users', color: '#22d3ee' },
  { label: 'сообществ', key: 'communities', color: '#f59e0b' },
  { label: 'участников', key: 'members', color: '#a78bfa' },
  { label: 'обсуждений', key: 'discussions', color: 'var(--pink)' },
];

type CommunityHeroProps = {
  activeTab: string;
  onTabSelect: (id: string) => void;
  stats: CommunityStats | null;
  /** null — гость: вместо действий кнопка входа */
  onCreate: (() => void) | null;
  onPublish: (() => void) | null;
  /** Строка поиска сообществ: фильтрует список под шапкой */
  query: string;
  onQuery: (q: string) => void;
  /** Подходящие сообщества для подсказок под строкой */
  matches: Community[];
  onOpen: (c: Community) => void;
};

/** Шапка раздела «Сообщество»: баннер с действиями и живой статистикой, поиск и вкладки разделов. */
export default function CommunityHero({ activeTab, onTabSelect, stats, onCreate, onPublish, query, onQuery, matches, onOpen }: CommunityHeroProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const q = query.trim();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const searchDiscussions = () => {
    if (q) navigate(`/community/discussions?q=${encodeURIComponent(q)}`);
  };

  return (
    <>
      <header className="tl-panel relative mb-6 overflow-hidden p-8">
        {/* фон: сетка и неоновые пятна в цветах лаунчера */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{
          backgroundImage: 'radial-gradient(600px 220px at 85% 0%, rgb(var(--accent-rgb)/.22), transparent 70%), radial-gradient(500px 240px at 0% 100%, rgba(131,56,236,.22), transparent 70%), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
          backgroundSize: 'auto, auto, 28px 28px, 28px 28px',
        }} />

        <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="tl-head mb-3 text-[10px] font-bold uppercase tracking-[.3em] text-accent">// Community hub</p>
            <h1 className="tl-pixel text-[30px] leading-tight text-white" style={{ textShadow: 'var(--glow)' }}>
              Сообщество <span className="text-accent">Lustre</span>
            </h1>
            <p className="tl-term mt-3 text-[17px] text-[var(--muted)]">
              Находи своих: сообщества по играм, общению и увлечениям, обсуждения, скриншоты, моды и трансляции.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {onCreate ? (
                <>
                  <button type="button" onClick={onCreate} className="tl-btn solid"><IconPlus size={15} /> Создать сообщество</button>
                  {onPublish && <button type="button" onClick={onPublish} className="tl-btn ghost"><IconUpload size={15} /> Опубликовать контент</button>}
                </>
              ) : (
                <button type="button" onClick={() => navigate('/login')} className="tl-btn solid"><IconLogin2 size={15} /> Войти, чтобы участвовать</button>
              )}
            </div>
          </div>

          <div className="w-full xl:w-[420px]">
            <div ref={wrapRef} className="relative mb-4">
              <div className="tl-prefix">
                <span className="at"><IconSearch size={18} /></span>
                <input
                  value={query}
                  onChange={(e) => { onQuery(e.target.value); setOpen(true); if (activeTab !== 'trending') onTabSelect('trending'); }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { onQuery(''); setOpen(false); }
                    if (e.key === 'Enter') setOpen(false);
                  }}
                  data-search-hotkey="page"
                  placeholder="Поиск сообществ…"
                  className="tl-field pr-9"
                />
                {query && (
                  <button type="button" aria-label="Очистить поиск" onClick={() => onQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white">
                    <IconX size={14} />
                  </button>
                )}
              </div>
              {open && q && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-[var(--line-2)] bg-[#0f0a17] shadow-[0_12px_30px_rgba(0,0,0,.6)]">
                  {matches.slice(0, 6).map((c) => {
                    const fmt = formatOf(c);
                    return (
                      <button
                        key={c.ID}
                        type="button"
                        onClick={() => { setOpen(false); onOpen(c); }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5"
                      >
                        <fmt.Icon size={16} className={`shrink-0 ${fmt.tone}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-white">{c.name}</span>
                          <span className="tl-term block truncate text-[13px] text-[var(--muted)]">{categoryLabel(c)} · {c.members_count} уч.</span>
                        </span>
                      </button>
                    );
                  })}
                  {matches.length === 0 && <p className="tl-term px-3 py-2.5 text-[14px] text-[var(--muted)]">Сообществ не найдено</p>}
                  <button type="button" onClick={searchDiscussions} className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 text-left text-xs text-accent hover:bg-white/5">
                    <IconMessage2 size={14} /> Искать «{q}» в обсуждениях
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-4 border border-[var(--line)] bg-black/30">
              {STATS.map(({ label, key, color }, i) => (
                <div key={key} className={`px-3 py-3 text-center ${i ? 'border-l border-[var(--line)]' : ''}`}>
                  <div className="tl-pixel text-[18px]" style={{ color, filter: `drop-shadow(0 0 6px ${color})` }}>
                    {stats ? nf.format(stats[key]) : '—'}
                  </div>
                  <div className="tl-head mt-1 text-[9px] font-bold uppercase tracking-[.16em] text-[var(--muted)]">
                    {key === 'online_users' && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse bg-emerald-400 align-middle" />}
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <nav className="tl-tabs mb-6">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" onClick={() => onTabSelect(s.id)} className={`tl-tab ${activeTab === s.id ? 'active' : ''}`}>
            {s.icon} {s.label}
          </button>
        ))}
      </nav>
    </>
  );
}
