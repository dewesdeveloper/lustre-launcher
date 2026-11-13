import type { ComponentType } from 'react';
import {
  Award, BookOpen, Camera, Clapperboard, Crown, Eye, Flag, Gem, Library, Medal, Megaphone,
  MessageCircle, Rocket, ShoppingCart, Sparkles, Star, Trophy, Users, UsersRound,
} from 'lucide-react';

type Glyph = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** Значок → иконка; сгруппировано по тому, за что значок выдаётся */
const GLYPHS: Record<string, Glyph> = {
  // лаунчер и библиотека
  first_steps: Rocket, collector: BookOpen, librarian: Library, adult_explorer: Eye,
  // общение
  social: Users, chatterbox: MessageCircle, team_player: UsersRound,
  // магазин
  patron: ShoppingCart, stylist: Sparkles, magnate: Gem,
  // отзывы
  reviewer: Star, critic: Clapperboard,
  // сообщества
  founder: Flag, activist: Megaphone, photographer: Camera,
  // сезоны
  season_bronze: Medal, season_silver: Award, season_gold: Trophy, season_legend: Crown,
};

/** Оформление по редкости: градиент кольца, цвет свечения и цвет знака */
type Tier = { ring: string; halo: string; ink: string };
const TIERS: Record<string, Tier> = {
  common: { ring: 'from-white/25 via-white/10 to-white/5', halo: 'rgba(255,255,255,0.12)', ink: '#cbd5e1' },
  rare: { ring: 'from-cyan-400 via-cyan-500/40 to-cyan-500/10', halo: 'rgba(34,211,238,0.4)', ink: '#67e8f9' },
  epic: { ring: 'from-violet-400 via-violet-500/40 to-violet-500/10', halo: 'rgba(139,92,246,0.45)', ink: '#c4b5fd' },
  legendary: { ring: 'from-amber-300 via-amber-400/40 to-amber-500/10', halo: 'rgba(250,204,21,0.5)', ink: '#fde68a' },
};

type BadgeEmblemProps = {
  /** Код значка; anniversary_<год> рисуется цифрами года */
  code?: string;
  rarity?: string;
  size?: number;
  /** Не получен — серый и полупрозрачный */
  dim?: boolean;
  className?: string;
};

/** Круглая медаль значка: кольцо цвета редкости, свечение и иконка (или год для юбилейных). */
export default function BadgeEmblem({ code = '', rarity = 'common', size = 48, dim = false, className = '' }: BadgeEmblemProps) {
  const tier = TIERS[rarity] ?? TIERS.common;
  const [kind, year] = code.split('_');
  const anniversary = kind === 'anniversary' && !!year;
  const Glyph = GLYPHS[code] ?? Award;
  const px = (k: number) => Math.round(size * k);

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size, filter: dim ? 'grayscale(1) opacity(0.45)' : undefined }}
    >
      <div
        className={`absolute inset-0 rounded-full bg-gradient-to-br ${tier.ring}`}
        style={{ padding: Math.max(2, px(0.05)), boxShadow: `0 0 ${px(0.3)}px ${tier.halo}` }}
      >
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/[0.06] bg-[#0b0b0f]">
          {anniversary
            ? <span className="font-black italic leading-none" style={{ fontSize: px(0.42), color: tier.ink }}>{year}</span>
            : <Glyph size={px(0.46)} color={tier.ink} strokeWidth={2.2} />}
        </div>
      </div>
      {/* световой блик сверху слева */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ background: 'radial-gradient(circle at 30% 24%, rgba(255,255,255,0.2), transparent 55%)' }}
      />
    </div>
  );
}
