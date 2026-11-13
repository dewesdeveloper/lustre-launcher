// Общие элементы сцены звонков (в стиле Discord, в дизайн-системе TL):
// плитка участника, плитка трансляции, сетка, кнопки панели управления.
// Используются окном звонка (CallWindow) и голосовыми каналами (VoiceRoomView).

import { useSyncExternalStore, type ReactNode } from 'react';
import { MicOff, HeadphoneOff, AudioLines, Loader2, Maximize2, Minimize2, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { ConnectionBars, StreamVideo } from '../callStage';
import { getScreenAudio, getScreenAudioVersion, setScreenAudioMuted, setScreenAudioVolume, subscribeScreenAudio, type CallQuality } from '../../api/livekitRoom';

export const fallbackAvatar = (seed: string | number) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;

/** Сетка как в Discord: столбцы по числу плиток, строки делят высоту сцены поровну. */
export function gridStyle(n: number): React.CSSProperties {
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(n / cols));
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  };
}

/** Квадратная кнопка панели управления. */
export function CtlBtn({ children, title, onClick, on, danger, accent, disabled, size = 44 }: {
  children: ReactNode; title: string; onClick: () => void; on?: boolean; danger?: boolean; accent?: boolean; disabled?: boolean; size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      style={{ width: size, height: size }}
      className={`shrink-0 flex items-center justify-center border transition-all disabled:opacity-30 ${
        danger ? 'bg-red-500/15 border-red-500/50 text-red-300 hover:bg-red-500/25'
          : accent ? 'bg-accent text-black border-accent shadow-[var(--glow)]'
            : 'bg-white/[0.04] border-[var(--line)] text-pearl/80 hover:text-white hover:border-[var(--line-2)]'
      }`}
    >
      {children}
    </button>
  );
}

/** Красная кнопка «положить трубку / выйти». */
export function HangupBtn({ title, onClick, label, tone = 'red', size = 44 }: {
  title: string; onClick: () => void; label?: string; tone?: 'red' | 'amber'; size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{ height: size, minWidth: size }}
      className={`flex items-center justify-center gap-2 px-3 text-white border transition-colors ${
        tone === 'amber' ? 'bg-amber-600/90 hover:bg-amber-500 border-amber-300/40' : 'bg-red-600/90 hover:bg-red-500 border-red-400/50'
      }`}
    >
      <PhoneOff size={size > 40 ? 18 : 15} />
      {label ? <span className="tl-head text-[10px] uppercase tracking-[0.14em]">{label}</span> : null}
    </button>
  );
}

export interface PersonTileProps {
  name: string;
  avatarUrl?: string;
  me?: boolean;
  speaking?: boolean;
  muted?: boolean;
  /** микрофон выключен модератором — красная иконка */
  forceMuted?: boolean;
  deaf?: boolean;
  quality?: CallQuality;
  /** поток камеры, если она включена */
  camera?: (() => MediaStream | null) | null;
  /** вызывающий ещё не ответил — пульсирующая рамка */
  ringing?: boolean;
  big?: boolean;
  onClick?: () => void;
  onContextMenu?: (x: number, y: number) => void;
}

/** Плитка участника: камера или аватар, подсветка говорящего, подпись с иконками. */
export function PersonTile({
  name, avatarUrl, me, speaking, muted, forceMuted, deaf, quality, camera, ringing, big, onClick, onContextMenu,
}: PersonTileProps) {
  const cam = camera?.() ?? null;
  return (
    <div
      onClick={onClick}
      onContextMenu={(e) => { if (!onContextMenu) return; e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
      className={`relative w-full h-full overflow-hidden border transition-shadow bg-[var(--panel2)] ${onClick ? 'cursor-pointer' : ''} ${
        speaking ? 'border-[var(--green2)] shadow-[0_0_0_2px_var(--green2),0_0_18px_rgb(52_211_153/.45)]' : 'border-[var(--line)]'
      }`}
    >
      {cam ? (
        <StreamVideo get={() => camera?.() ?? null} muted fit="cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`relative block border-2 transition-shadow ${speaking ? 'border-[var(--green2)] shadow-[0_0_14px_rgb(52_211_153/.6)]' : 'border-[var(--line)]'} ${ringing ? 'animate-pulse' : ''}`}
            style={{ width: big ? 128 : 'min(32%, 88px)', aspectRatio: '1' }}
          >
            <img src={avatarUrl || fallbackAvatar(name)} alt="" className="w-full h-full object-cover" draggable={false} />
            {ringing && <span className="absolute -inset-1 border-2 border-accent/60 vc-ring" />}
          </span>
        </div>
      )}
      <span className="absolute left-2 bottom-2 max-w-[85%] flex items-center gap-1.5 px-2 py-0.5 bg-black/70">
        {speaking && !muted && <AudioLines size={12} className="text-[var(--green2)] shrink-0" />}
        <span className="tl-term text-[14px] text-white truncate">{name}{me ? ' (вы)' : ''}</span>
        {(muted || forceMuted) && <MicOff size={12} className={`shrink-0 ${forceMuted ? 'text-red-400' : 'text-pearl/70'}`} />}
        {deaf && <HeadphoneOff size={12} className="text-pearl/70 shrink-0" />}
      </span>
      {quality && quality !== 'unknown' && (
        <span className="absolute right-2 top-2"><ConnectionBars quality={quality} /></span>
      )}
    </div>
  );
}

/** Громкость этой трансляции у зрителя: на маленькой плитке ползунок появляется при наведении. */
function StreamAudioControl({ identity, big }: { identity: string; big?: boolean }) {
  useSyncExternalStore(subscribeScreenAudio, getScreenAudioVersion);
  const a = getScreenAudio(identity);
  if (!a.has) return null;
  const percent = Math.round(a.volume * 100);
  const silent = a.muted || percent === 0;
  return (
    <span
      className="absolute right-2 bottom-2 flex items-center gap-1.5 px-1.5 py-1 bg-black/80 border border-[var(--line)] cursor-default"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setScreenAudioMuted(identity, !a.muted)}
        title={a.muted ? 'Включить звук трансляции' : 'Выключить звук трансляции'}
        aria-label={a.muted ? 'Включить звук трансляции' : 'Выключить звук трансляции'}
        aria-pressed={a.muted}
        className={silent ? 'text-red-300 hover:text-red-200' : 'text-pearl/85 hover:text-white'}
      >
        {silent ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
      <span className={`items-center gap-1.5 ${big ? 'flex' : 'hidden group-hover/t:flex focus-within:flex'}`}>
        <input
          type="range" min={0} max={200} step={5}
          value={percent}
          onChange={(e) => setScreenAudioVolume(identity, Number(e.target.value) / 100)}
          aria-label="Громкость трансляции"
          className={`${big ? 'w-28' : 'w-16'} cursor-pointer accent-[var(--pink)]`}
        />
        <span className="tl-num text-[10px] text-pearl/80 w-8 text-right">{a.muted ? 'выкл' : `${percent}%`}</span>
      </span>
    </span>
  );
}

/** Плитка трансляции экрана: LIVE, громкость этой трансляции, масштаб колесом в большом виде. */
export function StreamTile({ label, get, big, mutedAudio = true, audioIdentity, onClick, onContextMenu }: {
  label: string;
  get: () => MediaStream | null;
  big?: boolean;
  mutedAudio?: boolean;
  /** identity транслирующего: у своей трансляции не задаётся, регулировать там нечего */
  audioIdentity?: string;
  onClick?: () => void;
  onContextMenu?: (x: number, y: number) => void;
}) {
  const s = get();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (onClick && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      onContextMenu={(e) => { if (!onContextMenu) return; e.preventDefault(); onContextMenu(e.clientX, e.clientY); }}
      className="relative w-full h-full bg-black border border-[var(--line)] hover:border-[var(--line-2)] overflow-hidden group/t cursor-pointer"
      title={big ? 'Свернуть' : 'Развернуть трансляцию'}
    >
      {s ? <StreamVideo get={get} muted={mutedAudio} fit="contain" zoomable={big} /> : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-pearl/72">
          <Loader2 size={20} className="animate-spin" />
          <span className="tl-term text-[14px]">Загрузка трансляции…</span>
        </span>
      )}
      <span className="absolute left-2 top-2 tl-head text-[10px] px-1.5 py-0.5 bg-red-600 text-white tracking-[0.12em]">LIVE</span>
      <span className="absolute left-2 bottom-2 max-w-[60%] truncate px-2 py-0.5 bg-black/70 tl-term text-[14px] text-white">{label}</span>
      {audioIdentity && <StreamAudioControl identity={audioIdentity} big={big} />}
      <span className="absolute right-2 top-2 opacity-0 group-hover/t:opacity-100 text-white/80">{big ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</span>
    </div>
  );
}

/** Всплывающее уведомление звонка (пропущен, отклонён, ошибка). */
export function CallToast({ title, text, onClose }: { title: string; text: string; onClose?: () => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[100] vc-pop flex items-center gap-3 max-w-[340px] bg-[#0d0a14]/95 backdrop-blur border border-[var(--line-2)] shadow-[0_10px_30px_rgba(0,0,0,.6),var(--glow-sm)] pl-3 pr-4 py-3">
      <span className="w-9 h-9 shrink-0 flex items-center justify-center border border-red-500/50 bg-red-500/15 text-red-300">
        <PhoneOff size={16} />
      </span>
      <span className="min-w-0">
        <span className="block tl-head text-[10px] uppercase tracking-[0.14em] text-white">{title}</span>
        <span className="block tl-term text-[15px] text-pearl/70">{text}</span>
      </span>
      {onClose && <button onClick={onClose} className="ml-1 text-pearl/70 hover:text-white tl-term text-[15px]">✕</button>}
    </div>
  );
}
