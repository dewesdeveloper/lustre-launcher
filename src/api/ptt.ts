// Клавиша рации (push-to-talk) для всех голосовых режимов: звонки, группы, голосовые каналы.
// Раньше клавиша ловилась только событиями окна — в игре (окно лаунчера не в фокусе) рация
// не срабатывала вовсе. В Electron клавишу слушает главный процесс (uiohook): он сообщает
// только нажатие и отпускание выбранной клавиши, остальной ввод никуда не уходит.
// В вебе и если хук недоступен — события окна, как раньше.
import { getVoicePrefs, subscribeVoicePrefs, type VoicePrefs } from './voicePrefs';

type Electron = {
  pttSetKey?: (code: string | null) => Promise<boolean>;
  onPtt?: (cb: (down: boolean) => void) => () => void;
};

let held = false;
let started = false;
let globalActive = false;
let boundKey: string | null = null;
const listeners = new Set<(held: boolean) => void>();

function set(next: boolean) {
  if (held === next) return;
  held = next;
  listeners.forEach((fn) => fn(next));
}

/** Код кнопки мыши в формате prefs.ptt_key (MouseEvent.button: 1 — колесо, 3/4 — боковые) */
export function mouseButtonCode(button: number): string | null {
  if (button === 1) return 'Mouse3';
  if (button === 3) return 'Mouse4';
  if (button === 4) return 'Mouse5';
  return null;
}

function wantedKey(p: VoicePrefs): string | null {
  return p.transmission !== 'voice' && p.ptt_key ? p.ptt_key : null;
}

async function bindGlobal(p: VoicePrefs) {
  const key = wantedKey(p);
  if (key === boundKey) return;
  boundKey = key;
  set(false);
  const electron = (window as unknown as { electron?: Electron }).electron;
  if (!electron?.pttSetKey) { globalActive = false; return; }
  try {
    globalActive = (await electron.pttSetKey(key)) && !!key;
  } catch {
    globalActive = false;
  }
}

function start() {
  if (started) return;
  started = true;
  const electron = (window as unknown as { electron?: Electron }).electron;
  electron?.onPtt?.((down) => set(down));
  void bindGlobal(getVoicePrefs());
  subscribeVoicePrefs((p) => { void bindGlobal(p); });

  // Окно — запасной путь (и дублирует глобальный хук, пока лаунчер в фокусе: set() идемпотентен)
  const match = (code: string | null) => !!code && code === wantedKey(getVoicePrefs());
  window.addEventListener('keydown', (e) => { if (!e.repeat && match(e.code)) set(true); });
  window.addEventListener('keyup', (e) => { if (match(e.code)) set(false); });
  window.addEventListener('mousedown', (e) => { if (match(mouseButtonCode(e.button))) set(true); });
  window.addEventListener('mouseup', (e) => { if (match(mouseButtonCode(e.button))) set(false); });
  // без глобального хука отпускание вне окна не увидеть — считаем клавишу отпущенной
  window.addEventListener('blur', () => { if (!globalActive) set(false); });
}

export function isPttHeld(): boolean {
  start();
  return held;
}

export function onPttChange(fn: (held: boolean) => void): () => void {
  start();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Работает ли рация вне окна лаунчера (глобальный хук Electron) */
export function isPttGlobal(): boolean {
  start();
  return globalActive;
}
