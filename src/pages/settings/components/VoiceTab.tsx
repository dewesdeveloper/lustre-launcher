import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useSettings } from '../../../context/SettingsContext';
import { useDialog } from '../../../components/Dialogs';
import {
  listAudioDevices, normalizeVoicePrefs, prettyKey, getVoiceLogText, PROFILE_PRESETS,
} from '../../../api/voicePrefs';
import type { InputProfile, NoiseMode, VoicePrefs } from '../../../api/voicePrefs';
import { createMicPipeline, captureKeyOf, type MicLevel, type MicPipeline } from '../../../api/micPipeline';
import { isPttGlobal, mouseButtonCode } from '../../../api/ptt';
import SettingsToggle from './SettingsToggle';

const PROFILES: { id: InputProfile; label: string; hint: string }[] = [
  { id: 'isolation', label: 'Изоляция голоса', hint: 'Только ваш голос: нейросеть убирает клавиатуру, вентиляторы и прочий шум' },
  { id: 'studio', label: 'Студия', hint: 'Чистый звук: открытый микрофон без обработки' },
  { id: 'custom', label: 'Пользовательский', hint: 'Все настройки ниже — вручную' },
];

const NOISE: { id: NoiseMode; label: string }[] = [
  { id: 'rnnoise', label: 'Нейросетевое (RNNoise)' },
  { id: 'standard', label: 'Стандартное' },
  { id: 'off', label: 'Выключено' },
];

const TRANSMISSION = [
  { id: 'voice', label: 'По голосу' },
  { id: 'ptt', label: 'Рация' },
  { id: 'ptm', label: 'Выкл. звук при нажатии' },
] as const;

/** дБ (-100…0) → доля шкалы */
const dbPct = (db: number) => Math.max(0, Math.min(100, db + 100));

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="tl-panel p-[22px]">
      <h3 className={`tl-head text-[11px] font-bold text-white ${hint ? 'mb-1' : 'mb-4'}`} style={{ textShadow: 'var(--glow-sm)' }}>{title}</h3>
      {hint && <p className="tl-term text-[15px] text-[var(--muted-2)] mb-4">{hint}</p>}
      {children}
    </div>
  );
}

function Slider({ label, value, onChange, note }: { label: string; value: number; onChange: (v: number) => void; note: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="tl-head text-[10px] font-bold uppercase tracking-[0.1em] text-white">{label}</span>
        <span className="tl-term text-[17px] tl-pink tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range" min={0} max={2} step={0.05} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[color:var(--color-accent)] cursor-pointer"
      />
      <p className="tl-term text-[14px] text-[var(--muted-2)] mt-1">{note}</p>
    </div>
  );
}

export default function VoiceTab() {
  const { settings, updateSettings } = useSettings();
  const voice: VoicePrefs = normalizeVoicePrefs(settings.voice);
  const set = (patch: Partial<VoicePrefs>) => updateSettings({ voice: { ...voice, ...patch } });
  // ручная правка обработки переводит профиль в «Пользовательский»
  const tune = (patch: Partial<VoicePrefs>) => set({ ...patch, input_profile: 'custom' });
  const dlg = useDialog();

  const [devices, setDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const refreshDevices = () => listAudioDevices().then(setDevices);
  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  }, []);

  // --- Проверка микрофона: тот же конвейер, что в звонке (шумодав, усиление, порог) ---
  const [testing, setTesting] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const [level, setLevel] = useState<MicLevel | null>(null);
  const testRef = useRef<MicPipeline | null>(null);

  const stopTest = () => {
    testRef.current?.destroy();
    testRef.current = null;
    setTesting(false);
    setLevel(null);
  };

  const startTest = async () => {
    testRef.current?.destroy();
    const p = await createMicPipeline({ test: true });
    if (!p) {
      setTesting(false);
      await dlg.alert({ title: 'Ошибка', message: 'Не удалось получить доступ к микрофону', danger: true });
      return;
    }
    testRef.current = p;
    p.onLevel(setLevel);
    p.setMonitor(monitor);
    setTesting(true);
    refreshDevices(); // после разрешения появляются названия устройств
  };

  useEffect(() => () => testRef.current?.destroy(), []);
  // смена устройства или обработки — перезапуск проверки с новыми параметрами
  const captureKey = captureKeyOf(voice);
  useEffect(() => {
    if (testRef.current && testRef.current.captureKey !== captureKey) void startTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureKey]);
  useEffect(() => { testRef.current?.setMonitor(monitor); }, [monitor]);

  // --- Клавиша рации: клавиатура или боковые кнопки мыши ---
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === 'Escape') { setCapturing(false); return; }
      set({ ptt_key: e.code });
      setCapturing(false);
    };
    const onMouse = (e: MouseEvent) => {
      const code = mouseButtonCode(e.button);
      if (!code) return;
      e.preventDefault();
      set({ ptt_key: code });
      setCapturing(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouse);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturing]);

  const [pttGlobal, setPttGlobal] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setPttGlobal(isPttGlobal()), 300);
    return () => clearTimeout(t);
  }, [voice.transmission, voice.ptt_key]);

  const copyLog = async () => {
    const text = [getVoiceLogText(), '', `UserAgent: ${navigator.userAgent}`].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      await dlg.alert({ title: 'Скопировано', message: 'Журнал голосового чата в буфере обмена', tone: 'success' });
    } catch {
      await dlg.alert({ title: 'Ошибка', message: 'Не удалось скопировать журнал', danger: true });
    }
  };

  const custom = voice.input_profile === 'custom';
  const threshold = voice.auto_sensitivity ? level?.threshold ?? null : voice.sensitivity_db;

  return (
    <div className="flex flex-col gap-5">
      <Panel title="УСТРОЙСТВА">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="tl-term text-[16px] tl-muted">Устройство ввода</span>
            <select value={voice.input_device_id} onChange={(e) => set({ input_device_id: e.target.value })} className="tl-select w-full">
              <option value="">По умолчанию</option>
              {devices.inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Микрофон'}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="tl-term text-[16px] tl-muted">Устройство вывода</span>
            <select value={voice.output_device_id} onChange={(e) => set({ output_device_id: e.target.value })} className="tl-select w-full">
              <option value="">По умолчанию</option>
              {devices.outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Динамики'}</option>)}
            </select>
          </label>
        </div>
      </Panel>

      <div className="tl-panel p-[22px] grid gap-6 sm:grid-cols-2">
        <Slider label="Громкость микрофона" value={voice.input_volume} onChange={(v) => set({ input_volume: v })} note="Как громко вас слышат" />
        <Slider label="Громкость собеседников" value={voice.output_volume} onChange={(v) => set({ output_volume: v })} note="Свыше 100% — дополнительное усиление" />
      </div>

      <Panel title="ПРОВЕРКА МИКРОФОНА" hint="Звук проходит ту же обработку, что и в звонке: шумоподавление, усиление и порог.">
        <Meter level={level} threshold={voice.transmission === 'voice' ? threshold : null} active={testing} />
        <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
          <SettingsToggle label="Слышать себя (лучше в наушниках)" checked={monitor} onChange={() => setMonitor(!monitor)} />
          <button onClick={testing ? stopTest : startTest} className={`tl-btn shrink-0 ${testing ? '' : 'ghost'}`}>
            {testing ? 'Остановить проверку' : 'Проверить микрофон'}
          </button>
        </div>
      </Panel>

      <Panel title="ПРОФИЛЬ ВВОДА">
        <div className="flex flex-col gap-2">
          {PROFILES.map((p) => {
            const on = voice.input_profile === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => set(p.id === 'custom' ? { input_profile: 'custom' } : { ...PROFILE_PRESETS[p.id], input_profile: p.id })}
                className={`flex items-start gap-3 text-left px-3 py-2.5 border transition-colors ${on ? 'border-accent bg-[rgb(var(--accent-rgb)/.08)]' : 'border-[var(--line)] hover:border-[var(--line-2)]'}`}
              >
                <span className={`mt-1 w-4 h-4 shrink-0 border-2 flex items-center justify-center ${on ? 'border-accent' : 'border-[var(--muted-2)]'}`}>
                  {on && <span className="w-1.5 h-1.5 bg-accent" />}
                </span>
                <span className="flex flex-col">
                  <span className="tl-term text-[17px] text-white">{p.label}</span>
                  <span className="tl-term text-[15px] text-[var(--muted-2)]">{p.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title="ЧУВСТВИТЕЛЬНОСТЬ ВВОДА" hint="Микрофон передаёт звук, только когда он громче порога — тишина и фоновый шум не уходят собеседникам.">
        <SettingsToggle
          label="Определять чувствительность автоматически"
          checked={voice.auto_sensitivity}
          onChange={() => tune({ auto_sensitivity: !voice.auto_sensitivity })}
        />
        {!voice.auto_sensitivity && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="tl-term text-[16px] tl-muted">Порог</span>
              <span className="tl-term text-[17px] tl-pink tabular-nums">
                {voice.sensitivity_db <= -100 ? 'всё передаётся' : `${voice.sensitivity_db} дБ`}
              </span>
            </div>
            <input
              type="range" min={-100} max={0} step={1} value={voice.sensitivity_db}
              onChange={(e) => tune({ sensitivity_db: Number(e.target.value) })}
              className="w-full accent-[color:var(--color-accent)] cursor-pointer"
            />
          </div>
        )}
        <p className="tl-term text-[15px] text-[var(--muted-2)] mt-3">
          {voice.transmission !== 'voice'
            ? 'В режиме рации порог не действует: звук идёт, пока нажата клавиша.'
            : testing ? 'Говорите: шкала окрашивается, когда голос проходит порог.' : 'Включите проверку микрофона, чтобы видеть уровень и порог.'}
        </p>
      </Panel>

      <Panel title="ОБРАБОТКА ЗВУКА">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className="flex flex-col">
            <span className="tl-term text-[16px] tl-muted">Шумоподавление</span>
            <span className="tl-term text-[14px] text-[var(--muted-2)]">
              {voice.noise_mode === 'rnnoise' ? 'Нейросеть убирает фоновый шум, оставляя голос' : voice.noise_mode === 'standard' ? 'Встроенное шумоподавление Chromium' : 'Звук передаётся как есть'}
            </span>
          </span>
          <select value={voice.noise_mode} onChange={(e) => tune({ noise_mode: e.target.value as NoiseMode })} className="tl-select max-w-[260px] w-full">
            {NOISE.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-3 mt-4">
          <SettingsToggle label="Эхоподавление" checked={voice.echo_cancellation} onChange={() => tune({ echo_cancellation: !voice.echo_cancellation })} />
          <SettingsToggle label="Автоматическая регулировка усиления" checked={voice.auto_gain} onChange={() => tune({ auto_gain: !voice.auto_gain })} />
        </div>
        {!custom && <p className="tl-term text-[14px] text-[var(--muted-2)] mt-3">Изменение любого параметра переключит профиль на «Пользовательский».</p>}
      </Panel>

      <Panel title="РЕЖИМ ПЕРЕДАЧИ">
        <div className="tl-tabs">
          {TRANSMISSION.map((m) => (
            <button key={m.id} type="button" onClick={() => set({ transmission: m.id })} className={`tl-tab ${voice.transmission === m.id ? 'active' : ''}`}>
              {m.label}
            </button>
          ))}
        </div>

        {voice.transmission !== 'voice' && (
          <>
            <div className="flex items-center justify-between gap-4 mt-5">
              <span className="tl-term text-[16px] tl-muted">{voice.transmission === 'ptt' ? 'Клавиша рации' : 'Клавиша заглушения'}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCapturing(true)}
                  className={`min-w-[120px] px-4 py-2 tl-head text-[10px] font-bold uppercase tracking-[0.1em] border transition-all ${
                    capturing ? 'bg-[rgb(var(--accent-rgb)/.14)] border-accent text-accent animate-pulse' : 'bg-[#08050f] border-[var(--line)] text-white hover:border-[var(--line-2)]'
                  }`}
                >
                  {capturing ? 'Нажми клавишу…' : prettyKey(voice.ptt_key)}
                </button>
                <button
                  onClick={() => { set({ ptt_key: '' }); setCapturing(false); }}
                  title="Сбросить"
                  className="w-9 h-9 bg-[#08050f] border border-[var(--line)] text-[var(--muted)] hover:text-white hover:border-[var(--line-2)] transition-all flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <p className={`tl-term text-[15px] mt-2 ${voice.ptt_key ? 'text-[var(--muted-2)]' : 'text-amber-300/80'}`}>
              {!voice.ptt_key
                ? (voice.transmission === 'ptt' ? 'Назначьте клавишу — без неё микрофон в режиме рации молчит.' : 'Назначьте клавишу.')
                : pttGlobal ? 'Клавиша работает везде, в том числе в играх. Подойдут и боковые кнопки мыши.' : 'Клавиша работает, пока окно лаунчера активно.'}
            </p>
          </>
        )}

        <div className="mt-5">
          <SettingsToggle
            label="Звук при включении и выключении микрофона"
            checked={voice.mic_toggle_sound}
            onChange={() => set({ mic_toggle_sound: !voice.mic_toggle_sound })}
          />
        </div>
      </Panel>

      <Panel title="ДОПОЛНИТЕЛЬНО">
        <div className="flex flex-col gap-3">
          <SettingsToggle
            label="Предупреждать, если микрофон не передаёт звук"
            checked={voice.no_mic_warning}
            onChange={() => set({ no_mic_warning: !voice.no_mic_warning })}
          />
          <div className="flex items-center justify-between gap-4 pt-1">
            <span className="tl-term text-[16px] tl-muted">Журнал ошибок голосового чата</span>
            <button onClick={copyLog} className="tl-btn ghost shrink-0">Копировать</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** Шкала уровня микрофона с отметкой порога (как в Discord) */
function Meter({ level, threshold, active }: { level: MicLevel | null; threshold: number | null; active: boolean }) {
  const pct = level ? dbPct(level.db) : 0;
  const open = !!level?.open;
  return (
    <div className="relative h-3 bg-[#08050f] border border-[var(--line)] overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 transition-[width] duration-75"
        style={{ width: `${pct}%`, background: open ? 'var(--green2)' : 'var(--muted-2)' }}
      />
      {active && threshold != null && threshold > -100 && (
        <div className="absolute inset-y-0 w-[2px] bg-amber-300" style={{ left: `${dbPct(threshold)}%` }} title="Порог" />
      )}
    </div>
  );
}
