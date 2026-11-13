import type { Dispatch, SetStateAction } from 'react';
import { IconCheck, IconPalette } from '@tabler/icons-react';
import { PROFILE_THEMES, parseCustomThemeId } from '../../../components/profileThemes';
import type { ShopItem } from '../../../api/shop';
import type { EditProfileForm } from '../constants';

type ThemePickerSectionProps = {
  formData: EditProfileForm;
  setFormData: Dispatch<SetStateAction<EditProfileForm>>;
  isThemeLocked: (themeId: string) => boolean;
  customProfileThemes: ShopItem[];
};

export default function ThemePickerSection({ formData, setFormData, isThemeLocked, customProfileThemes }: ThemePickerSectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>ТЕМА СТРАНИЦЫ</h3>
        <p className="tl-term text-[15px] tl-muted mb-4">Выберите тему, которая изменит окружение вашего профиля</p>
        <div className="grid grid-cols-2 gap-4">
          {PROFILE_THEMES.filter((t) => !isThemeLocked(t.id)).map((theme) => {
            const active = formData.theme_id === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setFormData({ ...formData, theme_id: theme.id })}
                className={`flex flex-col gap-3 p-4 border transition-all text-left ${active ? 'border-accent bg-[rgb(var(--accent-rgb)/.08)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
              >
                <div className={`w-full h-12 border border-[var(--line)] ${theme.ambient}`} />
                <div className="flex items-center justify-between w-full">
                  <span className={`tl-head text-[10px] font-bold uppercase tracking-[0.1em] ${active ? 'text-accent' : 'tl-muted'}`}>{theme.name}</span>
                  {active && <IconCheck size={16} className="text-accent" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {customProfileThemes.length > 0 && (
        <div className="tl-panel p-[22px]">
          <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted flex items-center gap-2 mb-3">
            <IconPalette size={14} /> Купленные темы
          </label>
          <div className="grid grid-cols-2 gap-4">
            {customProfileThemes.map((item) => {
              const active = formData.theme_id === item.payload;
              const c = parseCustomThemeId(item.payload);
              return (
                <button
                  key={item.id}
                  onClick={() => setFormData({ ...formData, theme_id: item.payload })}
                  className={`flex flex-col gap-3 p-4 border transition-all text-left ${active ? 'border-accent bg-[rgb(var(--accent-rgb)/.08)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
                >
                  <div className="w-full h-12 border border-[var(--line)]" style={{ background: `linear-gradient(135deg, ${c?.accent || '#FF006E'}, ${c?.violet || '#8338EC'})` }} />
                  <div className="flex items-center justify-between w-full">
                    <span className={`tl-head text-[10px] font-bold uppercase tracking-[0.1em] ${active ? 'text-accent' : 'tl-muted'}`}>{item.name}</span>
                    {active && <IconCheck size={16} className="text-accent" />}
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
