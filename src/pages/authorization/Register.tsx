import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { saveDeviceToken } from '../../api/deviceTokens'
import { useAuth } from '../../context/AuthContext'
import { useCooldown } from '../../utils/useCooldown'

export default function Register() {
  const navigate = useNavigate()
  const { login: authLogin, refreshUser } = useAuth()
  const cooldown = useCooldown()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [login, setLogin] = useState('')
  // Согласие: пользовательское соглашение и политика конфиденциальности — оба обязательны
  const [consent, setConsent] = useState<ConsentState>({ terms: false, privacy: false })
  const consentOk = consentGiven(consent)
  const [consentNudge, setConsentNudge] = useState(0)

  // Шаг подтверждения почты
  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!consentOk) {
      // вместо текста ошибки подсвечиваем неотмеченные пункты согласия
      setConsentNudge((n) => n + 1);
      return;
    }
    setIsLoading(true);

    try {
      const response = await api.post('/auth/register', {
        username: login,
        email: email,
        password: password,
        // Согласие: чекбоксы на форме, бэкенд проверяет и сохраняет
        terms_accepted: consentOk,
        privacy_accepted: consentOk,
      });

      setMessage(response.data.message || 'Мы отправили код подтверждения на вашу почту');
      setCode('');
      setStep('verify');
    } catch (err: any) {
      if (err.response?.status === 429 && err.response.data?.retry_after) cooldown.start(err.response.data.retry_after);
      setError(err.response?.data?.error || 'Не удалось зарегистрироваться');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await api.post('/auth/verify-email', { identity: email, code });
      if (response.data.device_token) saveDeviceToken(response.data.user?.username || login, response.data.device_token);
      authLogin(response.data.user, { identity: login, password });
      navigate('/library');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Неверный код');
    } finally {
      setIsLoading(false);
    }
  }

  async function resend() {
    setError('');
    try {
      const response = await api.post('/auth/resend-code', { identity: email });
      setMessage(response.data.message || 'Код отправлен повторно');
    } catch (err: any) {
      if (err.response?.status === 429 && err.response.data?.retry_after) cooldown.start(err.response.data.retry_after);
      setError(err.response?.data?.error || 'Не удалось отправить код');
    }
  }

  if (step === 'verify') {
    return (
      <AuthLayout>
        <FormHeader
          title="Подтвердите почту"
          subtitle={message || `Мы отправили код на ${email}`}
        />
        <form onSubmit={handleVerify} className="space-y-4" noValidate>
          <TextInput
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Код из письма"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center text-lg tracking-[0.5em]"
            disabled={isLoading}
          />
          {error && <p className="text-xs text-[#f87171]">{error}</p>}
          <PrimaryButton disabled={isLoading || cooldown.active}>{isLoading ? 'Проверяем...' : 'Подтвердить и войти'}</PrimaryButton>
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
              onClick={() => { setStep('form'); setError(''); setCode(''); }}
              className="text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
            >
              ← Назад
            </button>
            <button
              type="button"
              disabled={isLoading || cooldown.active}
              onClick={resend}
              className="text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
            >
              {cooldown.active ? `Отправить повторно (${cooldown.label})` : 'Отправить код повторно'}
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <FormHeader
        title="Добро пожаловать в Lustre"
        subtitle="Введите данные, чтобы создать аккаунт"
      />
      <SocialButtons consent={consentOk} disabled={!consentOk} onBlocked={() => setConsentNudge((n) => n + 1)} onDone={async () => { await refreshUser(); navigate('/library'); }} onSecondFactor={(d) => navigate('/login', { state: { oauth2fa: d } })} />
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <TextInput
            type="text"
            placeholder="Логин"
            value={login}
            // только латиница: кириллицу и прочее не вводим прямо при наборе
            onChange={(e) => setLogin(e.target.value.replace(/[^A-Za-z0-9_.-]/g, ''))}
            maxLength={32}
            autoComplete="login"
            disabled={isLoading}
          />
          <p className="mt-1 text-[11px] text-pearl/70">Латинские буквы, цифры и символы _ . - (3–32)</p>
        </div>
        <div>
          <TextInput
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value.replace(/[^\x20-\x7e]/g, ''))}
            maxLength={254}
            autoComplete="email"
            disabled={isLoading}
          />
          <p className="mt-1 text-[11px] text-pearl/70">Только латиницей, например name@example.com</p>
        </div>
        <div>
          <PasswordInput
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/[^\x20-\x7e]/g, ''))}
            maxLength={72}
            autoComplete="new-password"
            disabled={isLoading}
          />
          <p className="mt-1 text-[11px] text-pearl/70">Латинские буквы, цифры и символы (минимум 8)</p>
        </div>
        {error && <p className="text-xs text-[#f87171]">{error}</p>}
        <ConsentCheckboxes value={consent} onChange={setConsent} idPrefix="register" nudge={consentNudge} />
        <PrimaryButton disabled={isLoading || cooldown.active}>
          {isLoading ? 'Создаём...' : 'Продолжить с Email'}
        </PrimaryButton>
      </form>
      <BottomLink
        text="Уже есть аккаунт?"
        action="Войти"
        onClick={() => navigate('/login')}
      />
    </AuthLayout>
  )
}
