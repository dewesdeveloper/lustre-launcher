import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useDialog } from '../../components/Dialogs';
import { isCustomThemeId } from '../../components/profileThemes';
import { getShop } from '../../api/shop';
import type { ShopData } from '../../api/shop';
import {
  IconCheck, IconTrash, IconX
} from '@tabler/icons-react';
import { parseShowcases, parseTags } from './constants';
import { PROFILE_IMAGE_ACCEPT, type EditProfileForm, type ImageKind } from './constants';
import EditProfileTabs, { type Tab } from './components/EditProfileTabs';
import InputBlock from './components/InputBlock';
import AvatarPickerSection from './components/AvatarPickerSection';
import FramePickerSection from './components/FramePickerSection';
import BannerPickerSection from './components/BannerPickerSection';
import ThemePickerSection from './components/ThemePickerSection';
import ShowcaseSection from './components/ShowcaseSection';
import TagsEditor from './components/TagsEditor';
import ProfilePreviewCard from './components/ProfilePreviewCard';
import AccountTab from '../settings/components/AccountTab';
import PrivacyTab from '../settings/components/PrivacyTab';
import type { Tab as SettingsTab } from '../settings/constants';
import { Loading } from '../../components/Loading';
import ImageCropper from '../../components/image-cropper/ImageCropper';
import { useProLimits } from '../../api/proLimits';
import { useProfileImages } from './useProfileImages';

const PANEL_HEAD = 'tl-head text-[11px] font-bold text-white mb-4';
const PANEL_HEAD_STYLE = { textShadow: 'var(--glow-sm)' };
const LABEL = 'tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted flex items-center gap-2 mb-[7px]';

/** Форма редактирования, заполненная текущим профилем (пустые поля — значениями по умолчанию) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- профиль приходит с сервера в свободной форме
function buildForm(user: any): EditProfileForm {
  const p = user?.profile ?? {};
  return {
    display_name: p.display_name || '',
    bio: p.bio || '',
    tags: parseTags(p),
    avatar_url: p.avatar_url || '',
    avatar_frame_url: p.avatar_frame_url || '',
    banner_url: p.banner_url || '',
    frame_id: p.frame_id || 'none',
    theme_id: p.theme_id || 'lustre',
    showcases: parseShowcases(p),
  };
}

export default function EditProfilePage() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const dlg = useDialog();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  const [formData, setFormData] = useState<EditProfileForm>(() => buildForm(user));
  const initialForm = useMemo(() => buildForm(user), [user]);
  const dirty = useMemo(() => JSON.stringify(formData) !== JSON.stringify(initialForm), [formData, initialForm]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // После сохранения остаёмся на странице: форма берёт значения, которые вернул сервер
  // (иначе мелкие расхождения нормализации оставляли бы «несохранённые изменения»)
  const justSavedRef = useRef(false);
  useEffect(() => {
    if (!justSavedRef.current) return;
    justSavedRef.current = false;
    setFormData(initialForm);
  }, [initialForm]);
  // «Сохранено» гаснет через пару секунд или при следующей правке
  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(t);
  }, [saved]);
  useEffect(() => { if (dirty) setSaved(false); }, [dirty]);

  // Магазин: платные темы/рамки — доступны только купленные
  const [shopData, setShopData] = useState<ShopData | null>(null);
  useEffect(() => {
    getShop().then(setShopData).catch(() => {});
  }, []);
  const shopThemeItemIds = useMemo(
    () => new Set((shopData?.items || []).filter(i => i.type === 'theme').map(i => i.payload)),
    [shopData]
  );
  const ownedShopItemPayloads = useMemo(() => {
    const set = new Set<string>();
    (shopData?.items || []).forEach(i => {
      if (shopData?.owned.includes(i.id)) set.add(`${i.type}:${i.payload}`);
    });
    return set;
  }, [shopData]);
  const isThemeLocked = (themeId: string) => shopThemeItemIds.has(themeId) && !ownedShopItemPayloads.has(`theme:${themeId}`);
  const isFrameLocked = (frameId: string) => !ownedShopItemPayloads.has(`frame:${frameId}`);

  // Купленные предметы для отображения в редакторе (только приобретённое)
  const isOwned = (id: number) => !!shopData?.owned.includes(id);
  const avatarShopItems = useMemo(
    () => (shopData?.items || []).filter(i => i.type === 'avatar' && isOwned(i.id)),
    [shopData]
  );
  const bannerShopItems = useMemo(
    () => (shopData?.items || []).filter(i => i.type === 'banner' && isOwned(i.id)),
    [shopData]
  );
  const imageFrameItems = useMemo(
    () => (shopData?.items || []).filter(i => i.type === 'frame' && /^(https?:\/\/|data:)/i.test(i.payload) && isOwned(i.id)),
    [shopData]
  );
  const customProfileThemes = useMemo(
    () => (shopData?.items || []).filter(i => i.type === 'theme' && i.scope !== 'launcher' && isCustomThemeId(i.payload) && isOwned(i.id)),
    [shopData]
  );
  const shopTagItems = useMemo(
    () => (shopData?.items || []).filter(i => i.type === 'tag' && isOwned(i.id)),
    [shopData]
  );

  // Аватар и баннер: кадрирование, загрузка, удаление старых файлов только после сохранения
  const limits = useProLimits();
  const images = useProfileImages(
    user?.id ?? 0,
    { avatar_url: initialForm.avatar_url, banner_url: initialForm.banner_url },
    { avatar_url: formData.avatar_url, banner_url: formData.banner_url },
    setFormData,
    limits.upload_mb,
  );
  // быстрый выбор файла по клику на превью справа
  const pickImage = (kind: ImageKind) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = PROFILE_IMAGE_ACCEPT;
    input.onchange = () => { const f = input.files?.[0]; if (f) images.handleFile(kind, f); };
    input.click();
  };

  if (!user) return <Loading />;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.put('/user/update', formData);

      // Обновляем состояние в Context, чтобы изменения применились везде сразу;
      // со страницы не уходим — пользователь продолжает редактировать
      justSavedRef.current = true;
      updateProfile(res.data);
      images.commit({ avatar_url: formData.avatar_url, banner_url: formData.banner_url });
      setSaved(true);
    } catch (e: any) {
      justSavedRef.current = false;
      await dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось сохранить настройки.', danger: true });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    images.discardDrafts();
    setFormData(initialForm);
    setSaved(false);
  };

  const handleDeleteRequest = async () => {
    const ok = await dlg.confirm({
      title: 'Удалить аккаунт',
      message: 'Удаление аккаунта необратимо. Запрос на удаление оформляется через поддержку.',
      confirmText: 'К поддержке',
      danger: true,
    });
    if (ok) navigate('/support');
  };

  // Вкладки «Аккаунт»/«Приватность» переиспользуют общий контент настроек:
  // приватность открываем здесь, безопасность — в полной странице настроек
  const handleSettingsTab = (tab: SettingsTab) => {
    if (tab === 'privacy') setActiveTab('privacy');
    else navigate('/settings');
  };

  return (
    <div className="relative pb-20 text-left">
      <div className="max-w-[1240px] mx-auto px-6 pt-8">

        <div className="tl-ticker">
          <span className="live">// SETTINGS MODULE</span>
          <span>operator card</span>
          <span>· sync: ok</span>
        </div>

        <div className="tl-sec-head">
          <span className="bar" />
          <h2>НАСТРОЙКИ ПРОФИЛЯ</h2>
          <span className="tag">draft</span>
          <span className="line" />
          <button
            onClick={() => navigate(-1)}
            className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted hover:text-white border border-[var(--line)] px-2.5 py-1.5 transition-colors"
          >
            ← к профилю
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[232px_minmax(0,1fr)_336px] gap-5 items-start">

          <EditProfileTabs activeTab={activeTab} setActiveTab={setActiveTab} />

          {/* ===== ЦЕНТР: вкладки как в шаблоне ===== */}
          <div className="min-w-0 flex flex-col gap-[22px]">
            {activeTab === 'profile' && (
              <>
                <AvatarPickerSection
                  userId={user.id}
                  formData={formData}
                  setFormData={setFormData}
                  avatarShopItems={avatarShopItems}
                  images={images}
                  uploadLimitMB={limits.upload_mb}
                />

                <div className="tl-panel p-[22px]">
                  <h3 className={PANEL_HEAD} style={PANEL_HEAD_STYLE}>ОСНОВНЫЕ ДАННЫЕ</h3>
                  <InputBlock label="Отображаемое имя" maxLength={32} value={formData.display_name} onChange={(v: string) => setFormData({ ...formData, display_name: v })} />

                  <div className="mt-4">
                    <label className={LABEL}>Никнейм</label>
                    <div className="tl-prefix">
                      <span className="at">@</span>
                      <input className="tl-field" value={user.username} readOnly />
                    </div>
                    <p className="tl-term text-[15px] text-[var(--muted-2)] mt-2">
                      Только латиница, цифры и <b className="tl-muted">_</b>. Смена — в настройках аккаунта.
                    </p>
                  </div>
                </div>

                <div className="tl-panel p-[22px]">
                  <h3 className={PANEL_HEAD} style={PANEL_HEAD_STYLE}>О СЕБЕ</h3>
                  <label className={LABEL}>
                    Биография
                    <span className={`ml-auto tl-term text-[14px] ${formData.bio.length >= 300 ? 'tl-pink' : 'text-[var(--muted-2)]'}`}>{formData.bio.length} / 300</span>
                  </label>
                  <textarea
                    maxLength={300}
                    className="tl-field min-h-[120px] resize-y leading-relaxed"
                    value={formData.bio}
                    onChange={e => setFormData({ ...formData, bio: e.target.value })}
                  />
                  <p className="tl-term text-[15px] text-[var(--muted-2)] mt-2">Коротко и по делу — эту строку увидят все, кто откроет профиль.</p>
                </div>

                <div className="tl-panel p-[22px]">
                  <h3 className={PANEL_HEAD} style={PANEL_HEAD_STYLE}>ТЕГИ И ИНТЕРЕСЫ</h3>
                  <TagsEditor
                    tags={formData.tags}
                    onChange={(tags) => setFormData({ ...formData, tags })}
                    shopTagItems={shopTagItems}
                  />
                </div>

                <ShowcaseSection formData={formData} setFormData={setFormData} />
              </>
            )}

            {activeTab === 'account' && (
              <AccountTab user={user} onNavigateTab={handleSettingsTab} />
            )}

            {activeTab === 'privacy' && (
              <PrivacyTab />
            )}

            {activeTab === 'theme' && (
              <>
                <BannerPickerSection
                  userId={user.id}
                  formData={formData}
                  setFormData={setFormData}
                  bannerShopItems={bannerShopItems}
                  images={images}
                  uploadLimitMB={limits.upload_mb}
                />
                <FramePickerSection
                  userId={user.id}
                  avatarUrl={user?.profile?.avatar_url}
                  formData={formData}
                  setFormData={setFormData}
                  isFrameLocked={isFrameLocked}
                  imageFrameItems={imageFrameItems}
                />
                <ThemePickerSection
                  formData={formData}
                  setFormData={setFormData}
                  isThemeLocked={isThemeLocked}
                  customProfileThemes={customProfileThemes}
                />
              </>
            )}
          </div>

          {/* ===== ПРАВАЯ КОЛОНКА ===== */}
          <aside className="flex flex-col gap-5 min-w-0">
            <ProfilePreviewCard
              profile={{ ...user.profile, ...formData }}
              onAvatarClick={() => pickImage('avatar')}
              onBannerClick={() => pickImage('banner')}
              uploadingAvatar={images.uploading.avatar}
              uploadingBanner={images.uploading.banner}
            />

            <div className="tl-panel p-[22px]">
              <h3 className={PANEL_HEAD} style={PANEL_HEAD_STYLE}>ДЕЙСТВИЯ</h3>
              <div className={`tl-dirty ${dirty ? 'on' : ''}`}>
                <span className="dot" /> Есть несохранённые изменения
              </div>
              <div className={`tl-saved ${saved ? 'on' : ''}`}>
                <IconCheck size={12} /> Настройки сохранены
              </div>
              <div className="flex flex-col gap-2.5">
                <button type="button" onClick={handleSave} disabled={saving || !dirty} className="tl-btn solid block disabled:opacity-50">
                  <IconCheck size={14} /> {saving ? 'Сохраняем…' : 'Сохранить изменения'}
                </button>
                <div className="flex gap-2.5">
                  <button type="button" onClick={() => navigate(-1)} className="tl-btn ghost block flex-1">
                    <IconX size={14} /> Отмена
                  </button>
                  <button type="button" onClick={handleReset} className="tl-btn ghost block flex-1">
                    Сброс
                  </button>
                </div>
              </div>
              <p className="tl-term text-[15px] text-[var(--muted-2)] mt-3">Изменения видны только вам до сохранения.</p>
            </div>

            <div className="tl-panel tl-danger p-[22px]">
              <h3 className={PANEL_HEAD} style={PANEL_HEAD_STYLE}>ОПАСНАЯ ЗОНА</h3>
              <p className="tl-term text-[15px] tl-muted leading-relaxed mb-4">
                Удаление аккаунта необратимо: исчезнут карточка, витрина, значки и вся история активности. Восстановить данные будет нельзя.
              </p>
              <button type="button" onClick={handleDeleteRequest} className="tl-btn danger block">
                <IconTrash size={14} /> Удалить аккаунт
              </button>
            </div>
          </aside>
        </div>
      </div>

      {images.cropping && (
        <ImageCropper
          src={images.cropping.src}
          shape={images.cropping.kind}
          onConfirm={images.confirmCrop}
          onClose={images.closeCropper}
        />
      )}
    </div>
  );
}
