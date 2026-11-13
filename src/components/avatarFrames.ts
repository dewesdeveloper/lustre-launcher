import type { CSSProperties } from 'react';

export type AvatarFrameDef = {
  id: string;
  name: string;
  class: string;
  style: CSSProperties;
  character: string | null;
  glow: string;
  /** Декоративный SVG-слой поверх аватара (рамка-орнамент) */
  svg?: string;
  /** Эксклюзивная рамка Lustre Pro */
  pro?: boolean;
};

/**
 * «Тернии» — чёрные шипы, впивающиеся в аватар со всех сторон (по мотиву
 * готической рамки с колючками). Один контур верхней грани зеркалится
 * тремя матрицами, поэтому все четыре стороны симметричны.
 */
const THORN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 100 100'>
<g fill='#0b0210' stroke='#ff2d8f' stroke-width='1.2' stroke-linejoin='round'>
<g>
<path d='M0 0 L26 0 L17 6 L23 14 L11 9 L9 19 L3 7 Z'/>
<path d='M32 0 L40 0 L36 14 Z'/>
<path d='M45 0 L49 0 L47 8 Z'/>
<path d='M47 0 L53 0 L50 30 Z'/>
<path d='M62 0 L68 0 L65 12 Z'/>
<path d='M76 0 L82 0 L79 9 Z'/>
<path d='M86 0 L100 0 L93 17 L95 26 L88 18 Z'/>
</g>
<g transform='matrix(1 0 0 -1 0 100)'>
<path d='M0 0 L26 0 L17 6 L23 14 L11 9 L9 19 L3 7 Z'/>
<path d='M32 0 L40 0 L36 14 Z'/>
<path d='M45 0 L49 0 L47 8 Z'/>
<path d='M47 0 L53 0 L50 30 Z'/>
<path d='M62 0 L68 0 L65 12 Z'/>
<path d='M76 0 L82 0 L79 9 Z'/>
<path d='M86 0 L100 0 L93 17 L95 26 L88 18 Z'/>
</g>
<g transform='matrix(0 1 1 0 0 0)'>
<path d='M0 0 L26 0 L17 6 L23 14 L11 9 L9 19 L3 7 Z'/>
<path d='M32 0 L40 0 L36 14 Z'/>
<path d='M45 0 L49 0 L47 8 Z'/>
<path d='M47 0 L53 0 L50 30 Z'/>
<path d='M62 0 L68 0 L65 12 Z'/>
<path d='M76 0 L82 0 L79 9 Z'/>
<path d='M86 0 L100 0 L93 17 L95 26 L88 18 Z'/>
</g>
<g transform='matrix(0 -1 -1 0 100 100)'>
<path d='M0 0 L26 0 L17 6 L23 14 L11 9 L9 19 L3 7 Z'/>
<path d='M32 0 L40 0 L36 14 Z'/>
<path d='M45 0 L49 0 L47 8 Z'/>
<path d='M47 0 L53 0 L50 30 Z'/>
<path d='M62 0 L68 0 L65 12 Z'/>
<path d='M76 0 L82 0 L79 9 Z'/>
<path d='M86 0 L100 0 L93 17 L95 26 L88 18 Z'/>
</g>
</g>
</svg>`;

/**
 * «Крылья» — орнаментальная рамка: «перья» в углах, медальон по центру грани
 * и шеврон под ним (по мотиву набора рамок с ушами-перьями). Светлые обводки
 * на тёмной подложке читаются поверх любого аватара.
 */
const WINGS_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 100 100'>
<g fill='#171230' stroke='#cfc6e8' stroke-width='1.3' stroke-linejoin='round'>
<g>
<path d='M0 0 L36 0 L27 5 L36 12 L19 8 L26 17 L9 11 L14 23 L0 9 Z'/>
<path d='M0 0 L0 36 L5 27 L12 36 L8 19 L17 26 L11 9 L23 14 L9 0 Z'/>
<circle cx='50' cy='1' r='5'/>
<path d='M50 21 L56 27 L50 33 L44 27 Z'/>
</g>
<g transform='matrix(1 0 0 -1 0 100)'>
<path d='M0 0 L36 0 L27 5 L36 12 L19 8 L26 17 L9 11 L14 23 L0 9 Z'/>
<path d='M0 0 L0 36 L5 27 L12 36 L8 19 L17 26 L11 9 L23 14 L9 0 Z'/>
<circle cx='50' cy='1' r='5'/>
<path d='M50 21 L56 27 L50 33 L44 27 Z'/>
</g>
<g transform='matrix(0 1 1 0 0 0)'>
<path d='M0 0 L36 0 L27 5 L36 12 L19 8 L26 17 L9 11 L14 23 L0 9 Z'/>
<path d='M0 0 L0 36 L5 27 L12 36 L8 19 L17 26 L11 9 L23 14 L9 0 Z'/>
<circle cx='50' cy='1' r='5'/>
<path d='M50 21 L56 27 L50 33 L44 27 Z'/>
</g>
<g transform='matrix(0 -1 -1 0 100 100)'>
<path d='M0 0 L36 0 L27 5 L36 12 L19 8 L26 17 L9 11 L14 23 L0 9 Z'/>
<path d='M0 0 L0 36 L5 27 L12 36 L8 19 L17 26 L11 9 L23 14 L9 0 Z'/>
<circle cx='50' cy='1' r='5'/>
<path d='M50 21 L56 27 L50 33 L44 27 Z'/>
</g>
</g>
</svg>`;

/** Рамка-градиент с пульсацией и значком-эмодзи в углу аватара */
const pulsing = (id: string, name: string, background: string, character: string | null, glow: string, extra: Partial<AvatarFrameDef> = {}): AvatarFrameDef =>
  ({ id, name, class: 'animate-pulse', style: { background }, character, glow, ...extra });

/** Рамка-орнамент: тёмная подложка и SVG-узор поверх аватара */
const ornament = (id: string, name: string, background: string, glow: string, svg: string): AvatarFrameDef =>
  ({ id, name, class: '', style: { background }, character: null, glow, svg });

// id рамок хранятся у пользователей и в магазине — менять их нельзя.
// Классы свечения (glow) пишутся целиком: сборщик стилей находит только полные строки.
export const AVATAR_FRAMES: AvatarFrameDef[] = [
  { id: 'none', name: 'Обычный', class: 'border-white/10', style: {}, character: null, glow: '' },

  pulsing('neon-vibe', 'Неоновый Lustre', 'conic-gradient(from 0deg, #FF006E, #8338EC, #3A86FF, #FF006E)', '✨',
    'shadow-[0_0_20px_rgb(var(--accent-rgb)/0.6)]'),
  pulsing('cyber-tech', 'Кибер-драйв', 'linear-gradient(45deg, #3A86FF, #ffffff, #00f5d4, #3A86FF)', '💾',
    'shadow-[0_0_25px_rgba(58,134,255,0.5)]'),
  pulsing('dragon-soul', 'Золотой дракон', 'conic-gradient(from 180deg, #facc15, #854d0e, #fef08a, #facc15)', '🐉',
    'shadow-[0_0_30px_rgba(234,179,8,0.4)]'),
  pulsing('void-echo', 'Эхо пустоты', 'radial-gradient(circle, #8338EC, #111, #8338EC)', '👁️',
    'shadow-[0_0_35px_rgba(131,56,236,0.5)]'),
  pulsing('inferno', 'Рыцарь преисподней', 'linear-gradient(to top, #ff4d00, #ffae00, #ff4d00)', '🔥',
    'shadow-[0_0_25px_#ff4d00]'),
  pulsing('obsidian', 'Обсидиановый клинок', 'linear-gradient(135deg, #111, #444, #111)', '💎',
    'shadow-[0_0_20px_rgba(255,255,255,0.15)]'),

  ornament('thorn-crown', 'Тернии', 'linear-gradient(160deg, #171026, #0b0210 60%, #2a0d1c)',
    'shadow-[0_0_24px_rgba(255,45,143,0.35)]', THORN_SVG),
  ornament('ornate-wings', 'Крылья', 'linear-gradient(135deg, #1a1533, #0d0b19 55%, #241a3d)',
    'shadow-[0_0_24px_rgba(131,56,236,0.4)]', WINGS_SVG),

  // выдаётся подписчикам Lustre Pro без своей рамки
  pulsing('pro', 'Lustre Pro', 'conic-gradient(from 0deg, #facc15, #FF006E, #8338EC, #22d3ee, #facc15)', null,
    'shadow-[0_0_30px_rgba(250,204,21,0.55)]', { pro: true }),
];
