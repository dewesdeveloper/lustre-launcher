import { IconBrandSteam, IconBrandItch } from '@tabler/icons-react';

export type StoreId = 'steam' | 'itch' | 'gamejolt';

export interface StoreMeta {
  id: StoreId;
  label: string;
  color: string;
}

export const STORES: StoreMeta[] = [
  { id: 'steam', label: 'Steam', color: '#66c0f4' },
  { id: 'itch', label: 'itch.io', color: '#fa5c5c' },
  { id: 'gamejolt', label: 'GameJolt', color: '#5ac928' },
];

export function storeLabel(id: string): string {
  return STORES.find((s) => s.id === id)?.label || id;
}

export function storeColor(id: string): string {
  return STORES.find((s) => s.id === id)?.color || 'currentColor';
}

/** Иконка магазина-оригинала. */
export function StoreIcon({ store, size = 16, className }: { store: string; size?: number; className?: string }) {
  if (store === 'steam') return <IconBrandSteam size={size} className={className} />;
  if (store === 'itch') return <IconBrandItch size={size} className={className} />;
  if (store === 'gamejolt') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-label="GameJolt">
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#5ac928" />
        <text
          x="12"
          y="16.5"
          textAnchor="middle"
          fontSize="10"
          fontWeight="900"
          fill="#0a0a0c"
          fontFamily="Arial, sans-serif"
        >
          GJ
        </text>
      </svg>
    );
  }
  return null;
}
