import { onChatEvent, sendWS, connectChat, disconnectChat } from './chat';
import { leaveVoiceForCall } from './voiceBridge';
import { getVoicePrefs, subscribeVoicePrefs, playMicSound, pushVoiceLog, applyOutputVolumeToElement, releaseOutputBoost, setOutputBoostSink } from './voicePrefs';
import { createMicPipeline, captureKeyOf, type MicPipeline } from './micPipeline';
import * as lk from './livekitRoom';
import { getPreset } from './mediaQuality';
import { getIceServers } from './ice';
import { VoiceGate, readAudioLevels, resetSpeakingCache, AUDIO_LEVEL_GATE } from './speaking';

export interface CallPeer {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'active';

export interface CallState {
  status: CallStatus;
  callId: string | null;
  peer: CallPeer | null;
  micMuted: boolean;
  /** Видео включено локально (мы шлём камеру). */
  videoEnabled: boolean;
  /** Мы демонстрируем экран. */
  sharingScreen: boolean;
  /** Собеседник демонстрирует экран. */
  remoteScreen: boolean;
  /** У собеседника есть видеотрек (мы принимаем видео). */
  remoteVideo: boolean;
  startedAt: number | null;
  notice: string | null;
  /** Мы говорим прямо сейчас (голосовая активность). */
  localSpeaking: boolean;
  /** Собеседник говорит прямо сейчас. */
  remoteSpeaking: boolean;
  /** Идёт автопереподключение после обрыва соединения. */
  reconnecting: boolean;
  /** У собеседника есть звук демонстрации экрана. */
  /** Нет связи с сервером: звонок ждёт переподключения (сервер держит его 30 с). */
  serverLost: boolean;
  /** Собеседник потерял связь с сервером и переподключается. */
  peerReconnecting: boolean;
}

let state: CallState = {
  status: 'idle', callId: null, peer: null, micMuted: false,
  videoEnabled: false, sharingScreen: false, remoteScreen: false, remoteVideo: false, startedAt: null, notice: null,
  localSpeaking: false, remoteSpeaking: false, reconnecting: false,
  serverLost: false, peerReconnecting: false,
};
const listeners = new Set<(s: CallState) => void>();

function setState(patch: Partial<CallState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function getCallState(): CallState {
  return state;
}

/** Локальный видеопоток (камера) для отрисовки в оверлее. */
export function getLocalVideoStream(): MediaStream | null {
  if (lkMode) return lkLocalCam;
  if (!localVideoTrack) { localVideoStreamCache = null; return null; }
  // стабильный объект: <video> не надо перепривязывать на каждом рендере
  if (!localVideoStreamCache || localVideoStreamCache.getVideoTracks()[0] !== localVideoTrack) {
    localVideoStreamCache = new MediaStream([localVideoTrack]);
  }
  return localVideoStreamCache;
}

/** Удалённый видеопоток собеседника. */
export function getRemoteVideoStream(): MediaStream | null {
  if (lkMode) return lkRemoteCam;
  return remoteVideoStream;
}

export function subscribeCall(listener: (s: CallState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

// --- WebRTC ---

let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let localVideoTrack: MediaStreamTrack | null = null;
let screenTrack: MediaStreamTrack | null = null;
let remoteVideoStream: MediaStream | null = null;
let remoteScreenStream: MediaStream | null = null;
// Кэш локальных потоков для оверлея (стабильная ссылка, без реконструкции на каждый вызов)
let localVideoStreamCache: MediaStream | null = null;
let localScreenStreamCache: MediaStream | null = null;
let remoteAudio: HTMLAudioElement | null = null;
let pendingIce: RTCIceCandidateInit[] = [];
let ringTimeout: ReturnType<typeof setTimeout> | null = null;
// Запустить камеру сразу после установки соединения (когда пользователь принял видео-вызов).
let pendingEnableVideo = false;
// Защита от гонки повторных renegotiation.
let renegotiating = false;
let makingOffer = false;
// Отложенное пересогласование: не отбрасываем, если сигнал уже идёт — повторим после стабилизации
let renegotiateQueued = false;
// P2P: автопереподключение при обрыве (ICE restart с грейс-таймером)
let iceReconnectAttempts = 0;
let iceReconnectTimer: ReturnType<typeof setTimeout> | null = null;
// Кто создал исходящее соединение — только он поднимает ICE restart (иначе глейр)
let isCallCaller = false;

// LiveKit-режим: медиа идёт через SFU вместо P2P. Старый WS-сигналинг (call.*)
// остаётся для «рингтона» — кто кому звонит.
let lkMode = false;
let lkVideoWanted = false;
// Локальные/удалённые потоки из LiveKit (для оверлея)
let lkLocalCam: MediaStream | null = null;
let lkLocalScreen: MediaStream | null = null;
let lkRemoteCam: MediaStream | null = null;
let lkRemoteScreen: MediaStream | null = null;

// --- Голосовые настройки (P2P): микрофон — micPipeline.ts (шумодав, порог, рация), здесь вывод ---
let p2pMic: MicPipeline | null = null;
let outStream: MediaStream | null = null;
let voiceLoop: ReturnType<typeof setInterval> | null = null;
let offPrefs: (() => void) | null = null;

/** Применяет «громкость вывода» (0..2) к элементу собеседника. */
function applyRemoteOutputVolume() {
  if (!remoteAudio) return;
  const track = (remoteAudio.srcObject as MediaStream | null)?.getAudioTracks()[0] ?? null;
  applyOutputVolumeToElement(remoteAudio, track, getVoicePrefs().output_volume);
}

function startVoiceController() {
  stopVoiceController();
  voiceLoop = setInterval(applyRemoteOutputVolume, 500);
}

function stopVoiceController() {
  if (voiceLoop) { clearInterval(voiceLoop); voiceLoop = null; }
}

// --- Голосовая активность: подсветка «говорит сейчас» (см. api/speaking.ts) ---

let speakLoop: ReturnType<typeof setInterval> | null = null;
let speakBusy = false;
const localGate = new VoiceGate(...AUDIO_LEVEL_GATE);
const remoteGate = new VoiceGate(...AUDIO_LEVEL_GATE);
let offLKSpeaking: (() => void) | null = null;

function micIsOff(): boolean {
  const tracks = (outStream || localStream)?.getAudioTracks() ?? [];
  return state.micMuted || !tracks.some((t) => t.enabled);
}

/** P2P: опрашивает getStats() соединения и пушит localSpeaking/remoteSpeaking. */
function startSpeakingWatch() {
  stopSpeakingWatch();
  speakLoop = setInterval(async () => {
    if (speakBusy || state.status !== 'active' || lkMode || !pc) return;
    speakBusy = true;
    try {
      const { local, remote } = await readAudioLevels(pc);
      const localSpeaking = !micIsOff() && localGate.update(local ?? 0);
      const remoteSpeaking = remoteGate.update(remote ?? 0);
      if (localSpeaking !== state.localSpeaking || remoteSpeaking !== state.remoteSpeaking) {
        setState({ localSpeaking, remoteSpeaking });
      }
    } catch { /* ignore */ } finally {
      speakBusy = false;
    }
  }, 250);
}

function stopSpeakingWatch() {
  if (speakLoop) { clearInterval(speakLoop); speakLoop = null; }
  speakBusy = false;
  localGate.reset();
  remoteGate.reset();
  resetSpeakingCache();
  if (state.localSpeaking || state.remoteSpeaking) setState({ localSpeaking: false, remoteSpeaking: false });
}

/** LiveKit-режим: подписка на ActiveSpeakersChanged вместо опроса getStats. */
function watchLKSpeaking() {
  offLKSpeaking?.();
  offLKSpeaking = lk.onSpeakingChanged(({ local, remote }) => {
    const l = local && !state.micMuted;
    if (l !== state.localSpeaking || remote !== state.remoteSpeaking) {
      setState({ localSpeaking: l, remoteSpeaking: remote });
    }
  });
}

function cleanupWebRTC() {
  if (ringTimeout) { clearTimeout(ringTimeout); ringTimeout = null; }
  clearIceReconnect();
  iceReconnectAttempts = 0;
  isCallCaller = false;
  stopSpeakingWatch();
  offLKSpeaking?.(); offLKSpeaking = null;
  // Отключаем LiveKit-комнату, если была активна
  if (lkMode) {
    void lk.disconnectRoom();
    lkMode = false;
    lkVideoWanted = false;
    lkLocalCam = null; lkLocalScreen = null; lkRemoteCam = null; lkRemoteScreen = null;
  }
  pendingIce = [];
  pendingEnableVideo = false;
  renegotiating = false;
  makingOffer = false;
  renegotiateQueued = false;
  stopVoiceController();
  offPrefs?.(); offPrefs = null;
  localVideoTrack?.stop();
  localVideoTrack = null;
  localVideoStreamCache = null;
  screenTrack?.stop();
  screenTrack = null;
  localScreenStreamCache = null;
  remoteVideoStream = null;
  remoteScreenStream = null;
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  outStream = null;
  p2pMic?.destroy();
  p2pMic = null;
  if (remoteAudio) {
    releaseOutputBoost(remoteAudio);
    remoteAudio.pause();
    remoteAudio.srcObject = null;
    remoteAudio.remove();
  }
  remoteAudio = null;
  pc?.close();
  pc = null;
}

function resetCall() {
  cleanupWebRTC();
  setState({ status: 'idle', callId: null, peer: null, micMuted: false, videoEnabled: false, sharingScreen: false, remoteScreen: false, remoteVideo: false, startedAt: null, reconnecting: false, serverLost: false, peerReconnecting: false });
}

function p2pMicPipeline(): Promise<MicPipeline | null> {
  return createMicPipeline({
    onSilentMic: () => setState({ notice: 'Микрофон не передаёт звук — проверь его в Настройках → Голос' }),
  });
}

// --- Смена микрофона во время активного звонка (P2P) ---
// Устройство ввода меняется через RTCRtpSender.replaceTrack (тот же kind/mid —
// пересогласование не нужно). Без этого выбор микрофона в настройках «не работал»,
// пока звонок активен.
let lastCaptureKey = '';

async function switchInputDeviceDuringCall() {
  if (!pc || lkMode) return;
  const next = await p2pMicPipeline();
  const track = next?.track;
  const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
  if (!next || !track || !sender) {
    next?.destroy();
    pushVoiceLog('switch input device failed');
    return;
  }
  track.enabled = !state.micMuted; // mute сохраняется
  try {
    await sender.replaceTrack(track);
  } catch (e: any) {
    pushVoiceLog(`replaceTrack failed: ${e?.message || e}`);
    next.destroy();
    return;
  }
  p2pMic?.destroy();
  p2pMic = next;
  localStream = next.stream;
  pushVoiceLog('input device switched');
}

// --- Видео ---

async function fetchCameraTrack(): Promise<MediaStreamTrack> {
  try {
    const preset = getPreset();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: preset.resolution.width },
        height: { ideal: preset.resolution.height },
        frameRate: { ideal: preset.frameRate },
      },
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('no video track');
    return track;
  } catch (e: any) {
    pushVoiceLog(`camera failed: ${e?.message || e}`);
    throw e;
  }
}

/**
 * Полное пересогласование: вызывающая сторона создаёт новый offer после
 * добавления/удаления видео-трека. Отвечающий получает offer и отвечает answer.
 * Если сигнал уже идёт (гонка camera+screen), запрос ставится в очередь
 * и выполняется сразу после того, как соединение вернётся в stable —
 * иначе второй трек «теряется» и демонстрация зависает.
 */
async function renegotiate() {
  if (renegotiating || makingOffer || !pc || pc.signalingState !== 'stable') {
    renegotiateQueued = true;
    return;
  }
  renegotiating = true;
  makingOffer = true;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendWS({ type: 'call.offer', call_id: state.callId, sdp: { type: offer.type, sdp: offer.sdp } });
  } catch (e: any) {
    pushVoiceLog(`renegotiate failed: ${e?.message || e}`);
  } finally {
    makingOffer = false;
    renegotiating = false;
    // подошёл отложенный запрос (например, включили экран, пока шло согласование камеры)
    if (renegotiateQueued && pc && pc.signalingState === 'stable') {
      renegotiateQueued = false;
      void renegotiate();
    }
  }
}

function clearIceReconnect() {
  if (iceReconnectTimer) { clearTimeout(iceReconnectTimer); iceReconnectTimer = null; }
}

/**
 * P2P: при обрыве/провале соединения не сбрасываем звонок сразу —
 * пробуем ICE restart (несколько раз), зрителю показываем «Переподключение…».
 */
function scheduleIceReconnect(callId: string) {
  if (iceReconnectTimer || !pc) return;
  iceReconnectTimer = setTimeout(() => {
    iceReconnectTimer = null;
    if (!pc || state.status !== 'active') return;
    if (pc.connectionState === 'connected') {
      iceReconnectAttempts = 0;
      if (state.reconnecting) setState({ reconnecting: false });
      return;
    }
    iceReconnectAttempts += 1;
    if (iceReconnectAttempts > 3) {
      pushVoiceLog('ice reconnect gave up');
      clearIceReconnect();
      sendWS({ type: 'call.end', call_id: callId });
      const peerName = state.peer?.username;
      resetCall();
      setState({ notice: peerName ? `Соединение с ${peerName} потеряно` : 'Соединение потеряно' });
      return;
    }
    pushVoiceLog(`ice restart attempt ${iceReconnectAttempts}`);
    setState({ reconnecting: true });
    try { pc.restartIce(); } catch { /* ignore */ }
    if (isCallCaller) void renegotiate();
    scheduleIceReconnect(callId);
  }, 3000);
}

/** Включить/выключить исходящее видео во время активного звонка. */
export async function toggleVideo() {
  if (state.status !== 'active') return;

  // LiveKit-режим: делегируем в SFU
  if (lkMode) {
    const next = !state.videoEnabled;
    const ok = await lk.setCameraEnabled(next);
    if (!ok && next) {
      setState({ notice: 'Нет доступа к камере' });
      return;
    }
    setState({ videoEnabled: next });
    return;
  }

  if (!pc) return;

  if (state.videoEnabled) {
    // Выключаем: убираем трек и сообщаем об этом
    if (localVideoTrack) {
      const sender = pc.getSenders().find((s) => s.track === localVideoTrack);
      if (sender) { try { pc.removeTrack(sender); } catch { /* ignore */ } }
      localVideoTrack.stop();
      localVideoTrack = null;
    }
    setState({ videoEnabled: false });
    await renegotiate();
    return;
  }

  // Включаем
  try {
    localVideoTrack = await fetchCameraTrack();
  } catch {
    setState({ notice: 'Нет доступа к камере' });
    return;
  }
  const stream = new MediaStream([localVideoTrack]);
  pc.addTrack(localVideoTrack, stream);
  setState({ videoEnabled: true });
  await renegotiate();
}

/** Начать демонстрацию экрана (источник уже выбран в пикере). */
export async function startScreenShare(): Promise<void> {
  if (state.status !== 'active') return;

  // LiveKit-режим: SFU сам захватывает экран (после выбора источника)
  if (lkMode) {
    if (state.sharingScreen) return;
    const ok = await lk.setScreenShareEnabled(true);
    if (ok) setState({ sharingScreen: true });
    else setState({ notice: 'Не удалось начать демонстрацию экрана' });
    return;
  }

  if (!pc || screenTrack) return;
  try {
    const preset = getPreset();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: preset.resolution.width },
        height: { ideal: preset.resolution.height },
        frameRate: { ideal: preset.frameRate },
      } as MediaTrackConstraints,
      audio: false,
    });
    screenTrack = stream.getVideoTracks()[0] ?? null;
    if (!screenTrack) throw new Error('no screen track');
  } catch (e: any) {
    // Пользователь отменил выбор — это не ошибка, просто выходим
    if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') {
      pushVoiceLog(`screen share failed: ${e?.message || e}`);
      setState({ notice: 'Не удалось начать демонстрацию экрана' });
    }
    return;
  }

  // Если пользователь остановил шаринг через системную кнопку браузера
  screenTrack.onended = () => { void stopScreenShare(); };

  pc.addTrack(screenTrack, new MediaStream([screenTrack]));
  setState({ sharingScreen: true });
  await renegotiate();
}

/** Остановить демонстрацию экрана. */
export async function stopScreenShare(): Promise<void> {
  if (lkMode) {
    if (!state.sharingScreen) return;
    await lk.setScreenShareEnabled(false);
    lkLocalScreen = null;
    setState({ sharingScreen: false });
    return;
  }
  if (!screenTrack) return;
  if (pc) {
    const sender = pc.getSenders().find((s) => s.track === screenTrack);
    if (sender) { try { pc.removeTrack(sender); } catch { /* ignore */ } }
  }
  screenTrack.stop();
  screenTrack = null;
  setState({ sharingScreen: false });
  await renegotiate();
}

export function toggleScreenShare(): Promise<void> {
  return state.sharingScreen ? stopScreenShare() : startScreenShare();
}

/** Локальный поток демонстрации экрана (для превью). */
export function getLocalScreenStream(): MediaStream | null {
  if (lkMode) return lkLocalScreen;
  if (!screenTrack) { localScreenStreamCache = null; return null; }
  if (!localScreenStreamCache || localScreenStreamCache.getVideoTracks()[0] !== screenTrack) {
    localScreenStreamCache = new MediaStream([screenTrack]);
  }
  return localScreenStreamCache;
}

/** Удалённый поток демонстрации экрана собеседника. */
export function getRemoteScreenStream(): MediaStream | null {
  if (lkMode) return lkRemoteScreen;
  return remoteScreenStream;
}

/**
 * Попытка подключиться к звонку через LiveKit (SFU).
 * Возвращает true, если удалось — тогда P2P-путь не используется.
 */
async function tryStartLiveKit(peerUserId: number): Promise<boolean> {
  const creds = await lk.fetchLiveKitToken({ userId: peerUserId });
  if (!creds) return false;

  lkMode = true;
  const ok = await lk.connectRoom(
    creds,
    { video: lkVideoWanted || pendingEnableVideo },
    {
      onLocalStream: (kind, stream) => {
        // Синхронизируем флаги с фактическим состоянием публикаций SFU:
        // иначе событие публикации сбрасывало флаги и меню звонка «зависало».
        if (kind === 'cam') {
          lkLocalCam = stream;
          setState({ videoEnabled: !!stream });
        } else {
          lkLocalScreen = stream;
          setState({ sharingScreen: !!stream });
        }
      },
      onRemoteStream: (kind, stream) => {
        if (kind === 'cam') lkRemoteCam = stream;
        else lkRemoteScreen = stream;
      },
      onRemoteCameraOn: (on) => setState({ remoteVideo: on }),
      onRemoteScreenOn: (on) => setState({ remoteScreen: on }),
      onConnectionState: (s) => {
        if (state.status === 'active') setState({ reconnecting: s === 'reconnecting' });
      },
      onDisconnected: () => {
        if (state.status === 'active') {
          if (state.callId) sendWS({ type: 'call.end', call_id: state.callId }, { queue: true });
          resetCall();
          setState({ notice: 'Соединение потеряно — звонок завершён' });
        }
      },
      onMicError: (message) => {
        if (state.status === 'active') setState({ notice: message });
      },
    },
    { userId: peerUserId },
  );

  if (!ok) {
    lkMode = false;
    return false;
  }

  setState({ status: 'active', startedAt: state.startedAt || Date.now() });
  watchLKSpeaking();
  pendingEnableVideo = false;
  return true;
}

/**
 * Следит за жизненным циклом удалённого видео-трека: когда собеседник выключает
 * камеру/демонстрацию, трек уходит в mute/ended — иначе оверлей показывает
 * «замороженный» кадр. Восстанавливаем состояние по unmute.
 */
function watchRemoteVideoTrack(track: MediaStreamTrack, kind: 'cam' | 'screen') {
  const apply = (on: boolean) => {
    if (kind === 'screen') {
      if (state.remoteScreen !== on) setState({ remoteScreen: on });
    } else if (state.remoteVideo !== on) {
      setState({ remoteVideo: on });
    }
  };
  track.addEventListener('ended', () => apply(false));
  track.addEventListener('unmute', () => apply(true));
  track.addEventListener('mute', () => {
    // просадки RTP тоже роняют mute — останавливаем поток только если он
    // не ожил через секунду
    window.setTimeout(() => {
      if (track.muted || track.readyState === 'ended') apply(false);
    }, 1200);
  });
}

async function createPeerConnection(callId: string) {
  pc = new RTCPeerConnection({ iceServers: await getIceServers() });

  p2pMic = await p2pMicPipeline();
  if (!p2pMic) throw new Error('microphone unavailable');
  localStream = p2pMic.stream;
  lastCaptureKey = p2pMic.captureKey;

  const sendStream = outStream || localStream;
  sendStream.getAudioTracks().forEach((t) => pc!.addTrack(t, sendStream));

  // Если пользователь принял видео-вызов — поднимаем камеру сразу после соединения
  if (pendingEnableVideo) {
    pendingEnableVideo = false;
    void toggleVideo();
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendWS({ type: 'call.ice', call_id: callId, candidate: e.candidate.toJSON() });
    }
  };

  pc.ontrack = (e) => {
    if (e.track.kind === 'video') {
      const track = e.track;
      // Камера и экран приходят отдельными треками — различаем их по ярлыку
      // (label транслируется от отправителя), а при неинформативном ярлыке —
      // по порядку поступления: если камера уже активна, новый трек — экран.
      const label = (track.label || '').toLowerCase();
      const looksScreen = /(screen|window|display|monitor|entire|screencast|экран|захват)/.test(label);
      const looksCam = /(camera|webcam|cam\b|камер)/.test(label);
      const camActive = !!state.remoteVideo
        && (remoteVideoStream?.getVideoTracks().some(t => t.readyState === 'live' && !t.muted) ?? false);

      let asScreen: boolean;
      if (looksScreen && !looksCam) asScreen = true;
      else if (looksCam && !looksScreen) asScreen = false;
      else asScreen = camActive;

      const stream = e.streams[0] ?? new MediaStream([track]);
      if (asScreen) {
        remoteScreenStream = stream;
        setState({ remoteScreen: true });
      } else {
        remoteVideoStream = stream;
        setState({ remoteVideo: true });
      }
      watchRemoteVideoTrack(track, asScreen ? 'screen' : 'cam');
      return;
    }
    remoteAudio = remoteAudio ?? new Audio();
    remoteAudio.autoplay = true;
    remoteAudio.srcObject = e.streams[0];
    // В DOM: Chromium использует подключённый <audio> как опору для AEC.
    if (!remoteAudio.isConnected) document.body.appendChild(remoteAudio);
    const prefs = getVoicePrefs();
    applyRemoteOutputVolume();
    const anyAudio = remoteAudio as any;
    if (prefs.output_device_id && typeof anyAudio.setSinkId === 'function') {
      anyAudio.setSinkId(prefs.output_device_id).catch((err: any) => pushVoiceLog(`setSinkId failed: ${err?.message || err}`));
    }
    if (prefs.output_device_id) void setOutputBoostSink(prefs.output_device_id);
    remoteAudio.play().catch(() => {});
  };

  pc.onconnectionstatechange = () => {
    if (!pc || !state.callId) return;
    const s = pc.connectionState;
    if (s === 'connected') {
      clearIceReconnect();
      iceReconnectAttempts = 0;
      if (state.reconnecting) setState({ reconnecting: false });
      return;
    }
    if (state.status !== 'active') return;
    if (s === 'disconnected') {
      setState({ reconnecting: true });
      scheduleIceReconnect(state.callId);
      return;
    }
    if (s === 'failed') {
      // Пробуем ICE restart; только после исчерпания попыток завершаем звонок
      setState({ reconnecting: true });
      if (iceReconnectAttempts < 3) {
        pushVoiceLog('connection failed — ice restart');
        iceReconnectAttempts += 1;
        try { pc.restartIce(); } catch { /* ignore */ }
        if (isCallCaller) void renegotiate();
        scheduleIceReconnect(state.callId);
      } else {
        clearIceReconnect();
        pushVoiceLog('connection failed');
        sendWS({ type: 'call.end', call_id: state.callId });
        const peerName = state.peer?.username;
        resetCall();
        setState({ notice: peerName ? `Соединение с ${peerName} потеряно` : 'Соединение потеряно' });
      }
    }
  };

  startVoiceController();
  startSpeakingWatch();
  offPrefs = subscribeVoicePrefs((p) => {
    if (remoteAudio) {
      applyRemoteOutputVolume();
      const anyAudio = remoteAudio as any;
      if (p.output_device_id && typeof anyAudio.setSinkId === 'function') {
        anyAudio.setSinkId(p.output_device_id).catch(() => {});
      }
      if (p.output_device_id) void setOutputBoostSink(p.output_device_id);
    }
    // Смена микрофона во время звонка (P2P): перезахват + replaceTrack
    if (!lkMode && captureKeyOf(p) !== lastCaptureKey) {
      lastCaptureKey = captureKeyOf(p);
      // Перезахват трека с новыми constraints — иначе эхо/шум/АРУ не применяются.
      void switchInputDeviceDuringCall();
    }
  });
}

async function addIceCandidateSafe(candidate: RTCIceCandidateInit) {
  if (!pc) { pendingIce.push(candidate); return; }
  if (pc.remoteDescription) {
    try { await pc.addIceCandidate(candidate); } catch { /* ignore */ }
  } else {
    pendingIce.push(candidate);
  }
}

async function flushPendingIce() {
  for (const c of pendingIce) {
    try { await pc?.addIceCandidate(c); } catch { /* ignore */ }
  }
  pendingIce = [];
}

// --- Исходящий звонок ---

export function startCall(peer: CallPeer, withVideo = false) {
  leaveVoiceForCall(); // как в Discord: звонок отключает голосовой канал
  if (state.status !== 'idle' || !peer.id) return;
  connectChat(); // на случай, если WS ещё не поднят
  if (withVideo) pendingEnableVideo = true;
  isCallCaller = true;
  const sent = sendWS({ type: 'call.invite', target_user_id: peer.id, video: withVideo }, { queue: true });
  setState({ status: 'outgoing', peer, notice: null, videoEnabled: false, sharingScreen: false, remoteScreen: false, remoteVideo: false, reconnecting: false, serverLost: !sent, peerReconnecting: false });
  // автоотмена, если не ответили за 45 секунд
  ringTimeout = setTimeout(() => {
    if (state.status !== 'outgoing') return;
    const reached = !!state.callId;
    if (reached) sendWS({ type: 'call.decline', call_id: state.callId });
    resetCall();
    // сервер так и не подтвердил вызов — честно говорим, что звонок не ушёл
    if (!reached) setState({ notice: 'Не удалось позвонить: нет связи с сервером' });
  }, 45000);
}

// --- Входящий звонок ---

export function acceptCall() {
  leaveVoiceForCall(); // как в Discord: звонок отключает голосовой канал
  if (state.status !== 'incoming' || !state.callId) return;
  sendWS({ type: 'call.accept', call_id: state.callId }, { queue: true });
  isCallCaller = false;
  setState({ status: 'active', startedAt: Date.now() });
  // Принимающий тоже поднимает SFU: иначе LiveKit-комнату создаёт только
  // инициатор (в call.accepted), а P2P-offer от него уже не придёт — в 1:1
  // собеседники оказываются каждый сам по себе и звук не идёт ни в одну сторону.
  if (state.peer) {
    void tryStartLiveKit(state.peer.id);
  }
}

export function declineCall() {
  if (!state.callId) { resetCall(); return; }
  sendWS({ type: 'call.decline', call_id: state.callId }, { queue: true });
  resetCall();
}

export function endCall() {
  if (!state.callId) { resetCall(); return; }
  sendWS({ type: 'call.end', call_id: state.callId }, { queue: true });
  resetCall();
}

export function toggleMute() {
  const muted = !state.micMuted;
  setState({ micMuted: muted });
  const prefs = getVoicePrefs();
  if (prefs.mic_toggle_sound) playMicSound(!muted);

  if (lkMode) {
    void lk.setMicEnabled(!muted);
    return;
  }

  if (!localStream) return;
  localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
}

export function clearCallNotice() {
  setState({ notice: null });
}

// Собеседник принял наш вызов (call.accepted или call.synced после переподключения)
async function onCallAccepted(callId: string) {
  setState({ status: 'active', startedAt: Date.now() });
  // Сначала пробуем LiveKit (SFU); если недоступен — старый P2P
  if (state.peer && await tryStartLiveKit(state.peer.id)) {
    return;
  }
  try {
    await createPeerConnection(callId);
    const offer = await pc!.createOffer();
    await pc!.setLocalDescription(offer);
    sendWS({ type: 'call.offer', call_id: callId, sdp: { type: offer.type, sdp: offer.sdp } });
  } catch (e) {
    console.error('[call] offer failed', e);
    sendWS({ type: 'call.end', call_id: callId });
    setState({ notice: 'Не удалось установить соединение (проверьте микрофон)' });
    resetCall();
  }
}

// --- Обработка событий сигналинга ---

let initialized = false;

export function initCallManager() {
  if (initialized) return () => {};
  initialized = true;

  // Живое применение усиления микрофона в LiveKit-режиме при смене настроек
  const offVoice = subscribeVoicePrefs(() => {
    if (lkMode) lk.reapplyAudioPrefs();
  });

  const off = onChatEvent(async (data) => {
    switch (data.type) {
      case 'call.outgoing': {
        // подтверждение от сервера: звонок «звонит» у обеих сторон
        setState({ status: 'outgoing', callId: data.call_id, peer: data.peer, notice: null, reconnecting: false, serverLost: false });
        break;
      }

      case 'call.ring': {
        // показываем главное окно, чтобы входящий вызов был виден (мог быть скрыт)
        (window as any).electron?.showMainWindow?.();
        if (state.callId === data.call_id) return; // повтор того же вызова
        if (state.status !== 'idle') {
          // Сервер пропускает вызов, только если у нас нет другого звонка, поэтому
          // «занятое» состояние здесь — почти всегда хвост оборвавшегося звонка, о конце
          // которого мы не узнали. Раньше из-за него вызов сразу отклонялся, и звонящий
          // видел «отклонил вызов», хотя у нас даже не зазвонило.
          if (state.status === 'outgoing' && !state.callId) {
            // встречные вызовы: наш ещё в пути — честно отвечаем «занят»
            sendWS({ type: 'call.decline', call_id: data.call_id, reason: 'busy' });
            return;
          }
          pushVoiceLog(`stale call state ${state.status} — reset for incoming ring`);
          resetCall();
        }
        // Если вызывающий звонит с видео — отвечающий тоже поднимет камеру
        if (data.video) pendingEnableVideo = true;
        setState({ status: 'incoming', callId: data.call_id, peer: data.caller, notice: null, videoEnabled: false, sharingScreen: false, remoteScreen: false, remoteVideo: false, reconnecting: false });
        // автоотмена входящего, если абонент сбросил (придёт call.ended)
        ringTimeout = setTimeout(() => {
          if (state.status === 'incoming') {
            resetCall();
          }
        }, 60000);
        break;
      }

      case 'call.accepted': {
        // мы инициатор: создаём offer
        if (state.status !== 'outgoing' || state.callId !== data.call_id) return;
        await onCallAccepted(data.call_id);
        break;
      }

      case '__close': {
        if (state.status !== 'idle') setState({ serverLost: true });
        break;
      }

      case '__open': {
        // вернулась связь: сверяем звонок с сервером (жив ли, не приняли ли без нас)
        if (state.status !== 'idle' && state.callId) sendWS({ type: 'call.sync', call_id: state.callId });
        if (state.serverLost) setState({ serverLost: false });
        break;
      }

      case 'call.synced': {
        if (state.callId !== data.call_id) return;
        setState({ serverLost: false, peerReconnecting: !data.peer_online });
        // собеседник принял вызов, пока у нас не было связи — call.accepted потерялся
        if (data.accepted && state.status === 'outgoing') await onCallAccepted(data.call_id);
        break;
      }

      case 'call.peer_reconnecting': {
        if (state.callId === data.call_id) setState({ peerReconnecting: true });
        break;
      }

      case 'call.peer_back': {
        if (state.callId === data.call_id) setState({ peerReconnecting: false });
        break;
      }

      case 'call.taken': {
        // вызов принят или отклонён на другом устройстве — здесь перестаём звонить
        if (state.status === 'incoming' && state.callId === data.call_id) resetCall();
        break;
      }

      case 'call.offer': {
        // мы отвечающий: ставим remote, отвечаем answer
        if (state.callId !== data.call_id || state.status !== 'active') return;
        // Если мы уже в LiveKit — входящий P2P-offer игнорируем
        if (lkMode) return;
        // Пробуем LiveKit: если обе стороны настроены, P2P-offer не придёт вовсе
        if (state.peer && await tryStartLiveKit(state.peer.id)) {
          break;
        }
        try {
          // Первый offer в звонке — создаём соединение; последующие — это renegotiation
          // (например, собеседник включил/выключил видео), pc уже существует.
          if (!pc) {
            await createPeerConnection(data.call_id);
          }
          // Коллизия: у нас уже свой неотвеченный offer (обе стороны пересогласовались
          // одновременно) — откатываем свой и принимаем чужой, свой запрос вернём в очередь.
          if (pc!.signalingState !== 'stable') {
            renegotiateQueued = true;
            try { await pc!.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit); } catch { /* ignore */ }
          }
          await pc!.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushPendingIce();
          const answer = await pc!.createAnswer();
          await pc!.setLocalDescription(answer);
          sendWS({ type: 'call.answer', call_id: data.call_id, sdp: { type: answer.type, sdp: answer.sdp } });
          // отложенный при коллизии пересогласование (свой offer откатили) — выполняем теперь
          if (renegotiateQueued && pc!.signalingState === 'stable') {
            renegotiateQueued = false;
            void renegotiate();
          }
        } catch (e) {
          console.error('[call] answer failed', e);
          sendWS({ type: 'call.end', call_id: data.call_id });
          setState({ notice: 'Не удалось установить соединение (проверьте микрофон)' });
          resetCall();
        }
        break;
      }

      case 'call.answer': {
        if (state.callId !== data.call_id || !pc || pc.signalingState === 'stable') return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          await flushPendingIce();
          // answer применён → сигнал стабилен: выполняем отложенное пересогласование
          // (если вдруг нет — renegotiate сам перепоставит его в очередь)
          if (renegotiateQueued) {
            renegotiateQueued = false;
            void renegotiate();
          }
        } catch (e) {
          console.error('[call] remote answer failed', e);
        }
        break;
      }

      case 'call.ice': {
        if (state.callId !== data.call_id || !data.candidate) return;
        await addIceCandidateSafe(data.candidate);
        break;
      }

      case 'call.declined': {
        if (state.callId !== data.call_id) return;
        setState({ notice: `${state.peer?.display_name || state.peer?.username || 'Пользователь'} отклонил вызов` });
        resetCall();
        break;
      }

      case 'call.forbidden': {
        if (state.status !== 'idle' && state.status !== 'outgoing') return;
        setState({ notice: data.reason || 'Пользователь принимает звонки только от друзей' });
        resetCall();
        break;
      }

      case 'call.ended': {
        if (state.callId !== data.call_id) return;
        const wasActive = state.status === 'active';
        resetCall();
        if (data.reason === 'gone') {
          setState({ notice: 'Звонок завершился, пока не было связи с сервером' });
        } else if (data.reason === 'disconnect' && wasActive) {
          setState({ notice: 'Собеседник потерял соединение — звонок завершён' });
        }
        break;
      }

      case 'call.busy': {
        if (state.status === 'outgoing' && (state.peer?.id === data.target_user_id || (data.call_id && state.callId === data.call_id))) {
          setState({ notice: `${state.peer?.display_name || state.peer?.username || 'Пользователь'} сейчас занят` });
          resetCall();
        }
        break;
      }

      case 'call.missed': {
        if (state.status === 'idle') return;
        if (state.callId && data.call_id && state.callId !== data.call_id) return;
        setState({ notice: `${state.peer?.display_name || state.peer?.username || 'Пользователь'} не в сети — звонок сохранён в чате` });
        resetCall();
        break;
      }

      case 'call.offline': {
        if (state.status === 'outgoing' && state.peer?.id === data.target_user_id) {
          setState({ notice: `${state.peer?.display_name || state.peer?.username || 'Пользователь'} не в сети` });
          resetCall();
        }
        break;
      }
    }
  });

  return () => {
    off();
    offVoice();
    initialized = false;
    resetCall();
  };
}

// Форс-очистка при закрытии окна (главного) — без отправки сигналов, сервер сам увидит дисконнект
export function destroyCallManager() {
  // окно закрывают посреди звонка — сообщаем сразу, а не через 30 с ожидания переподключения
  if (state.callId) sendWS({ type: state.status === 'incoming' ? 'call.decline' : 'call.end', call_id: state.callId });
  cleanupWebRTC();
  disconnectChat();
}
