import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/800.css'
import '@fontsource/montserrat/900.css'
import '@fontsource/montserrat/700-italic.css'
import '@fontsource/montserrat/800-italic.css'
import '@fontsource/montserrat/900-italic.css'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { ConnectivityProvider } from './context/ConnectivityContext';
import { initLauncherThemeSync } from './components/profileThemes';
import { initDeviceInfo } from './utils/deviceInfo';

// Переход на BrowserRouter: старые ссылки вида site.com/#/store (HashRouter)
// должны продолжать открываться — превращаем хэш-роут в чистый путь до
// монтирования роутера. Только web: в Electron HashRouter остаётся, хэш
// трогать нельзя. Нероутовые якоря ('#section') не трогаем.
(function legacyHashRedirect() {
  const electron = (window as any).electron;
  if (electron) return;
  const h = window.location.hash;
  if (h.startsWith('#/')) {
    window.history.replaceState(null, '', h.slice(1));
  }
})();

initLauncherThemeSync();

initDeviceInfo().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <ConnectivityProvider>
      <AuthProvider>
        <SettingsProvider>
          <StrictMode>
            <App />
          </StrictMode>
        </SettingsProvider>
      </AuthProvider>
    </ConnectivityProvider>
  )
  // заставка из index.html: убираем после первого рендера (не раньше её минимума)
  requestAnimationFrame(() => (window as any).__lustreSplashHide?.())
})
