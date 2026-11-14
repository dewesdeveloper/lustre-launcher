import { useCallback, useEffect, useState } from 'react';
import { Check, ExternalLink, KeyRound, Link2, Mail, Phone } from 'lucide-react';
import api from '../../../api';
import { useAuth } from '../../../context/AuthContext';
import { Loading } from '../../../components/Loading';

// Почта аккаунта (привязка кодом для аккаунтов из Steam/GitHub без почты) и сервисы,
// через которые можно войти.

type Service = { provider: string; linked: boolean; linked_at?: string; profile_url?: string };
type Links = {
  email: string;
  email_verified: boolean;
  pending_email: string;
  has_password: boolean;
  phone_verified: boolean;
  services: Service[];
};

const PROVIDER: Record<string, { name: string; color: string; letter: string }> = {
  steam: { name: 'Steam', color: '#66c0f4', letter: 'S' },
  github: { name: 'GitHub', color: '#e6edf3', letter: 'G' },
  google: { name: 'Google', color: '#ea4335', letter: 'G' },
  telegram: { name: 'Telegram', color: '#29a9eb', letter: 'T' },
  itch: { name: 'itch.io', color: '#fa5c5c', letter: 'i' },
};

const Head = ({ children }: { children: string }) => (
  <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>{children}</h3>
);

const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

function openLink(url: string) {
  const electron = (window as any).electron;
  if (electron?.openExternal) void electron.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

/** Форма привязки почты: адрес → код из письма */
function BindEmail({ current, onDone }: { current: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/email/bind-start', { email });
      setSentTo(data.email || email);
      setCode('');
    } catch (e: any) {
      const d = e?.response?.data;
      setError(d?.retry_after ? `${d.error} Повторить можно через ${Math.ceil(d.retry_after / 60)} мин.` : d?.error || 'Не удалось отправить код');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/email/bind-confirm', { code: code.trim() });
      setOpen(false);
      setSentTo('');
      setEmail('');
      onDone();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Не удалось подтвердить код');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={current ? 'tl-btn ghost' : 'tl-btn solid'} onClick={() => setOpen(true)}>
        {current ? 'Сменить почту' : 'Привязать почту'}
      </button>
    );
  }

  return (
    <div className="mt-4 w-full border border-[var(--line)] bg-black/20 p-4">
      {!sentTo ? (
        <>
          <p className="tl-term mb-3 text-[15px] text-[var(--muted)]">На этот адрес придёт код подтверждения.</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email.trim() && void send()}
              placeholder="name@example.com"
              className="tl-field min-w-[220px] flex-1"
            />
            <button type="button" className="tl-btn solid" disabled={busy || !email.trim()} onClick={() => void send()}>
              {busy ? 'Отправляем…' : 'Отправить код'}
            </button>
            <button type="button" className="tl-btn ghost" onClick={() => setOpen(false)}>Отмена</button>
          </div>
        </>
      ) : (
        <>
          <p className="tl-term mb-3 text-[15px] text-[var(--muted)]">
            Код отправлен на <b className="font-normal text-white">{sentTo}</b>. Проверьте и папку «Спам».
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              autoFocus
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && code.trim() && void confirm()}
              placeholder="Код из письма"
              className="tl-field w-44"
            />
            <button type="button" className="tl-btn solid" disabled={busy || !code.trim()} onClick={() => void confirm()}>
              {busy ? 'Проверяем…' : 'Подтвердить'}
            </button>
            <button type="button" className="tl-btn ghost" disabled={busy} onClick={() => void send()}>Отправить ещё раз</button>
            <button type="button" className="tl-btn ghost" onClick={() => { setSentTo(''); setError(''); }}>Другая почта</button>
          </div>
        </>
      )}
      {error && <p className="tl-term mt-3 text-[15px] text-[#ff5b8a]">{error}</p>}
    </div>
  );
}

function Status({ ok, children }: { ok: boolean; children: string }) {
  return <span className={`tl-chip ${ok ? 'ok' : 'warn'} inline-flex items-center gap-1`}>{ok && <Check size={11} />}{children}</span>;
}

export default function LinkedAccounts() {
  const { refreshUser } = useAuth();
  const [data, setData] = useState<Links | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api.get('/auth/linked-accounts').then((r) => { setData(r.data); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return null; // старый сервер без этого раздела
  if (!data) return <div className="tl-panel p-[22px]"><Loading /></div>;

  const services = data.services || [];

  return (
    <>
      <div className="tl-panel p-[22px]">
        <Head>ПОЧТА И ВХОД</Head>
        <div className="flex flex-wrap items-center gap-4">
          <Mail size={20} className="shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="tl-head text-[10px] font-bold uppercase tracking-[.14em] text-[var(--muted)]">Электронная почта</p>
            <p className="mt-1 truncate text-sm text-white">{data.email || 'Почта не указана'}</p>
          </div>
          {data.email ? <Status ok={data.email_verified}>{data.email_verified ? 'Подтверждена' : 'Не подтверждена'}</Status> : null}
          <BindEmail current={data.email} onDone={() => { load(); void refreshUser(); }} />
        </div>
        {!data.email && (
          <p className="tl-term mt-3 text-[15px] text-[var(--muted-2)]">
            Аккаунт создан через внешний сервис, и почты у него нет. Привяжите её — тогда можно будет входить по почте и восстановить доступ, если вход через сервис станет недоступен.
          </p>
        )}

        <div className="mt-5 grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <KeyRound size={18} className="shrink-0 text-[var(--muted)]" />
            <div className="min-w-0">
              <p className="tl-head text-[10px] font-bold uppercase tracking-[.14em] text-[var(--muted)]">Пароль</p>
              <p className="tl-term text-[15px] text-white">{data.has_password ? 'Задан' : 'Не задан'}</p>
              {!data.has_password && (
                <p className="tl-term text-[14px] text-[var(--muted-2)]">
                  {data.email ? 'Задайте его через «Забыли пароль?» на экране входа.' : 'Сначала привяжите почту.'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Phone size={18} className="shrink-0 text-[var(--muted)]" />
            <div>
              <p className="tl-head text-[10px] font-bold uppercase tracking-[.14em] text-[var(--muted)]">Телефон</p>
              <p className="tl-term text-[15px] text-white">{data.phone_verified ? 'Привязан' : 'Не привязан'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <Head>ПРИВЯЗАННЫЕ СЕРВИСЫ</Head>
        {services.length === 0 ? (
          <p className="tl-term text-[15px] text-[var(--muted)]">Вход через внешние сервисы сейчас недоступен.</p>
        ) : (
          <div className="divide-y divide-[var(--line)] border border-[var(--line)]">
            {services.map((s) => {
              const meta = PROVIDER[s.provider] || { name: s.provider, color: 'var(--muted)', letter: s.provider[0]?.toUpperCase() || '?' };
              return (
                <div key={s.provider} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center border text-sm font-black"
                    style={{ color: meta.color, borderColor: s.linked ? meta.color : 'var(--line)', opacity: s.linked ? 1 : 0.5 }}
                  >
                    {meta.letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">{meta.name}</p>
                    <p className="tl-term text-[14px] text-[var(--muted)]">
                      {s.linked ? `Привязан${s.linked_at ? ` · ${date(s.linked_at)}` : ''}` : 'Не привязан'}
                    </p>
                  </div>
                  {s.linked ? <Status ok>Вход доступен</Status> : <span className="tl-chip text-[var(--muted-2)] inline-flex items-center gap-1"><Link2 size={11} /> Нет</span>}
                  {s.profile_url && (
                    <button type="button" className="tl-btn ghost inline-flex items-center gap-1.5" onClick={() => openLink(s.profile_url!)}>
                      <ExternalLink size={13} /> Профиль
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
