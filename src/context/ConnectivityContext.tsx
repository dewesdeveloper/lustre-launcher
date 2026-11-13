import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { secureStorage } from '../api/secureStorage';
import { API_URL } from '../api/config';

type ConnectivityType = {
  online: boolean;
  offline: boolean;
  manualOffline: boolean;
  checking: boolean;
  reconnectKey: number;
  setManualOffline: (value: boolean) => void;
  checkNow: () => Promise<boolean>;
};

const ConnectivityContext = createContext<ConnectivityType | undefined>(undefined);

const HEALTH_INTERVAL = 25000;
const HEALTH_TIMEOUT = 8000;
// Один сорвавшийся запрос — ещё не «нет связи»: на нестабильной сети (VPN, мобильный интернет)
// единичные обрывы бывают постоянно, и раньше сайт из-за них на 25 с уходил в «нет связи»
const HEALTH_RETRY_DELAY = 1500;

async function pingHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
  try {
    const res = await fetch(`${API_URL}/health`, { signal: controller.signal, cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [manualOffline, setManualOfflineState] = useState(
    secureStorage.getItem('manualOffline') === true
  );

  const onlineRef = useRef(true);
  const manualRef = useRef(manualOffline);
  manualRef.current = manualOffline;

  const checkNow = useCallback(async () => {
    if (manualRef.current) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (onlineRef.current) {
        onlineRef.current = false;
        setOnline(false);
      }
      return false;
    }

    setChecking(true);
    try {
      let ok = await pingHealth();
      // пока считаем себя в сети, перед переходом в «нет связи» перепроверяем
      if (!ok && onlineRef.current) {
        await new Promise((r) => setTimeout(r, HEALTH_RETRY_DELAY));
        ok = await pingHealth();
      }
      if (ok) {
        if (!onlineRef.current) {
          onlineRef.current = true;
          setOnline(true);
          setReconnectKey((k) => k + 1);
        }
        return true;
      }
      if (onlineRef.current) {
        onlineRef.current = false;
        setOnline(false);
      }
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkNow();

    const handleOnline = () => checkNow();
    const handleOffline = () => {
      if (onlineRef.current) {
        onlineRef.current = false;
        setOnline(false);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const interval = setInterval(checkNow, HEALTH_INTERVAL);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkNow]);

  const setManualOffline = (value: boolean) => {
    setManualOfflineState(value);
    secureStorage.setItem('manualOffline', value);
    if (!value) setTimeout(() => checkNow(), 50);
  };

  const offline = manualOffline || !online;

  return (
    <ConnectivityContext.Provider
      value={{ online, offline, manualOffline, checking, reconnectKey, setManualOffline, checkNow }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
};

export const useConnectivity = () => {
  const context = useContext(ConnectivityContext);
  if (!context) throw new Error('useConnectivity must be used within ConnectivityProvider');
  return context;
};
