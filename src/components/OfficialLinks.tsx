import { Link } from 'react-router-dom';
import { Mail, Send, Users } from 'lucide-react';

/** Официальное сообщество LustreHub в Lustre и канал в Telegram */
export const OFFICIAL_COMMUNITY_PATH = '/community/8';
export const OFFICIAL_TELEGRAM_URL = 'https://t.me/lustrehubpto';
/** Почта службы поддержки — для обращений, претензий и правообладателей */
export const SUPPORT_EMAIL = 'developerdewes@gmail.com';

// Заметные кнопки: розовая рамка со свечением, при наведении — заливка акцентом
const BTN =
  'group inline-flex items-center gap-2 border border-[var(--pink)] bg-[rgb(var(--accent-rgb)/.10)] px-3.5 py-2 '
  + 'tl-head text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow-[var(--glow-sm)] '
  + 'transition-all hover:bg-[var(--pink)] hover:shadow-[var(--glow)]';

/**
 * Ссылки на официальные каналы — в футерах сайта и лаунчера. Telegram открывается во внешнем
 * браузере (в лаунчере это делает обработчик новых окон Electron).
 */
export default function OfficialLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Официальные каналы Lustre" className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      <span className="tl-head mr-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent" style={{ textShadow: 'var(--glow-sm)' }}>
        Мы на связи:
      </span>
      <Link to={OFFICIAL_COMMUNITY_PATH} className={BTN}>
        <Users size={15} className="text-accent transition-colors group-hover:text-white" /> Сообщество LustreHub
      </Link>
      <a href={OFFICIAL_TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className={BTN}>
        <Send size={15} className="text-accent transition-colors group-hover:text-white" /> Наш Telegram
      </a>
      <a href={`mailto:${SUPPORT_EMAIL}`} className={BTN} title="Почта поддержки">
        <Mail size={15} className="text-accent transition-colors group-hover:text-white" /> {SUPPORT_EMAIL}
      </a>
    </nav>
  );
}
