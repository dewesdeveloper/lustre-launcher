import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  subscribeCall, acceptCall, declineCall, endCall, toggleMute, toggleVideo,
  startScreenShare, stopScreenShare, toggleScreenShare,
  getLocalVideoStream, getRemoteVideoStream, getLocalScreenStream, getRemoteScreenStream, clearCallNotice,
} from '../api/call';
import type { CallState } from '../api/call';
import { startRingtone, stopRingtone, unlockAudio } from '../utils/ringtone';
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

export default function CallOverlay() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const upgrade = useProUpgradeDialog();
  const [st, setSt] = useState<CallState>({ status: 'idle', callId: null, peer: null, micMuted: false, videoEnabled: false, sharingScreen: false, remoteScreen: false, remoteVideo: false, startedAt: null, notice: null, localSpeaking: false, remoteSpeaking: false, reconnecting: false, serverLost: false, peerReconnecting: false });
  const [elapsed, setElapsed] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [quality, setQualityState] = useState<MediaQuality>(getQuality());
  const [shareAudio, setShareAudioState] = useState<boolean>(getShareAudio());
  const shareBtnRef = useRef<HTMLDivElement | null>(null);
  const isPro = !!user?.profile?.is_pro;

  useEffect(() => subscribeCall(setSt), []);

  // Синхронизируем Pro-статус для пресетов качества и пересчитываем выбор.
  useEffect(() => {
    setProStatus(isPro);
    setQualityState(getQuality());
  }, [isPro]);

  // разблокировка аудиоконтекста по первому клику (autoplay-политика)
  useEffect(() => {
    unlockAudio();
  }, []);

  // сигналы звонка
  useEffect(() => {
    if (st.status === 'incoming') startRingtone('incoming');
    else if (st.status === 'outgoing') startRingtone('ringback');
    else stopRingtone();
  }, [st.status]);

  useEffect(() => () => stopRingtone(), []);

  // Системный тост Windows о входящем звонке (звук — рингтон приложения)
  useEffect(() => {
    if (st.status === 'incoming' && st.peer) {
      nativeNotify({
        title: 'Входящий звонок',
        body: `${st.peer.display_name || st.peer.username} звонит вам`,
        tag: 'lh-call',
        silent: true,
        payload: { type: 'call' },
        category: 'calls',
      });
    }
  }, [st.status, st.peer]);

  // Пропущенный / отклонённый / неудачный звонок — тоже системным тостом
  useEffect(() => {
    if (st.notice) {
      nativeNotify({
        title: 'Звонок',
        body: st.notice,
        tag: 'lh-call-notice',
        payload: { type: 'call' },
        category: 'missed',
      });
    }
  }, [st.notice]);

  useEffect(() => {
    if (st.status !== 'active' || !st.startedAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - st.startedAt!) / 1000)), 1000);
    return () => clearInterval(t);
  }, [st.status, st.startedAt]);

  // --- Качество соединения (полоски сигнала, как в Discord) ---
  // LiveKit комната поднимается асинхронно после 'active' — пробуем подписаться
  // с короткими ретраями, пока hasRoom() не станет true.
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
      if (k === 'KeyM') { e.preventDefault(); toggleMute(); }
      else if (k === 'KeyV') { e.preventDefault(); void toggleVideo(); }
      else if (k === 'KeyS') { e.preventDefault(); void toggleScreenShare(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [st.status]);



  const onPickSource = async (s: DesktopSource) => {
    setShareSource(s.id);
    setPickerOpen(false);
    if (st.sharingScreen) await restartScreenShare();
    else await startScreenShare();
  };

  const handleShareStop = async () => {
    setShareMenuOpen(false);
    await stopScreenShare();
  };

  const handleShareChangeSource = () => {
    setShareMenuOpen(false);
    if (isElectron) { setPickerOpen(true); return; }
    // web: перезапуск шаринга заново открывает браузерный диалог выбора экрана
    void restartScreenShare();
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

  // Меню настроек демонстрации актуально только пока идёт шаринг.
  useEffect(() => {
    if (!st.sharingScreen) setShareMenuOpen(false);
  }, [st.sharingScreen]);

  // тост-уведомление само исчезает
  useEffect(() => {
    if (!st.notice) return;
    const t = setTimeout(() => clearCallNotice(), 4500);
    return () => clearTimeout(t);
  }, [st.notice]);



  if (st.status === 'idle' && !st.notice) return null;

  const statusText =
    st.status === 'incoming' ? 'Входящий звонок…'
    : st.status === 'outgoing' ? 'Вызываем…'
    : elapsed < 3 ? 'Соединение…'
    : fmtTime(elapsed);

  const peerName = st.peer?.display_name || st.peer?.username || '';
  const myName = (user as any)?.profile?.display_name || (user as any)?.username || 'Вы';
  const myAvatar = (user as any)?.profile?.avatar_url as string | undefined;
  const myIdStr = String((user as any)?.id ?? '');
  const peerIdStr = String(st.peer?.id ?? '');
  const active = st.status === 'active';

  // участники сцены: собеседник первым (как в Discord), затем вы
  const people: CallPerson[] = [];
  if (st.peer) {
    people.push({
      key: 'peer', identity: peerIdStr, name: peerName, avatarUrl: st.peer.avatar_url,
      speaking: active && st.remoteSpeaking, quality: qualityMap[peerIdStr], ringing: st.status === 'outgoing',
      camera: active && st.remoteVideo ? getRemoteVideoStream : null,
      screen: active && st.remoteScreen ? getRemoteScreenStream : null,
    });
  }
  people.push({
    key: 'me', name: myName, avatarUrl: myAvatar, me: true,
    speaking: active && st.localSpeaking, muted: st.micMuted, quality: qualityMap[myIdStr],
    camera: st.videoEnabled ? getLocalVideoStream : null,
    screen: st.sharingScreen ? getLocalScreenStream : null,
  });

  return (
    <>
      {st.notice && <CallToast title="Звонок не состоялся" text={st.notice} onClose={clearCallNotice} />}

      {st.status !== 'idle' && st.peer && (
        <CallWindow
          kind="dm"
          status={st.status}
          title={peerName}
          avatarUrl={st.peer.avatar_url}
          incomingText={`${peerName} звонит вам`}
          statusText={statusText}
          reconnecting={st.reconnecting || st.serverLost || st.peerReconnecting}
          reconnectText={st.serverLost ? 'Нет связи с сервером…' : st.peerReconnecting ? `${peerName} переподключается…` : undefined}
          quality={qualityMap[peerIdStr]}
          people={people}
          micMuted={st.micMuted}
          onMute={toggleMute}
          videoOn={st.videoEnabled}
          onVideo={() => void toggleVideo()}
          sharing={st.sharingScreen}
          canShare
          onShare={() => {
            if (st.sharingScreen) { void stopScreenShare(); return; }
            // Electron: свой пикер источников; web: браузерный диалог getDisplayMedia
            if (isElectron) setPickerOpen(true);
            else void startScreenShare();
          }}
          shareMenuOpen={shareMenuOpen}
          onShareMenu={() => setShareMenuOpen((v) => !v)}
          shareBtnRef={shareBtnRef}
          onAccept={() => acceptCall()}
          onDecline={declineCall}
          onHangup={endCall}
          hangupTitle="Завершить звонок"
        />
      )}

      <ScreenSourcePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPickSource} />
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
