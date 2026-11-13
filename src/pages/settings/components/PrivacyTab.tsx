import { useEffect, useState } from 'react';
import { useDialog } from '../../../components/Dialogs';
import { getPrivacy, updatePrivacy } from '../../../api/privacy';
import type { PrivacySettings, OnlineStatus } from '../../../api/privacy';
import SettingsToggle from './SettingsToggle';
import { Loading } from '../../../components/Loading';

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tl-tabs">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={`tl-tab ${value === o.id ? 'active' : ''}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_OPTIONS: { id: OnlineStatus; label: string; color: string; hint: string }[] = [
  { id: 'online', label: 'В сети', color: 'var(--green2)', hint: 'Пока лаунчер запущен, тебя видят в сети.' },
  { id: 'away', label: 'Нет на месте', color: '#fbbf24', hint: 'Тебя видят в сети с пометкой «нет на месте» — понятно, что ответ может задержаться.' },
  { id: 'invisible', label: 'Невидимка', color: 'var(--muted-2)', hint: 'Для всех ты не в сети, но чатом, звонками и всем остальным пользуешься как обычно.' },
  { id: 'offline', label: 'Не в сети', color: 'var(--muted-2)', hint: 'Для всех ты не в сети и не принимаешь звонки. Сообщения по-прежнему приходят.' },
];
const STATUS_META = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.id, o])) as Record<OnlineStatus, (typeof STATUS_OPTIONS)[number]>;

// Подсказка к варианту «Пользователи с Pro»: друзья не отсекаются, своя подписка не нужна
function ProHint({ what }: { what: string }) {
  return (
    <p className="tl-term text-[15px] text-[var(--muted-2)] mt-2">
      {what === 'писать' ? 'Писать' : 'Звонить'} смогут друзья и пользователи с подпиской Lustre Pro. Своя подписка для этого не нужна.
    </p>
  );
}

export default function PrivacyTab() {
  const dlg = useDialog();
  const [p, setP] = useState<PrivacySettings | null>(null);

  useEffect(() => {
    getPrivacy().then(setP).catch(() => setP(null));
  }, []);

  const upd = async (patch: Partial<PrivacySettings>) => {
    if (!p) return;
    const prev = p;
    setP({ ...p, ...patch });
    try {
      const saved = await updatePrivacy(patch);
      setP(saved);
    } catch (e: any) {
      setP(prev); // сохранить не удалось — показываем то, что действует на самом деле
      await dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось сохранить настройки приватности', danger: true });
    }
  };

  if (!p) {
    return (
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>ПРИВАТНОСТЬ</h3>
        <Loading />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>КТО ВИДИТ ПРОФИЛЬ</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Скрытый профиль не открывается никому, кроме тебя.</p>
        <Seg
          value={p.profile_visibility}
          onChange={(v) => upd({ profile_visibility: v })}
          options={[
            { id: 'public', label: 'Публичный' },
            { id: 'friends', label: 'Только друзья' },
            { id: 'private', label: 'Скрытый' },
          ]}
        />
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>СПИСОК ДРУЗЕЙ</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Влияет на вкладку друзей в профиле.</p>
        <Seg
          value={p.friends_visibility}
          onChange={(v) => upd({ friends_visibility: v })}
          options={[
            { id: 'public', label: 'Публичный' },
            { id: 'friends', label: 'Только друзья' },
            { id: 'private', label: 'Скрытый' },
          ]}
        />
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>ЛЕНТА АКТИВНОСТИ</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Кто видит твою активность в профиле (запуски игр, значки, комментарии).</p>
        <Seg
          value={p.activity_visibility}
          onChange={(v) => upd({ activity_visibility: v })}
          options={[
            { id: 'public', label: 'Все пользователи' },
            { id: 'friends', label: 'Только друзья' },
            { id: 'private', label: 'Только я' },
          ]}
        />
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-2">При «Только я» лента в твоём профиле не открывается никому, кроме тебя.</p>
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>ЗАЯВКИ В ДРУЗЬЯ</h3>
        <SettingsToggle
          label="Получать заявки в друзья от всех пользователей"
          checked={p.friend_requests === 'everyone'}
          onChange={() => upd({ friend_requests: p.friend_requests === 'everyone' ? 'nobody' : 'everyone' })}
        />
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-2">Если выключено — другие не смогут отправить тебе заявку.</p>
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>ЛИЧНЫЕ СООБЩЕНИЯ</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Кто может писать:</p>
        <Seg
          value={p.dms}
          onChange={(v) => upd({ dms: v })}
          options={[
            { id: 'everyone', label: 'Все пользователи' },
            { id: 'pro', label: 'Пользователи с Pro' },
            { id: 'friends', label: 'Только друзья' },
          ]}
        />
        {p.dms === 'pro' && <ProHint what="писать" />}
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>ГОЛОСОВЫЕ ЗВОНКИ</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Кто может звонить:</p>
        <Seg
          value={p.calls}
          onChange={(v) => upd({ calls: v })}
          options={[
            { id: 'everyone', label: 'Все пользователи' },
            { id: 'pro', label: 'Пользователи с Pro' },
            { id: 'friends', label: 'Только друзья' },
          ]}
        />
        {p.calls === 'pro' && <ProHint what="звонить" />}
        {p.online_status === 'offline' && (
          <p className="tl-term text-[15px] text-amber-300/80 mt-2">Сейчас выбран статус «Не в сети» — звонки не принимаются, пока его не сменить.</p>
        )}
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>ОНЛАЙН-СТАТУС</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Как тебя видят друзья и другие пользователи:</p>
        <Seg
          value={p.online_status}
          onChange={(v) => upd({ online_status: v })}
          options={STATUS_OPTIONS.map(({ id, label }) => ({ id, label }))}
        />
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-3 flex items-start gap-2">
          <span className="w-2 h-2 mt-1.5 shrink-0" style={{ background: STATUS_META[p.online_status].color }} />
          {STATUS_META[p.online_status].hint}
        </p>
      </div>
    </div>
  );
}
