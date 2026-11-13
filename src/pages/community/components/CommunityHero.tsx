import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconFlame, IconMessage2, IconPhoto, IconSearch, IconTools } from '@tabler/icons-react';

/** Значок «трансляция» (треугольник play) — в наборе tabler нет подходящего по стилю */
function PlayGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4v16l13-8z" />
    </svg>
  );
}

const SECTIONS: { id: string; label: string; icon: ReactNode }[] = [
  { id: 'trending', label: 'В тренде', icon: <IconFlame size={18} /> },
  { id: 'screenshots', label: 'Скриншоты', icon: <IconPhoto size={18} /> },
  { id: 'discussions', label: 'Обсуждения', icon: <IconMessage2 size={18} /> },
  { id: 'workshop', label: 'Мастерская', icon: <IconTools size={18} /> },
  { id: 'broadcasts', label: 'Трансляции', icon: <PlayGlyph size={18} /> },
];

/** Шапка раздела «Сообщество»: заголовок, поиск (ведёт в обсуждения) и вкладки разделов. */
export default function CommunityHero({ activeTab, onTabSelect }: { activeTab: string; onTabSelect: (id: string) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const search = () => {
    const q = query.trim();
    if (q) navigate(`/community/discussions?q=${encodeURIComponent(q)}`);
  };

  return (
    <>
      <header className="mb-8 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div>
          <h1 className="tl-pixel text-[26px] text-white" style={{ textShadow: 'var(--glow)' }}>Сообщество <span className="text-accent">Lustre</span></h1>
          <p className="tl-head tl-muted mt-3 text-[10px] font-bold uppercase tracking-[.26em]">Центр управления контентом и связи с игроками</p>
        </div>
        <div className="w-full md:w-96">
          <div className="tl-prefix">
            <span className="at"><IconSearch size={18} /></span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              data-search-hotkey="page"
              placeholder="Поиск по обсуждениям, модам и игрокам..."
              className="tl-field"
            />
          </div>
        </div>
      </header>

      <nav className="tl-tabs mb-8">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" onClick={() => onTabSelect(s.id)} className={`tl-tab ${activeTab === s.id ? 'active' : ''}`}>
            {s.icon} {s.label}
          </button>
        ))}
      </nav>
    </>
  );
}
