import { useEffect, useState } from 'react';
import { X, Plus, Gamepad2, Loader2, ArrowLeft } from 'lucide-react';
import api from '../../api';
import { secureStorage } from '../../api/secureStorage';
import { allDeviceTokens, saveDeviceToken, removeDeviceTokenForAccount } from '../../api/deviceTokens';
import { saveKnownAccount, removeKnownAccount } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import { useCooldown } from '../../utils/useCooldown';

const FALLBACK_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Moby';

type Pending = { username: string; password: string; loginToken: string; purpose: 'login' | 'verify' | 'totp' };

// Окно «Кто играет?» — выбор аккаунта как в Steam
export default function AccountPickerPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [askOnStart, setAskOnStart] = useState(false);
  const [busyUsername, setBusyUsername] = useState('');
  const electron = (window as any).electron;
  const dlg = useDialog();

  // Подтверждение кодом из письма (2FA)
  const [pending, setPending] = useState<Pending | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [busyCode, setBusyCode] = useState(false);
  const cooldown = useCooldown();

  useEffect(() => {
    const cur = secureStorage.getItem('user');
    setCurrentUsername(cur?.username || '');
    setAskOnStart(secureStorage.getItem('askAccountOnStart') === true);

    let list = secureStorage.getItem('knownAccounts') || [];
    // Текущий пользователь мог ещё не попасть в список — добавляем
    if (cur && !list.some((a: any) => a.username === cur.username)) {
      list = [
        { username: cur.username, avatar_url: cur.profile?.avatar_url || '', display_name: cur.profile?.display_name || cur.username },
        ...list,
      ];
      secureStorage.setItem('knownAccounts', list);
    }
    setAccounts(list);
  }, []);

  const close = (action: 'cancel' | 'switch' | 'switched', username?: string) => {
    electron?.closeAccountPicker?.({ action, username });
  };

  const finish = (username: string, password: string, user: any) => {
    secureStorage.setItem('user', user);
    saveKnownAccount(user, { identity: username, password });
    close('switched'); // главное окно перезагрузится уже с новым аккаунтом
  };

  // Выбор аккаунта: текущий — просто возврат, другой — авто-вход по сохранённому паролю
  const pick = async (a: any) => {
    if (a.username === currentUsername) { close('cancel'); return; }

    if (a.password) {
      setBusyUsername(a.username);
      try {
        const res = await api.post('/auth/login', {
          identity: a.username,
          password: a.password,
          device_tokens: allDeviceTokens(),
        });

        // Доверенное устройство — вход без кода
        if (res.data.user) { finish(a.username, a.password, res.data.user); return; }

        // Требуется код из приложения-аутентификатора (TOTP)
        if (res.data.need_totp) {
          setPending({ username: a.username, password: a.password, loginToken: res.data.login_token, purpose: 'totp' });
          setCode('');
          setCodeError('');
          return;
        }

        // Требуется код из письма (вход)
        if (res.data.need_code) {
          setPending({ username: a.username, password: a.password, loginToken: res.data.login_token, purpose: 'login' });
          setCode('');
          setCodeError('');
          return;
        }

        // Подтверждение с телефона — уводим в основное окно входа (QR)
        if (res.data.need_device_approval) {
          close('switch', a.username);
          return;
        }
      } catch (err: any) {
        const data = err.response?.data;
        // Почта не подтверждена — просим код подтверждения
        if (data?.need_verify) {
          setPending({ username: a.username, password: a.password, loginToken: '', purpose: 'verify' });
          setCode('');
          setCodeError('');
          return;
        }
        // пароль не подошёл — обычная форма входа с префиллом
      } finally {
        setBusyUsername('');
      }
    }
    close('switch', a.username);
  };

  // Удаление аккаунта ТОЛЬКО с этого компьютера (серверный аккаунт не трогаем)
  const forget = async (a: any) => {
    const isCurrent = a.username === currentUsername;
    const ok = await dlg.confirm({
      title: 'Удалить аккаунт с этого компьютера?',
      message: isCurrent
        ? `«${a.display_name || a.username}» исчезнет из списка на этом устройстве, и вы выйдете из аккаунта. Аккаунт на сервере не будет удалён.`
        : `«${a.display_name || a.username}» исчезнет из списка на этом устройстве. Аккаунт на сервере не будет удалён.`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    removeKnownAccount(a.username);
    removeDeviceTokenForAccount(a.username);
    if (isCurrent) {
      // текущий аккаунт: закрываем picker → главное окно выполнит logout
      close('switch', '');
      return;
    }
    setAccounts((prev) => prev.filter((x) => x.username !== a.username));
  };

  const submitCode = async () => {
    if (!pending || !code.trim()) return;
    setBusyCode(true);
    setCodeError('');
    try {
      const res = pending.purpose === 'totp'
        ? await api.post('/auth/confirm-totp', { login_token: pending.loginToken, code })
        : pending.purpose === 'login'
          ? await api.post('/auth/confirm-login', { login_token: pending.loginToken, code })
          : await api.post('/auth/verify-email', { identity: pending.username, code });
      if (res.data.device_token) saveDeviceToken(res.data.user?.username || pending.username, res.data.device_token);
      finish(pending.username, pending.password, res.data.user);
    } catch (err: any) {
      if (err.response?.status === 429 && err.response.data?.retry_after) cooldown.start(err.response.data.retry_after);
      setCodeError(err.response?.data?.error || 'Неверный код');
    } finally {
      setBusyCode(false);
    }
  };

  const resend = async () => {
    if (!pending || pending.purpose === 'totp') return;
    setCodeError('');
    try {
      const res = pending.purpose === 'login'
        ? await api.post('/auth/resend-code', { login_token: pending.loginToken })
        : await api.post('/auth/resend-code', { identity: pending.username });
      if (res.data?.mail_failed) setCodeError(res.data.message || 'Не удалось отправить письмо');
    } catch (err: any) {
      if (err.response?.status === 429 && err.response.data?.retry_after) cooldown.start(err.response.data.retry_after);
      setCodeError(err.response?.data?.error || 'Не удалось отправить код');
    }
  };

  const toggleAsk = () => {
    const next = !askOnStart;
    setAskOnStart(next);
    secureStorage.setItem('askAccountOnStart', next);
  };

  // ===== Шаг подтверждения кодом =====
  if (pending) {
    return (
      <div
        className="h-screen w-full bg-main-bg overflow-hidden select-none"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="tl-grid-bg" aria-hidden />
        <div className="relative h-full w-full flex flex-col items-center justify-center border border-[var(--line)] bg-[radial-gradient(circle_at_50%_-20%,rgb(var(--violet-rgb)_/_0.15),transparent)] px-8">
          <h1
            className="tl-pixel text-[18px] uppercase text-white leading-tight text-center"
            style={{ textShadow: 'var(--glow)' }}
          >
            {pending.purpose === 'totp' ? 'Двухфакторный вход' : pending.purpose === 'verify' ? 'Подтвердите почту' : 'Подтверждение входа'}
          </h1>
          <p className="mt-3 tl-term text-[15px] tl-muted text-center">
            {pending.purpose === 'totp'
              ? 'Введите 6-значный код из приложения-аутентификатора'
              : pending.purpose === 'verify'
                ? 'Аккаунт не подтверждён — введите код из письма'
                : 'Мы отправили код подтверждения на почту аккаунта'}
          </p>
          <span className="mt-4 w-16 h-px" style={{ background: 'var(--line-2)' }} />

          <div className="mt-6 w-full max-w-[280px] space-y-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCode(); }}
              placeholder={pending.purpose === 'totp' ? 'Код приложения' : 'Код из письма'}
              className="tl-field rounded-none w-full text-center tl-num text-[18px] tracking-[0.5em]"
            />
            {codeError && <p className="tl-term text-[14px] text-accent text-center">{codeError}</p>}
            {cooldown.active && (
              <p className="tl-term text-[13px] tl-muted text-center">
                Повторно через <span className="tl-num text-[13px] text-accent">{cooldown.label}</span>
              </p>
            )}

            <button
              onClick={submitCode}
              disabled={busyCode || !code.trim()}
              className="tl-btn solid w-full h-11 disabled:opacity-50"
            >
              {busyCode ? <Loader2 size={14} className="animate-spin" /> : null} Войти
            </button>

            <div className="flex items-center justify-between">
              <button
                onClick={() => { setPending(null); setCode(''); setCodeError(''); }}
                className="tl-head text-[10px] uppercase tracking-[0.18em] tl-muted hover:text-accent transition-colors flex items-center gap-1.5"
              >
                <ArrowLeft size={12} /> Назад
              </button>
              {pending.purpose !== 'totp' && (
                <button
                  onClick={resend}
                  disabled={cooldown.active}
                  className="tl-head text-[10px] uppercase tracking-[0.18em] tl-muted hover:text-accent transition-colors disabled:opacity-40"
                >
                  {cooldown.active ? `Повторно (${cooldown.label})` : 'Отправить повторно'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen w-full bg-main-bg overflow-hidden select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="tl-grid-bg" aria-hidden />
      <div className="relative h-full w-full flex flex-col items-center border border-[var(--line)] bg-[radial-gradient(circle_at_50%_-20%,rgb(var(--violet-rgb)_/_0.15),transparent)]">
        {/* Заголовок с логотипом и закрытием */}
        <div className="w-full flex items-center justify-between px-5 pt-4">
          <div className="flex items-center gap-2 pointer-events-none">
            <Gamepad2 size={16} className="text-accent" />
            <span className="tl-head text-[10px] uppercase tracking-[0.25em] text-pearl/70">LustreHub</span>
          </div>
          <button
            onClick={() => close('cancel')}
            className="w-7 h-7 rounded-none border border-[var(--line)] bg-white/[0.04] hover:bg-red-600 hover:border-red-600 text-pearl/72 hover:text-white flex items-center justify-center transition-all"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title="Закрыть"
          >
            <X size={14} />
          </button>
        </div>

        <h1
          className="mt-8 tl-pixel text-[22px] uppercase text-white leading-tight"
          style={{ textShadow: 'var(--glow)' }}
        >
          Кто играет?
        </h1>
        <span className="mt-4 w-16 h-px" style={{ background: 'var(--line-2)' }} />

        {/* Аватары аккаунтов */}
        <div
          className="mt-8 flex items-center gap-5 flex-wrap justify-center px-6"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {accounts.map((a) => {
            const isCurrent = a.username === currentUsername;
            return (
              <div key={a.username} className="relative group/cell">
                <button
                  onClick={() => pick(a)}
                  disabled={busyUsername === a.username}
                  className="group flex flex-col items-center gap-2 disabled:opacity-70"
                  title={isCurrent ? 'Текущий аккаунт' : 'Войти в этот аккаунт'}
                >
                  <div className="relative">
                    <img
                      src={a.avatar_url || FALLBACK_AVATAR}
                      className={`relative z-10 w-[72px] h-[72px] rounded-none object-cover bg-black border transition-all group-hover:scale-105 ${isCurrent ? 'border-[var(--green2)]' : 'border-[var(--line)] group-hover:border-[var(--line-2)]'}`}
                      alt={a.username}
                    />
                    {busyUsername === a.username && (
                      <span className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 border border-[var(--line)]">
                        <Loader2 size={20} className="animate-spin text-white" />
                      </span>
                    )}
                    {isCurrent && (
                      <span className="absolute -bottom-1 -right-1 z-20 w-3 h-3 rounded-none bg-[var(--green2)] border border-main-bg" />
                    )}
                  </div>
                  <span className={`tl-head text-[10px] uppercase tracking-[0.16em] max-w-[84px] truncate ${isCurrent ? 'text-[var(--green2)]' : 'text-pearl/70 group-hover:text-pearl'}`}>
                    {a.display_name || a.username}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void forget(a); }}
                  className="absolute -top-1.5 -right-1.5 z-30 w-5 h-5 border border-[var(--line)] bg-black/80 text-pearl/65 group-hover/cell:text-pearl/70 hover:text-white hover:bg-red-600 hover:border-red-600 transition-all flex items-center justify-center"
                  title="Удалить с этого компьютера"
                  aria-label={`Удалить ${a.username} с этого компьютера`}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}

          {/* Новый аккаунт */}
          <button
            onClick={() => close('switch', '')}
            className="flex flex-col items-center gap-2"
            title="Войти в другой аккаунт"
          >
            <div className="w-[72px] h-[72px] rounded-none border border-dashed border-[var(--line-2)] flex items-center justify-center text-pearl/60 hover:text-accent hover:border-accent transition-all hover:scale-105">
              <Plus size={26} />
            </div>
            <span className="tl-head text-[10px] uppercase tracking-[0.16em] text-pearl/60">Добавить</span>
          </button>
        </div>

        {/* Тумблер «спрашивать при каждом запуске» */}
        <div
          className="mt-auto mb-5 flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="tl-term text-[14px] tl-muted">Спрашивать при каждом запуске, какой аккаунт использовать</span>
          <button
            onClick={toggleAsk}
            className={`w-9 h-5 rounded-none relative transition-all border ${askOnStart ? 'bg-[rgb(var(--accent-rgb)/.28)] border-[var(--line-2)]' : 'bg-white/[0.04] border-[var(--line)]'}`}
          >
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-none transition-all ${askOnStart ? 'left-[18px] bg-accent' : 'left-[2px] bg-pearl/40'}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
