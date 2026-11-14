import type { ComponentType } from 'react';
import {
  Award, BookOpen, Bird, Bug, Camera, Clapperboard, Compass, Crown, Eraser, Eye, Flag, Flame, Footprints,
  Forward, Gem, Ghost, HardDriveDownload, Heart, HeartHandshake, Hourglass, Languages, Library, Medal,
  Megaphone, MessageCircle, MessageSquareText, Mic, Moon, Phone, Rocket, Shapes, Share2, ShieldCheck,
  Shirt, ShoppingCart, Sparkles, Star, Timer, Trophy, Users, UsersRound,
} from 'lucide-react';

type Glyph = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** Значок → иконка; сгруппировано по тому, за что значок выдаётся */
const GLYPHS: Record<string, Glyph> = {
  // лаунчер и библиотека
  first_steps: Rocket, collector: BookOpen, librarian: Library, adult_explorer: Eye,
  // игры и время
  marathon_10: Timer, marathon_100: Hourglass, marathon_500: Footprints, night_watch: Moon,
  one_game: Heart, omnivore: Shapes, pioneer: Compass, veteran: ShieldCheck,
  // скачивания и установка
  installer_10: HardDriveDownload, installer_50: HardDriveDownload, polyglot: Languages,
  multi_source: Share2, tidy: Eraser,
  // общение
  social: Users, chatterbox: MessageCircle, team_player: UsersRound, on_call: Phone, voice_regular: Mic,
  postman: Forward, inner_circle: HeartHandshake, wall_keeper: MessageSquareText,
  // магазин и профиль
  patron: ShoppingCart, stylist: Sparkles, magnate: Gem, streak_7: Flame, streak_30: Flame,
  wardrobe_10: Shirt, wardrobe_25: Shirt, pro_patron: Crown,
  // отзывы
  reviewer: Star, critic: Clapperboard,
  // сообщества
  founder: Flag, activist: Megaphone, photographer: Camera,
  // сезоны
  season_bronze: Medal, season_silver: Award, season_gold: Trophy, season_legend: Crown,
  // секретные
  early_bird: Bird, bug_hunter: Bug, lost_404: Ghost,
};

/** Цвет редкости (как у чипов редкости в лаунчере) */
const INK: Record<string, string> = {
  common: '#b9b2c9',
  rare: '#67e8f9',
  epic: '#c4b5fd',
  legendary: '#fcd34d',
};

const BG = '#0b0710';

type BadgeEmblemProps = {
  /** Код значка; anniversary_<год> рисуется цифрами года */
  code?: string;
  rarity?: string;
  size?: number;
  /** Не получен — серый и полупрозрачный */
  dim?: boolean;
  className?: string;
};

/**
 * Эмблема значка: квадратная рамка с уголками акцентного цвета лаунчера.
 * Редкость читается по рамке и её цвету: обычный — одинарная, редкий — двойная,
 * эпический — двойная с полосами, легендарный — залитая.
 */
export default function BadgeEmblem({ code = '', rarity = 'common', size = 48, dim = false, className = '' }: BadgeEmblemProps) {
  const ink = INK[rarity] ?? INK.common;
  const legendary = rarity === 'legendary';
  const double = rarity === 'rare' || rarity === 'epic' || legendary;
  const striped = rarity === 'epic';
  const [kind, year] = code.split('_');
  const anniversary = kind === 'anniversary' && !!year;
  const Glyph = GLYPHS[code] ?? Award;

  const px = (k: number) => Math.max(1, Math.round(size * k));
  const gap = double ? px(0.09) : 0; // отступ внутренней рамки от внешней
  const tick = px(0.18); // длина уголков
  const fg = legendary ? BG : ink;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size, filter: dim ? 'grayscale(1) opacity(0.45)' : undefined }}
    >
      {/* внешняя тонкая рамка у редких и выше */}
      {double && <span aria-hidden className="absolute inset-0" style={{ border: `1px solid ${ink}`, opacity: 0.5 }} />}

      <div
        className="absolute flex items-center justify-center overflow-hidden"
        style={{ inset: gap, border: `${size >= 40 ? 2 : 1}px solid ${ink}`, background: legendary ? ink : BG }}
      >
        {anniversary
          ? <span className="tl-pixel leading-none" style={{ fontSize: px(0.34), color: fg }}>{year}</span>
          : <Glyph size={px(0.44)} color={fg} strokeWidth={2} />}
        {striped && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0"
            style={{
              height: px(0.16),
              borderTop: `1px solid ${ink}`,
              background: `repeating-linear-gradient(-55deg, ${ink} 0 ${px(0.04)}px, transparent ${px(0.04)}px ${px(0.09)}px)`,
            }}
          />
        )}
      </div>

      {/* уголки акцентного цвета лаунчера: слева сверху и справа снизу */}
      <span aria-hidden className="absolute left-0 top-0" style={{ width: tick, height: tick, borderTop: '2px solid var(--pink)', borderLeft: '2px solid var(--pink)' }} />
      <span aria-hidden className="absolute bottom-0 right-0" style={{ width: tick, height: tick, borderBottom: '2px solid var(--pink)', borderRight: '2px solid var(--pink)' }} />
    </div>
  );
}
