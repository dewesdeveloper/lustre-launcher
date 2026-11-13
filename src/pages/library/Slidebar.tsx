import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IconSearch } from "@tabler/icons-react";
import { Heart, PanelLeftClose, PanelLeftOpen, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api';
import { useSettings } from '../../context/SettingsContext';
import { LIBRARY_CHANGED_EVENT } from '../../utils/libraryEvents';
import type { SidebarLibraryEntry } from './types';
import SidebarGameRow from './components/SidebarGameRow';

export default function SidebarGames() {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, updateSettings } = useSettings();
  const [entries, setEntries] = useState<SidebarLibraryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const collapsed = settings.sidebar_collapsed;
  const width = settings.sidebar_width;

  const load = useCallback(() => {
    api.get('/library/').then(res => setEntries(res.data)).catch(() => {});
  }, []);

  // Динамическое обновление: монтирование, событие об изменении библиотеки, фокус окна
  useEffect(() => {
    load();
    const onChanged = () => load();
    window.addEventListener(LIBRARY_CHANGED_EVENT, onChanged);
    window.addEventListener('focus', onChanged);
    return () => {
      window.removeEventListener(LIBRARY_CHANGED_EVENT, onChanged);
      window.removeEventListener('focus', onChanged);
    };
  }, [load]);

  // Обновление при переходах между страницами
  useEffect(() => { load(); }, [location.pathname, load]);

  const MIN_WIDTH = 50;
  const MAX_WIDTH = 400;
  const COLLAPSED_WIDTH = 48;

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      updateSettings({ sidebar_width: newWidth });
    };

    const onUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [width, updateSettings]);

  const toggleCollapse = () => {
    updateSettings({ sidebar_collapsed: !collapsed });
  };

  const currentWidth = collapsed ? COLLAPSED_WIDTH : width;
  const isCompact = currentWidth < 180;

  const favorites = entries.filter(e => e.favorite);
  const others = entries.filter(e => !e.favorite);

  const filterList = (list: SidebarLibraryEntry[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(e => e.game?.title?.toLowerCase().includes(q));
  };

  return (
    <motion.aside
      animate={{ width: currentWidth }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative z-10 border-r border-[var(--line)] bg-[#0b0512]/70 flex flex-col h-full shrink-0 overflow-hidden max-md:hidden"
      ref={sidebarRef}
    >
      {/* Header */}
      <div className="p-3 flex items-center justify-between shrink-0">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="tl-head text-[10px] font-bold uppercase tracking-widest text-accent truncate"
            >
              Библиотека ({entries.length})
            </motion.span>
          )}
        </AnimatePresence>
        <button
          onClick={toggleCollapse}
          className="p-1.5 rounded-lg hover:bg-violet/10 text-pearl/60 hover:text-accent transition-colors shrink-0"
          title={collapsed ? 'Развернуть' : 'Свернуть'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Search */}
      <AnimatePresence>
        {!collapsed && !isCompact && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-3 pb-3 overflow-hidden shrink-0"
          >
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent/60" size={14} />
              <input
                type="text"
                data-search-hotkey="sidebar"
                placeholder="Поиск..."
                className="w-full bg-[#08050f] border border-[var(--line)] py-1.5 pl-8 pr-2 text-xs focus:border-[var(--line-2)] outline-none transition-all text-[var(--text)] placeholder:text-[var(--muted-2)]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Library list */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar px-1.5">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {favorites.length > 0 && (
                <div className="mb-3">
                  {!isCompact && (
                    <button className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-accent">
                      <Heart size={10} className="fill-accent" />
                      <span>Избранное ({favorites.length})</span>
                    </button>
                  )}
                  {filterList(favorites).map(entry => (
                    <SidebarGameRow
                      key={entry.id}
                      title={entry.game?.title || 'Неизвестно'}
                      image={entry.game?.header_image}
                      compact={isCompact}
                      onClick={() => navigate(`/games/${entry.game_id}`)}
                    />
                  ))}
                </div>
              )}

              <div>
                {!isCompact && (
                  <button className="flex items-center gap-1.5 w-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-violet">
                    <span>Все ({others.length})</span>
                  </button>
                )}
                {filterList(others).map(entry => (
                  <SidebarGameRow
                    key={entry.id}
                    title={entry.game?.title || 'Неизвестно'}
                    image={entry.game?.header_image}
                    compact={isCompact}
                    onClick={() => navigate(`/games/${entry.game_id}`)}
                  />
                ))}
              </div>

              {entries.length === 0 && (
                <p className="text-[10px] text-pearl/55 px-2 py-4 text-center">Нет игр</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Resize handle */}
      {!collapsed && (
        <div
          onMouseDown={handleDragStart}
          className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize group flex items-center justify-center z-10 transition-colors ${
            isDragging ? 'bg-accent/30' : 'hover:bg-accent/20'
          }`}
        >
          <GripVertical
            size={12}
            className={`text-pearl/10 group-hover:text-pearl/70 transition-colors ${isDragging ? 'text-accent' : ''}`}
          />
        </div>
      )}
    </motion.aside>
  );
}
