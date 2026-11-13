import { createContext, useContext, useEffect, useState } from "react";
import { secureStorage } from "../api/secureStorage";
import api, { startSessionKeepAlive } from "../api";
import { broadcastLauncherTheme } from "../components/profileThemes";
import { resetCaches } from "../api/catalog";
import { useConnectivity } from "./ConnectivityContext";


type Profile = {
    display_name: string,
    bio: string,
    tag: string,
    tag_color?: string,
    avatar_url: string,
    avatar_frame_url?: string,
    banner_url: string,
    level: number;
    xp: number;
    is_pro: boolean;
    // оформление профиля
    frame_id: string;
    avatar_frame_scale?: number;
    theme_id: string;
    launcher_theme_id?: string;
    showcase_type: string;
    showcase_data: string;
}

type User = {
    id: number;
    username: string;
    email: string;
    friend_code?: string;
    role?: 'user' | 'moderator' | 'manager' | 'admin';
    email_verified?: boolean;
    trusted_device_days?: number;
    profile: Profile;
};

// Аккаунты, известные на этом компьютере (для окна «Кто играет?» как в Steam).
// Пароль хранится зашифрованно (AES) — нужен для авто-входа при переключении аккаунта.
// ВАЖНО: вызовы без credentials (например, /auth/me при старте) НЕ должны затирать сохранённый пароль
export const saveKnownAccount = (userData: User, credentials?: { identity: string; password: string }) => {
    if (!userData?.username) return;
    const list = secureStorage.getItem('knownAccounts') || [];
    const existing = list.find((a: any) => a.username === userData.username) || {};
    // «Не сохранять данные аккаунта на этом компьютере» — пароль не храним
    const dontSave = secureStorage.getItem('dontSaveAccount') === true;
    const password = dontSave ? undefined : (credentials?.password ?? existing.password);
    const entry: any = {
        username: userData.username,
        avatar_url: userData.profile?.avatar_url || existing.avatar_url || '',
        display_name: userData.profile?.display_name || existing.display_name || userData.username,
    };
    if (password) entry.password = password;
    const filtered = list.filter((a: any) => a.username !== entry.username);
    filtered.unshift(entry);
    secureStorage.setItem('knownAccounts', filtered.slice(0, 8));
};

/** Удаляет аккаунт из списка известных на этом компьютере (не трогает сервер). */
export const removeKnownAccount = (username: string) => {
    if (!username) return;
    const list = secureStorage.getItem('knownAccounts') || [];
    const next = list.filter((a: any) => a.username !== username);
    if (next.length) secureStorage.setItem('knownAccounts', next);
    else secureStorage.removeItem('knownAccounts');
};

type AuthContextType = {
    user: User | null;
    isLoading: boolean;
    login: (userData: User, credentials?: { identity: string; password: string }) => void;
    logout: () => void;
    updateProfile: (newProfile: Profile) => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { offline, reconnectKey, checkNow } = useConnectivity();

    const refreshUser = async () => {
        if (offline) return;
        try {
            const res = await api.get('/auth/me');
            setUser(res.data.user);
            secureStorage.setItem('user', res.data.user);
            saveKnownAccount(res.data.user);
            broadcastLauncherTheme(res.data.user?.profile?.launcher_theme_id);
        } catch (err: any) {
            const status = err?.response?.status;
            // 401 после неудачного продления из-за сети/сбоя — не выход из аккаунта
            if (status === 401 && !err?.sessionCheckUnavailable) {
                secureStorage.removeItem('user');
                setUser(null);
            } else {
                // Сетевая ошибка — работаем на кэше, помечаем оффлайн
                checkNow();
            }
        }
    };

    useEffect(() => {
        const verifySession = async () => {
            const savedUser = secureStorage.getItem('user');
            if (savedUser) setUser(savedUser);

            // Автономный режим / нет связи — входим по кэшу
            if (offline) {
                setUser(savedUser || null);
                setIsLoading(false);
                return;
            }

            try {
                const res = await api.get('/auth/me');
                setUser(res.data.user);
                secureStorage.setItem('user', res.data.user);
                saveKnownAccount(res.data.user);
                broadcastLauncherTheme(res.data.user?.profile?.launcher_theme_id);
                // Как в Steam: спрашивать, какой аккаунт использовать, при каждом запуске
                if (secureStorage.getItem('askAccountOnStart') === true) {
                    (window as any).electron?.openAccountPicker?.(false);
                }
            } catch (err: any) {
                if (err?.response?.status === 401 && !err?.sessionCheckUnavailable) {
                    secureStorage.removeItem('user');
                    setUser(null);
                } else {
                    // Нет сети — оставляем кэшированного пользователя (оффлайн-режим)
                    setUser(savedUser || null);
                    checkNow();
                }
            } finally {
                setIsLoading(false);
            }
        };

        verifySession();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Возврат связи — синхронизируем сессию с сервером
    useEffect(() => {
        if (reconnectKey === 0 || offline) return;
        refreshUser();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reconnectKey, offline]);

    const login = (userData: User, credentials?: { identity: string; password: string }) => {
        secureStorage.setItem('user', userData);
        saveKnownAccount(userData, credentials);
        setUser(userData);
        broadcastLauncherTheme(userData?.profile?.launcher_theme_id);
    };

    const logout = async (switchToUsername?: string) => {
        try {
            await api.post('/auth/logout').catch(() => {});
        } finally {
            secureStorage.removeItem('user');
            localStorage.removeItem('token');
            resetCaches();
            setUser(null);
            broadcastLauncherTheme('');
            // Сырой hash-навигация работала только со HashRouter; под
            // BrowserRouter уходим на чистый путь (перезагрузка при выходе
            // заодно сбрасывает всё состояние приложения).
            window.location.assign(
                switchToUsername !== undefined && switchToUsername !== ''
                    ? `/login?username=${encodeURIComponent(switchToUsername)}`
                    : '/login'
            );
        }
    };

    // Пока пользователь в аккаунте — продлеваем сессию заранее (иначе через 72 ч выход)
    const signedIn = !!user;
    useEffect(() => {
        if (!signedIn) return;
        return startSessionKeepAlive();
    }, [signedIn]);

    // Переключение аккаунта из окна «Кто играет?»
    useEffect(() => {
        (window as any).electron?.onForceLogout?.((username: string) => {
            logout(username);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateProfile = (newProfile: Profile) => {
        if (user) {
            const updatedUser = { ...user, profile: newProfile };
            setUser(updatedUser);
            secureStorage.setItem('user', updatedUser);
            broadcastLauncherTheme(newProfile.launcher_theme_id);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout, updateProfile, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};