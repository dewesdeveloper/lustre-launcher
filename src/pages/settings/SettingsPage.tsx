import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { applyLauncherTheme, useLauncherThemeSync } from '../../components/profileThemes';
import { ChevronLeft, Minus, Square, X, Check, Trash2, Sparkles } from 'lucide-react';
import StorageTab from './StorageTab';
import LibraryTab from './components/LibraryTab';
import SecurityTab from './components/SecurityTab';
import { TABS } from './constants';
import type { Tab } from './constants';
import AccountTab from './components/AccountTab';
import PrivacyTab from './components/PrivacyTab';
import InterfaceTab from './components/InterfaceTab';
import StoreTab from './components/StoreTab';
import VoiceTab from './components/VoiceTab';
import InGameTab from './components/InGameTab';
import NotificationsTab from './components/NotificationsTab';
import BackgroundTab from './components/BackgroundTab';
import ProfilePreviewCard from '../profile/components/ProfilePreviewCard';
import { useOpenPath } from './useOpenPath';

export default function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const openPath = useOpenPath();
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const electron = (window as any).electron;

  // Отдельное окно настроек закрываем; в браузере и главном окне возвращаемся назад
  const goBack = async () => {
    if (await electron?.closeSettingsWindow?.()) return;
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };

  // Отдельное окно вне MainLayout — тему лаунчера применяем сами
  const launcherThemeId = user?.profile?.launcher_theme_id;
  useEffect(() => {
    applyLauncherTheme(launcherThemeId);
  }, [launcherThemeId]);
  useLauncherThemeSync();

  return (
    <div className="flex flex-col h-screen bg-main-bg overflow-hidden text-left font-sans text-pearl">
      {/* Title bar */}
      <div
        className="h-9 flex items-center bg-[#0a0a0c] border-b border-white/5 shrink-0 z-50"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-3 px-4 h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={goBack} className="text-pearl/70 hover:text-pearl transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="tl-head text-[10px] font-bold uppercase tracking-[0.2em] text-pearl/72">Настройки</span>
        </div>
        {/* Кнопки окна — только в лаунчере: в браузере они ничего не делали */}
        {electron && <div className="ml-auto flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => electron?.minimize?.()} className="h-full w-12 flex items-center justify-center text-pearl/60 hover:text-pearl hover:bg-white/10 transition-colors"><Minus size={14} /></button>
          <button onClick={() => electron?.maximize?.()} className="h-full w-12 flex items-center justify-center text-pearl/60 hover:text-pearl hover:bg-white/10 transition-colors"><Square size={12} /></button>
          <button onClick={() => electron?.close?.()} className="h-full w-12 flex items-center justify-center text-pearl/60 hover:text-white hover:bg-accent transition-colors"><X size={15} /></button>
        </div>}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative">
        <div className="max-w-[1240px] mx-auto px-6 py-6">

          <div className="tl-ticker">
            <span className="live">// SETTINGS MODULE</span>
            <span>operator card</span>
            <span>· sync: ok</span>
          </div>

          <div className="tl-sec-head mt-1">
            <span className="bar" />
            <h2>НАСТРОЙКИ</h2>
            <span className="tag">{TABS.find(t => t.id === activeTab)?.label || 'модуль'}</span>
            <span className="line" />
            <button
              onClick={goBack}
              className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted hover:text-white border border-[var(--line)] px-2.5 py-1.5 transition-colors"
            >
              ← назад
            </button>
          </div>

          {/* Раскладка зависит от ширины окна в CSS-пикселях, а она меняется вместе с масштабом
              интерфейса (zoom 0.8–1.5 при окне 900 px — это 600–1125 px). Поэтому три режима:
              узкое окно — разделы лентой сверху; обычное — меню слева, превью и действия под
              содержимым; широкое (≥1280) — три колонки. Раньше три колонки включались с 1024 px,
              и при окне 900 px меню из 11 пунктов всегда стояло над содержимым. */}
          <div className="grid grid-cols-1 sm:grid-cols-[188px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_336px] gap-5 items-start">

            <aside className="tl-panel self-start sm:sticky sm:top-4 min-w-0">
              <div className="hidden sm:flex items-center gap-2.5 p-3.5 border-b border-[var(--line)]">
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
                  onClick={() => setActiveTab('interface')}
                  className="w-[26px] h-[26px] grid place-items-center bg-violet text-white hover:bg-accent transition-colors shrink-0"
                  aria-label="К внешнему виду"
                >
                  <Sparkles size={13} />
                </button>
              </div>
              <nav className="flex flex-row sm:flex-col overflow-x-auto sm:overflow-visible custom-scrollbar sm:py-2">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={activeTab === tab.id ? 'page' : undefined}
                    className={`flex items-center gap-2.5 shrink-0 sm:w-full px-3.5 py-2.5 border-b-[3px] sm:border-b-0 sm:border-l-[3px] tl-head text-[10px] font-bold uppercase tracking-[0.1em] whitespace-nowrap sm:whitespace-normal transition-colors text-left ${
                      activeTab === tab.id
                        ? 'text-accent bg-[rgb(var(--accent-rgb)/.14)] border-accent'
                        : 'text-[var(--muted)] border-transparent hover:text-white hover:bg-[rgb(var(--accent-rgb)/.07)]'
                    }`}
                  >
                    <span className="shrink-0">{tab.icon}</span> <span className="min-w-0">{tab.label}</span>
                    <span className={`hidden sm:inline ml-auto text-[13px] transition-opacity ${activeTab === tab.id ? 'opacity-100' : 'opacity-0'}`}>›</span>
                  </button>
                ))}
              </nav>
            </aside>

            <main className="min-w-0 flex flex-col gap-5">
              {activeTab === 'account' && <AccountTab user={user} onNavigateTab={setActiveTab} />}
              {activeTab === 'security' && <SecurityTab />}
              {activeTab === 'privacy' && <PrivacyTab />}
              {activeTab === 'notifications' && <NotificationsTab />}
              {activeTab === 'interface' && <InterfaceTab />}
              {activeTab === 'background' && <BackgroundTab />}
              {activeTab === 'store' && <StoreTab />}
              {activeTab === 'library' && <LibraryTab />}
              {activeTab === 'cloud' && <StorageTab />}
              {activeTab === 'ingame' && <InGameTab />}
              {activeTab === 'audio' && <VoiceTab />}
            </main>

            <aside className="flex flex-col gap-5 min-w-0 sm:col-start-2 xl:col-start-3 xl:row-start-1">
              <ProfilePreviewCard profile={{ ...(user?.profile || {}), username: user?.username }} />

              <div className="tl-panel p-[22px]">
                <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>ДЕЙСТВИЯ</h3>
                <div className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] flex items-center gap-2.5 mb-3 px-3 py-2.5 border border-[rgba(52,211,153,.5)] bg-[rgba(52,211,153,.10)] text-[var(--green2)]">
                  <span className="w-1.5 h-1.5 bg-[var(--green2)] shadow-[0_0_6px_var(--green2)] shrink-0" />
                  Настройки применяются автоматически
                </div>
                <div className="flex flex-col gap-2.5">
                  <button type="button" onClick={goBack} className="tl-btn solid block">
                    <Check size={14} /> Сохранить изменения
                  </button>
                  <div className="flex gap-2.5">
                    <button type="button" onClick={goBack} className="tl-btn ghost block flex-1">
                      <X size={14} /> Отмена
                    </button>
                    <button type="button" onClick={() => window.location.reload()} className="tl-btn ghost block flex-1">
                      Сброс
                    </button>
                  </div>
                </div>
                <p className="tl-term text-[15px] text-[var(--muted-2)] mt-3">Изменения сохраняются сразу и видны только вам.</p>
              </div>

              <div className="tl-panel tl-danger p-[22px]">
                <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>ОПАСНАЯ ЗОНА</h3>
                <p className="tl-term text-[15px] tl-muted leading-relaxed mb-4">
                  Удаление аккаунта необратимо: исчезнут карточка, витрина, значки и вся история активности. Восстановить данные будет нельзя.
                </p>
                <button type="button" onClick={() => openPath('/support')} className="tl-btn danger block">
                  <Trash2 size={14} /> Удалить аккаунт
                </button>
              </div>
            </aside>

          </div>

          <footer className="tl-footer">
            <div className="status">SYSTEM STATUS: <b>STABLE</b><br />SETTINGS MODULE ONLINE</div>
            <div className="left">
              <span className="keep">KEEP GOING.EXE</span>
              <div className="tl-barcode">
                {Array.from({ length: 20 }).map((_, i) => <i key={i} />)}
              </div>
            </div>
          </footer>

        </div>
      </div>
    </div>
  );
}
