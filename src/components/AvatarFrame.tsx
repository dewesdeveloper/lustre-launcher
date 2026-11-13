import { IconCrown } from '@tabler/icons-react';
import { AVATAR_FRAMES, type AvatarFrameDef } from './avatarFrames';

type FrameSize = 'xxs' | 'xs' | 'small' | 'medium' | 'large' | 'xl';

type AvatarFrameProps = {
  avatarUrl?: string;
  /** Рамка-пресет из AVATAR_FRAMES */
  frameId?: string;
  /** Рамка-картинка из магазина — важнее пресета */
  frameUrl?: string;
  size?: FrameSize;
  className?: string;
  isPro?: boolean;
};

/** Размер квадрата и скругление под каждый размер аватара */
const BOX: Record<FrameSize, [box: string, radius: string]> = {
  xxs: ['h-4 w-4', 'rounded-[3px]'],
  xs: ['h-8 w-8', 'rounded-[0.4rem]'],
  small: ['h-10 w-10', 'rounded-[0.3rem]'],
  medium: ['h-16 w-16', 'rounded-[0.6rem]'],
  large: ['h-28 w-28', 'rounded-[0.8rem]'],
  xl: ['h-32 w-32', 'rounded-[1rem]'],
};

/** Положение и размер значка короны Pro: [классы, размер иконки] */
function crownBadge(size: FrameSize): [string, number] {
  if (size === 'small') return ['w-5 h-5 -bottom-1 -right-1', 10];
  if (size === 'xs') return ['w-4 h-4 -bottom-1 -right-1', 8];
  return ['w-7 h-7 -bottom-1.5 -right-1.5', 14];
}

/** Какой пресет рисовать: у подписчика Pro без своей рамки — эксклюзивная рамка Pro */
function pickPreset(frameId: string | undefined, frameUrl: string | undefined, isPro: boolean): AvatarFrameDef {
  const wantsPro = isPro && !frameUrl && (!frameId || frameId === 'none');
  const id = wantsPro ? 'pro' : frameId;
  return AVATAR_FRAMES.find((f) => f.id === id) ?? AVATAR_FRAMES[0];
}

/**
 * Аватар в рамке. Картинка-рамка (frameUrl) рисуется поверх аватара; иначе — CSS-пресет
 * с подложкой, свечением и, если есть, SVG-орнаментом и эмодзи в углу. У подписчиков Pro
 * в углу корона. В самом мелком размере (xxs, панель навигации) значков в углу нет.
 */
export default function AvatarFrame({ avatarUrl, frameId, frameUrl, size = 'large', className = '', isPro = false }: AvatarFrameProps) {
  const [box, radius] = BOX[size] ?? BOX.large;
  const preset = pickPreset(frameId, frameUrl, isPro);
  const custom = Boolean(frameUrl);
  const nano = size === 'xxs';
  const corner = !nano && size !== 'xs';
  const [crownPos, crownIcon] = crownBadge(size);

  return (
    <div className={`relative ${box} shrink-0 ${radius} flex items-center justify-center ${custom ? '' : preset.glow} ${className}`}>
      {!custom && <div className={`absolute inset-0 ${radius} overflow-hidden ${preset.class}`} style={preset.style} />}

      <div className={`absolute ${nano ? 'inset-[2px]' : 'inset-[3px]'} ${radius} z-10 overflow-hidden bg-[#1a1926]`}>
        <img src={avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Moby'} alt="" className="h-full w-full object-cover" />
      </div>

      {custom && <img src={frameUrl} alt="" className="pointer-events-none absolute inset-0 z-20 h-full w-full object-cover" />}

      {/* SVG-орнамент пресета (шипы, крылья) поверх аватара */}
      {!custom && preset.svg && !nano && (
        <div className="pointer-events-none absolute inset-0 z-20" dangerouslySetInnerHTML={{ __html: preset.svg }} />
      )}

      {!custom && !isPro && corner && preset.character && (
        <div className="absolute -bottom-1 -right-1 z-20 flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#0a0a0a] text-sm shadow-xl">
          {preset.character}
        </div>
      )}

      {isPro && !nano && (
        <div
          title="Lustre Pro"
          className={`absolute ${crownPos} z-30 flex items-center justify-center rounded-xl border border-white/25 bg-gradient-to-br from-amber-400 to-accent shadow-[0_0_14px_rgba(250,204,21,0.7)]`}
        >
          <IconCrown size={crownIcon} className="text-white" />
        </div>
      )}
    </div>
  );
}
