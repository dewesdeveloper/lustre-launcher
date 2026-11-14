import { IconDeviceGamepad2, IconDots, IconHeart, IconMessages, IconPalette } from '@tabler/icons-react';
import type { ComponentType } from 'react';
import type { Community, CommunityFormat } from '../../api/community';

type FormatInfo = {
  id: CommunityFormat;
  label: string;
  hint: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  /** цвет метки формата */
  tone: string;
};

/** Форматы сообщества в порядке показа (игра из каталога — только у формата «Игры») */
export const COMMUNITY_FORMATS: FormatInfo[] = [
  { id: 'social', label: 'Общение', hint: 'Знакомства, болталка, поиск друзей', Icon: IconMessages, tone: 'text-cyan' },
  { id: 'games', label: 'Игры', hint: 'Сообщество по игре из каталога Lustre', Icon: IconDeviceGamepad2, tone: 'text-accent' },
  { id: 'creative', label: 'Творчество', hint: 'Арт, музыка, видео, моддинг', Icon: IconPalette, tone: 'text-violet' },
  { id: 'hobby', label: 'Хобби', hint: 'Увлечения и интересы вне игр', Icon: IconHeart, tone: 'text-amber-300' },
  { id: 'other', label: 'Другое', hint: 'Всё, что не подошло под остальные', Icon: IconDots, tone: 'text-[var(--muted)]' },
];

/** Формат сообщества (у старых сообществ без формата — «Игры») */
export function formatOf(c: Pick<Community, 'format'>): FormatInfo {
  return COMMUNITY_FORMATS.find((f) => f.id === c.format) || COMMUNITY_FORMATS[1];
}

/** Подпись категории: игра у формата «Игры», иначе название формата */
export function categoryLabel(c: Pick<Community, 'format' | 'game'>): string {
  return c.game?.title || formatOf(c).label;
}
