import { useState } from 'react';
import { nativeNotify } from '../../../utils/nativeNotify';
import {
  playNotifSound,
  setNotifyPrefs,
  useNotifyPrefs,
  type NotifyCategory,
} from '../../../utils/notifyPrefs';
import SettingsToggle from './SettingsToggle';

const CATEGORIES: { id: NotifyCategory; label: string }[] = [
  { id: 'messages', label: 'Личные сообщения' },
  { id: 'groups', label: 'Сообщения в группах' },
  { id: 'friends', label: 'Заявки в друзья' },
  { id: 'calls', label: 'Входящие звонки' },
  { id: 'missed', label: 'Пропущенные и завершённые звонки' },
];

const Head = ({ children }: { children: string }) => (
  <h3 className="tl-head text-[11px] font-bold text-white mb-4" style={{ textShadow: 'var(--glow-sm)' }}>{children}</h3>
);

export default function NotificationsTab() {
  const p = useNotifyPrefs();
  const [tested, setTested] = useState<string | null>(null);
  // всплывающие уведомления не показываются, если выключены совсем или включено «не беспокоить»
  const muted = !p.enabled || p.dnd;

  const test = () => {
    const shown = nativeNotify({
      title: 'Lustre',
      body: p.preview ? 'Так будут выглядеть уведомления лаунчера.' : 'Новое сообщение',
      tag: 'lh-test',
      silent: true,
    });
    playNotifSound(true);
    setTested(shown ? null : 'Система не дала показать уведомление — проверь разрешения уведомлений Windows для Lustre.');
  };

  return (
    <div className="space-y-4">
      <section className="tl-panel p-[22px]">
        <Head>ВСПЛЫВАЮЩИЕ УВЕДОМЛЕНИЯ</Head>
        <div className="space-y-4">
          <SettingsToggle
            label="Показывать уведомления Windows"
            checked={p.enabled}
            onChange={() => setNotifyPrefs({ enabled: !p.enabled })}
          />
          <SettingsToggle
            label="Не беспокоить"
            checked={p.dnd}
            onChange={() => setNotifyPrefs({ dnd: !p.dnd })}
          />
        </div>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-3">
          {p.dnd
            ? 'Уведомления и звуки отключены. Окно входящего звонка всё равно появится, но без мелодии.'
            : 'Уведомления приходят, когда окно лаунчера свёрнуто или не в фокусе.'}
        </p>
        <div className="flex items-center gap-3 mt-4">
          <button className="tl-btn ghost" onClick={test}>Проверить</button>
          {tested && <span className="tl-term text-[15px] text-amber-300/80">{tested}</span>}
        </div>
      </section>

      <section className={`tl-panel p-[22px] ${muted ? 'opacity-60' : ''}`}>
        <Head>О ЧЁМ УВЕДОМЛЯТЬ</Head>
        <div className="space-y-4">
          {CATEGORIES.map((c) => (
            <SettingsToggle
              key={c.id}
              label={c.label}
              checked={p.categories[c.id]}
              disabled={muted}
              onChange={() => setNotifyPrefs({ categories: { ...p.categories, [c.id]: !p.categories[c.id] } })}
            />
          ))}
          <SettingsToggle
            label="Показывать текст сообщений"
            checked={p.preview}
            disabled={muted}
            onChange={() => setNotifyPrefs({ preview: !p.preview })}
          />
        </div>
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-3">
          Без текста в уведомлении видно только отправителя — удобно, если экран видят другие.
        </p>
      </section>

      <section className="tl-panel p-[22px]">
        <Head>ЗВУКИ</Head>
        <div className="space-y-4">
          <SettingsToggle
            label="Звук уведомлений"
            checked={p.sound}
            disabled={p.dnd}
            onChange={() => setNotifyPrefs({ sound: !p.sound })}
          />
          <div className={!p.sound || p.dnd ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex items-center justify-between mb-2">
              <span className="tl-term text-[16px] tl-muted">Громкость</span>
              <span className="tl-term text-[17px] tl-pink tabular-nums">{p.volume}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={p.volume}
              onChange={(e) => setNotifyPrefs({ volume: Number(e.target.value) })}
              onPointerUp={() => playNotifSound()}
              className="w-full accent-[color:var(--color-accent)] cursor-pointer"
            />
          </div>
          <SettingsToggle
            label="Мелодия входящего звонка"
            checked={p.ringtone}
            disabled={p.dnd}
            onChange={() => setNotifyPrefs({ ringtone: !p.ringtone })}
          />
        </div>
      </section>
    </div>
  );
}
