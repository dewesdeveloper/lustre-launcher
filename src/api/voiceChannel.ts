// Голосовые каналы сообществ — как в Discord: постоянные комнаты, в которые заходишь и
// выходишь сам. Медиа — LiveKit (комната cv_<channelId>), присутствие «кто в каком канале,
// мьют/deafen/камера/стрим» — WS-события voice.* (см. backend controllers/voice_channels.go).
// Модуль без React: стор + подписка, как api/call.ts и api/groupCall.ts.

import api from './index';
import { joinByInvite } from './community';
import { onChatEvent, sendWS } from './chat';
import * as lk from './livekitRoom';
import { getCallState } from './call';
import { getGroupCallState } from './groupCall';
import { registerVoiceLeave } from './voiceBridge';
import { getVoicePrefs, playMicSound } from './voicePrefs';

export interface VoiceUser {
  id: number;
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_pro?: boolean;
}

export interface VoiceMember {
  user_id: number;
  user: VoiceUser;
  channel_id: number;
  community_id: number;
  self_mute: boolean;
  self_deaf: boolean;
  server_mute: boolean;
  video: boolean;
  stream: boolean;
  joined_at: string;
}

export interface VoiceChannelInfo {
  id: number;
  community_id: number;
  kind: 'voice' | string;
  name: string;
  position: number;
  user_limit: number;
}

/** Сообщение текстового чата голосового канала */
export interface VoiceChatMessage {
  ID: number;
  CreatedAt: string;
  channel_id: number;
  author_id: number;
  content: string;
  author?: { username?: string; profile?: { display_name?: string; avatar_url?: string } };
}

/** Входящее приглашение в голосовой канал */
export interface VoiceInvite {
  channel: VoiceChannelInfo;
  community_id: number;
  community_name: string;
  by?: VoiceUser;
  /** Только от владельца приватного сообщества: приглашённый вступает по этому коду */
  invite_code?: string;
  at: number;
}

export interface CommunityVoice {
  channels: VoiceChannelInfo[];
  members: VoiceMember[];
  canManage: boolean;
  canJoin: boolean;
  livekit: boolean;
  loaded: boolean;
}

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export interface VoiceState {
  /** id текущего пользователя */
  selfId: number;
  status: VoiceStatus;
  channelId: number | null;
  communityId: number | null;
  channelName: string;
  communityName: string;
  selfMute: boolean;
  selfDeaf: boolean;
  serverMute: boolean;
  video: boolean;
  sharing: boolean;
  /** identity (user_id строкой) тех, кто говорит прямо сейчас */
  speaking: string[];
  localSpeaking: boolean;
  quality: lk.CallQuality;
  startedAt: number | null;
  notice: string | null;
  invite: VoiceInvite | null;
  communities: Record<number, CommunityVoice>;
  localCam: MediaStream | null;
  localScreen: MediaStream | null;
  /** увеличивается при изменении удалённых треков — плитки перерисовываются */
  tracksVersion: number;
}

const initial: VoiceState = {
  selfId: 0, status: 'idle', channelId: null, communityId: null, channelName: '', communityName: '',
  selfMute: false, selfDeaf: false, serverMute: false, video: false, sharing: false,
  speaking: [], localSpeaking: false, quality: 'unknown', startedAt: null, notice: null, invite: null,
  communities: {}, localCam: null, localScreen: null, tracksVersion: 0,
};

let state: VoiceState = { ...initial };
const listeners = new Set<(s: VoiceState) => void>();

function setState(patch: Partial<VoiceState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function getVoiceState(): VoiceState { return state; }

export function subscribeVoice(l: (s: VoiceState) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let myId = 0;

// ---------------- Присутствие в каналах сообществ ----------------

const watched = new Map<number, number>(); // community_id -> число наблюдателей

function patchCommunity(id: number, fn: (c: CommunityVoice) => CommunityVoice) {
  const cur = state.communities[id] ?? { channels: [], members: [], canManage: false, canJoin: false, livekit: false, loaded: false };
  setState({ communities: { ...state.communities, [id]: fn(cur) } });
}

export async function refreshChannels(communityId: number): Promise<void> {
  try {
    const { data } = await api.get(`/communities/${communityId}/channels`);
    patchCommunity(communityId, () => ({
      channels: data.channels || [],
      members: data.voice_states || [],
      canManage: !!data.can_manage,
      canJoin: !!data.can_join,
      livekit: !!data.livekit,
      loaded: true,
    }));
  } catch {
    patchCommunity(communityId, (c) => ({ ...c, loaded: true }));
  }
}

/** Страница сообщества открыта: грузим каналы и подписываемся на живые обновления. */
export function watchCommunity(communityId: number): () => void {
  watched.set(communityId, (watched.get(communityId) ?? 0) + 1);
  refreshChannels(communityId);
  sendWS({ type: 'voice.subscribe', community_id: communityId });
  return () => {
    const n = (watched.get(communityId) ?? 1) - 1;
    if (n > 0) { watched.set(communityId, n); return; }
    watched.delete(communityId);
    // оставаясь в канале сообщества, продолжаем получать его состояния
    if (state.communityId !== communityId) sendWS({ type: 'voice.unsubscribe', community_id: communityId });
  };
}

function upsertMember(communityId: number, userId: number, m: VoiceMember | null) {
  patchCommunity(communityId, (c) => {
    const rest = c.members.filter((x) => x.user_id !== userId);
    return { ...c, members: m ? [...rest, m] : rest };
  });
  // своё состояние с сервера: серверный мьют
  if (userId === myId && m && state.channelId === m.channel_id && m.server_mute !== state.serverMute) {
    setState({ serverMute: m.server_mute });
    if (m.server_mute) {
      void lk.setMicEnabled(false);
      notice('Модератор выключил вам микрофон');
    } else {
      void lk.setMicEnabled(!state.selfMute);
      notice('Модератор снова разрешил микрофон');
    }
  }
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
function notice(text: string) {
  setState({ notice: text });
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => setState({ notice: null }), 4500);
}
export function clearVoiceNotice() { setState({ notice: null }); }

// ---------------- Звуки входа/выхода (как в Discord) ----------------

let toneCtx: AudioContext | null = null;
function tone(up: boolean) {
  try {
    toneCtx ??= new AudioContext();
    const ctx = toneCtx;
    const now = ctx.currentTime;
    const notes = up ? [523, 784] : [784, 523];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.05, now + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.12);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.14);
    });
  } catch { /* без звука */ }
}

// ---------------- Подключение ----------------

let offSpeaking: (() => void) | null = null;
let offQuality: (() => void) | null = null;
let offParticipants: (() => void) | null = null;
let joinSeq = 0;

function callBusy(): boolean {
  return getCallState().status !== 'idle' || getGroupCallState().status !== 'idle';
}

/** Зайти в голосовой канал (из другого — переходим, как в Discord). */
export async function joinVoiceChannel(channel: VoiceChannelInfo, communityName: string): Promise<void> {
  if (state.channelId === channel.id && state.status !== 'idle') return;
  if (callBusy()) {
    notice('Сначала завершите текущий звонок');
    return;
  }
  const seq = ++joinSeq;
  if (state.status !== 'idle') await teardown(false);

  setState({
    status: 'connecting', channelId: channel.id, communityId: channel.community_id,
    channelName: channel.name, communityName, notice: null, serverMute: false,
    video: false, sharing: false, localCam: null, localScreen: null, speaking: [], localSpeaking: false,
  });
  sendWS({ type: 'voice.subscribe', community_id: channel.community_id });

  let creds: lk.LiveKitCreds | null = null;
  try {
    const { data } = await api.post('/calls/token', { channel_id: channel.id });
    if (data?.token && data?.url) creds = data;
  } catch (e: any) {
    if (seq !== joinSeq) return;
    resetIdle();
    notice(e?.response?.data?.code === 'livekit_disabled'
      ? 'Голосовые каналы недоступны: сервер звонков не настроен'
      : e?.response?.data?.error || 'Не удалось подключиться к каналу');
    return;
  }
  if (seq !== joinSeq) return;
  if (!creds) { resetIdle(); notice('Не удалось подключиться к каналу'); return; }

  const ok = await lk.connectRoom(creds, { video: false }, {
    onLocalStream: (kind, stream) => setState(kind === 'cam' ? { localCam: stream, video: !!stream } : { localScreen: stream, sharing: !!stream }),
    onRemoteStream: () => bumpTracks(),
    onRemoteCameraOn: () => bumpTracks(),
    onRemoteScreenOn: () => bumpTracks(),
    onDisconnected: () => { if (seq === joinSeq && state.status !== 'idle') { void teardown(true); notice('Соединение с голосовым каналом потеряно'); } },
    onMicError: (m) => notice(m),
    onConnectionState: (s) => {
      if (seq !== joinSeq) return;
      if (s === 'reconnecting') setState({ status: 'reconnecting' });
      if (s === 'reconnected') { setState({ status: 'connected' }); sendJoin(); }
    },
  }, { channelId: channel.id });

  if (seq !== joinSeq) return;
  if (!ok) { resetIdle(); notice('Не удалось подключиться к серверу звонков'); return; }

  setState({ status: 'connected', startedAt: Date.now() });
  await lk.setMicEnabled(!state.selfMute && !state.serverMute);
  lk.setDeafened(state.selfDeaf);
  sendJoin();
  tone(true);

  offSpeaking?.();
  offSpeaking = lk.onSpeakingChanged(({ identities, local }) => {
    setState({ speaking: identities, localSpeaking: local && !state.selfMute && !state.serverMute });
  });
  offQuality?.();
  offQuality = lk.onConnectionQuality((q) => setState({ quality: q[String(myId)] ?? 'unknown' }));
  offParticipants?.();
  offParticipants = lk.onParticipantsChanged(() => bumpTracks());
}

function sendJoin() {
  if (!state.channelId) return;
  sendWS({ type: 'voice.join', channel_id: state.channelId, self_mute: state.selfMute, self_deaf: state.selfDeaf });
  sendUpdate();
}

function sendUpdate() {
  sendWS({ type: 'voice.update', self_mute: state.selfMute, self_deaf: state.selfDeaf, video: state.video, stream: state.sharing });
}

function bumpTracks() { setState({ tracksVersion: state.tracksVersion + 1 }); }

function resetIdle() {
  setState({
    status: 'idle', channelId: null, communityId: null, channelName: '', communityName: '',
    serverMute: false, video: false, sharing: false, speaking: [], localSpeaking: false,
    quality: 'unknown', startedAt: null, localCam: null, localScreen: null,
  });
}

async function teardown(lost: boolean) {
  const communityId = state.communityId;
  offSpeaking?.(); offSpeaking = null;
  offQuality?.(); offQuality = null;
  offParticipants?.(); offParticipants = null;
  if (!lost) sendWS({ type: 'voice.leave' });
  lk.setDeafened(false);
  const p = lk.disconnectRoom();
  resetIdle();
  if (communityId && !watched.has(communityId)) sendWS({ type: 'voice.unsubscribe', community_id: communityId });
  await p;
}

/** Выйти из канала. */
export async function leaveVoiceChannel(): Promise<void> {
  if (state.status === 'idle') return;
  joinSeq++;
  tone(false);
  await teardown(false);
}

// звонок забирает LiveKit — выходим из канала синхронно (до подключения звонка)
registerVoiceLeave(() => { if (state.status !== 'idle') { joinSeq++; void teardown(false); notice('Голосовой канал отключён: начался звонок'); } });

// ---------------- Управление собой ----------------

export function toggleVoiceMute() {
  if (state.status === 'idle') { setState({ selfMute: !state.selfMute }); return; }
  if (state.serverMute) { notice('Микрофон выключен модератором'); return; }
  const selfMute = !state.selfMute;
  // как в Discord: включая микрофон, снимаем и «выключенный звук»
  const selfDeaf = selfMute ? state.selfDeaf : false;
  setState({ selfMute, selfDeaf });
  lk.setDeafened(selfDeaf);
  void lk.setMicEnabled(!selfMute);
  if (getVoicePrefs().mic_toggle_sound) playMicSound(!selfMute);
  sendUpdate();
}

export function toggleVoiceDeaf() {
  const selfDeaf = !state.selfDeaf;
  // deafen глушит и микрофон; снятие deafen возвращает микрофон
  const selfMute = selfDeaf ? true : false;
  setState({ selfDeaf, selfMute });
  if (state.status === 'idle') return;
  lk.setDeafened(selfDeaf);
  void lk.setMicEnabled(!selfMute && !state.serverMute);
  sendUpdate();
}

export async function toggleVoiceVideo() {
  if (state.status !== 'connected') return;
  const on = !state.video;
  const ok = await lk.setCameraEnabled(on);
  if (!ok && on) { notice('Не удалось включить камеру'); return; }
  setState({ video: on });
  sendUpdate();
}

/** Демонстрация экрана: sourceId — из ScreenSourcePicker (Electron), в вебе — системный диалог. */
export async function setVoiceScreenShare(on: boolean, sourceId?: string) {
  if (state.status !== 'connected') return;
  if (on && sourceId) lk.setShareSource(sourceId);
  const ok = await lk.setScreenShareEnabled(on);
  if (!ok && on) { notice('Не удалось начать демонстрацию'); return; }
  setState({ sharing: on });
  sendUpdate();
}

export function setMemberVolume(userId: number, v: number) {
  lk.setParticipantVolume(String(userId), v);
  bumpTracks();
}

export const getMemberScreenAudio = (userId: number) => lk.getScreenAudio(String(userId));
export const setMemberScreenVolume = (userId: number, v: number) => lk.setScreenAudioVolume(String(userId), v);

export function getMemberVolume(userId: number): number {
  return lk.getParticipantVolume(String(userId));
}

/** Модерация (владелец сообщества): серверный мьют, отключение, перенос. */
export function moderateVoice(targetUserId: number, action: 'mute' | 'unmute' | 'disconnect' | 'move', targetChannelId?: number) {
  sendWS({ type: 'voice.moderate', target_user_id: targetUserId, action, ...(targetChannelId ? { target_id: targetChannelId } : {}) });
}

// ---------------- Каналы: CRUD (владелец) ----------------

export async function createVoiceChannel(communityId: number, name: string, userLimit = 0) {
  await api.post(`/communities/${communityId}/channels`, { name, user_limit: userLimit });
  await refreshChannels(communityId);
}

export async function updateVoiceChannel(channel: VoiceChannelInfo, patch: { name?: string; user_limit?: number; position?: number }) {
  await api.put(`/community-channels/${channel.id}`, patch);
  await refreshChannels(channel.community_id);
}

export async function deleteVoiceChannel(channel: VoiceChannelInfo) {
  await api.delete(`/community-channels/${channel.id}`);
  await refreshChannels(channel.community_id);
}

// Рация и порог чувствительности — в обработке микрофона (micPipeline.ts): она работает
// во всех голосовых режимах и ловит клавишу, даже когда лаунчер не в фокусе.

// ---------------- WS ----------------

let initialized = false;

/** Подключить обработку voice.* (один раз, в главном окне). */
export function initVoiceChannels(meId: number) {
  myId = meId;
  if (state.selfId !== meId) setState({ selfId: meId });
  if (initialized) return;
  initialized = true;
  onChatEvent((d: any) => {
    switch (d.type) {
      case '__open':
        // переподключение WS: сервер забыл подписки и присутствие — восстанавливаем
        watched.forEach((_, id) => sendWS({ type: 'voice.subscribe', community_id: id }));
        if (state.communityId && !watched.has(state.communityId)) sendWS({ type: 'voice.subscribe', community_id: state.communityId });
        if (state.status === 'connected') sendJoin();
        break;
      case 'voice.invited':
        if (state.channelId !== d.channel?.id) setState({ invite: { ...d, at: Date.now() } });
        break;
      case 'voice.snapshot':
        patchCommunity(d.community_id, (c) => ({ ...c, members: d.states || [] }));
        break;
      case 'voice.state':
        upsertMember(d.community_id, d.user_id, d.state || null);
        break;
      case 'voice.channels':
        refreshChannels(d.community_id);
        break;
      case 'voice.joined':
        if (d.channel_id === state.channelId && d.server_mute && !state.serverMute) {
          setState({ serverMute: true });
          void lk.setMicEnabled(false);
        }
        break;
      case 'voice.error':
        if (state.status !== 'idle' && (!d.channel_id || d.channel_id === state.channelId)) {
          joinSeq++;
          void teardown(false);
        }
        notice(d.error || 'Ошибка голосового канала');
        break;
      case 'voice.kicked':
        if (state.channelId === d.channel_id) {
          joinSeq++;
          void teardown(true);
          tone(false);
          notice(d.reason === 'deleted' ? 'Канал удалён' : `Вас отключил ${d.by?.display_name || d.by?.username || 'модератор'}`);
        }
        break;
      case 'voice.moved': {
        const com = state.communities[d.community_id];
        const ch = com?.channels.find((c) => c.id === d.channel_id);
        if (ch) {
          const name = state.communityName;
          joinSeq++;
          void teardown(true).then(() => joinVoiceChannel(ch, name)).then(() => notice(`Вас перенесли в «${ch.name}»`));
        }
        break;
      }
    }
  });
}

// ---------------- Чат канала и приглашения ----------------

export async function getVoiceChatHistory(channelId: number): Promise<VoiceChatMessage[]> {
  const res = await api.get(`/community-channels/${channelId}/messages`);
  return Array.isArray(res.data) ? res.data : [];
}

export function sendVoiceChat(channelId: number, content: string): boolean {
  return sendWS({ type: 'voice.chat', channel_id: channelId, content });
}

export async function deleteVoiceChatMessage(id: number): Promise<void> {
  await api.delete(`/community-channel-messages/${id}`);
}

export function inviteToVoiceChannel(channelId: number, userId: number): boolean {
  return sendWS({ type: 'voice.invite', channel_id: channelId, target_user_id: userId });
}

export function declineVoiceInvite() {
  setState({ invite: null });
}

export async function acceptVoiceInvite(): Promise<void> {
  const invite = state.invite;
  if (!invite) return;
  setState({ invite: null });
  if (invite.invite_code) {
    // уже участник — сервер ответит ошибкой, это не мешает зайти в канал
    await joinByInvite(invite.invite_code).catch(() => {});
    await refreshChannels(invite.community_id);
  }
  await joinVoiceChannel(invite.channel, invite.community_name);
}

/** Участники канала (по присутствию), в порядке входа. */
export function membersOf(communityId: number, channelId: number): VoiceMember[] {
  return (state.communities[communityId]?.members ?? [])
    .filter((m) => m.channel_id === channelId)
    .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

export const getRemoteCamera = (userId: number) => lk.getParticipantCameraStream(String(userId));
export const getRemoteScreen = (userId: number) => lk.getParticipantScreenStream(String(userId));
