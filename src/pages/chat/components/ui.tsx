// Мелкие общие элементы окна сообщений (в стилистике TL: прямые углы, 1px-рамки, неон).

import type { ReactNode } from 'react';
import { Check, CheckCheck, Clock3 } from 'lucide-react';
import { FALLBACK_AVATAR, GROUP_FALLBACK } from '../model';

export function ChatAvatar({
  src, size = 40, online, playing, group, className = '',
}: {
  src?: string;
  size?: number;
  online?: boolean;
  playing?: boolean;
  group?: boolean;
  className?: string;
}) {
  return (
    <span className={`relative inline-block shrink-0 ${className}`} style={{ width: size, height: size }}>
      <img
        src={src || (group ? GROUP_FALLBACK : FALLBACK_AVATAR)}
        alt=""
        draggable={false}
        className="w-full h-full object-cover bg-black border border-[var(--line)] select-none"
        style={{ borderRadius: 'var(--tl-radius)' }}
      />
      {(online || playing) && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 border-2 border-[var(--panel)] ${playing ? 'bg-accent' : 'bg-[var(--green2)]'}`}
          style={{ width: Math.max(9, size / 4), height: Math.max(9, size / 4) }}
        />
      )}
    </span>
  );
}

export function IconBtn({
  title, onClick, active, children, className = '', disabled,
}: {
  title: string;
  onClick?: () => void;
  active?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 flex items-center justify-center border transition-colors disabled:opacity-30 ${
        active
          ? 'text-accent border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.14)]'
          : 'text-pearl/70 border-transparent hover:text-accent hover:border-[var(--line)] hover:bg-[rgb(var(--accent-rgb)/.08)]'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Статус доставки своего сообщения: часы → ✓ → ✓✓ (прочитано — акцентом). */
export function DeliveryMark({ pending, read, className = '' }: { pending?: boolean; read?: boolean; className?: string }) {
  if (pending) return <Clock3 size={12} className={`shrink-0 opacity-60 ${className}`} />;
  if (read) return <CheckCheck size={14} className={`shrink-0 text-accent ${className}`} />;
  return <Check size={14} className={`shrink-0 opacity-70 ${className}`} />;
}

export function CountBadge({ n, muted }: { n: number; muted?: boolean }) {
  if (n <= 0) return null;
  return (
    <span
      className={`shrink-0 min-w-[20px] h-[18px] px-1.5 flex items-center justify-center tl-num text-[10px] leading-none ${
        muted ? 'bg-pearl/25 text-black' : 'bg-accent text-black shadow-[var(--glow-sm)]'
      }`}
    >
      {n > 999 ? '999+' : n}
    </span>
  );
}

/** Подсветка вхождений поискового запроса. */
export function Highlight({ text, query }: { text: string; query?: string }) {
  const q = query?.trim();
  if (!q || q.length < 2) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let i = lower.indexOf(needle);
  while (i !== -1) {
    if (i > from) parts.push(text.slice(from, i));
    parts.push(
      <mark key={i} className="bg-[rgb(var(--accent-rgb)/.45)] text-white px-0.5">{text.slice(i, i + q.length)}</mark>,
    );
    from = i + q.length;
    i = lower.indexOf(needle, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

/** Текст сообщения: ссылки кликабельны (как в Telegram), переносы сохраняются. */
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

export function RichText({ text, query }: { text: string; query?: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? (
        <a
          key={i}
          href={p}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[var(--cyan2)] underline decoration-dotted underline-offset-2 hover:text-white break-all"
        >
          <Highlight text={p} query={query} />
        </a>
      ) : (
        <Highlight key={i} text={p} query={query} />
      )))}
    </>
  );
}

/** Сообщение только из эмодзи (1–3) — показываем крупно, без пузыря, как в Telegram. */
const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*\s*){1,3}$/u;

export function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  return !!t && t.length <= 24 && EMOJI_ONLY_RE.test(t);
}
