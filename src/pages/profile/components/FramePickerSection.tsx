import type { Dispatch, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCheck, IconCrown, IconPalette, IconSquareRounded, IconTrash } from '@tabler/icons-react';
import ImageUpload from '../../../components/ImageUpload';
import AvatarFrame from '../../../components/AvatarFrame';
import { AVATAR_FRAMES } from '../../../components/avatarFrames';
import { useAuth } from '../../../context/AuthContext';
import type { ShopItem } from '../../../api/shop';
import type { EditProfileForm } from '../constants';

type FramePickerSectionProps = {
  userId: number;
  avatarUrl?: string;
  formData: EditProfileForm;
  setFormData: Dispatch<SetStateAction<EditProfileForm>>;
  isFrameLocked: (frameId: string) => boolean;
  imageFrameItems: ShopItem[];
};

export default function FramePickerSection({
  userId,
  avatarUrl,
  formData,
  setFormData,
  isFrameLocked,
  imageFrameItems,
}: FramePickerSectionProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPro = user?.profile?.is_pro === true;
  // Своя рамка — функция Lustre Pro (сервер проверяет то же); персонал — без ограничений
  const role = (user as any)?.role;
  const canUploadFrame = isPro || role === 'admin' || role === 'manager';

  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted flex items-center gap-2 mb-3">
          <IconSquareRounded size={14} /> Своя рамка (PNG с прозрачным центром)
        </label>
        {canUploadFrame ? (
          <ImageUpload
            folder="frames"
            userId={userId}
            currentUrl={formData.avatar_frame_url}
            onUpload={(url) => setFormData({ ...formData, avatar_frame_url: url })}
            onRemove={() => setFormData({ ...formData, avatar_frame_url: '' })}
            label="Загрузить рамку"
          />
        ) : (
          <div className="flex items-center gap-5 flex-wrap">
            <AvatarFrame avatarUrl={avatarUrl} frameUrl={formData.avatar_frame_url || undefined} frameId={formData.frame_id} size="large" />
            <div className="flex-1 min-w-[200px]">
              <p className="tl-term text-[15px] text-white flex items-center gap-2">
                <IconCrown size={15} className="text-amber-400" /> Своя рамка — с Lustre Pro
              </p>
              <p className="tl-term text-[14px] text-[var(--muted-2)] mt-1.5">
                Без подписки можно выбрать рамку из купленных в магазине ниже.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => navigate('/subscriptions')} className="tl-btn solid">
                  <IconCrown size={14} /> Оформить Pro
                </button>
                {formData.avatar_frame_url && (
                  <button type="button" onClick={() => setFormData({ ...formData, avatar_frame_url: '' })} className="tl-btn ghost">
                    <IconTrash size={14} /> Убрать рамку
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {formData.avatar_frame_url && (
          <div className="mt-4 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.03)] p-4">
            <p className="tl-term text-[15px] tl-pink">Своя рамка перекрывает пресеты ниже</p>
          </div>
        )}
      </div>

      <div className="tl-panel p-[22px]">
        <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted flex items-center gap-2 mb-3">
          <IconPalette size={14} /> Купленные рамки
        </label>
        <div className="grid grid-cols-2 gap-4">
          {AVATAR_FRAMES.filter((f) => ('pro' in f && f.pro ? isPro : f.id === 'none' || !isFrameLocked(f.id))).map((frame) => {
            const active = formData.frame_id === frame.id && !formData.avatar_frame_url;
            return (
              <button
                key={frame.id}
                onClick={() => setFormData({ ...formData, frame_id: frame.id, avatar_frame_url: '' })}
                className={`flex items-center gap-4 p-4 border transition-all relative ${active ? 'border-accent bg-[rgb(var(--accent-rgb)/.06)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
              >
                <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                  <AvatarFrame avatarUrl={avatarUrl} frameId={frame.id} size="small" />
                </div>
                <span className={`tl-head text-[10px] font-bold uppercase tracking-[0.1em] ${active ? 'text-accent' : 'tl-muted'}`}>{frame.name}</span>
                {active && <IconCheck size={15} className="text-accent ml-auto" />}
              </button>
            );
          })}
        </div>
      </div>

      {imageFrameItems.length > 0 && (
        <div className="tl-panel p-[22px]">
          <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted flex items-center gap-2 mb-3">
            <IconSquareRounded size={14} /> Купленные рамки-картинки
          </label>
          <div className="grid grid-cols-2 gap-4">
            {imageFrameItems.map((item) => {
              const active = formData.avatar_frame_url === item.payload;
              return (
                <button
                  key={item.id}
                  onClick={() => setFormData({ ...formData, frame_id: 'none', avatar_frame_url: item.payload })}
                  className={`flex items-center gap-4 p-4 border transition-all relative ${active ? 'border-accent bg-[rgb(var(--accent-rgb)/.06)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
                >
                  <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                    <AvatarFrame avatarUrl={avatarUrl} frameUrl={item.payload} size="small" />
                  </div>
                  <span className={`tl-head text-[10px] font-bold uppercase tracking-[0.1em] ${active ? 'text-accent' : 'tl-muted'}`}>{item.name}</span>
                  {active && <IconCheck size={15} className="text-accent ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
