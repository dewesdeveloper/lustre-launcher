import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from './AuthContext';
import { replaceVoicePrefs } from '../api/voicePrefs';
import type { VoicePrefs } from '../api/voicePrefs';

interface StoreSettings {
  sexual_content: boolean;
  nudity: boolean;
  violence: boolean;
  gore: boolean;
  strong_language: boolean;
  gambling: boolean;
  horror: boolean;
  mature_themes: boolean;
}

interface UISettings {
  sidebar_collapsed: boolean;
  sidebar_width: number;
}

export type LibraryItemSize = 'auto' | 'small' | 'medium' | 'large';

export interface LibrarySettings {
  item_size: LibraryItemSize;
  low_bandwidth: boolean;
  simple_mode: boolean;
  hide_community_content: boolean;
}

export const DEFAULT_LIBRARY_SETTINGS: LibrarySettings = {
  item_size: 'auto',
  low_bandwidth: false,
  simple_mode: false,
  hide_community_content: false,
};

interface AllSettings {
  store_content_filters: StoreSettings;
  store_age_rating: string;
  hide_adult_games: boolean;
  sidebar_collapsed: boolean;
  sidebar_width: number;
  voice?: VoicePrefs;
  library?: LibrarySettings;
  ui_scale?: number;
}

const DEFAULT_SETTINGS: AllSettings = {
  store_content_filters: {
    sexual_content: true,
    nudity: true,
    violence: true,
    gore: true,
    strong_language: true,
    gambling: true,
    horror: true,
    mature_themes: true,
  },
  store_age_rating: '18+',
  hide_adult_games: false,
  sidebar_collapsed: false,
  sidebar_width: 256,
  library: DEFAULT_LIBRARY_SETTINGS,
  ui_scale: 1,
};

interface SettingsContextType {
  settings: AllSettings;
  updateSettings: (partial: Partial<AllSettings>) => Promise<void>;
  getStoreFilters: () => StoreSettings;
  getAgeRating: () => string;
  getHideAdult: () => boolean;
  getSidebar: () => UISettings;
  getLibrary: () => LibrarySettings;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const syncToLocalStorage = (data: Record<string, any>) => {
    if (data.store_content_filters) localStorage.setItem('store_content_filters', JSON.stringify(data.store_content_filters));
    if (data.store_age_rating) localStorage.setItem('store_age_rating', data.store_age_rating);
    if (data.hide_adult_games !== undefined) localStorage.setItem('hide_adult_games', String(data.hide_adult_games));
    if (data.sidebar_collapsed !== undefined) localStorage.setItem('sidebar_collapsed', String(data.sidebar_collapsed));
    if (data.sidebar_width !== undefined) localStorage.setItem('sidebar_width', String(data.sidebar_width));
    if (data.library) localStorage.setItem('library_settings', JSON.stringify(data.library));
    if (data.ui_scale !== undefined) localStorage.setItem('ui_scale', String(data.ui_scale));
  };
  const [settings, setSettings] = useState<AllSettings>(() => {
    // Initialize from localStorage as fallback
    try {
      const savedFilters = localStorage.getItem('store_content_filters');
      const savedAge = localStorage.getItem('store_age_rating');
      const savedHideAdult = localStorage.getItem('hide_adult_games');
      const savedCollapsed = localStorage.getItem('sidebar_collapsed');
      const savedWidth = localStorage.getItem('sidebar_width');
      const savedLibrary = localStorage.getItem('library_settings');
      const savedScale = localStorage.getItem('ui_scale');

      return {
        store_content_filters: savedFilters ? JSON.parse(savedFilters) : DEFAULT_SETTINGS.store_content_filters,
        store_age_rating: savedAge || DEFAULT_SETTINGS.store_age_rating,
        hide_adult_games: savedHideAdult !== null ? savedHideAdult === 'true' : DEFAULT_SETTINGS.hide_adult_games,
        sidebar_collapsed: savedCollapsed === 'true',
        sidebar_width: savedWidth ? parseInt(savedWidth) : DEFAULT_SETTINGS.sidebar_width,
        library: savedLibrary ? { ...DEFAULT_LIBRARY_SETTINGS, ...JSON.parse(savedLibrary) } : DEFAULT_LIBRARY_SETTINGS,
        ui_scale: savedScale ? parseFloat(savedScale) : 1,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Load settings from backend on mount
  useEffect(() => {
    if (!user) return;
    api.get('/settings/').then(res => {
      if (res.data?.settings) {
        const remote = typeof res.data.settings === 'string'
          ? JSON.parse(res.data.settings)
          : res.data.settings;

        setSettings(prev => ({ ...prev, ...remote }));

        if (remote.voice) replaceVoicePrefs(remote.voice);

        // Sync to localStorage as cache
        syncToLocalStorage(remote);
      }
    }).catch(() => {});
  }, [user]);

  // Listen for localStorage changes from other windows (e.g. settings window)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      const keyMap: Record<string, keyof AllSettings> = {
        'store_content_filters': 'store_content_filters',
        'store_age_rating': 'store_age_rating',
        'hide_adult_games': 'hide_adult_games',
        'sidebar_collapsed': 'sidebar_collapsed',
        'sidebar_width': 'sidebar_width',
        'library_settings': 'library',
        'ui_scale': 'ui_scale',
      };
      const settingKey = keyMap[e.key];
      if (!settingKey || !e.newValue) return;

      setSettings(prev => {
        let parsed: any;
        try {
          parsed = (e.key === 'store_content_filters' || e.key === 'library_settings') ? JSON.parse(e.newValue!) : e.newValue;
        } catch { return prev; }

        if (settingKey === 'sidebar_width') parsed = parseInt(parsed) || prev.sidebar_width;
        if (settingKey === 'ui_scale') parsed = parseFloat(parsed) || prev.ui_scale || 1;
        if (settingKey === 'sidebar_collapsed' || settingKey === 'hide_adult_games') parsed = parsed === 'true';

        const next = { ...prev, [settingKey]: parsed };

        // Save to backend
        api.put('/settings/', { settings: next }).catch(console.error);

        return next;
      });
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const updateSettings = useCallback(async (partial: Partial<AllSettings>) => {
    if (partial.voice) replaceVoicePrefs(partial.voice);
    setSettings(prev => {
      const next = { ...prev, ...partial };

      // Sync to localStorage as cache
      if (partial.store_content_filters) localStorage.setItem('store_content_filters', JSON.stringify(partial.store_content_filters));
      if (partial.store_age_rating) localStorage.setItem('store_age_rating', partial.store_age_rating);
      if (partial.hide_adult_games !== undefined) localStorage.setItem('hide_adult_games', String(partial.hide_adult_games));
      if (partial.sidebar_collapsed !== undefined) localStorage.setItem('sidebar_collapsed', String(partial.sidebar_collapsed));
      if (partial.sidebar_width !== undefined) localStorage.setItem('sidebar_width', String(partial.sidebar_width));
      if (partial.library) localStorage.setItem('library_settings', JSON.stringify(partial.library));
      if (partial.ui_scale !== undefined) localStorage.setItem('ui_scale', String(partial.ui_scale));

      // Save to backend
      api.put('/settings/', { settings: next }).catch(console.error);

      return next;
    });
  }, []);

  const getStoreFilters = useCallback(() => settings.store_content_filters, [settings]);
  const getAgeRating = useCallback(() => settings.store_age_rating, [settings]);
  const getHideAdult = useCallback(() => settings.hide_adult_games, [settings]);
  const getSidebar = useCallback(() => ({
    sidebar_collapsed: settings.sidebar_collapsed,
    sidebar_width: settings.sidebar_width,
  }), [settings]);

  const getLibrary = useCallback(
    () => ({ ...DEFAULT_LIBRARY_SETTINGS, ...(settings.library || {}) }),
    [settings]
  );

  // «Упрощённый режим» — глобально отключаем переходы и анимации
  useEffect(() => {
    document.documentElement.classList.toggle('simple-mode', !!settings.library?.simple_mode);
  }, [settings.library?.simple_mode]);

  // Масштаб интерфейса.
  // Electron: системный zoom (учитывает vh/vw — layout не ломается).
  // Веб: масштабируем через размер корневого шрифта (безопасно для layout).
  useEffect(() => {
    const scale = settings.ui_scale ?? 1;
    const electron = (window as any).electron;
    document.documentElement.style.removeProperty('zoom'); // убираем возможный старый inline-zoom
    if (electron?.setZoomFactor) {
      electron.setZoomFactor(scale);
    } else {
      document.documentElement.style.fontSize = scale === 1 ? '' : `${16 * scale}px`;
    }
  }, [settings.ui_scale]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, getStoreFilters, getAgeRating, getHideAdult, getSidebar, getLibrary }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
