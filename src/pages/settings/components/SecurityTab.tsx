import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Check, ShieldCheck, Monitor, Trash2, Pencil, LogOut } from 'lucide-react';
import api from '../../../api';
import { secureStorage } from '../../../api/secureStorage';
import { getDeviceToken, saveDeviceToken, removeDeviceToken, clearDeviceTokens } from '../../../api/deviceTokens';
import { useAuth } from '../../../context/AuthContext';
import { useCooldown } from '../../../utils/useCooldown';
import { getCachedDeviceInfo } from '../../../utils/deviceInfo';
import SettingsToggle from './SettingsToggle';
import { LoadingInline } from '../../../components/Loading';

function timeAgo(iso?: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  return new Date(iso).toLocaleDateString('ru-RU');
}

export default function SecurityTab() {
  const { user } = useAuth();
  const cooldown = useCooldown();

  const [showForm, setShowForm] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [dontSave, setDontSave] = useState(secureStorage.getItem('dontSaveAccount') === true);

  const [days, setDays] = useState<number>(user?.trusted_device_days ?? 30);
  const [savingDays, setSavingDays] = useState(false);
  const [daysMsg, setDaysMsg] = useState('');

  const [trusted, setTrusted] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [hoursLeft, setHoursLeft] = useState(0);
  const [forever, setForever] = useState(false);
  const [trustLoading, setTrustLoading] = useState(true);
  const [trustBusy, setTrustBusy] = useState(false);
  const [trustToken, setTrustToken] = useState('');
  const [trustCode, setTrustCode] = useState('');
  const [trustError, setTrustError] = useState('');
  const [showTrustCode, setShowTrustCode] = useState(false);

  const [devices, setDevices] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesBusy, setDevicesBusy] = useState(false);
  const [devicesError, setDevicesError] = useState('');
  const [renamingId, setRenamingId] = useState('');
  const [renameValue, setRenameValue] = useState('');

  const loadDevices = async () => {
    try {
      const res = await api.post('/auth/trusted-devices', { device_token: getDeviceToken(user?.username) });
      setDevices(res.data.devices || []);
    } catch {
      setDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  };

  const removeDevice = async (d: any) => {
    setDevicesBusy(true);
    setDevicesError('');
    try {
      await api.post('/auth/trusted-device-remove', { id: d.id, device_id: d.device_id });
      if (d.current) {
        removeDeviceToken(user?.username);
        setTrusted(false);
      }
      await loadDevices();
    } catch (e: any) {
      setDevicesError(e?.response?.data?.error || 'Не удалось удалить устройство');
    } finally {
      setDevicesBusy(false);
    }
  };

  const saveRename = async (d: any) => {
    const name = renameValue.trim();
    if (!name) { setRenamingId(''); return; }
    setDevicesBusy(true);
    setDevicesError('');
    try {
      await api.post('/auth/trusted-device-rename', { id: d.id, device_id: d.device_id, name });
      setRenamingId('');
      await loadDevices();
    } catch (e: any) {
      setDevicesError(e?.response?.data?.error || 'Не удалось переименовать устройство');
    } finally {
      setDevicesBusy(false);
    }
  };

  const revokeOthers = async () => {
    setDevicesBusy(true);
    setDevicesError('');
    try {
      await api.post('/auth/trusted-devices-revoke-others', { device_id: getCachedDeviceInfo().id });
      await loadDevices();
    } catch (e: any) {
      setDevicesError(e?.response?.data?.error || 'Не удалось выйти на других устройствах');
    } finally {
      setDevicesBusy(false);
    }
  };

  const refreshTrust = async () => {
    const token = getDeviceToken(user?.username);
    if (!token) { setTrusted(false); setTrustLoading(false); return; }
    try {
      const res = await api.post('/auth/trusted-device-status', { device_token: token });
      setTrusted(!!res.data.trusted);
      setDaysLeft(res.data.days_left || 0);
      setHoursLeft(res.data.hours_left || 0);
      setForever(!!res.data.forever);
    } catch {
      setTrusted(false);
    } finally {
      setTrustLoading(false);
    }
  };

  useEffect(() => {
    refreshTrust();
    loadDevices();
    const timer = setInterval(refreshTrust, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleDontSave = () => {
    const v = !dontSave;
    setDontSave(v);
    secureStorage.setItem('dontSaveAccount', v);
    if (v) {
      const list = secureStorage.getItem('knownAccounts') || [];
      secureStorage.setItem('knownAccounts', list.map(({ password, ...rest }: any) => rest));
      clearDeviceTokens();
      setTrusted(false);
    }
  };

  const changeDays = async (d: number) => {
    if (d === days || savingDays) return;
    setSavingDays(true);
    setDaysMsg('');
    try {
      await api.post('/auth/trusted-device-days', { days: d });
      setDays(d);
      setDaysMsg('Сохранено');
      refreshTrust();
      setTimeout(() => setDaysMsg(''), 2000);
    } catch (e: any) {
      setDaysMsg(e?.response?.data?.error || 'Не удалось сохранить');
    } finally {
      setSavingDays(false);
    }
  };

  const toggleTrust = async () => {
    setTrustError('');
    setTrustBusy(true);
    try {
      if (trusted) {
        await api.post('/auth/trusted-device-revoke', { device_token: getDeviceToken(user?.username) });
        removeDeviceToken(user?.username);
        setTrusted(false);
        setShowTrustCode(false);
        loadDevices();
      } else {
        const res = await api.post('/auth/trust-device-start', {});
        setTrustToken(res.data.trust_token);
        setTrustCode('');
        setShowTrustCode(true);
      }
    } catch (e: any) {
      if (e?.response?.status === 429 && e.response.data?.retry_after) cooldown.start(e.response.data.retry_after);
      setTrustError(e?.response?.data?.error || 'Не удалось выполнить действие');
    } finally {
      setTrustBusy(false);
    }
  };

  const confirmTrust = async () => {
    if (!trustCode.trim()) return;
    setTrustBusy(true);
    setTrustError('');
    try {
      const res = await api.post('/auth/confirm-trust', { trust_token: trustToken, code: trustCode });
      saveDeviceToken(user?.username || '', res.data.device_token);
      setShowTrustCode(false);
      setTrustCode('');
      await refreshTrust();
      loadDevices();
    } catch (e: any) {
      setTrustError(e?.response?.data?.error || 'Неверный код');
    } finally {
      setTrustBusy(false);
    }
  };

  const submit = async () => {
    setError('');
    setOk('');
    if (next.length < 6) { setError('Новый пароль — минимум 6 символов'); return; }
    if (next !== confirm) { setError('Пароли не совпадают'); return; }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next });
      setOk('Пароль изменён. Доверенные устройства сброшены.');
      setCurrent('');
      setNext('');
      setConfirm('');
      secureStorage.removeItem('deviceToken');
      removeDeviceToken(user?.username);
      setTrusted(false);
      loadDevices();
      setTimeout(() => { setShowForm(false); setOk(''); }, 2500);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Не удалось изменить пароль');
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'tl-field';

  const trustInfo = !trusted
    ? 'Устройство не доверено — код из письма запрашивается при каждом входе.'
    : forever
      ? 'Повторное подтверждение: никогда.'
      : `Повторное подтверждение через ${daysLeft} д. ${hoursLeft} ч.`;

  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <span className="tl-term text-[16px] tl-muted">Логин:</span>
            <span className="tl-head text-[11px] font-bold text-white truncate">{user?.username || '—'}</span>
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setError(''); setOk(''); }}
            className="tl-btn ghost shrink-0"
          >
            {showForm ? 'Отмена' : 'Изменить пароль'}
          </button>
        </div>

        {showForm && (
          <div className="mt-5 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-300">
            <input
              type={visible ? 'text' : 'password'}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Текущий пароль"
              className={inputClass}
            />
            <input
              type={visible ? 'text' : 'password'}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="Новый пароль"
              className={inputClass}
            />
            <div className="relative">
              <input
                type={visible ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                placeholder="Повторите новый пароль"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                title={visible ? 'Скрыть пароль' : 'Показать пароль'}
                className="absolute right-px top-px bottom-px w-10 border-l border-[var(--line)] text-[var(--muted)] hover:text-accent hover:bg-[rgb(var(--accent-rgb)/.1)] transition-colors flex items-center justify-center"
              >
                {visible ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error && <p className="tl-head text-[10px] uppercase tracking-[0.1em] text-accent">{error}</p>}
            {ok && (
              <p className="tl-head text-[10px] uppercase tracking-[0.1em] text-[var(--green2)] flex items-center gap-1.5">
                <Check size={13} /> {ok}
              </p>
            )}

            <button
              onClick={submit}
              disabled={busy || !current || !next || !confirm}
              className="tl-btn solid block"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null} Сохранить новый пароль
            </button>
          </div>
        )}
      </div>

      <div className="tl-panel p-[22px]">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="tl-head text-[10px] font-bold uppercase tracking-[0.1em] text-white">Не сохранять данные аккаунта на этом компьютере</p>
            <p className="tl-term text-[15px] text-[var(--muted-2)] mt-1.5 leading-relaxed">
              Эта опция рекомендована для компьютеров, находящихся в общем пользовании.
              Если она включена, нельзя использовать автономный режим.
            </p>
          </div>
          <SettingsToggle label="" checked={dontSave} onChange={toggleDontSave} />
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <div className="flex items-center justify-between gap-4 mb-1">
          <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>СРОК ПОДТВЕРЖДЕНИЯ</h3>
          {savingDays ? (
            <Loader2 size={14} className="animate-spin text-accent" />
          ) : daysMsg ? (
            <span className={`tl-head text-[10px] font-bold uppercase tracking-[0.1em] ${daysMsg === 'Сохранено' ? 'text-[var(--green2)]' : 'text-accent'}`}>
              {daysMsg}
            </span>
          ) : null}
        </div>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-1 mb-4 leading-relaxed">
          Через сколько дней устройство перестаёт быть доверенным и при входе снова запрашивается код из письма.
        </p>
        <div className="tl-tabs">
          {[
            { value: 30, label: '30 дней' },
            { value: 60, label: '60 дней' },
            { value: 90, label: '90 дней' },
            { value: 365, label: '365 дней' },
            { value: 0, label: 'Никогда' },
          ].map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => changeDays(o.value)}
              disabled={savingDays}
              className={`tl-tab ${days === o.value ? 'active' : ''} disabled:opacity-50`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0 flex items-start gap-3">
            <span className={`mt-0.5 shrink-0 ${trusted ? 'text-[var(--green2)]' : 'text-[var(--muted-2)]'}`}>
              <ShieldCheck size={18} />
            </span>
            <div className="min-w-0">
              <p className="tl-head text-[10px] font-bold uppercase tracking-[0.1em] text-white">Доверенное устройство</p>
              <p className="tl-term text-[15px] text-[var(--muted-2)] mt-1 leading-relaxed">
                {trustLoading ? 'Проверяем...' : trustInfo}
              </p>
            </div>
          </div>
          <SettingsToggle label="" checked={trusted} onChange={toggleTrust} disabled={trustBusy || cooldown.active} />
        </div>

        {cooldown.active && (
          <p className="tl-term text-[15px] tl-muted mt-3">
            Слишком много запросов кода. Повторите через{' '}
            <span className="tl-pink">{cooldown.label}</span>
          </p>
        )}

        {showTrustCode && !trusted && (
          <div className="mt-4 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-300">
            <p className="tl-term text-[15px] tl-muted">Введите код из письма, чтобы доверять этому устройству.</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={trustCode}
              onChange={(e) => setTrustCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmTrust(); }}
              placeholder="Код из письма"
              className={`${inputClass} text-center tracking-[0.4em]`}
            />
            {trustError && <p className="tl-head text-[10px] uppercase tracking-[0.1em] text-accent">{trustError}</p>}
            <button
              onClick={confirmTrust}
              disabled={trustBusy || !trustCode.trim()}
              className="tl-btn solid block"
            >
              {trustBusy ? <Loader2 size={14} className="animate-spin" /> : null} Подтвердить устройство
            </button>
          </div>
        )}

        {trustError && !showTrustCode && (
          <p className="tl-head text-[10px] uppercase tracking-[0.1em] text-accent mt-3">{trustError}</p>
        )}
      </div>

      <div className="tl-panel p-[22px]">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>УСТРОЙСТВА АККАУНТА</h3>
            <p className="tl-term text-[15px] text-[var(--muted-2)] mt-1 leading-relaxed">
              Устройства, на которых вход не требует код из письма.
            </p>
          </div>
          {devices.length > 1 && (
            <button
              onClick={revokeOthers}
              disabled={devicesBusy}
              className="tl-btn ghost shrink-0"
            >
              {devicesBusy ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
              Выйти на всех других
            </button>
          )}
        </div>

        {devicesError && <p className="tl-head text-[10px] uppercase tracking-[0.1em] text-accent mb-3">{devicesError}</p>}

        {devicesLoading ? (
          <div className="flex items-center gap-2 tl-term text-[15px] tl-muted">
            <LoadingInline /> Загружаем устройства...
          </div>
        ) : devices.length === 0 ? (
          <p className="tl-term text-[15px] tl-muted">Нет доверенных устройств.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {devices.map((d) => {
              const rowKey = d.device_id || `id-${d.id}`;
              const isRenaming = renamingId === rowKey;
              return (
                <div
                  key={rowKey}
                  className="flex items-center gap-3 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.03)] px-4 py-3"
                >
                  <Monitor size={16} className={d.current ? 'text-[var(--green2)] shrink-0' : 'text-[var(--muted-2)] shrink-0'} />
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(d);
                          if (e.key === 'Escape') setRenamingId('');
                        }}
                        maxLength={60}
                        className="w-full bg-[#08050f] border border-[var(--line)] px-3 py-1.5 text-sm text-pearl outline-none focus:border-[var(--line-2)]"
                      />
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="tl-head text-[11px] font-bold text-white truncate">{d.device_name}</p>
                        {d.current && (
                          <span className="shrink-0 tl-chip ok">Это устройство</span>
                        )}
                      </div>
                    )}
                    <p className="tl-term text-[14px] text-[var(--muted-2)] truncate">
                      {d.platform || 'Платформа неизвестна'}
                      {d.last_seen_at ? ` · вход ${timeAgo(d.last_seen_at)}` : ''}
                    </p>
                  </div>

                  {isRenaming ? (
                    <button
                      onClick={() => saveRename(d)}
                      disabled={devicesBusy}
                      title="Сохранить"
                      className="w-8 h-8 bg-[rgb(var(--accent-rgb)/.2)] text-accent hover:bg-[rgb(var(--accent-rgb)/.3)] flex items-center justify-center transition-all disabled:opacity-40 shrink-0"
                    >
                      <Check size={14} />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setRenamingId(rowKey); setRenameValue(d.device_name); }}
                      disabled={devicesBusy}
                      title="Переименовать"
                      className="w-8 h-8 bg-[#08050f] border border-[var(--line)] text-[var(--muted)] hover:text-white hover:border-[var(--line-2)] flex items-center justify-center transition-all disabled:opacity-30 shrink-0"
                    >
                      <Pencil size={13} />
                    </button>
                  )}

                  {!d.current && (
                    <button
                      onClick={() => removeDevice(d)}
                      disabled={devicesBusy}
                      title="Убрать доверие"
                      className="w-8 h-8 bg-[#08050f] border border-[var(--line)] text-[var(--muted)] hover:text-accent hover:border-[var(--line-2)] flex items-center justify-center transition-all disabled:opacity-30 shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
