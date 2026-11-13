import type { ShopItem } from '../../../api/shop';
import { RARITY_COLOR } from '../constants';

/** Цвет титула по редкости — тот же, что в шапке профиля */
export function titleColor(rarity?: string): string {
  return RARITY_COLOR[rarity || ''] || '#9CA3AF';
}

/**
 * Плашка титула — как она выглядит рядом с ником в профиле:
 * рамка и текст цветом редкости, верхний регистр, трекинг.
 */
export function TitleChip({
  text,
  rarity,
  className = '',
}: {
  text: string;
  rarity?: string;
  className?: string;
}) {
  const color = titleColor(rarity);
  return (
    <span
      className={`inline-flex max-w-full items-center px-2.5 py-1 border font-black uppercase tracking-widest ${className}`}
      style={{ color, borderColor: `${color}55`, background: `${color}1a` }}
    >
      <span className="truncate text-[10px]">{text}</span>
    </span>
  );
}

/**
 * Превью титула для витрины: мини-шапка профиля с плашкой по центру —
 * показывает, как титул будет смотреться под ником.
 */
export function TitleCardPreview({ item }: { item: ShopItem }) {
  const color = titleColor(item.rarity);

  return (
    <div className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 25%, ${color}2b, transparent 72%)` }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-transparent to-[#0b0912]" />

      <div className="relative h-full flex flex-col items-center justify-center gap-2 px-5">
        {/* мини-аватар */}
        <div
          className="w-12 h-12 rounded-full border"
          style={{ borderColor: `${color}55`, background: `linear-gradient(135deg, ${color}44, #0d0b13 70%)` }}
        />
        {/* ник */}
        <div className="h-1.5 w-14 rounded-full bg-white/15" />
        {/* сам титул */}
        <TitleChip text={item.payload} rarity={item.rarity} className="max-w-full" />
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">
          Так будет выглядеть
        </span>
      </div>
    </div>
  );
}

/** Превью для плитки/админки: плашка по центру на фоне редкости */
export function TitleTilePreview({ item }: { item: ShopItem }) {
  const color = titleColor(item.rarity);

  return (
    <div className="w-full h-full flex items-center justify-center relative overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 50%, ${color}33, transparent 70%)` }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-transparent to-[#09070c]" />
      <TitleChip text={item.payload} rarity={item.rarity} className="relative max-w-[85%]" />
    </div>
  );
}

export default TitleChip;
