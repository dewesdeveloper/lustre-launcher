import type React from 'react';
import { Settings, Info, Heart, FolderSearch, Pin, FolderOpen, Trash2 } from 'lucide-react';
import type { InstalledGame } from '../types';

interface Props {
  installed: InstalledGame | null;
  favorite: boolean;
  shortcutMsg: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuOpen: boolean;
  submenuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSubmenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onToggleFavorite: () => void;
  onPickExe: () => void;
  onCreateShortcut: () => void;
  onReveal: () => void;
  onUninstall: () => void;
  onOpenStore: () => void;
}

const item =
  'w-full text-left px-4 py-2.5 tl-head text-[10px] font-bold uppercase tracking-[0.1em] ' +
  'text-[var(--muted)] hover:text-white hover:bg-[rgb(var(--accent-rgb)/.14)] transition-colors';

const iconBtn = 'tl-btn ghost';

const GameActionsMenu = ({
  installed,
  favorite,
  shortcutMsg,
  menuRef,
  menuOpen,
  submenuOpen,
  setMenuOpen,
  setSubmenuOpen,
  onToggleFavorite,
  onPickExe,
  onCreateShortcut,
  onReveal,
  onUninstall,
  onOpenStore,
}: Props) => (
  <div className="ml-auto flex items-center gap-2 relative" ref={menuRef}>
    {shortcutMsg && (
      <span className="tl-chip ok absolute -top-9 right-0 whitespace-nowrap z-50">
        {shortcutMsg}
      </span>
    )}
    <button
      onClick={() => { setMenuOpen(v => !v); setSubmenuOpen(false); }}
      className={menuOpen ? 'tl-btn' : iconBtn}
      title="Управление"
    >
      <Settings size={14} />
    </button>
    <button
      onClick={onOpenStore}
      className={iconBtn}
      title="Страница в магазине"
    >
      <Info size={14} />
    </button>
    <button
      onClick={onToggleFavorite}
      className={`${iconBtn} group`}
      title="Избранное"
    >
      <Heart size={14} className={favorite ? 'fill-yellow-400 text-yellow-400' : 'group-hover:text-yellow-400'} />
    </button>

    {/* Выпадающее меню */}
    {menuOpen && (
      <div className="absolute top-full right-0 mt-2 w-60 z-50">
        <div className="tl-panel" style={{ position: 'absolute', inset: 0 }} aria-hidden="true" />
        <div className="relative py-1.5">
          <button
            onClick={() => { onToggleFavorite(); setMenuOpen(false); }}
            className={item}
          >
            {favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          </button>

          <div
            className="relative"
            onMouseEnter={() => setSubmenuOpen(true)}
            onMouseLeave={() => setSubmenuOpen(false)}
          >
            <button className={`${item} flex items-center justify-between`}>
              Управление <span className="text-[var(--muted-2)]">›</span>
            </button>
            {submenuOpen && (
              <div className="absolute top-0 right-full w-64 z-50">
                <div className="tl-panel py-1.5">
                  <button
                    onClick={() => { onPickExe(); setMenuOpen(false); }}
                    disabled={!installed}
                    className={`${item} flex items-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <FolderSearch size={13} className="text-accent shrink-0" /> Указать файл игры...
                  </button>
                  <button
                    onClick={() => { onCreateShortcut(); setMenuOpen(false); }}
                    disabled={!installed}
                    className={`${item} flex items-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <Pin size={13} className="text-accent shrink-0" /> Создать ярлык на рабочем столе
                  </button>
                  <button
                    onClick={() => { onReveal(); setMenuOpen(false); }}
                    disabled={!installed}
                    className={`${item} flex items-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <FolderOpen size={13} className="text-accent shrink-0" /> Просмотреть локальные файлы
                  </button>
                  <div className="my-1 border-t border-[var(--line)]" />
                  <button
                    onClick={() => { onUninstall(); setMenuOpen(false); }}
                    disabled={!installed}
                    className={`${item} flex items-center gap-2.5 disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <Trash2 size={13} className="text-[#ff5b8a] shrink-0" /> Удалить с устройства
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="my-1 border-t border-[var(--line)]" />
          <button
            disabled
            className={`${item} text-[var(--muted-2)] cursor-not-allowed hover:text-[var(--muted-2)]`}
          >
            Свойства...
          </button>
        </div>
      </div>
    )}
  </div>
);

export default GameActionsMenu;
