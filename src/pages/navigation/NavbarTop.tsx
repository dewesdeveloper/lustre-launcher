import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Download, Menu as MenuIcon, MessageCircle, PictureInPicture } from 'lucide-react';
import { ChatBell } from '../../components/ChatBell';
import CurrencyPill from '../../components/CurrencyPill';
import Tooltip from '../../components/Tooltip';
import OfflineBadge from '../../components/OfflineBadge';
import { useAuth } from '../../context/AuthContext';
import { useConnectivity } from '../../context/ConnectivityContext';
import { secureStorage } from '../../api/secureStorage';
import { openChatWindow } from '../../utils/openChat';
import { canModerate } from '../../utils/roles';
import { DOWNLOAD_WINDOWS_URL } from '../../utils/downloads';
import { admin } from '../../admin';
import { LogoMenu } from './components/LogoMenu';
import { ProfileMenu } from './components/ProfileMenu';
import { WindowControls } from './components/WindowControls';
import { DropMenu } from './components/DropMenu';
import { TOP_LINKS, helpMenu, logoMenu, profileMenu, topLinksMenu } from './components/menuItems';

type Menu = 'logo' | 'help' | 'profile' | null;

// Electron: панель перетаскивает окно, а кнопки внутри неё должны оставаться кликабельными
const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties;

type Bridge = { toggleOverlay?: () => Promise<boolean> };
const bridge = (window as { electron?: Bridge }).electron;
const IS_WEB = !bridge;

const ICON_BTN = 'w-8 h-7 flex items-center justify-center rounded transition-colors cursor-pointer';

// Уже этой ширины ссылки шапки не помещаются рядом с валютой и профилем — сворачиваем их в меню
const COMPACT_QUERY = '(max-width: 1100px)';

function useCompactNav() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

/**
 * Верхняя полоса приложения: меню логотипа, ссылки и «Справка» (только лаунчер),
 * валюта, чаты, оверлей, меню профиля и кнопки окна. Гость видит вход и регистрацию.
 */
export const NavbarTop = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { manualOffline, setManualOffline } = useConnectivity();
  const [menu, setMenu] = useState<Menu>(null);
  const [overlay, setOverlay] = useState(false);
  const compact = useCompactNav();

  const logoBox = useRef<HTMLDivElement>(null);
  const helpBox = useRef<HTMLDivElement>(null);
  const profileBox = useRef<HTMLDivElement>(null);

  // клик мимо открытого меню закрывает его
  useEffect(() => {
    const boxes: Record<Exclude<Menu, null>, typeof logoBox> = { logo: logoBox, help: helpBox, profile: profileBox };
    const onDown = (e: MouseEvent) => setMenu((m) => (m && !boxes[m].current?.contains(e.target as Node) ? null : m));
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const toggle = (m: Exclude<Menu, null>) => setMenu((cur) => (cur === m ? null : m));
  const close = () => setMenu(null);

  const role = user?.role;
  const offline = {
    manualOffline,
    // без сохранённого аккаунта автономный режим недоступен
    disabled: secureStorage.getItem('dontSaveAccount') === true,
    onToggle: () => setManualOffline(!manualOffline),
  };
  const roles = { staff: role === 'admin' || role === 'manager', admin: role === 'admin', moderator: canModerate(role) };

  const toggleOverlay = async () => setOverlay(!!(await bridge?.toggleOverlay?.()));

  return (
    <div style={DRAG} className="fx-nav-line relative z-[100] flex h-11 w-full select-none items-center border-b border-[var(--line-2)] bg-[#08040d]">
      <div style={NO_DRAG} className="flex h-full min-w-0 items-center gap-5 px-4 max-md:gap-3 max-md:px-2">
        <div ref={logoBox} className="relative">
          <LogoMenu isOpen={menu === 'logo'} onToggle={() => toggle('logo')} onClose={close} items={logoMenu(navigate, logout, offline, roles)} />
        </div>

        {!IS_WEB && (
          <nav className="flex h-full items-center gap-4">
            {!compact && TOP_LINKS.map((l) => (
              <Tooltip key={l.label} label={l.label} hint={l.hint}>
                <button type="button" onClick={() => navigate(l.to)} className="tl-head flex h-full cursor-pointer items-center font-bold uppercase tracking-[0.15em] text-[var(--muted)] transition-colors hover:text-white">
                  {l.label}
                </button>
              </Tooltip>
            ))}
            <div ref={helpBox} className="relative flex h-full items-center">
              <Tooltip label={compact ? 'Меню' : 'Справка'} hint={compact ? 'Разделы, поддержка и документы' : 'Поддержка и документы'} align="left">
                <button
                  type="button"
                  onClick={() => toggle('help')}
                  className={`tl-head flex h-full cursor-pointer items-center gap-1 font-bold uppercase tracking-[0.15em] transition-colors ${menu === 'help' ? 'text-white' : 'text-[var(--muted)] hover:text-white'}`}
                >
                  {compact && <MenuIcon size={14} className="sm:hidden" />}
                  <span className={compact ? 'max-sm:hidden' : ''}>{compact ? 'Меню' : 'Справка'}</span>
                  <ChevronDown size={10} className={`transition-transform duration-200 ${menu === 'help' ? 'rotate-180' : ''}`} />
                </button>
              </Tooltip>
              <DropMenu open={menu === 'help'} entries={compact ? [...topLinksMenu(navigate), 'sep', ...helpMenu(navigate)] : helpMenu(navigate)} onClose={close} place="left-0 mt-1 w-72 z-[110]" />
            </div>
          </nav>
        )}
      </div>

      <div style={NO_DRAG} className="ml-auto flex h-full shrink-0 items-center">
        <OfflineBadge />

        {IS_WEB && (
          <a
            href={DOWNLOAD_WINDOWS_URL}
            title="Lustre для Windows, около 135 МБ"
            className="tl-head mr-3 inline-flex h-7 items-center gap-1.5 whitespace-nowrap border border-[var(--line-2)] px-3 font-bold uppercase tracking-[0.12em] text-white transition-colors hover:bg-[rgb(var(--accent-rgb)/.2)] max-md:hidden"
          >
            <Download size={13} /> Скачать лаунчер
          </a>
        )}

        {user ? (
          <>
            <div className="mr-3 flex items-center gap-2 max-sm:mr-1.5 max-sm:gap-1">
              <CurrencyPill />
              <div className="flex items-center gap-1">
                <Tooltip label="Сообщения" hint="Все чаты: личные и группы" align="right">
                  <button type="button" onClick={() => openChatWindow()} className={`${ICON_BTN} text-pearl/60 hover:text-cyan`}><MessageCircle size={14} /></button>
                </Tooltip>
                {!IS_WEB && (
                  <Tooltip label={overlay ? 'Выйти из оверлея' : 'Режим оверлея'} hint="Панель поверх всех окон" align="right">
                    <button type="button" onClick={toggleOverlay} className={`${ICON_BTN} ${overlay ? 'bg-accent/10 text-accent' : 'text-pearl/60 hover:text-violet'}`}>
                      <PictureInPicture size={14} />
                    </button>
                  </Tooltip>
                )}
                <ChatBell />
                {admin && <admin.AdminNavButton />}
              </div>
            </div>
            <div ref={profileBox} className="relative flex h-full items-center">
              <ProfileMenu isOpen={menu === 'profile'} onToggle={() => toggle('profile')} onClose={close} user={user} items={profileMenu(user.username, navigate, logout, offline)} />
            </div>
          </>
        ) : (
          <div className="mr-3 flex items-center gap-2">
            <button type="button" onClick={() => navigate('/login')} className="tl-head h-7 cursor-pointer border border-[var(--line)] px-3 font-bold uppercase tracking-[0.12em] text-[var(--muted)] transition-colors hover:border-[var(--line-2)] hover:text-white">
              Войти
            </button>
            <button type="button" onClick={() => navigate('/register')} className="tl-head h-7 cursor-pointer bg-[var(--pink)] px-3 font-bold uppercase tracking-[0.12em] text-[#0b0210] transition-all hover:brightness-110">
              Регистрация
            </button>
          </div>
        )}

        {!IS_WEB && <WindowControls />}
      </div>
    </div>
  );
};
