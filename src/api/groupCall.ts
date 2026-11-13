import { onChatEvent, sendWS, connectChat } from './chat';
import { leaveVoiceForCall } from './voiceBridge';
import { getVoicePrefs, buildAudioConstraints, subscribeVoicePrefs, applyOutputVolumeToElement, releaseOutputBoost } from './voicePrefs';
import * as lk from './livekitRoom';
import { getPreset } from './mediaQuality';
import { getIceServers } from './ice';
import { cachedStream } from '../utils/streamCache';
import { VoiceGate, readAudioLevels, resetSpeakingCache, AUDIO_LEVEL_GATE } from './speaking';

export interface GroupCallParticipant {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
}

export type GroupCallStatus = 'idle' | 'incoming' | 'active';

export interface GroupCallState {
  status: GroupCallStatus;
  callId: string | null;
  groupId: number | null;
  groupName: string | null;
  caller: GroupCallParticipant | null;
  participants: GroupCallParticipant[];
  micMuted: boolean;
  /** Наша камера включена. */
  videoEnabled: boolean;
  /** Участники, которые шлют видео (камеру). */
  videoUsers: number[];
  /** Мы демонстрируем экран. */
  sharingScreen: boolean;
  /** Участники, которые демонстрируют экран. */
  screenUsers: number[];
  /** Звонок идёт через LiveKit (SFU) — доступен шаринг экрана. */
  livekit: boolean;
  startedAt: number | null;
  notice: string | null;
  /** Участники (id), которые говорят прямо сейчас. */
  speakingIds: number[];
  /** Мы говорим прямо сейчас. */
  localSpeaking: boolean;
  /** Идёт автопереподключение после обрыва соединения. */
  reconnecting: boolean;
  /** У кого-то из участников есть звук демонстрации экрана. */
}

let state: GroupCallState = {
  status: 'idle', callId: null, groupId: null, groupName: null,
  caller: null, participants: [], micMuted: false, videoEnabled: false, videoUsers: [],
  sharingScreen: false, screenUsers: [], livekit: false, startedAt: null, notice: null,
  speakingIds: [], localSpeaking: false, reconnecting: false,
};
const listeners = new Set<(s: GroupCallState) => void>();
function setState(patch: Partial<GroupCallState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}
export function getGroupCallState() { return state; }
export function subscribeGroupCall(l: (s: GroupCallState) => void): () => void {
  listeners.add(l); l(state); return () => listeners.delete(l);
}

let localStream: MediaStream | null = null;
let localVideoTrack: MediaStreamTrack | null = null;
const peers = new Map<number, RTCPeerConnection>();
const pendingIce = new Map<number, RTCIceCandidateInit[]>();
const remoteAudio = new Map<number, HTMLAudioElement>();
const remoteVideoStreams = new Map<number, MediaStream>();
let voiceLoop: ReturnType<typeof setInterval> | null = null;
// mesh: кто создал соединение — только инициатор поднимает ICE restart
const peerInitiator = new Map<number, boolean>();
// mesh: наблюдение/рестарты для оборвавшихся peer-соединений
const meshReconnectTimers = new Map<number, ReturnType<typeof setTimeout>>();
const meshReconnectAttempts = new Map<number, number>();

// LiveKit-режим группового звонка (SFU) — используется, если сервер настроен.
let lkMode = false;
let lkOffParticipants: (() => void) | null = null;
let lkLocalVideoStream: MediaStream | null = null;
let lkLocalScreenStream: MediaStream | null = null;

async function getUserMediaSafe(): Promise<MediaStream> {
  const c = buildAudioConstraints();
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: c });
  } catch (e: any) {
    if ((c as any).deviceId) {
      const rest: any = { ...c };
      delete rest.deviceId;
      return await navigator.mediaDevices.getUserMedia({ audio: rest });
    }
    throw e;
  }
}

async function ensureLocalStream() {
  if (!localStream) localStream = await getUserMediaSafe();
  if (!voiceLoop) {
    voiceLoop = setInterval(() => {
      if (!localStream) return;
      const enabled = !state.micMuted;
      localStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    }, 400);
  }
}

function cleanup() {
  if (voiceLoop) { clearInterval(voiceLoop); voiceLoop = null; }
  stopSpeakingWatch();
  offLKSpeaking?.(); offLKSpeaking = null;
  meshReconnectTimers.forEach((t) => clearTimeout(t));
  meshReconnectTimers.clear();
  meshReconnectAttempts.clear();
  peerInitiator.clear();
  peers.forEach((pc) => { try { pc.close(); } catch { /* ignore */ } });
  peers.clear();
  pendingIce.clear();
  remoteAudio.forEach((a) => {
    releaseOutputBoost(a);
    a.pause();
    a.srcObject = null;
    a.remove();
  });
  remoteAudio.clear();
  remoteVideoStreams.clear();
  if (lkMode) {
    lkOffParticipants?.(); lkOffParticipants = null;
    void lk.disconnectRoom();
    lkMode = false;
    lkLocalVideoStream = null;
    lkLocalScreenStream = null;
  }
  localVideoTrack?.stop();
  localVideoTrack = null;
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
}

/** Применяет «громкость вывода» (0..2) ко всем элементам участников. */
function applyGroupOutputVolume() {
  const v = getVoicePrefs().output_volume;
  remoteAudio.forEach((el) => {
    const track = (el.srcObject as MediaStream | null)?.getAudioTracks()[0] ?? null;
    applyOutputVolumeToElement(el, track, v);
  });
}

function resetGroupCall() {
  cleanup();
  setState({ status: 'idle', callId: null, groupId: null, groupName: null, caller: null, participants: [], micMuted: false, videoEnabled: false, videoUsers: [], sharingScreen: false, screenUsers: [], livekit: false, startedAt: null, speakingIds: [], localSpeaking: false, reconnecting: false });
}

// --- Голосовая активность: подсветка говорящих (см. api/speaking.ts) ---

let speakLoop: ReturnType<typeof setInterval> | null = null;
let speakBusy = false;
const remoteGates = new Map<number, VoiceGate>();
const localGate = new VoiceGate(...AUDIO_LEVEL_GATE);
let offLKSpeaking: (() => void) | null = null;

function micIsOff(): boolean {
  const tracks = localStream?.getAudioTracks() ?? [];
  return state.micMuted || !tracks.some((t) => t.enabled);
}

function applySpeaking(speakingIds: number[], localSpeaking: boolean) {
  const same =
    speakingIds.length === state.speakingIds.length &&
    speakingIds.every((id) => state.speakingIds.includes(id));
  if (!same || localSpeaking !== state.localSpeaking) {
    setState({ speakingIds, localSpeaking });
  }
}

/** mesh: опрашивает getStats() всех peer-соединений и публикует говорящих. */
function startSpeakingWatch() {
  stopSpeakingWatch();
  speakLoop = setInterval(async () => {
    if (speakBusy || state.status !== 'active' || lkMode) return;
    speakBusy = true;
    try {
      const speakingIds: number[] = [];
      for (const [userId, p] of peers) {
        try {
          const { remote } = await readAudioLevels(p);
          let gate = remoteGates.get(userId);
          if (!gate) {
            gate = new VoiceGate(...AUDIO_LEVEL_GATE);
            remoteGates.set(userId, gate);
          }
          if (gate.update(remote ?? 0)) speakingIds.push(userId);
        } catch { /* ignore */ }
      }
      const firstPc = peers.values().next().value as RTCPeerConnection | undefined;
      let localLevel: number | null = null;
      if (firstPc) localLevel = (await readAudioLevels(firstPc)).local;
      applySpeaking(speakingIds, !micIsOff() && localGate.update(localLevel ?? 0));
    } catch { /* ignore */ } finally {
      speakBusy = false;
    }
  }, 300);
}

function stopSpeakingWatch() {
  if (speakLoop) { clearInterval(speakLoop); speakLoop = null; }
  speakBusy = false;
  remoteGates.clear();
  localGate.reset();
  resetSpeakingCache();
  if (state.speakingIds.length || state.localSpeaking) setState({ speakingIds: [], localSpeaking: false });
}

/** LiveKit: подписка на ActiveSpeakersChanged (identity = String(userId)). */
function watchLKSpeaking(myIdNum: number) {
  offLKSpeaking?.();
  offLKSpeaking = lk.onSpeakingChanged(({ identities }) => {
    const ids: number[] = [];
    for (const i of identities) {
      const n = Number(i);
      if (!Number.isNaN(n)) ids.push(n);
    }
    applySpeaking(ids, ids.includes(myIdNum) && !state.micMuted);
  });
}

function addParticipant(p: GroupCallParticipant) {
  if (!p?.id) return;
  const exists = state.participants.some((x) => x.id === p.id);
  if (exists) return;
  setState({ participants: [...state.participants, p] });
}

function removeParticipant(userId: number) {
  setState({ participants: state.participants.filter((x) => x.id !== userId) });
}

function clearMeshReconnect(userId: number) {
  const t = meshReconnectTimers.get(userId);
  if (t) { clearTimeout(t); meshReconnectTimers.delete(userId); }
  meshReconnectAttempts.delete(userId);
}

/** mesh: при обрыве не удаляем участника сразу — пробуем ICE restart (до 3 раз). */
function scheduleMeshReconnect(userId: number) {
  if (meshReconnectTimers.has(userId)) return;
  const t = setTimeout(() => {
    meshReconnectTimers.delete(userId);
    const pc = peers.get(userId);
    if (!pc || state.status !== 'active') return;
    if (pc.connectionState === 'connected') {
      meshReconnectAttempts.delete(userId);
      if (!peers.size || ![...peers.values()].some((p) => p.connectionState !== 'connected')) {
        if (state.reconnecting) setState({ reconnecting: false });
      }
      return;
    }
    const attempts = (meshReconnectAttempts.get(userId) ?? 0) + 1;
    meshReconnectAttempts.set(userId, attempts);
    if (attempts > 3) {
      meshReconnectAttempts.delete(userId);
      try { pc.close(); } catch { /* ignore */ }
      peers.delete(userId);
      removeParticipant(userId);
      return;
    }
    setState({ reconnecting: true });
    try { pc.restartIce(); } catch { /* ignore */ }
    if (peerInitiator.get(userId)) {
      void renegotiateAll(1);
    }
    scheduleMeshReconnect(userId);
  }, 3000);
  meshReconnectTimers.set(userId, t);
}

async function createPeer(userId: number, initiator: boolean): Promise<RTCPeerConnection> {
  const existing = peers.get(userId);
  if (existing) return existing;
  await ensureLocalStream();

  const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
  peers.set(userId, pc);
  peerInitiator.set(userId, initiator);
  pendingIce.set(userId, []);

  localStream!.getTracks().forEach((t) => pc.addTrack(t, localStream!));
  if (localVideoTrack) pc.addTrack(localVideoTrack, new MediaStream([localVideoTrack]));

  pc.onicecandidate = (e) => {
    if (e.candidate) sendWS({ type: 'group.call.ice', call_id: state.callId, target_user_id: userId, candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    if (e.track.kind === 'video') {
      remoteVideoStreams.set(userId, e.streams[0] ?? new MediaStream([e.track]));
      if (!state.videoUsers.includes(userId)) setState({ videoUsers: [...state.videoUsers, userId] });
      return;
    }
    let audio = remoteAudio.get(userId);
    if (!audio) { audio = new Audio(); audio.autoplay = true; remoteAudio.set(userId, audio); }
    audio.srcObject = e.streams[0];
    if (!audio.isConnected) document.body.appendChild(audio);
    applyOutputVolumeToElement(audio, e.track, getVoicePrefs().output_volume);
    audio.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (state.status !== 'active') return;
    const s = pc.connectionState;
    if (s === 'connected') {
      clearMeshReconnect(userId);
      const anyBroken = [...peers.values()].some((p) => p.connectionState !== 'connected');
      if (!anyBroken && state.reconnecting) setState({ reconnecting: false });
      return;
    }
    if (s === 'disconnected') {
      setState({ reconnecting: true });
      scheduleMeshReconnect(userId);
      return;
    }
    if (s === 'failed') {
      const attempts = meshReconnectAttempts.get(userId) ?? 0;
      if (attempts < 3) {
        setState({ reconnecting: true });
        try { pc.restartIce(); } catch { /* ignore */ }
        if (peerInitiator.get(userId)) void renegotiateAll(1);
        scheduleMeshReconnect(userId);
      } else {
        clearMeshReconnect(userId);
        try { pc.close(); } catch { /* ignore */ }
        peers.delete(userId);
        removeParticipant(userId);
      }
    }
  };

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendWS({ type: 'group.call.offer', call_id: state.callId, target_user_id: userId, sdp: { type: offer.type, sdp: offer.sdp } });
  }
  return pc;
}

/** Полное пересогласование со всеми участниками после добавления/удаления видео-трека. */
async function renegotiateAll(retries = 10) {
  let skipped = false;
  for (const [userId, pc] of peers) {
    // У этого участника сигнал ещё идёт — не отбрасываем, а повторим через мгновение,
    // иначе только что добавленный трек (камера/экран) до него не доедет.
    if (pc.signalingState !== 'stable') { skipped = true; continue; }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWS({ type: 'group.call.offer', call_id: state.callId, target_user_id: userId, sdp: { type: offer.type, sdp: offer.sdp } });
    } catch (e) { console.error('[groupcall] renegotiate failed', e); }
  }
  if (skipped && retries > 0 && peers.size > 0) {
    setTimeout(() => { void renegotiateAll(retries - 1); }, 400);
  }
}

/** Досоздаёт соединения с уже присутствующими участниками (защита от гонки join). */
async function ensureConnections() {
  for (const p of state.participants) {
    if (p.id === myId() || peers.has(p.id)) continue;
    try { await createPeer(p.id, true); } catch (e) { console.error('[groupcall] connect failed', e); }
  }
}

function handleRemoteOffer(callId: string, from: GroupCallParticipant, sdp: RTCSessionDescriptionInit) {
  createPeer(from.id, false).then(async (pc) => {
    // Если с этим участником уже установлено соединение (glare при renegotiation) —
    // откатываемся к его offer, чтобы не застрять в have-local-offer.
    if (pc.signalingState === 'have-local-offer') {
      try { await pc.setLocalDescription({ type: 'rollback' } as RTCLocalSessionDescriptionInit); } catch { /* ignore */ }
    }
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushIce(from.id);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendWS({ type: 'group.call.answer', call_id: callId, target_user_id: from.id, sdp: { type: answer.type, sdp: answer.sdp } });
  }).catch((e) => console.error('[groupcall] answer failed', e));
}

async function addIce(userId: number, candidate: RTCIceCandidateInit) {
  const pc = peers.get(userId);
  if (!pc) {
    const list = pendingIce.get(userId);
    if (list) list.push(candidate); else pendingIce.set(userId, [candidate]);
    return;
  }
  if (pc.remoteDescription) { try { await pc.addIceCandidate(candidate); } catch { /* ignore */ } }
  else pendingIce.get(userId)!.push(candidate);
}

async function flushIce(userId: number) {
  const list = pendingIce.get(userId) || [];
  for (const c of list) { try { await peers.get(userId)?.addIceCandidate(c); } catch { /* ignore */ } }
  pendingIce.set(userId, []);
}

// --- LiveKit (SFU) ---

/** Синхронизирует список участников из LiveKit-комнаты. */
function syncLiveKitParticipants(me: GroupCallParticipant) {
  const parts = lk.listParticipants();
  const updated: GroupCallParticipant[] = [me];
  for (const p of parts) {
    if (p.userId == null) continue;
    updated.push({ id: p.userId, username: p.username });
  }
  setState({
    participants: updated,
    videoUsers: updated
      .filter((p) => p.id !== me.id && lk.getParticipantCameraStream(String(p.id)))
      .map((p) => p.id),
    screenUsers: lk.listScreenSharers(),
  });
}

/**
 * Пробует поднять групповой звонок через LiveKit.
 * Возвращает true, если удалось.
 */
async function tryStartLiveKitGroup(groupId: number, groupName: string, me: GroupCallParticipant): Promise<boolean> {
  const creds = await lk.fetchLiveKitToken({ groupId });
  // Пока ждали, звонок мог закончиться — тогда и запасной mesh поднимать незачем
  if (!creds) return state.status !== 'active';
  if (state.status !== 'active') return true;

  lkMode = true;
  const ok = await lk.connectRoom(
    creds,
    { video: false },
    {
      onLocalStream: (kind, stream) => {
        if (kind === 'cam') lkLocalVideoStream = stream;
        else lkLocalScreenStream = stream;
      },
      onRemoteStream: () => {
        // пересобираем списки «кто вещает видео/экран»
        syncLiveKitParticipants(me);
      },
      onRemoteCameraOn: () => syncLiveKitParticipants(me),
      onRemoteScreenOn: () => syncLiveKitParticipants(me),
      onConnectionState: (s) => {
        if (state.status === 'active') setState({ reconnecting: s === 'reconnecting' });
      },
      onDisconnected: () => {
        if (state.status === 'active') {
          resetGroupCall();
          setState({ notice: 'Соединение потеряно — звонок завершён' });
        }
      },
      onMicError: (message) => {
        if (state.status === 'active') setState({ notice: message });
      },
    },
    { groupId },
  );

  if (!ok) {
    lkMode = false;
    return state.status !== 'active';
  }
  if (state.status !== 'active') {
    lkMode = false;
    void lk.disconnectRoom();
    return true;
  }

  // Подписка на изменения состава участников
  syncLiveKitParticipants(me);
  lkOffParticipants = lk.onParticipantsChanged(() => syncLiveKitParticipants(me));
  watchLKSpeaking(me.id);

  setState({ status: 'active', groupId, groupName, livekit: true, startedAt: state.startedAt || Date.now() });
  return true;
}

// --- Публичное API ---

export function startGroupCall(groupId: number, groupName: string, me: GroupCallParticipant) {
  leaveVoiceForCall(); // как в Discord: звонок отключает голосовой канал
  if (state.status !== 'idle' || !groupId) return;
  connectChat();
  sendWS({ type: 'group.call.start', group_id: groupId });
  setState({ status: 'active', groupId, groupName, participants: [me], startedAt: Date.now(), notice: null, reconnecting: false });
  startSpeakingWatch();
  // Сначала пробуем SFU; если недоступен — старый mesh
  void tryStartLiveKitGroup(groupId, groupName, me).then((ok) => {
    if (!ok) ensureLocalStream().catch(() => {});
  });
}

/** Подключиться к уже идущему звонку группы (плашка в чате), даже если нам не звонили. */
export function joinGroupCall(callId: string, groupId: number, groupName: string, me: GroupCallParticipant) {
  if (!callId || !groupId) return;
  if (state.status === 'active') {
    if (state.callId !== callId) setState({ notice: 'Сначала выйдите из текущего звонка' });
    return;
  }
  if (state.status === 'incoming' && state.callId !== callId) declineGroupCall();
  leaveVoiceForCall(); // как в Discord: звонок отключает голосовой канал
  connectChat();
  setState({ status: 'active', callId, groupId, groupName, caller: null, participants: [me], startedAt: Date.now(), notice: null, reconnecting: false });
  sendWS({ type: 'group.call.accept', call_id: callId }, { queue: true });
  startSpeakingWatch();
  void tryStartLiveKitGroup(groupId, groupName, me).then((ok) => {
    if (!ok) ensureLocalStream().catch(() => {});
  });
}

export function acceptGroupCall(me: GroupCallParticipant) {
  leaveVoiceForCall(); // как в Discord: звонок отключает голосовой канал
  if (state.status !== 'incoming' || !state.callId) return;
  sendWS({ type: 'group.call.accept', call_id: state.callId });
  setState({ status: 'active', participants: [me], startedAt: Date.now(), reconnecting: false });
  startSpeakingWatch();

  const gid = state.groupId;
  if (gid) {
    void tryStartLiveKitGroup(gid, state.groupName || 'Группа', me).then((ok) => {
      if (!ok) ensureLocalStream().catch(() => {});
    });
  } else {
    ensureLocalStream().catch(() => {});
  }
}

export function declineGroupCall() {
  if (!state.callId) { resetGroupCall(); return; }
  sendWS({ type: 'group.call.leave', call_id: state.callId });
  resetGroupCall();
}

export function leaveGroupCall() {
  if (!state.callId) { resetGroupCall(); return; }
  sendWS({ type: 'group.call.leave', call_id: state.callId });
  resetGroupCall();
}

export function endGroupCall() {
  if (!state.callId) { resetGroupCall(); return; }
  sendWS({ type: 'group.call.end', call_id: state.callId });
  resetGroupCall();
}

export function toggleGroupMute() {
  const muted = !state.micMuted;
  setState({ micMuted: muted });
  if (lkMode) {
    void lk.setMicEnabled(!muted);
    return;
  }
  localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
}

/** Включить/выключить исходящее видео во всех peer-соединениях группового звонка. */
export async function toggleGroupVideo() {
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

  if (state.videoEnabled) {
    // Выключаем: убираем трек из всех соединений
    if (localVideoTrack) {
      for (const pc of peers.values()) {
        const sender = pc.getSenders().find((s) => s.track === localVideoTrack);
        if (sender) { try { pc.removeTrack(sender); } catch { /* ignore */ } }
      }
      localVideoTrack.stop();
      localVideoTrack = null;
    }
    setState({ videoEnabled: false });
    await renegotiateAll();
    return;
  }

  // Включаем
  try {
    const preset = getPreset();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: preset.resolution.width },
        height: { ideal: preset.resolution.height },
        frameRate: { ideal: preset.frameRate },
      },
    });
    localVideoTrack = stream.getVideoTracks()[0] ?? null;
    if (!localVideoTrack) throw new Error('no camera');
  } catch {
    setState({ notice: 'Нет доступа к камере' });
    return;
  }
  const ms = new MediaStream([localVideoTrack]);
  for (const pc of peers.values()) pc.addTrack(localVideoTrack, ms);
  setState({ videoEnabled: true });
  await renegotiateAll();
}

/** Включить/выключить демонстрацию экрана в групповом звонке (только LiveKit). */
export async function toggleGroupScreenShare(): Promise<void> {
  if (state.status !== 'active' || !lkMode) return;
  const next = !state.sharingScreen;
  const ok = await lk.setScreenShareEnabled(next);
  if (!ok && next) {
    setState({ notice: 'Не удалось начать демонстрацию экрана' });
    return;
  }
  if (!next) lkLocalScreenStream = null;
  setState({ sharingScreen: next });
}

/** Локальный видеопоток (камера) для отрисовки. */
export function getLocalGroupVideoStream(): MediaStream | null {
  if (lkMode) return lkLocalVideoStream;
  return cachedStream('group:local-cam', localVideoTrack);
}

/** Локальный поток демонстрации экрана. */
export function getLocalGroupScreenStream(): MediaStream | null {
  return lkLocalScreenStream;
}

/** Удалённый видеопоток участника (камера). */
export function getGroupParticipantStream(userId: number): MediaStream | null {
  if (lkMode) return lk.getParticipantCameraStream(String(userId));
  return remoteVideoStreams.get(userId) ?? null;
}

/** Удалённый поток демонстрации экрана участника. */
export function getGroupParticipantScreenStream(userId: number): MediaStream | null {
  if (lkMode) return lk.getParticipantScreenStream(String(userId));
  return null;
}

function myId(): number {
  return state.participants[0]?.id ?? 0;
}

export function clearGroupCallNotice() { setState({ notice: null }); }

let initialized = false;
export function initGroupCallManager() {
  if (initialized) return () => {};
  initialized = true;

  // Живое применение голосовых настроек в групповом звонке: громкость вывода
  // для всех участников + перезахват микрофона (эхо/шум/АРУ) в LiveKit-режиме.
  const offVoice = subscribeVoicePrefs(() => {
    applyGroupOutputVolume();
    if (lkMode) void lk.reapplyAudioPrefs();
  });

  const off = onChatEvent(async (data) => {
    switch (data.type) {
      case 'group.call.started':
        setState({ status: 'active', callId: data.call_id, groupId: data.group_id, participants: data.participants || state.participants, startedAt: Date.now(), reconnecting: false });
        break;
      case 'group.call.incoming': {
        if (state.status !== 'idle') {
          sendWS({ type: 'group.call.leave', call_id: data.call_id });
          return;
        }
        (window as any).electron?.showMainWindow?.();
        setState({ status: 'incoming', callId: data.call_id, groupId: data.group_id, caller: data.caller, notice: null, reconnecting: false });
        break;
      }
      case 'group.call.accepted': {
        if (state.callId !== data.call_id) return;
        setState({ status: 'active', startedAt: state.startedAt || Date.now() });
        // В LiveKit-режиме participant-обмен идёт через SFU, а не через mesh
        if (lkMode) break;
        const parts: GroupCallParticipant[] = data.participants || [];
        parts.forEach((p) => addParticipant(p));
        for (const p of parts) {
          try { await createPeer(p.id, true); } catch (e) { console.error('[groupcall] offer failed', e); }
        }
        break;
      }
      case 'group.call.joined':
        if (state.callId !== data.call_id) return;
        addParticipant(data.user);
        if (lkMode) break;
        // Кто-то вошёл после нас — досоздаём соединение, чтобы все оказались в mesh
        void ensureConnections();
        break;
      case 'group.call.offer': {
        if (state.callId !== data.call_id || !data.from) return;
        if (lkMode) return; // сигналинг mesh игнорируем — медиа через SFU
        addParticipant(data.from);
        handleRemoteOffer(data.call_id, data.from, data.sdp);
        break;
      }
      case 'group.call.answer': {
        if (lkMode || state.callId !== data.call_id || !data.from) return;
        const pc = peers.get(data.from.id);
        if (!pc || pc.signalingState === 'stable') return;
        try { await pc.setRemoteDescription(new RTCSessionDescription(data.sdp)); await flushIce(data.from.id); } catch (e) { console.error('[groupcall] remote answer', e); }
        break;
      }
      case 'group.call.ice':
        if (lkMode || state.callId !== data.call_id || !data.from || !data.candidate) return;
        await addIce(data.from.id, data.candidate);
        break;
      case 'group.call.left': {
        if (state.callId !== data.call_id) return;
        const uid = data.user_id;
        const pc = peers.get(uid);
        if (pc) { try { pc.close(); } catch { /* ignore */ } peers.delete(uid); }
        const audio = remoteAudio.get(uid);
        if (audio) {
          releaseOutputBoost(audio);
          audio.pause();
          audio.srcObject = null;
          audio.remove();
          remoteAudio.delete(uid);
        }
        remoteVideoStreams.delete(uid);
        if (state.videoUsers.includes(uid)) setState({ videoUsers: state.videoUsers.filter((x) => x !== uid) });
        removeParticipant(uid);
        break;
      }
      case 'group.call.ended':
        if (state.callId !== data.call_id) return;
        resetGroupCall();
        // Нажали «Подключиться», а звонок уже закончился
        if (data.reason === 'gone') setState({ notice: 'Звонок уже завершился' });
        break;
      case 'group.call.state':
        // group.call.ended приходит только сидящим в звонке: у остальных он ещё звонит.
        // Пока сервер не выдал callId, это мы только начинаем новый звонок — не трогаем.
        if (data.active || data.group_id !== state.groupId || !state.callId) return;
        resetGroupCall();
        break;
      case 'group.call.busy':
        setState({ notice: 'В этой группе уже идёт звонок' });
        resetGroupCall();
        break;
    }
  });

  return () => { offVoice(); off(); initialized = false; resetGroupCall(); };
}
