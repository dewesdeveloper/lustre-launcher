import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, KeyRound, Link2, Loader2, Mail, Phone } from 'lucide-react';
import api from '../../../api';
import { getOAuthLinkUrl, getOAuthResult } from '../../../api/oauth';
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

const LINK_ERRORS: Record<string, string> = {
  link_taken: 'Этот аккаунт сервиса уже привязан к другому пользователю Lustre.',
  link_have: 'К вашему аккаунту уже привязан другой аккаунт этого сервиса.',
  expired: 'Время ожидания истекло. Попробуйте ещё раз.',
};

/**
 * Привязка сервиса: сервис открывается в браузере (на сайте — во всплывающем окне),
 * а здесь ждём результат так же, как при входе через сервис.
 */
function useServiceLink(onLinked: () => void) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const link = async (provider: string) => {
    if (busy) return;
    setBusy(provider);
    setError('');
    const electron = (window as any).electron;
    // на сайте окно открываем сразу в обработчике клика — иначе его заблокирует браузер
    const popup = !electron ? window.open('about:blank', '_blank', 'width=560,height=700') : null;
    try {
      const { url, state, poll } = await getOAuthLinkUrl(provider);
      if (electron?.openExternal) {
        if (!(await electron.openExternal(url))) throw new Error('Не удалось открыть браузер');
      } else if (popup && !popup.closed) {
        popup.location.href = url;
      } else {
        throw new Error('Разрешите всплывающие окна для этого сайта');
      }
      const deadline = Date.now() + 5 * 60 * 1000;
      while (!cancelled.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        let res;
        try { res = await getOAuthResult(state, poll); } catch { continue; }
        if (res.status === 'linked') { onLinked(); return; }
        if (res.status === 'error') { setError(LINK_ERRORS[res.reason || ''] || 'Не удалось привязать сервис'); return; }
      }
      if (!cancelled.current) setError(LINK_ERRORS.expired);
    } catch (e: any) {
      if (popup && !popup.closed) popup.close();
      setError(e?.response?.data?.error || e?.message || 'Не удалось привязать сервис');
    } finally {
      if (!cancelled.current) setBusy('');
    }
  };
  return { link, busy, error };
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

  const serviceLink = useServiceLink(() => { load(); void refreshUser(); });

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
                  {s.linked ? (
                    <Status ok>Вход доступен</Status>
                  ) : (
                    <button
                      type="button"
                      className="tl-btn solid inline-flex items-center gap-1.5"
                      disabled={!!serviceLink.busy}
                      onClick={() => void serviceLink.link(s.provider)}
                      title="Откроется браузер: войдите в сервис, и он привяжется к этому аккаунту"
                    >
                      {serviceLink.busy === s.provider ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                      {serviceLink.busy === s.provider ? 'Ждём браузер…' : 'Привязать'}
                    </button>
                  )}
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
        {serviceLink.busy && (
          <p className="tl-term mt-3 text-[15px] text-[var(--muted)]">Войдите в сервис в открывшемся окне браузера и вернитесь сюда — привязка завершится сама.</p>
        )}
        {serviceLink.error && <p className="tl-term mt-3 text-[15px] text-[#ff5b8a]">{serviceLink.error}</p>}
      </div>
    </>
  );
}
