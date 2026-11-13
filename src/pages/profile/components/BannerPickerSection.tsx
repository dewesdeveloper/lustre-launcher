import type { Dispatch, SetStateAction } from 'react';
import { IconCheck, IconPhoto } from '@tabler/icons-react';
import type { ShopItem } from '../../../api/shop';
import type { EditProfileForm } from '../constants';
import type { useProfileImages } from '../useProfileImages';
import ProfileImageField from './ProfileImageField';

type BannerPickerSectionProps = {
  userId: number;
  formData: EditProfileForm;
  setFormData: Dispatch<SetStateAction<EditProfileForm>>;
  bannerShopItems: ShopItem[];
  images: ReturnType<typeof useProfileImages>;
  uploadLimitMB: number;
};

export default function BannerPickerSection({ formData, setFormData, bannerShopItems, images, uploadLimitMB }: BannerPickerSectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>БАННЕР</h3>
        <ProfileImageField
          kind="banner"
          url={formData.banner_url}
          uploading={images.uploading.banner}
          error={images.errors.banner}
          uploadLimitMB={uploadLimitMB}
          onFile={(file) => images.handleFile('banner', file)}
          onRecrop={() => images.recrop('banner', formData.banner_url)}
          onRemove={() => setFormData((prev) => ({ ...prev, banner_url: '' }))}
        />
      </div>

      {bannerShopItems.length > 0 && (
        <div className="tl-panel p-[22px]">
          <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted flex items-center gap-2 mb-3">
            <IconPhoto size={14} /> Купленные фоны
          </label>
          <div className="grid grid-cols-2 gap-3">
            {bannerShopItems.map((item) => {
              const active = formData.banner_url === item.payload;
              return (
                <button
                  key={item.id}
                  onClick={() => setFormData((prev) => ({ ...prev, banner_url: item.payload }))}
                  className={`relative overflow-hidden border transition-all text-left ${active ? 'border-accent bg-[rgb(var(--accent-rgb)/.06)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
                >
                  <img src={item.image_url} alt="" draggable={false} className="w-full h-20 object-cover" />
                  <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--line)]">
                    <span className={`tl-head text-[10px] font-bold uppercase tracking-[0.1em] truncate ${active ? 'text-accent' : 'tl-muted'}`}>{item.name}</span>
                    {active && <IconCheck size={15} className="text-accent shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
