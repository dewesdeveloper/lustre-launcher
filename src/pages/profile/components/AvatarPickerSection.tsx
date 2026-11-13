import type { Dispatch, SetStateAction } from 'react';
import { IconId, IconCheck } from '@tabler/icons-react';
import type { ShopItem } from '../../../api/shop';
import type { EditProfileForm } from '../constants';
import type { useProfileImages } from '../useProfileImages';
import ProfileImageField from './ProfileImageField';

type AvatarPickerSectionProps = {
  userId: number;
  formData: EditProfileForm;
  setFormData: Dispatch<SetStateAction<EditProfileForm>>;
  avatarShopItems: ShopItem[];
  images: ReturnType<typeof useProfileImages>;
  uploadLimitMB: number;
};

export default function AvatarPickerSection({
  userId,
  formData,
  setFormData,
  avatarShopItems,
  images,
  uploadLimitMB,
}: AvatarPickerSectionProps) {
  return (
    <div className="tl-panel p-[22px]">
      <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>АВАТАР</h3>
      <ProfileImageField
        kind="avatar"
        url={formData.avatar_url}
        fallbackUrl={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`}
        uploading={images.uploading.avatar}
        error={images.errors.avatar}
        uploadLimitMB={uploadLimitMB}
        onFile={(file) => images.handleFile('avatar', file)}
        onRecrop={() => images.recrop('avatar', formData.avatar_url)}
        onRemove={() => setFormData((prev) => ({ ...prev, avatar_url: '' }))}
      />

      {avatarShopItems.length > 0 && (
        <div className="pt-5 mt-5 border-t border-[var(--line)]">
          <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted flex items-center gap-2 mb-3">
            <IconId size={14} /> Купленные аватары
          </label>
          <div className="grid grid-cols-3 gap-3">
            {avatarShopItems.map((item) => {
              const active = formData.avatar_url === item.payload;
              return (
                <button
                  key={item.id}
                  onClick={() => setFormData((prev) => ({ ...prev, avatar_url: item.payload }))}
                  title={item.name}
                  className={`relative overflow-hidden border transition-all ${active ? 'border-accent bg-[rgb(var(--accent-rgb)/.06)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
                >
                  <img src={item.image_url} alt="" draggable={false} className="w-full aspect-square object-cover" />
                  {active && <span className="absolute top-2 right-2 w-6 h-6 bg-black/70 border border-accent flex items-center justify-center text-accent"><IconCheck size={14} /></span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
