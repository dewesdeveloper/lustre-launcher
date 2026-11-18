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

/** Правовые документы сервиса — ссылки в футерах сайта и лаунчера */
export const LEGAL_DOCS = [
  { to: '/terms', label: 'Пользовательское соглашение' },
  { to: '/privacy', label: 'Политика конфиденциальности' },
  { to: '/subscriber-agreement', label: 'Соглашение подписчика (оферта)' },
  { to: '/legal', label: 'Правовая информация' },
  { to: '/support', label: 'Поддержка' },
];

export function DocLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Документы" className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 tl-term text-[14px] ${className}`}>
      {LEGAL_DOCS.map((d) => (
        <Link key={d.to} to={d.to} className="text-[var(--muted)] underline-offset-4 transition-colors hover:text-white hover:underline">
          {d.label}
        </Link>
      ))}
    </nav>
  );
}

/** Нижняя полоса для страниц без своего футера (гостевые каталог, подписка, документы) */
export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] px-8 py-5">
      <span className="tl-term text-[13px] text-[var(--muted-2)]">© 2026 Lustre</span>
      <DocLinks />
      <a href={`mailto:${SUPPORT_EMAIL}`} className="tl-term text-[14px] text-[var(--muted)] hover:text-white">{SUPPORT_EMAIL}</a>
    </footer>
  );
}
