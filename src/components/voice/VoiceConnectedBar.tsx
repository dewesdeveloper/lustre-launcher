import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Video, MonitorUp, Loader2 } from 'lucide-react';
import {
  leaveVoiceChannel, toggleVoiceMute, toggleVoiceDeaf, toggleVoiceVideo, setVoiceScreenShare, clearVoiceNotice,
} from '../../api/voiceChannel';
import { ConnectionBars } from '../callStage';
import ScreenSourcePicker, { type DesktopSource } from '../ScreenSourcePicker';
import { useVoice } from './useVoice';
import './voice.css';

function fmt(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/**
 * Плашка «Голосовая связь подключена» (как внизу слева в Discord): видна на любой
 * странице лаунчера, пока вы в голосовом канале. Клик по названию — к каналу.
 */
export default function VoiceConnectedBar() {
  const v = useVoice();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (v.status === 'idle') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [v.status]);

  // уведомление без активного канала (кик, ошибка входа) — отдельный тост
  if (v.status === 'idle') {
    if (!v.notice) return null;
    return (
      <div className="absolute left-3 bottom-3 z-[60] vc-pop max-w-[300px] px-4 py-2.5 bg-[#0d0a14] border border-[var(--line-2)] shadow-[var(--glow)] flex items-center gap-3">
        <span className="tl-term text-[15px] text-pearl">{v.notice}</span>
        <button onClick={clearVoiceNotice} className="text-pearl/70 hover:text-white tl-term text-[15px]">✕</button>
      </div>
    );
  }

  const connected = v.status === 'connected';
  const share = () => {
    if (v.sharing) { void setVoiceScreenShare(false); return; }
    if ((window as any).electron?.getDesktopSources) setPicker(true);
    else void setVoiceScreenShare(true);
  };
  const btn = (active: boolean, danger?: boolean) =>
    `w-8 h-8 flex items-center justify-center border transition-colors ${
      danger ? 'text-red-300 border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
        : active ? 'text-black bg-accent border-accent' : 'text-pearl/70 border-[var(--line)] hover:text-white hover:border-[var(--line-2)]'
    }`;

  return (
    <div className="absolute left-3 bottom-3 z-[60] w-[290px] vc-pop bg-[#0d0a14]/95 backdrop-blur border border-[var(--line-2)] shadow-[0_10px_30px_rgba(0,0,0,.6),var(--glow-sm)]">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        {connected
          ? <span className="w-2 h-2 bg-[var(--green2)] shadow-[0_0_6px_var(--green2)]" />
          : <Loader2 size={12} className="animate-spin text-amber-300" />}
        <span className={`tl-head text-[10px] uppercase tracking-[0.16em] ${connected ? 'text-[var(--green2)]' : 'text-amber-300'}`}>
          {v.status === 'connecting' ? 'Подключение…' : v.status === 'reconnecting' ? 'Переподключение…' : 'Голосовая связь'}
        </span>
        {connected && <ConnectionBars quality={v.quality} />}
        <span className="flex-1" />
        {connected && v.startedAt && <span className="tl-num text-[10px] text-pearl/72">{fmt(Math.max(0, Math.floor((now - v.startedAt) / 1000)))}</span>}
        <button onClick={() => void leaveVoiceChannel()} title="Отключиться" className="w-7 h-7 flex items-center justify-center text-pearl/60 hover:text-red-400"><PhoneOff size={15} /></button>
      </div>
      <button
        onClick={() => v.communityId && navigate(`/community/${v.communityId}`, { state: { tab: 'voice', channelId: v.channelId } })}
        className="block w-full text-left px-3 pb-2 group/n"
        title="Открыть канал"
      >
        <span className="block tl-term text-[16px] text-white truncate group-hover/n:text-accent">{v.channelName}</span>
        <span className="block tl-term text-[13px] tl-muted truncate">{v.communityName}</span>
      </button>
      <div className="flex items-center gap-1.5 px-3 pb-2.5">
        <button className={btn(false, v.selfMute || v.serverMute)} onClick={toggleVoiceMute} title={v.selfMute ? 'Включить микрофон' : 'Выключить микрофон'}>
          {v.selfMute || v.serverMute ? <MicOff size={15} /> : <Mic size={15} />}
        </button>
        <button className={btn(false, v.selfDeaf)} onClick={toggleVoiceDeaf} title={v.selfDeaf ? 'Включить звук' : 'Выключить звук'}>
          {v.selfDeaf ? <HeadphoneOff size={15} /> : <Headphones size={15} />}
        </button>
        <button className={btn(v.video)} onClick={() => void toggleVoiceVideo()} title="Камера" disabled={!connected}><Video size={15} /></button>
        <button className={btn(v.sharing)} onClick={share} title="Демонстрация экрана" disabled={!connected}><MonitorUp size={15} /></button>
        {v.notice && <span className="ml-1 tl-term text-[13px] text-amber-200/90 truncate" title={v.notice}>{v.notice}</span>}
      </div>
      {picker && (
        <ScreenSourcePicker open onClose={() => setPicker(false)} onPick={(s: DesktopSource) => { setPicker(false); void setVoiceScreenShare(true, s.id); }} />
      )}
    </div>
  );
}
