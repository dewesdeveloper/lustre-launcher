import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthLayout, FormHeader, PasswordInput, PrimaryButton, TextInput } from './ui'
import api from '../../api'
import { useCooldown } from '../../utils/useCooldown'

type Step = 'email' | 'code' | 'done'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const cooldown = useCooldown()

  function handleError(err: any, fallback: string) {
    const data = err.response?.data
    if (err.response?.status === 429 && data?.retry_after) {
      cooldown.start(data.retry_after)
    }
    return data?.error || fallback
  }

  async function sendCode(event?: FormEvent) {
    event?.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Введите корректный email')
      return
    }
    setIsLoading(true)
    try {
      const response = await api.post('/auth/forgot-password', { email: email.trim() })
      setMessage(response.data?.message || 'Если такая почта зарегистрирована, мы отправили код для сброса пароля')
      setCode('')
      setStep('code')
      cooldown.start(60)
    } catch (err: any) {
      setError(handleError(err, 'Не удалось отправить код'))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (code.trim().length !== 6) {
      setError('Введите 6-значный код из письма')
      return
    }
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают')
      return
    }
    setIsLoading(true)
    try {
      await api.post('/auth/reset-password', {
        email: email.trim(),
        code: code.trim(),
        new_password: password,
      })
      setStep('done')
    } catch (err: any) {
      setError(handleError(err, 'Не удалось сбросить пароль'))
    } finally {
      setIsLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <AuthLayout>
        <FormHeader
          title="Пароль изменён"
          subtitle="Теперь можно войти с новым паролем"
        />
        <form
          onSubmit={(event) => {
            event.preventDefault()
            navigate(`/login?username=${encodeURIComponent(email.trim())}`)
          }}
        >
          <PrimaryButton>Войти</PrimaryButton>
        </form>
      </AuthLayout>
    )
  }

  if (step === 'code') {
    return (
      <AuthLayout>
        <FormHeader
          title="Новый пароль"
          subtitle={message || 'Введите код из письма и задайте новый пароль'}
        />
        <form onSubmit={handleReset} className="space-y-4" noValidate>
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
          <PasswordInput
            placeholder="Новый пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            disabled={isLoading}
          />
          <PasswordInput
            placeholder="Повторите пароль"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={isLoading}
          />
          {error && (
            <p className="text-xs text-accent font-bold animate-in fade-in slide-in-from-top-1">{error}</p>
          )}
          <PrimaryButton disabled={isLoading || cooldown.active}>
            {isLoading ? 'Сохраняем...' : 'Сбросить пароль'}
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
              onClick={() => {
                setStep('email')
                setError('')
                setCode('')
                setPassword('')
                setConfirm('')
              }}
              className="text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
            >
              ← Изменить почту
            </button>
            <button
              type="button"
              disabled={isLoading || cooldown.active}
              onClick={() => sendCode()}
              className="text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
            >
              {cooldown.active ? `Отправить повторно (${cooldown.label})` : 'Отправить код повторно'}
            </button>
          </div>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => navigate('/login')}
            className="w-full text-center text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
          >
            Вернуться ко входу
          </button>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <FormHeader
        title="Восстановление пароля"
        subtitle="Введите email, на который зарегистрирован аккаунт — мы отправим код"
      />
      <form onSubmit={sendCode} className="space-y-4" noValidate>
        <TextInput
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={isLoading}
        />
        {error && (
          <p className="text-xs text-accent font-bold animate-in fade-in slide-in-from-top-1">{error}</p>
        )}
        <PrimaryButton disabled={isLoading || cooldown.active}>
          {isLoading ? 'Отправляем...' : 'Продолжить с Email'}
        </PrimaryButton>
        {cooldown.active && (
          <p className="text-center text-[11px] font-medium text-pearl/70">
            Повторная отправка кода будет доступна через{' '}
            <span className="font-mono text-accent">{cooldown.label}</span>
          </p>
        )}
        <button
          type="button"
          disabled={isLoading}
          onClick={() => navigate('/login')}
          className="w-full text-center text-xs font-medium text-pearl/70 transition-colors hover:text-accent disabled:opacity-50"
        >
          ← Вернуться ко входу
        </button>
      </form>
    </AuthLayout>
  )
}
