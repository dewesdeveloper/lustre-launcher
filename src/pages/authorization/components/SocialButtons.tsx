import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconBrandGithub, IconBrandSteam } from '@tabler/icons-react';
import { getOAuthProviders, getOAuthStartUrl, getOAuthResult, type OAuthResultData } from '../../../api/oauth';
import { saveDeviceToken } from '../../../api/deviceTokens';
import { OrDivider } from './OrDivider';

export function SocialButton({ icon, children, onClick, disabled }: { icon: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tl-btn ghost w-full h-12 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
    >
      {icon}
      {children}
    </button>
  )
}

// Вход только через GitHub и Steam (Google, Telegram и itch.io отключены и на сервере —
// oauthEnabled); кнопки показываем лишь для провайдеров из этого списка
const PROVIDER_META: Record<string, { label: string; icon: ReactNode }> = {
  github: { label: 'Войти с GitHub', icon: <IconBrandGithub /> },
  steam: { label: 'Войти с Steam', icon: <IconBrandSteam /> },
};

const REASON_TEXT: Record<string, string> = {
  state: 'Сессия входа истекла. Попробуйте снова.',
  code: 'Провайдер не вернул код входа.',
  token: 'Не удалось подтвердить вход у провайдера.',
  userinfo: 'Не удалось получить профиль.',
  user: 'Не удалось создать аккаунт.',
  steam: 'Steam не подтвердил вход.',
  telegram: 'Telegram отклонил вход.',
  provider: 'Провайдер не настроен.',
  expired: 'Время входа истекло.',
};

function reasonText(reason?: string): string {
  if (!reason) return 'Не удалось войти. Попробуйте ещё раз.';
  return REASON_TEXT[reason] || 'Не удалось войти. Попробуйте ещё раз.';
}

// disabled — вход пока недоступен (нет согласия): кнопки остаются активными, а нажатие
// вызывает onBlocked (форма подсвечивает пункты согласия), чтобы было понятно, чего не хватает
// onSecondFactor — у аккаунта включена 2FA: форма входа показывает шаг кода/подтверждения с телефона
export function SocialButtons({ onDone, disabled, consent = false, onBlocked, onSecondFactor }: { onDone?: () => void; disabled?: boolean; consent?: boolean; onBlocked?: () => void; onSecondFactor?: (data: OAuthResultData) => void }) {
  const [providers, setProviders] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [fallbackProvider, setFallbackProvider] = useState<string | null>(null);
  const pollRef = useRef<{ cancelled: boolean } | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getOAuthProviders()
      .then((info) => setProviders((info.providers || []).filter((p) => p in PROVIDER_META)))
      .catch(() => {});
  }, []);

  // Аварийный Electron-окно: закрылось по редиректу — завершаем вход.
  useEffect(() => {
    const off = (window as any).electron?.onOAuthDone?.(() => {
      // Идёт опрос результата — он сам завершит вход (с токеном и доверенным устройством)
      if (pollRef.current) return;
      if (fallbackTimer.current) { clearTimeout(fallbackTimer.current); fallbackTimer.current = null; }
      setBusy('');
      setError('');
      setFallbackProvider(null);
      onDone?.();
    });
    return () => { if (typeof off === 'function') off(); };
  }, [onDone]);

  useEffect(() => () => {
    if (pollRef.current) pollRef.current.cancelled = true;
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
  }, []);

  /** Ждём завершения входа в браузере (5 минут), забирая одноразовый результат. */
  const pollResult = async (provider: string, state: string, poll: string) => {
    const token = { cancelled: false };
    pollRef.current = token;
    const deadline = Date.now() + 5 * 60 * 1000;
    try {
      while (!token.cancelled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1200));
        if (token.cancelled) return;
        try {
          const data = await getOAuthResult(state, poll);
          if (data.status === 'ok' && data.token) {
            localStorage.setItem('token', data.token);
            // Доверенное устройство: без него после 72 ч сессию не продлить и выкидывает из аккаунта
            if (data.username && data.device_token) saveDeviceToken(data.username, data.device_token);
            if (fallbackTimer.current) { clearTimeout(fallbackTimer.current); fallbackTimer.current = null; }
            setBusy('');
            setError('');
            setFallbackProvider(null);
            onDone?.();
            return;
          }
          if ((data.status === 'need_totp' || data.status === 'need_device_approval') && data.login_token) {
            if (fallbackTimer.current) { clearTimeout(fallbackTimer.current); fallbackTimer.current = null; }
            setBusy('');
            setError('');
            setFallbackProvider(null);
            onSecondFactor?.(data);
            return;
          }
          if (data.status === 'error') {
            setBusy('');
            setError(reasonText(data.reason));
            setFallbackProvider(provider);
            return;
          }
        } catch {
          // сеть недоступна — продолжаем до таймаута
        }
      }
      if (!token.cancelled) {
        setBusy('');
        setError('Время входа истекло. Попробуйте ещё раз или откройте окно входа.');
        setFallbackProvider(provider);
      }
    } finally {
      if (pollRef.current === token) pollRef.current = null;
    }
  };

  const startOAuth = async (provider: string) => {
    if (busy) return;
    if (disabled) { onBlocked?.(); return; }
    setBusy(provider);
    setError('');
    setFallbackProvider(null);
    // Веб: popup открываем синхронно в жесте пользователя — иначе после await
    // блокировщик всплывающих окон закроет его. URL навешиваем, когда готов.
    const electron = (window as any).electron;
    const popup = !electron ? window.open('about:blank', '_blank', 'width=560,height=700') : null;
    try {
      const { url, state, poll } = await getOAuthStartUrl(provider, consent);
      if (!state || !poll) throw new Error('no state');
      if (electron?.openExternal) {
        const ok = await electron.openExternal(url);
        if (!ok) throw new Error('open failed');
      } else if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        throw new Error('open failed');
      }
      await pollResult(provider, state, poll);
    } catch {
      if (popup && !popup.closed) popup.close();
      setBusy('');
      setError(
        (window as any).electron
          ? 'Не удалось открыть браузер. Попробуйте ещё раз или откройте окно входа.'
          : 'Не удалось открыть окно входа. Разрешите всплывающие окна для этого сайта и попробуйте снова.',
      );
      setFallbackProvider(provider);
    }
  };

  /** Аварийный путь: встроенное окно Electron (если браузер не сработал). */
  const startFallback = async (provider: string) => {
    if (busy) return;
    if (pollRef.current) { pollRef.current.cancelled = true; pollRef.current = null; }
    if (fallbackTimer.current) { clearTimeout(fallbackTimer.current); fallbackTimer.current = null; }
    setBusy(provider);
    setError('');
    try {
      // Свежий state: старый мог истечь, пока ждали браузер.
      const { url, return_url, state, poll } = await getOAuthStartUrl(provider, consent);
      const electron = (window as any).electron;
      if (!electron?.oauthOpen) {
        setBusy('');
        setError('Встроенное окно входа недоступно.');
        return;
      }
      electron.oauthOpen({ url, returnUrl: return_url });
      // Окно ставит только куку — результат (токен в теле + доверенное устройство)
      // забираем опросом, иначе сессию потом нечем продлевать.
      if (state && poll) void pollResult(provider, state, poll);
      fallbackTimer.current = setTimeout(() => {
        fallbackTimer.current = null;
        setBusy('');
        setError('Вход не завершён. Попробуйте ещё раз.');
        setFallbackProvider(provider);
      }, 5 * 60 * 1000);
    } catch {
      setBusy('');
      setError('Не удалось открыть окно входа.');
    }
  };

  if (providers.length === 0) return null;

  return (
    <>
      <div className="space-y-3">
        {providers.map((p) => {
          const meta = PROVIDER_META[p] || { label: `Войти с ${p}`, icon: null };
          return (
            <SocialButton key={p} icon={meta.icon} onClick={() => void startOAuth(p)} disabled={!!busy}>
              {meta.label}
            </SocialButton>
          );
        })}
      </div>

      {error && <p className="mt-3 text-[12px] leading-snug text-red-400/90">{error}</p>}

      {/* Аварийное окно входа — только Electron (в web используется popup) */}
      {fallbackProvider && !busy && !!(window as any).electron && (
        <button
          type="button"
          onClick={() => void startFallback(fallbackProvider)}
          disabled={!!disabled}
          className="tl-btn ghost w-full h-10 mt-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Открыть окно входа
        </button>
      )}

      <OrDivider />
    </>
  );
}
