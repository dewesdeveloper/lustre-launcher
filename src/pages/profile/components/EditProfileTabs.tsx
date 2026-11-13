import {
  IconUserCircle, IconSettings, IconShield, IconSparkles
} from '@tabler/icons-react';
import { useAuth } from '../../../context/AuthContext';

export type Tab = 'profile' | 'account' | 'privacy' | 'theme';

type EditProfileTabsProps = {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
};

export default function EditProfileTabs({ activeTab, setActiveTab }: EditProfileTabsProps) {
  const { user } = useAuth();

  return (
    <aside className="tl-panel self-start lg:sticky lg:top-24">
      <div className="flex items-center gap-2.5 p-3.5 border-b border-[var(--line)]">
        <img
          src={user?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username}`}
          alt=""
          className="w-10 h-10 object-cover border border-[var(--line-2)] shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="tl-head text-[10px] font-bold text-white uppercase tracking-[0.06em] truncate">
            {user?.profile?.display_name || user?.username}
          </div>
          <div className="tl-term text-[14px] tl-muted truncate">@{user?.username}</div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('theme')}
          className="w-[26px] h-[26px] grid place-items-center bg-violet text-white hover:bg-accent transition-colors shrink-0"
          aria-label="К внешнему виду"
        >
          <IconSparkles size={13} />
        </button>
      </div>
      <nav className="flex flex-col py-2">
        <TabButton id="profile" label="Профиль" icon={IconUserCircle} active={activeTab} setter={setActiveTab} />
        <TabButton id="account" label="Аккаунт" icon={IconSettings} active={activeTab} setter={setActiveTab} />
        <TabButton id="privacy" label="Приватность" icon={IconShield} active={activeTab} setter={setActiveTab} />
        <TabButton id="theme" label="Внешний вид" icon={IconSparkles} active={activeTab} setter={setActiveTab} />
      </nav>
    </aside>
  );
}

function TabButton({ id, label, icon: Icon, active, setter }: any) {
  const isActive = active === id;
  return (
    <button
      type="button"
      onClick={() => setter(id)}
      className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 border-l-[3px] tl-head text-[10px] font-bold uppercase tracking-[0.1em] transition-colors text-left ${
        isActive
          ? 'text-accent bg-[rgb(var(--accent-rgb)/.14)] border-accent'
          : 'text-[var(--muted)] border-transparent hover:text-white hover:bg-[rgb(var(--accent-rgb)/.07)]'
      }`}
    >
      <Icon size={15} className="shrink-0" /> {label}
      <span className={`ml-auto text-[13px] transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`}>›</span>
    </button>
  );
}
