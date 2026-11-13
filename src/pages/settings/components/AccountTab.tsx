import { Users, Shield, User } from 'lucide-react';
import { useOpenPath } from '../useOpenPath';
import type { Tab } from '../constants';
import { secureStorage } from '../../../api/secureStorage';
import { useConnectivity } from '../../../context/ConnectivityContext';
import SettingsCard from './SettingsCard';
import SettingsRow from './SettingsRow';
import SettingsToggle from './SettingsToggle';

export default function AccountTab({ user, onNavigateTab }: { user: any; onNavigateTab: (tab: Tab) => void }) {
  const openPath = useOpenPath();
  const { manualOffline, setManualOffline } = useConnectivity();
  const dontSave = secureStorage.getItem('dontSaveAccount') === true;
  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>АККАУНТ</h3>
        <div className="flex items-center gap-5 flex-wrap">
          <img
            src={user?.profile?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=Guest"}
            className="w-16 h-16 object-cover border-2 border-[var(--line-2)] shrink-0"
            alt=""
          />
          <div className="min-w-0">
            <h3 className="tl-head text-[13px] font-bold text-white truncate">{user?.profile?.display_name || user?.username}</h3>
            <p className="tl-term text-[16px] tl-muted truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => openPath('/profile/edit')}
            className="tl-btn ghost ml-auto shrink-0"
          >
            Посмотреть профиль
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SettingsCard
          title="Друзья"
          desc="Управление списком друзей"
          icon={<Users size={24} />}
          onClick={() => openPath('/friends')}
        />
        <SettingsCard
          title="Настройки приватности"
          desc="Профиль, игры, инвентарь"
          icon={<Shield size={24} />}
          onClick={() => onNavigateTab('privacy')}
        />
        <SettingsCard
          title="Об аккаунте"
          desc="Магазин, безопасность, настройки"
          icon={<User size={24} />}
          onClick={() => onNavigateTab('security')}
        />
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-2" style={{ textShadow: 'var(--glow-sm)' }}>ОСНОВНОЕ</h3>
        <SettingsRow label="Ваш код друга" value={user?.friend_code || 'Не задан'} />
        <SettingsRow label="Адрес эл. почты" value={user?.email || 'Не указан'} />
      </div>

      <div className="tl-panel p-[22px]">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="tl-head text-[10px] font-bold uppercase tracking-[0.1em] text-white">Автономный режим</p>
            <p className="tl-term text-[15px] text-[var(--muted-2)] mt-1.5 leading-relaxed">
              {dontSave
                ? 'Недоступно, пока включена опция «Не сохранять данные аккаунта на этом компьютере».'
                : 'Запускать установленные игры без подключения к серверу. Онлайн-функции будут отключены.'}
            </p>
          </div>
          <SettingsToggle
            label=""
            checked={manualOffline}
            onChange={() => setManualOffline(!manualOffline)}
            disabled={dontSave}
          />
        </div>
      </div>
    </div>
  );
}
