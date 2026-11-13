import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  subscribeGroupCall, acceptGroupCall, declineGroupCall, leaveGroupCall, endGroupCall,
  toggleGroupMute, toggleGroupVideo, toggleGroupScreenShare, clearGroupCallNotice,
  getLocalGroupVideoStream, getGroupParticipantStream,
  getLocalGroupScreenStream, getGroupParticipantScreenStream,
} from '../api/groupCall';
import type { GroupCallState } from '../api/groupCall';
import ScreenSourcePicker, { type DesktopSource } from './ScreenSourcePicker';
import ScreenShareMenu from './ScreenShareMenu';
import { useProUpgradeDialog } from './ProUpgradeDialog';
import { getQuality, getShareAudio, setQuality, setShareAudio, setProStatus, type MediaQuality } from '../api/mediaQuality';
import {
  setShareSource, reapplyMediaQuality, restartScreenShare, hasRoom, onConnectionQuality,  type CallQuality,
} from '../api/livekitRoom';
import { isElectron } from '../App';
import { useAuth } from '../context/AuthContext';
import { nativeNotify } from '../utils/nativeNotify';
import CallWindow, { type CallPerson } from './call/CallWindow';
import { CallToast } from './call/CallUI';

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function GroupCallOverlay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const upgrade = useProUpgradeDialog();
  const [st, setSt] = useState<GroupCallState>({
    status: 'idle', callId: null, groupId: null, groupName: null,
    caller: null, participants: [], micMuted: false, videoEnabled: false, videoUsers: [],
    sharingScreen: false, screenUsers: [], livekit: false, startedAt: null, notice: null,
    speakingIds: [], localSpeaking: false, reconnecting: false,
  });
  const [elapsed, setElapsed] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [quality, setQualityState] = useState<MediaQuality>(getQuality());
  const [shareAudio, setShareAudioState] = useState<boolean>(getShareAudio());
  const shareBtnRef = useRef<HTMLDivElement | null>(null);
  const isPro = !!user?.profile?.is_pro;

  const startShare = async (source?: DesktopSource) => {
    if (source) setShareSource(source.id);
    setPickerOpen(false);
    if (st.sharingScreen) await restartScreenShare();
    else await toggleGroupScreenShare();
  };

  const handleShareButton = () => {
    if (st.sharingScreen) void toggleGroupScreenShare();
    else if (isElectron) setPickerOpen(true);
    else void startShare();
  };

  const handleShareStop = async () => {
    setShareMenuOpen(false);
    if (st.sharingScreen) await toggleGroupScreenShare();
  };

  const handleShareChangeSource = () => {
    setShareMenuOpen(false);
    setPickerOpen(true);
  };

  const handleQuality = async (q: MediaQuality) => {
    if (q === 'hd' && !isPro) {
      setShareMenuOpen(false);
      void upgrade({
        title: 'HD-качество',
        message: 'Демонстрация в 1080p/60 доступна с подпиской Lustre Pro.',
        confirmText: 'К подписке',
      });
      return;
    }
    const next = setQuality(q);
    setQualityState(next);
    await reapplyMediaQuality();
  };

  const handleShareAudio = async (value: boolean) => {
    setShareAudio(value);
    setShareAudioState(value);
    if (st.sharingScreen) await restartScreenShare();
  };

  const handleShareReport = () => {
    setShareMenuOpen(false);
    navigate('/support');
  };

  useEffect(() => subscribeGroupCall(setSt), []);

  // Pro-статус для пресетов качества + актуализация выбора.
  useEffect(() => {
    setProStatus(isPro);
    setQualityState(getQuality());
  }, [isPro]);

  useEffect(() => {
    if (!st.sharingScreen) setShareMenuOpen(false);
  }, [st.sharingScreen]);

  useEffect(() => {
    if (st.status !== 'active' || !st.startedAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - st.startedAt!) / 1000)), 1000);
    return () => clearInterval(t);
  }, [st.status, st.startedAt]);

  // --- Качество соединения участников (полоски сигнала, как в Discord) ---
  const [qualityMap, setQualityMap] = useState<Record<string, CallQuality>>({});
  useEffect(() => {
    if (st.status !== 'active') { setQualityMap({}); return; }
    let unsub: (() => void) | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trySub = () => {
      if (!hasRoom()) {
        if (tries++ < 40) timer = setTimeout(trySub, 500);
        return;
      }
      unsub = onConnectionQuality((q) => setQualityMap(q));
    };
    trySub();
    return () => { if (timer) clearTimeout(timer); unsub?.(); setQualityMap({}); };
  }, [st.status]);

  // --- Горячие клавиши (как в Discord): Ctrl+Shift+M/V/S ---
  useEffect(() => {
    if (st.status !== 'active') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey) || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.code;
      if (k === 'KeyM') { e.preventDefault(); toggleGroupMute(); }
      else if (k === 'KeyV') { e.preventDefault(); void toggleGroupVideo(); }
      else if (k === 'KeyS') { e.preventDefault(); if (st.livekit) void toggleGroupScreenShare(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [st.status, st.livekit]);

  useEffect(() => {
    if (!st.notice) return;
    const t = setTimeout(() => clearGroupCallNotice(), 4500);
    return () => clearTimeout(t);
  }, [st.notice]);

  // Системный тост Windows о входящем групповом звонке
  useEffect(() => {
    if (st.status === 'incoming') {
      nativeNotify({
        title: 'Групповой звонок',
        body: `${st.caller?.display_name || st.caller?.username || 'Пользователь'} зовёт в «${st.groupName || 'звонок'}»`,
        tag: 'lh-group-call',
        silent: true,
        payload: { type: 'call' },
        category: 'calls',
      });
    }
  }, [st.status, st.caller, st.groupName]);

  // Ошибки/пропуски группового звонка — системным тостом
  useEffect(() => {
    if (st.notice) {
      nativeNotify({
        title: 'Групповой звонок',
        body: st.notice,
        tag: 'lh-group-notice',
        payload: { type: 'call' },
        category: 'missed',
      });
    }
  }, [st.notice]);






  if (st.status === 'idle' && !st.notice) return null;

  const myId = (user as any)?.id as number | undefined;
  const myName = (user as any)?.profile?.display_name || (user as any)?.username || 'Вы';
  const myAvatar = (user as any)?.profile?.avatar_url as string | undefined;
  const callerName = st.caller?.display_name || st.caller?.username || 'Участник';
  const active = st.status === 'active';

  const people: CallPerson[] = st.participants
    .filter((p) => p.id !== myId)
    .map((p) => ({
      key: `u${p.id}`,
      identity: String(p.id),
      name: p.display_name || p.username,
      avatarUrl: p.avatar_url,
      speaking: st.speakingIds.includes(p.id),
      quality: qualityMap[String(p.id)],
      camera: st.videoUsers.includes(p.id) ? () => getGroupParticipantStream(p.id) : null,
      screen: st.screenUsers.includes(p.id) ? () => getGroupParticipantScreenStream(p.id) : null,
    }));
  people.push({
    key: 'me', name: myName, avatarUrl: myAvatar, me: true,
    speaking: active && st.localSpeaking, muted: st.micMuted, quality: qualityMap[String(myId ?? '')],
    camera: st.videoEnabled ? getLocalGroupVideoStream : null,
    screen: st.sharingScreen ? getLocalGroupScreenStream : null,
  });

  return (
    <>
      {st.notice && <CallToast title="Групповой звонок" text={st.notice} onClose={clearGroupCallNotice} />}

      {st.status !== 'idle' && (
        <CallWindow
          kind="group"
          status={st.status}
          title={st.groupName || 'Групповой звонок'}
          avatarUrl={st.caller?.avatar_url}
          incomingText={`${callerName} зовёт в групповой звонок`}
          statusText={active && st.startedAt ? (elapsed < 2 ? 'Соединение…' : fmtTime(elapsed)) : 'Подключение…'}
          reconnecting={st.reconnecting}
          quality={qualityMap[String(myId ?? '')]}
          people={people}
          micMuted={st.micMuted}
          onMute={toggleGroupMute}
          videoOn={st.videoEnabled}
          onVideo={() => void toggleGroupVideo()}
          sharing={st.sharingScreen}
          canShare={st.livekit}
          onShare={handleShareButton}
          shareMenuOpen={shareMenuOpen}
          onShareMenu={() => setShareMenuOpen((v) => !v)}
          shareBtnRef={shareBtnRef}
          onAccept={() => acceptGroupCall({ id: myId ?? 0, username: (user as any)?.username || 'Вы', display_name: myName, avatar_url: myAvatar })}
          onDecline={declineGroupCall}
          onHangup={endGroupCall}
          hangupTitle="Завершить звонок для всех"
          onLeave={leaveGroupCall}
        />
      )}

      <ScreenSourcePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(s) => void startShare(s)} />
      <ScreenShareMenu
        open={shareMenuOpen && st.sharingScreen}
        anchorRef={shareBtnRef}
        onClose={() => setShareMenuOpen(false)}
        onStop={() => void handleShareStop()}
        onChangeSource={handleShareChangeSource}
        quality={quality}
        canHd={isPro}
        onQuality={(q) => void handleQuality(q)}
        shareAudio={shareAudio}
        onToggleShareAudio={(v) => void handleShareAudio(v)}
        onReport={handleShareReport}
      />
    </>
  );
}
