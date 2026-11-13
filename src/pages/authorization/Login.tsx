import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2 } from 'lucide-react'
import {
  AuthLayout,
  BottomLink,
  FormHeader,
  PasswordInput,
  PrimaryButton,
  SocialButtons,
  TextInput,
  ConsentCheckboxes,
  consentGiven,
  type ConsentState,
} from './ui'
import api from '../../api'
import { allDeviceTokens, saveDeviceToken } from '../../api/deviceTokens'
import type { OAuthResultData } from '../../api/oauth'
import { useAuth } from '../../context/AuthContext'
import { useCooldown } from '../../utils/useCooldown'

type Step = 'creds' | 'code' | 'verify' | 'totp' | 'approve';

export default function Login() {
  const { login, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [identity, setIdentity] = useState(searchParams.get('username') || '')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<Step>('creds')
  const [loginToken, setLoginToken] = useState('')
  // Вход через OAuth с включённой 2FA: логина/пароля нет — не сохраняем пустые учётные
  // данные (иначе затёрся бы ранее сохранённый пароль аккаунта в «Кто играет?»)
  const [viaOAuth, setViaOAuth] = useState(false)
  const location = useLocation()
  const credentials = () => (viaOAuth ? undefined : { identity, password })

  const startOAuthSecondFactor = (d: OAuthResultData) => {
    if (!d.login_token) return;
    setViaOAuth(true);
    setLoginToken(d.login_token);
    setError('');
    if (d.status === 'need_device_approval') {
      setStep('approve');
      return;
    }
    setMessage(d.message || 'Введите код из приложения-аутентификатора');
    setCode('');
    setStep('totp');
  };

  // OAuth со страницы регистрации передаёт сюда требование второго фактора
  useEffect(() => {
    const d = (location.state as { oauth2fa?: OAuthResultData } | null)?.oauth2fa;
    if (d) startOAuthSecondFactor(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false);
  // Согласие: пользовательское соглашение и политика конфиденциальности — оба обязательны
  const [consent, setConsent] = useState<ConsentState>({ terms: false, privacy: false })
  const consentOk = consentGiven(consent)
  const [consentNudge, setConsentNudge] = useState(0)
  const cooldown = useCooldown();

  // Ожидание подтверждения входа с телефона (опрос статуса сессии)
  useEffect(() => {
    if (step !== 'approve' || !loginToken) return;
    const id = setInterval(async () => {
      try {
        const res = await api.post('/auth/login-approval-status', { login_token: loginToken });
        const status = res.data?.status;
        if (status === 'approved' && res.data.user) {
          clearInterval(id);
          if (res.data.device_token) saveDeviceToken(res.data.user.username || identity, res.data.device_token);
          login(res.data.user, credentials());
          navigate('/library');
        } else if (status === 'denied') {
          clearInterval(id);
          setError('Вход отклонён на телефоне');
          setStep('creds');
        } else if (status === 'expired') {
          clearInterval(id);
          setError('Запрос истёк — попробуйте снова');
          setStep('creds');
        }
      } catch {
        // сетевая ошибка — повторим на следующем тике
      }
    }, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loginToken]);

  function handleError(err: any, fallback: string) {
    const data = err.response?.data;
    if (err.response?.status === 429 && data?.retry_after) {
      cooldown.start(data.retry_after);
    }
    return data?.error || fallback;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setViaOAuth(false); // вход по паролю — учётные данные снова сохраняем
    setError('');
    if (!consentOk) {
      // вместо текста ошибки подсвечиваем неотмеченные пункты согласия
      setConsentNudge((n) => n + 1);
      return;
    }
    setIsLoading(true);

    try {
      const response = await api.post('/auth/login', {
        identity,
        password,
        device_tokens: allDeviceTokens(),
        terms_accepted: consentOk,
        privacy_accepted: consentOk,
      });

      // Доверенное устройство — вход без кода
      if (response.data.user) {
        login(response.data.user, { identity, password });
        navigate('/library');
        return;
      }

      // Подтверждение входа с телефона (QR / push)
      if (response.data.need_device_approval) {
        setLoginToken(response.data.login_token);
        setError('');
        setStep('approve');
        return;
      }

      // Требуется код из приложения-аутентификатора (TOTP)
      if (response.data.need_totp) {
        setLoginToken(response.data.login_token);
        setMessage(response.data.message || 'Введите код из приложения-аутентификатора');
        setCode('');
        setStep('totp');
        return;
      }

      // Требуется код из письма (2FA)
      if (response.data.need_code) {
        setLoginToken(response.data.login_token);
        setMessage(response.data.message || 'Мы отправили код подтверждения на почту');
        setCode('');
        setStep('code');
      }
    } catch (err: any) {
      const data = err.response?.data;
      // Почта ещё не подтверждена — просим подтвердить
      if (data?.need_verify) {
        setMessage(data.message || 'Подтвердите почту — мы отправили код');
        setCode('');
        setStep('verify');
      } else {
        setError(handleError(err, 'Ошибка соединения'));
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCode(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await api.post('/auth/confirm-login', { login_token: loginToken, code });
      if (response.data.device_token) saveDeviceToken(response.data.user?.username || identity, response.data.device_token);
      login(response.data.user, { identity, password });
      navigate('/library');
    } catch (err: any) {
      setError(handleError(err, 'Неверный код'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTotp(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await api.post('/auth/confirm-totp', { login_token: loginToken, code });
      if (response.data.device_token) saveDeviceToken(response.data.user?.username || identity, response.data.device_token);
      login(response.data.user, credentials());
      navigate('/library');
    } catch (err: any) {
      setError(handleError(err, 'Неверный код'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await api.post('/auth/verify-email', { identity, code });
      if (response.data.device_token) saveDeviceToken(response.data.user?.username || identity, response.data.device_token);
      login(response.data.user, { identity, password });
      navigate('/library');
    } catch (err: any) {
      setError(handleError(err, 'Неверный код'));
    } finally {
      setIsLoading(false);
    }
  }

  async function resend() {
    setError('');
    try {
      const response = await api.post('/auth/resend-code', step === 'code' ? { login_token: loginToken } : { identity });
      setMessage(response.data.message || 'Код отправлен повторно');
    } catch (err: any) {
      setError(handleError(err, 'Не удалось отправить код'));
    }
  }

  // ===== Шаг: подтверждение входа с телефона =====
  if (step === 'approve') {
    return (
      <AuthLayout>
        <FormHeader
          title="Подтверждение входа"
          subtitle="Откройте приложение Lustre и подтвердите вход"
        />
        <div className="flex flex-col items-center gap-5 py-2">
          <div className="bg-white p-4 rounded-2xl shadow-lg">
            <QRCodeSVG value={`lustremobile://approve?token=${loginToken}`} size={208} />
          </div>
          <p className="text-xs text-pearl/70 text-center leading-relaxed">
            Отсканируйте QR-код в приложении Lustre
            <br />или подтвердите вход из push-уведомления.
          </p>
          {error && <p className="text-xs text-accent font-bold">{error}</p>}
          <div className="flex items-center gap-2 text-pearl/70 text-[11px] font-bold uppercase tracking-widest">
            <Loader2 className="animate-spin" size={13} /> Ожидаем подтверждение…
          </div>
          <button
            type="button"
            onClick={() => { setStep('creds'); setError(''); }}
            className="text-xs font-medium text-pearl/70 transition-colors hover:text-accent"
          >
            ← Назад
          </button>
        </div>
      </AuthLayout>
    );
  }

  // ===== Шаг: код из письма / подтверждение почты =====
  if (step !== 'creds') {
    const isVerify = step === 'verify';
    const isTotp = step === 'totp';
    return (
      <AuthLayout>
        <FormHeader
          title={isTotp ? 'Двухфакторный вход' : isVerify ? 'Подтвердите почту' : 'Подтверждение входа'}
          subtitle={
            isTotp
              ? 'Введите 6-значный код из приложения-аутентификатора'
              : message || (isVerify ? 'Введите код из письма' : 'Введите код, отправленный на вашу почту')
          }
        />
        <form onSubmit={isVerify ? handleVerify : isTotp ? handleTotp : handleCode} className="space-y-4" noValidate>
          <TextInput
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder={isTotp ? 'Код приложения' : 'Код из письма'}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center text-lg tracking-[0.5em]"
            disabled={isLoading}
          />
          {error && (
            <p className="text-xs text-accent font-bold animate-in fade-in slide-in-from-top-1">{error}</p>
          )}
          <PrimaryButton disabled={isLoading || cooldown.active}>
            {isLoading ? 'Проверяем...' : (isVerify ? 'Подтвердить почту' : 'Войти')}
          </PrimaryButton>
          {cooldown.active && (
            <p className="text-center text-[11px] font-medium text-pearl/70">
              Повторная отправка кода будет доступна через{' '}
              <span className="font-mono text-accent">{cooldown.label}</span>
            </p>
          )}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => { setStep('creds'); setError(''); setCode(''); }}
              className="text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
            >
              ← Назад
            </button>
            {!isTotp && (
              <button
                type="button"
                disabled={isLoading || cooldown.active}
                onClick={resend}
                className="text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
              >
                {cooldown.active ? `Отправить повторно (${cooldown.label})` : 'Отправить код повторно'}
              </button>
            )}
          </div>
        </form>
      </AuthLayout>
    );
  }

  // ===== Шаг: логин и пароль =====
  return (
    <AuthLayout>
      <FormHeader
        title="Добро пожаловать в Lustre"
        subtitle="Введите данные, чтобы войти в аккаунт"
      />
      <SocialButtons consent={consentOk} disabled={!consentOk} onBlocked={() => setConsentNudge((n) => n + 1)} onDone={async () => { await refreshUser(); navigate('/library'); }} onSecondFactor={startOAuthSecondFactor} />
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextInput
          type="text"
          placeholder="Логин или email"
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          autoComplete="username"
          disabled={isLoading}
        />
        <div>
          <PasswordInput
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={isLoading}
          />
          {error && (
            <p className="mt-2 text-xs text-accent font-bold animate-in fade-in slide-in-from-top-1">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => navigate('/reset-password')}
            className="mt-2 text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
          >
            Забыли пароль?
          </button>
        </div>

        <ConsentCheckboxes value={consent} onChange={setConsent} idPrefix="login" nudge={consentNudge} />

        <PrimaryButton disabled={isLoading || cooldown.active}>
          {isLoading ? 'Вход...' : 'Войти'}
        </PrimaryButton>
        {cooldown.active && (
          <p className="text-center text-[11px] font-medium text-pearl/70">
            Слишком много попыток. Повторите через{' '}
            <span className="font-mono text-accent">{cooldown.label}</span>
          </p>
        )}
      </form>
      <BottomLink
        text="Нет аккаунта?"
        action="Зарегистрироваться"
        onClick={() => navigate('/register')}
      />
    </AuthLayout>
  )
}
