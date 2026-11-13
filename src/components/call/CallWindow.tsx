import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Maximize2, Minimize2, LayoutGrid,
  ChevronDown, Users, Loader2, PhoneIncoming,
} from 'lucide-react';
import { ConnectionBars } from '../callStage';
import type { CallQuality } from '../../api/livekitRoom';
import { CtlBtn, HangupBtn, PersonTile, StreamTile, gridStyle, fallbackAvatar } from './CallUI';
import '../voice/voice.css';

export interface CallPerson {
  key: string;
  /** identity в комнате LiveKit: по ней настраивается звук трансляции */
  identity?: string;
  name: string;
  avatarUrl?: string;
  me?: boolean;
  speaking?: boolean;
  muted?: boolean;
  quality?: CallQuality;
  camera?: (() => MediaStream | null) | null;
  screen?: (() => MediaStream | null) | null;
  ringing?: boolean;
}

export interface CallWindowProps {
  kind: 'dm' | 'group';
  status: 'incoming' | 'outgoing' | 'active';
  title: string;
  avatarUrl?: string;
  /** «Kira звонит вам» / «Kira зовёт в групповой звонок» */
  incomingText: string;
  /** таймер или «Вызываем…» */
  statusText: string;
  reconnecting?: boolean;
  /** текст вместо «Переподключение…» (нет связи с сервером, собеседник переподключается) */
  reconnectText?: string;
  quality?: CallQuality;
  people: CallPerson[];
  micMuted: boolean;
  onMute: () => void;
  videoOn: boolean;
  onVideo: () => void;
  sharing: boolean;
  canShare: boolean;
  onShare: () => void;
  shareMenuOpen: boolean;
  onShareMenu: () => void;
  shareBtnRef: RefObject<HTMLDivElement | null>;
  onAccept: () => void;
  onDecline: () => void;
  onHangup: () => void;
  hangupTitle: string;
  /** только группа: выйти, не завершая звонок для остальных */
  onLeave?: () => void;
}

type Tile = { key: string; kind: 'person' | 'stream'; p: CallPerson };

/**
 * Окно звонка в стиле Discord: модалка входящего вызова, мини-окно в углу
 * (видно поверх любой страницы) и полноэкранная сцена с сеткой/большим видом.
 */
export default function CallWindow(props: CallWindowProps) {
  const { status, people } = props;
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const seenStreams = useRef<Set<string>>(new Set());

  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];
    for (const p of people) if (p.screen) out.push({ key: `s:${p.key}`, kind: 'stream', p });
    for (const p of people) out.push({ key: `u:${p.key}`, kind: 'person', p });
    return out;
  }, [people]);
  const focused = focus ? tiles.find((t) => t.key === focus) ?? null : null;

  // как в Discord: новая чужая трансляция сама разворачивается в большой вид
  useEffect(() => {
    const streams = tiles.filter((t) => t.kind === 'stream');
    for (const t of streams) {
      if (seenStreams.current.has(t.key)) continue;
      seenStreams.current.add(t.key);
      if (!t.p.me && !focus) setFocus(t.key);
    }
    for (const k of [...seenStreams.current]) if (!streams.some((t) => t.key === k)) seenStreams.current.delete(k);
    if (focus && !focused) setFocus(null);
  }, [tiles, focus, focused]);

  // Esc: из большого вида — в сетку, из сетки — в мини-окно
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (focus) setFocus(null); else setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, focus]);

  if (status === 'incoming') return <IncomingModal {...props} />;

  const isGroup = props.kind === 'group';
  const anyStream = tiles.find((t) => t.kind === 'stream' && !t.p.me) ?? tiles.find((t) => t.kind === 'stream');
  const anyCamera = people.some((p) => p.camera);

  const controls = (size: number) => (
    <div className="flex items-center gap-2">
      {status === 'active' && (
        <>
          <CtlBtn size={size} danger={props.micMuted} on={!props.micMuted} title={props.micMuted ? 'Включить микрофон (Ctrl+Shift+M)' : 'Выключить микрофон (Ctrl+Shift+M)'} onClick={props.onMute}>
            {props.micMuted ? <MicOff size={size > 40 ? 19 : 15} /> : <Mic size={size > 40 ? 19 : 15} />}
          </CtlBtn>
          <CtlBtn size={size} accent={props.videoOn} on={props.videoOn} title={props.videoOn ? 'Выключить камеру (Ctrl+Shift+V)' : 'Включить камеру (Ctrl+Shift+V)'} onClick={props.onVideo}>
            {props.videoOn ? <Video size={size > 40 ? 19 : 15} /> : <VideoOff size={size > 40 ? 19 : 15} />}
          </CtlBtn>
          {props.canShare && (
            <div ref={props.shareBtnRef} className="flex items-center">
              <CtlBtn size={size} accent={props.sharing} on={props.sharing} title={props.sharing ? 'Остановить демонстрацию (Ctrl+Shift+S)' : 'Демонстрация экрана (Ctrl+Shift+S)'} onClick={props.onShare}>
                {props.sharing ? <MonitorOff size={size > 40 ? 19 : 15} /> : <MonitorUp size={size > 40 ? 19 : 15} />}
              </CtlBtn>
              {props.sharing && (
                <button
                  type="button"
                  onClick={props.onShareMenu}
                  title="Настройки демонстрации"
                  style={{ height: size }}
                  className={`w-5 flex items-center justify-center border border-l-0 transition-colors ${props.shareMenuOpen ? 'bg-accent text-black border-accent' : 'bg-white/[0.04] border-[var(--line)] text-pearl/70 hover:text-white'}`}
                >
                  <ChevronDown size={13} />
                </button>
              )}
            </div>
          )}
          {expanded && tiles.length > 1 && (
            <CtlBtn size={size} accent={!!focused} title={focused ? 'Сетка' : 'Большой вид'} onClick={() => setFocus(focused ? null : (anyStream ?? tiles[0]).key)}>
              <LayoutGrid size={size > 40 ? 19 : 15} />
            </CtlBtn>
          )}
          <CtlBtn size={size} title={expanded ? 'Свернуть (Esc)' : 'Развернуть'} onClick={() => setExpanded(!expanded)}>
            {expanded ? <Minimize2 size={size > 40 ? 19 : 15} /> : <Maximize2 size={size > 40 ? 19 : 15} />}
          </CtlBtn>
          <span className="w-px bg-[var(--line)] mx-1" style={{ height: size - 12 }} />
        </>
      )}
      {isGroup && props.onLeave && status === 'active' && (
        <HangupBtn size={size} tone="amber" title="Выйти из звонка" onClick={props.onLeave} label={expanded ? 'Выйти' : undefined} />
      )}
      <HangupBtn
        size={size}
        title={status === 'outgoing' ? 'Отменить вызов' : props.hangupTitle}
        onClick={props.onHangup}
        label={expanded ? (isGroup ? 'Завершить для всех' : 'Завершить') : undefined}
      />
    </div>
  );

  // ---------------- полноэкранная сцена ----------------
  if (expanded) {
    return (
      <div className="fixed inset-0 z-[110] flex flex-col bg-[var(--bg)]">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--line)] bg-[var(--panel)] shrink-0">
          {isGroup ? <Users size={17} className="text-accent" /> : <Phone size={16} className="text-accent" />}
          <span className="tl-head text-[11px] uppercase tracking-[0.14em] text-white truncate">{props.title}</span>
          {isGroup && <span className="flex items-center gap-1 tl-term text-[15px] tl-muted"><Users size={13} /> {people.length}</span>}
          <span className="flex-1" />
          {props.reconnecting
            ? <span className="flex items-center gap-1.5 tl-term text-[15px] text-amber-300"><Loader2 size={13} className="animate-spin" />{props.reconnectText || 'Переподключение…'}</span>
            : <span className="tl-num text-[11px] text-pearl/60">{props.statusText}</span>}
          {status === 'active' && <ConnectionBars quality={props.quality} />}
        </div>

        <div className="relative flex-1 min-h-0 p-3 vc-stage">
          {focused ? (
            <div className="h-full flex flex-col gap-3">
              <div className="flex-1 min-h-0">
                <TileView t={focused} big onClick={() => setFocus(null)} />
              </div>
              {tiles.length > 1 && (
                <div className="flex gap-2 h-[112px] shrink-0 overflow-x-auto custom-scrollbar">
                  {tiles.filter((t) => t.key !== focused.key).map((t) => (
                    <div key={t.key} className="w-[200px] shrink-0 h-full">
                      <TileView t={t} onClick={() => setFocus(t.key)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className={`h-full grid gap-3 ${tiles.length <= 1 ? 'max-w-[820px] mx-auto w-full' : ''}`} style={gridStyle(tiles.length)}>
              {tiles.map((t) => (
                <div key={t.key} className="min-h-0 min-w-0">
                  <TileView t={t} onClick={() => setFocus(t.key)} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center h-[72px] border-t border-[var(--line)] bg-[var(--panel)] shrink-0">
          {controls(44)}
        </div>
      </div>
    );
  }

  // ---------------- мини-окно в углу ----------------
  return (
    <div className="fixed bottom-5 right-5 z-[100] w-[340px] vc-pop bg-[#0d0a14]/95 backdrop-blur border border-[var(--line-2)] shadow-[0_14px_40px_rgba(0,0,0,.65),var(--glow-sm)]">
      <div className="flex items-center gap-2 px-3 h-10 border-b border-[var(--line)]">
        {status === 'active'
          ? <span className="w-2 h-2 bg-[var(--green2)] shadow-[0_0_6px_var(--green2)] shrink-0" />
          : <Loader2 size={12} className="animate-spin text-amber-300 shrink-0" />}
        <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-white truncate">{props.title}</span>
        <span className="flex-1" />
        {props.reconnecting
          ? <span className="tl-term text-[14px] text-amber-300">{props.reconnectText || 'переподключение…'}</span>
          : <span className={`tl-num text-[10px] ${status === 'active' ? 'text-pearl/60' : 'text-amber-300'}`}>{props.statusText}</span>}
        {status === 'active' && <ConnectionBars quality={props.quality} />}
        {status === 'active' && (
          <button onClick={() => setExpanded(true)} title="Развернуть" className="text-pearl/72 hover:text-accent"><Maximize2 size={14} /></button>
        )}
      </div>

      <div className="p-2">
        {status === 'outgoing' ? (
          <div className="flex flex-col items-center gap-2 py-4">
            <span className="relative w-20 h-20 border-2 border-[var(--line-2)]">
              <img src={props.avatarUrl || fallbackAvatar(props.title)} alt="" className="w-full h-full object-cover" />
              <span className="absolute -inset-1 border-2 border-accent/60 vc-ring" />
            </span>
            <span className="tl-term text-[16px] text-pearl/70">Вызываем…</span>
          </div>
        ) : anyStream ? (
          <div className="aspect-video">
            <TileView t={anyStream} onClick={() => { setExpanded(true); setFocus(anyStream.key); }} />
          </div>
        ) : anyCamera ? (
          <div className="grid grid-cols-2 gap-1.5">
            {tiles.filter((t) => t.kind === 'person').slice(0, 4).map((t) => (
              <div key={t.key} className="aspect-video"><TileView t={t} onClick={() => setExpanded(true)} /></div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-3 py-3">
            {people.slice(0, 8).map((p) => (
              <div key={p.key} className="flex flex-col items-center gap-1 w-[64px]">
                <span className={`block w-14 h-14 border-2 transition-shadow ${p.speaking ? 'border-[var(--green2)] shadow-[0_0_12px_rgb(52_211_153/.6)]' : 'border-[var(--line)]'}`}>
                  <img src={p.avatarUrl || fallbackAvatar(p.name)} alt="" className="w-full h-full object-cover" />
                </span>
                <span className="flex items-center gap-1 max-w-full">
                  <span className="tl-term text-[13px] text-pearl/70 truncate">{p.me ? 'Вы' : p.name}</span>
                  {p.muted && <MicOff size={10} className="text-pearl/72 shrink-0" />}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center px-2 pb-2.5">{controls(36)}</div>
    </div>
  );
}

function TileView({ t, big, onClick }: { t: Tile; big?: boolean; onClick?: () => void }) {
  const p = t.p;
  if (t.kind === 'stream' && p.screen) {
    return <StreamTile label={p.me ? 'Ваш экран' : `Экран: ${p.name}`} get={p.screen} big={big} mutedAudio audioIdentity={p.me ? undefined : p.identity} onClick={onClick} />;
  }
  return (
    <PersonTile
      name={p.name}
      avatarUrl={p.avatarUrl}
      me={p.me}
      speaking={p.speaking}
      muted={p.muted}
      quality={p.quality}
      camera={p.camera}
      ringing={p.ringing}
      big={big}
      onClick={onClick}
    />
  );
}

/** Входящий вызов — модалка по центру, как в Discord. */
function IncomingModal(props: CallWindowProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
      <div className="tl-panel vc-pop w-[320px] flex flex-col items-center gap-4 px-6 py-7 bg-[var(--panel)] border border-[var(--line-2)] shadow-[0_20px_60px_rgba(0,0,0,.7),var(--glow)]">
        <span className="flex items-center gap-2 tl-head text-[10px] uppercase tracking-[0.2em] text-accent">
          <PhoneIncoming size={13} /> {props.kind === 'group' ? 'Групповой звонок' : 'Входящий звонок'}
        </span>
        <span className="relative w-28 h-28 border-2 border-[var(--line-2)]">
          <img src={props.avatarUrl || fallbackAvatar(props.title)} alt="" className="w-full h-full object-cover" />
          <span className="absolute -inset-1 border-2 border-accent/60 vc-ring" />
          <span className="absolute -inset-1 border border-accent/40 vc-ring delay" />
        </span>
        <div className="text-center">
          <p className="tl-head text-[13px] uppercase tracking-[0.16em] text-white">{props.title}</p>
          <p className="tl-term text-[16px] tl-muted mt-1">{props.incomingText}</p>
        </div>
        <div className="flex items-center gap-6 mt-1">
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={props.onDecline}
              title="Отклонить"
              className="w-14 h-14 flex items-center justify-center bg-red-600/90 hover:bg-red-500 border border-red-400/50 text-white transition-colors"
            ><PhoneOff size={22} /></button>
            <span className="tl-term text-[14px] tl-muted">Отклонить</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={props.onAccept}
              title="Принять"
              className="w-14 h-14 flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 border border-emerald-300/60 text-black shadow-[0_0_18px_rgb(52_211_153/.55)] transition-colors animate-pulse"
            ><Phone size={22} /></button>
            <span className="tl-term text-[14px] text-[var(--green2)]">Принять</span>
          </div>
        </div>
      </div>
    </div>
  );
}
