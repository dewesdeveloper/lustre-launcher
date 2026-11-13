// Абстракция над LiveKit Room (SFU). Медиа (аудио/видео/экран) идёт через SFU,
// а сигналинг «кто кому звонит» остаётся в старом call.* (WS).
//
// Модуль изолирован: если livekit-client не установлен или сервер не настроен,
// вызывающий код продолжает работать на старом P2P-движке.

import api from './index';
import { getVoicePrefs, applyOutputVolumeToElement, releaseOutputBoost, setOutputBoostSink } from './voicePrefs';
import { createMicPipeline, captureKeyOf, type MicPipeline } from './micPipeline';
import { getPreset, getShareAudio } from './mediaQuality';
import { cachedStream } from '../utils/streamCache';

type LK = typeof import('livekit-client');

let lk: LK | null = null;
async function loadLiveKit(): Promise<LK | null> {
  if (lk) return lk;
  try {
    lk = await import('livekit-client');
    return lk;
  } catch {
    return null;
  }
}

/** Цель подключения: личный звонок, группа или голосовой канал сообщества. */
export interface LiveKitTarget {
  conversationId?: number;
  groupId?: number;
  userId?: number;
  channelId?: number;
}

export interface LiveKitCreds {
  token: string;
  url: string;
  room: string;
}

let room: import('livekit-client').Room | null = null;
let connTimer: ReturnType<typeof setTimeout> | null = null;

// Учётка подключения (для повторного применения аудио-настроек)
let currentCreds: LiveKitCreds | null = null;
let currentVideoWanted = false;
// Цель звонка — нужна, чтобы переподняться после обрыва (токен мог истечь, запрашиваем новый)
let currentTarget: LiveKitTarget | null = null;
let currentHandlers: LiveKitHandlers | null = null;
let currentOpts: { video: boolean } = { video: false };

// Элементы воспроизведения удалённого аудио (по sid трека). Держим ссылку,
// чтобы применять громкость вывода и снять WebAudio-усиление при уходе трека.
const remoteAudioEls = new Map<string, HTMLMediaElement>();
// Чей это звук (identity участника) — для громкости «по человеку», как в Discord
const elIdentity = new Map<HTMLMediaElement, string>();
// Громкость отдельных участников (0..2, множитель к общей) и «выключить звук» (deafen)
const userVolumes = new Map<string, number>(loadVolumes('lh_user_volumes'));
let deafened = false;

function loadVolumes(key: string): [string, number][] {
  try { return Object.entries(JSON.parse(localStorage.getItem(key) || '{}')).map(([k, v]) => [k, Number(v)]); } catch { return []; }
}

function saveVolume(key: string, map: Map<string, number>, identity: string, v: number) {
  const vol = Math.max(0, Math.min(2, v));
  if (vol === 1) map.delete(identity); else map.set(identity, vol);
  try { localStorage.setItem(key, JSON.stringify(Object.fromEntries(map))); } catch { /* ignore */ }
}

/** Итоговая громкость элемента: общая × участника; при deafen — тишина. */
function effectiveVolume(el: HTMLMediaElement): number {
  if (deafened) return 0;
  const id = elIdentity.get(el);
  const per = id ? userVolumes.get(id) ?? 1 : 1;
  return Math.max(0, Math.min(2, getVoicePrefs().output_volume * per));
}
// Звук демонстрации экрана — отдельно от микрофона: зритель настраивает каждую трансляцию сам
const screenAudioEls = new Map<string, { el: HTMLMediaElement; track: MediaStreamTrack; identity: string }>();
const screenVolumes = new Map<string, number>(loadVolumes('lh_screen_volumes'));
const screenMuted = new Set<string>();
const screenAudioListeners = new Set<() => void>();
let screenAudioVersion = 0;

function screenAudioChanged() {
  screenAudioVersion += 1;
  screenAudioListeners.forEach((l) => l());
}

// Автопереподключение после обрыва соединения (LiveKit сам пробует штатно,
// но при финальном Disconnected поднимаем комнату заново с новым токеном).
let manualDisconnect = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

// Текущий выбранный источник демонстрации — чтобы перезапускать шаринг
// (смена качества/звука) без потери окна.
let shareSourceId = '';

/** Запоминает источник и передаёт его main-процессу для getDisplayMedia. */
export function setShareSource(id: string) {
  shareSourceId = id || '';
  try { (window as any).electron?.setShareSource?.(shareSourceId); } catch { /* ignore */ }
}

// --- Аудио-обработка: усиление микрофона через WebAudio ---
// Обработанный микрофон (шумоподавление, усиление, порог/рация — см. micPipeline.ts)
let mic: MicPipeline | null = null;

export interface LiveKitHandlers {
  onLocalStream: (kind: 'cam' | 'screen', stream: MediaStream | null) => void;
  onRemoteStream: (kind: 'cam' | 'screen', stream: MediaStream | null) => void;
  onRemoteCameraOn: (on: boolean) => void;
  onRemoteScreenOn: (on: boolean) => void;
  onDisconnected: () => void;
  /** Микрофон захватить не удалось (нет прав/устройств) — показать пользователю. */
  onMicError?: (message: string) => void;
  /** Смена состояния соединения (автопереподключение после обрыва). */
  onConnectionState?: (state: 'reconnecting' | 'reconnected' | 'disconnected') => void;
}

/** Запрашивает токен у бэкенда для личного или группового звонка. */
export async function fetchLiveKitToken(target: LiveKitTarget): Promise<LiveKitCreds | null> {
  try {
    // ВАЖНО: бэкенд ждёт snake_case (conversation_id/group_id/user_id).
    // Раньше здесь уходил camelCase, бэкенд отвечал 400 «Укажите…»,
    // fetch молча возвращал null — и звонки ВСЕГДА уходили в P2P-фолбэк,
    // минуя LiveKit (поэтому в логах SFU не было ни одного join от клиента).
    const body: Record<string, number> = {};
    if (target.conversationId) body.conversation_id = target.conversationId;
    if (target.groupId) body.group_id = target.groupId;
    if (target.userId) body.user_id = target.userId;
    if (target.channelId) body.channel_id = target.channelId;
    const res = await api.post('/calls/token', body);
    const data = res.data as LiveKitCreds;
    if (!data?.token || !data?.url) return null;
    return data;
  } catch {
    return null;
  }
}

/** Доступен ли LiveKit (модуль установлен и токен выдан). */
export async function isLiveKitAvailable(target: LiveKitTarget): Promise<boolean> {
  const mod = await loadLiveKit();
  if (!mod) return false;
  const creds = await fetchLiveKitToken(target);
  return !!creds;
}

/** Готовит обработанный микрофон; прежний (реконнект, смена настроек) закрывается. */
async function prepareProcessedMic(): Promise<MediaStreamTrack | null> {
  teardownAudioProcessing();
  const next = await createMicPipeline({
    onSilentMic: () => currentHandlers?.onMicError?.(
      'Микрофон не передаёт звук. Проверь, что он подключён и не выключен в Windows, и выбери его в Настройках → Голос.',
    ),
  });
  mic = next;
  return next?.track ?? null;
}

/** Усиление применяется конвейером сам (подписка на настройки) — оставлено для совместимости. */
export function applyInputGain() { /* см. micPipeline.ts */ }

function teardownAudioProcessing() {
  mic?.destroy();
  mic = null;
}

/** Снимает с DOM все <audio> удалённого аудио (микрофон + звук демонстрации). */
function teardownRemoteAudio() {
  remoteAudioEls.forEach((el) => {
    releaseOutputBoost(el);
    elIdentity.delete(el);
    try { el.remove(); } catch { /* ignore */ }
  });
  remoteAudioEls.clear();
  screenAudioEls.forEach(({ el }) => {
    releaseOutputBoost(el);
    try { el.remove(); } catch { /* ignore */ }
  });
  screenAudioEls.clear();
  screenAudioChanged();
}

/** Применяет громкость звука демонстраций: общая громкость вывода × настройка этой трансляции. */
function applyScreenAudioVolume() {
  screenAudioEls.forEach(({ el, track, identity }) => {
    const muted = deafened || screenMuted.has(identity);
    const effective = muted ? 0 : getVoicePrefs().output_volume * (screenVolumes.get(identity) ?? 1);
    applyOutputVolumeToElement(el, track, Math.max(0, Math.min(2, effective)));
  });
}

function clearReconnectTimer() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

/** Планирует очередную попытку переподключения после обрыва соединения. */
function scheduleReconnect() {
  if (manualDisconnect) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS || !currentTarget || !currentHandlers) {
    currentHandlers?.onConnectionState?.('disconnected');
    currentHandlers?.onDisconnected();
    return;
  }
  const delay = RECONNECT_DELAYS[Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1)];
  reconnectAttempts += 1;
  currentHandlers?.onConnectionState?.('reconnecting');
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => { void doReconnect(); }, delay);
}

/** Полностью поднимает комнату заново: закрывает старую и запрашивает новый токен. */
async function doReconnect(): Promise<void> {
  if (manualDisconnect || !currentTarget || !currentHandlers) return;
  try {
    const creds = await fetchLiveKitToken(currentTarget);
    if (!creds) throw new Error('no creds');
    const old = room;
    room = null;
    if (old) { try { await old.disconnect(); } catch { /* ignore */ } }
    teardownRemoteAudio();
    const ok = await connectRoom(creds, currentOpts, currentHandlers, currentTarget);
    if (ok) {
      reconnectAttempts = 0;
      currentHandlers.onConnectionState?.('reconnected');
    } else {
      scheduleReconnect();
    }
  } catch {
    scheduleReconnect();
  }
}

/**
 * Подключается к комнате LiveKit. Публикует обработанный микрофон и (опц.) камеру.
 */
export async function connectRoom(
  creds: LiveKitCreds,
  opts: { video: boolean },
  handlers: LiveKitHandlers,
  target?: LiveKitTarget,
): Promise<boolean> {
  const mod = await loadLiveKit();
  if (!mod) return false;

  currentCreds = creds;
  currentVideoWanted = opts.video;
  currentTarget = target ?? currentTarget;
  currentHandlers = handlers;
  currentOpts = { ...opts };
  manualDisconnect = false;
  if (connTimer) { clearTimeout(connTimer); connTimer = null; }

  const preset = getPreset();
  let r: import('livekit-client').Room;
  try {
    r = new mod.Room({
      // Не даём adaptiveStream выбирать низкий слой для маленьких плиток —
      // иначе текст на демонстрации выглядит размытым.
      adaptiveStream: false,
      dynacast: true,
      videoCaptureDefaults: { resolution: preset.resolution, frameRate: preset.frameRate },
      publishDefaults: {
        videoEncoding: { maxBitrate: preset.cameraBitrate, maxFramerate: preset.frameRate },
        screenShareEncoding: { maxBitrate: preset.screenBitrate, maxFramerate: preset.frameRate },
      },
    });
  } catch {
    return false;
  }
  room = r;

  r.on(mod.RoomEvent.TrackSubscribed, (track, pub, participant) => {
    if (room !== r) return;
    // Удалённое аудио: SDK сам <audio>-элемент НЕ создаёт — трек надо
    // attach()-ить, иначе звук собеседника теряется (подсветка «говорит»
    // при этом горит: сервер видит публикацию, но в динамики ничего не идёт).
    // Громкость (setVolume) применяется только к уже прикреплённым элементам,
    // поэтому attach() идёт первым.
    if (track.kind === 'audio') {
      const el = track.attach() as HTMLMediaElement;
      el.style.display = 'none';
      el.setAttribute('data-lk-remote-audio', '1');
      // Элемент должен быть в DOM: Chromium использует подключённый <audio>
      // как опорный сигнал для эхоподавления (иначе AEC «не работает»).
      document.body.appendChild(el);
      const key = track.sid || track.mediaStreamTrack.id;
      // Звук демонстрации экрана — своя громкость у зрителя, отдельный список.
      if (pub.source === mod.Track.Source.ScreenShareAudio) {
        screenAudioEls.set(key, { el, track: track.mediaStreamTrack, identity: participant.identity });
        applyScreenAudioVolume();
        screenAudioChanged();
        return;
      }
      remoteAudioEls.set(key, el);
      if (participant?.identity) elIdentity.set(el, participant.identity);
      applyOutputVolumeToElement(el, track.mediaStreamTrack, effectiveVolume(el));
      return;
    }
    const emitVideo = (on: boolean, stream: MediaStream | null) => {
      if (pub.source === 'screen_share') {
        handlers.onRemoteScreenOn(on);
        handlers.onRemoteStream('screen', stream);
      } else {
        handlers.onRemoteCameraOn(on);
        handlers.onRemoteStream('cam', stream);
      }
    };
    emitVideo(true, new MediaStream([track.mediaStreamTrack]));
    // Камера выключается мьютом, а не отпиской: без этой ветки у зрителя
    // остаётся чёрный прямоугольник вместо аватара (см. RoomEvent.TrackMuted).
    const onEnded = () => { if (room === r) emitVideo(false, null); };
    track.mediaStreamTrack.addEventListener('ended', onEnded);
  })
  .on(mod.RoomEvent.TrackUnsubscribed, (track) => {
    if (room !== r) return;
    if (track.kind === 'audio') {
      const key = track.sid || track.mediaStreamTrack.id;
      const screen = screenAudioEls.get(key);
      if (screen) {
        releaseOutputBoost(screen.el);
        try { track.detach(screen.el); } catch { /* ignore */ }
        screen.el.remove();
        screenAudioEls.delete(key);
        screenAudioChanged();
        return;
      }
      const mapped = remoteAudioEls.get(key);
      const el = mapped ?? (track.detach()[0] as HTMLMediaElement | undefined);
      if (el) {
        releaseOutputBoost(el);
        elIdentity.delete(el);
        try { track.detach(el); } catch { /* ignore */ }
        el.remove();
        remoteAudioEls.delete(key);
      }
      return;
    }
    const pub = track as unknown as { source?: string };
    if (pub.source === 'screen_share') {
      handlers.onRemoteScreenOn(false);
      handlers.onRemoteStream('screen', null);
    } else {
      handlers.onRemoteCameraOn(false);
      handlers.onRemoteStream('cam', null);
    }
  })
  // Мьют камеры/экрана на стороне отправителя (setCameraEnabled(false) = mute).
  // Публикация остаётся, но трек enabled=false → кадр чёрный; скрываем поток,
  // чтобы вместо него показывался аватар, и возвращаем при unmute.
  .on(mod.RoomEvent.TrackMuted, (pub, participant) => {
    if (room !== r) return;
    if (participant === r.localParticipant) return; // свои мьюты считает toggleVideo
    if (pub.kind !== 'video') return;
    if (pub.source === 'screen_share') {
      handlers.onRemoteScreenOn(false);
      handlers.onRemoteStream('screen', null);
    } else {
      handlers.onRemoteCameraOn(false);
      handlers.onRemoteStream('cam', null);
    }
  })
  .on(mod.RoomEvent.TrackUnmuted, (pub, participant) => {
    if (room !== r) return;
    if (participant === r.localParticipant) return;
    if (pub.kind !== 'video') return;
    const track = (pub as unknown as { track?: { mediaStreamTrack: MediaStreamTrack } }).track;
    if (!track) return;
    const stream = new MediaStream([track.mediaStreamTrack]);
    if (pub.source === 'screen_share') {
      handlers.onRemoteScreenOn(true);
      handlers.onRemoteStream('screen', stream);
    } else {
      handlers.onRemoteCameraOn(true);
      handlers.onRemoteStream('cam', stream);
    }
  })
  .on(mod.RoomEvent.TrackSubscriptionFailed, (trackSid, participant) => {
    if (room !== r) return;
    const pubs = (participant as unknown as { trackPublications?: Map<string, { kind?: string; source?: string }> }).trackPublications;
    const pub = pubs?.get(trackSid as unknown as string);
    if (!pub || pub.kind !== 'video') return;
    if (pub.source === 'screen_share') {
      handlers.onRemoteScreenOn(false);
      handlers.onRemoteStream('screen', null);
    } else {
      handlers.onRemoteCameraOn(false);
      handlers.onRemoteStream('cam', null);
    }
  })
  .on(mod.RoomEvent.AudioPlaybackStatusChanged, () => {
    if (room !== r) return;
    // Автовоспроизведение могло быть заблокировано политикой Chromium —
    // повторный startAudio() из пользовательского контекста возобновляет вывод.
    if (!r.canPlaybackAudio) void r.startAudio().catch(() => {});
  })
  .on(mod.RoomEvent.ParticipantDisconnected, () => {
    if (room !== r) return;
    // В групповом звонке остальные участники остаются — их списками управляет
    // onParticipantsChanged; глобальная очистка гасила бы чужие плитки.
    if (r.remoteParticipants.size > 0) return;
    handlers.onRemoteCameraOn(false);
    handlers.onRemoteScreenOn(false);
    handlers.onRemoteStream('cam', null);
    handlers.onRemoteStream('screen', null);
  })
  .on(mod.RoomEvent.Reconnecting, () => {
    if (room !== r) return;
    handlers.onConnectionState?.('reconnecting');
  })
  .on(mod.RoomEvent.Reconnected, () => {
    if (room !== r) return;
    handlers.onConnectionState?.('reconnected');
  })
  .on(mod.RoomEvent.Disconnected, (reason) => {
    if (room !== r) return;
    if (manualDisconnect) return;
    // Терминальные причины: переподключение смысла не имеет
    const terminal = new Set<number>([
      mod.DisconnectReason.CLIENT_INITIATED,
      mod.DisconnectReason.DUPLICATE_IDENTITY,
      mod.DisconnectReason.PARTICIPANT_REMOVED,
      mod.DisconnectReason.ROOM_DELETED,
      mod.DisconnectReason.JOIN_FAILURE,
      mod.DisconnectReason.ROOM_CLOSED,
      mod.DisconnectReason.USER_UNAVAILABLE,
      mod.DisconnectReason.USER_REJECTED,
    ]);
    if (typeof reason === 'number' && terminal.has(reason)) {
      handlers.onConnectionState?.('disconnected');
      handlers.onDisconnected();
      return;
    }
    scheduleReconnect();
  });

  try {
    await r.connect(creds.url, creds.token);
  } catch {
    room = null;
    try { await r.disconnect(); } catch { /* ignore */ }
    return false;
  }

  // Фиксируем текущие настройки микрофона, чтобы не пересоздавать трек без нужды
  const p0 = getVoicePrefs();
  cachedMicSettings = { capture: captureKeyOf(p0), outputDevice: p0.output_device_id };

  // Громкость/устройство вывода — сразу при подключении (удалённые треки
  // подставляют громкость при подписке, см. TrackSubscribed)
  applyOutputVolume();
  if (p0.output_device_id) void applyOutputDevice(p0.output_device_id);

  // Публикуем обработанный микрофон
  const micTrack = await prepareProcessedMic();
  if (micTrack) {
    try {
      await room.localParticipant.publishTrack(micTrack, micPublishOptions(mod));
    } catch {
      // не удалось опубликовать — не критично
    }
  } else {
    // Раньше отказ захвата глотался молча: в браузере без разрешения
    // микрофона участник просто «молчал» без объяснений.
    handlers.onMicError?.(
      'Нет доступа к микрофону: разреши микрофон для этой вкладки (иконка в адресной строке) и проверь Настройки → Голос.',
    );
  }

  // Слушатели локальных публикаций регистрируем ДО включения камеры:
  // иначе событие LocalTrackPublished от камеры «теряется» и собственное
  // превью остаётся чёрным (кнопка камеры при этом выключена).
  attachLocalPublications(mod, handlers);

  // Камера (если видео-звонок)
  if (opts.video) {
    try { await setCameraEnabled(true); } catch { /* ignore */ }
  }

  // авто-отключение, если соединение не поднялось за 20 c
  connTimer = setTimeout(() => {
    if (room === r && room.state !== 'connected') handlers.onDisconnected();
  }, 20000);

  return true;
}

// Голос: Opus 64 кбит/с (как в Discord; по умолчанию было 32), DTX — тишина почти не
// тратит канал, RED — дублирование пакетов: потери в сети не превращаются в «бульканье».
function micPublishOptions(mod: LK) {
  return {
    source: mod.Track.Source.Microphone,
    name: 'mic',
    audioPreset: { maxBitrate: 64_000, priority: 'high' as const },
    dtx: true,
    red: true,
  };
}

function attachLocalPublications(mod: LK, handlers: LiveKitHandlers) {
  const r = room;
  if (!r) return;
  const emit = (pub: { source?: string; track?: { kind: string; mediaStreamTrack: MediaStreamTrack } | null }) => {
    const track = pub.track;
    if (!track || track.kind !== 'video') return;
    const stream = new MediaStream([track.mediaStreamTrack]);
    if (pub.source === 'screen_share') handlers.onLocalStream('screen', stream);
    else handlers.onLocalStream('cam', stream);
  };
  r.on(mod.RoomEvent.LocalTrackPublished, (pub) => {
    if (room !== r) return;
    emit(pub);
    if (pub.track?.kind === 'video') {
      // Устройство могли выдернуть: закрываем превью, если трек умер
      pub.track.mediaStreamTrack.addEventListener('ended', () => {
        if (room !== r) return;
        if (pub.source === 'screen_share') handlers.onLocalStream('screen', null);
        else handlers.onLocalStream('cam', null);
      });
    }
  });
  r.on(mod.RoomEvent.LocalTrackUnpublished, (pub) => {
    if (room !== r) return;
    if (pub.source === 'screen_share') handlers.onLocalStream('screen', null);
    else handlers.onLocalStream('cam', null);
  });
  // Уже опубликованные треки (камера включается до регистрации слушателей
  // при реконнекте) — отдаём сразу, иначе превью не появится.
  r.localParticipant.trackPublications.forEach((pub) => {
    emit(pub as unknown as { source?: string; track?: { kind: string; mediaStreamTrack: MediaStreamTrack } | null });
  });
}

interface MicSettingsCache {
  capture: string;
  outputDevice: string;
}
let cachedMicSettings: MicSettingsCache | null = null;

/**
 * Переприменяет аудио-настройки после их изменения в настройках:
 * громкость вывода, устройство вывода и усиление микрофона — мгновенно;
 * шумоподавление/эхоподавление/АРУ и смена устройства ввода — перезахватом
 * микрофона и заменой публикуемого трека.
 */
export async function reapplyAudioPrefs(): Promise<void> {
  const prefs = getVoicePrefs();
  const cached = cachedMicSettings;

  // Вывод: громкость удалённых треков + выбор динамиков/наушников
  applyOutputVolume();
  if (!cached || cached.outputDevice !== prefs.output_device_id) {
    if (prefs.output_device_id) void applyOutputDevice(prefs.output_device_id);
  }

  // Ввод: усиление, порог и рация конвейер применяет сам; смена устройства или
  // обработки (эхо, АРУ, шумоподавление) — перезахват микрофона
  const same = cached !== null && cached.capture === captureKeyOf(prefs);
  cachedMicSettings = { capture: captureKeyOf(prefs), outputDevice: prefs.output_device_id };
  if (same || !room) return;

  // Пересоздаём обработанный микрофон и заменяем трек публикации
  const mod = lk;
  if (!mod) return;
  const newTrack = await prepareProcessedMic();
  if (!newTrack) return;
  try {
    const pub = room.localParticipant.getTrackPublication(mod.Track.Source.Microphone);
    const oldTrack = pub?.track;
    const wasMuted = !!pub?.isMuted;
    // Сначала снимаем старую публикацию (передаём сам LocalAudioTrack, а не
    // mediaStreamTrack — иначе unpublish не находит публикацию и остаются две
    // дорожки: настройки «применяются», но звук идёт со старой).
    if (oldTrack) {
      await room.localParticipant.unpublishTrack(oldTrack, true);
    }
    await room.localParticipant.publishTrack(newTrack, micPublishOptions(mod));
    // выключенный микрофон остаётся выключенным (раньше смена настройки включала его)
    if (wasMuted) await room.localParticipant.setMicrophoneEnabled(false);
  } catch {
    // не критично — останемся на старом треке
  }
}

/** Применяет громкость вывода ко всем прикреплённым аудио-элементам (0..2). */
export function applyOutputVolume() {
  remoteAudioEls.forEach((el) => {
    const track = (el.srcObject as MediaStream | null)?.getAudioTracks()[0] ?? null;
    applyOutputVolumeToElement(el, track, effectiveVolume(el));
  });
  // звук демонстрации экрана: глобальная громкость умножается на зрительскую
  applyScreenAudioVolume();
}

/** Громкость конкретного участника (identity = user_id), 0..2; запоминается между сессиями. */
export function setParticipantVolume(identity: string, v: number) {
  saveVolume('lh_user_volumes', userVolumes, identity, v);
  applyOutputVolume();
}

export function getParticipantVolume(identity: string): number {
  return userVolumes.get(identity) ?? 1;
}

/** «Выключить звук» (deafen): глушит всех участников и звук демонстраций. */
export function setDeafened(on: boolean) {
  deafened = on;
  applyOutputVolume();
}

// --- Звук демонстрации экрана (зритель): настройка у каждой трансляции своя ---

/** Громкость демонстрации участника (0..2, множитель к общей); запоминается между сессиями. */
export function setScreenAudioVolume(identity: string, v: number) {
  saveVolume('lh_screen_volumes', screenVolumes, identity, v);
  // двигают ползунок — значит, хотят слышать
  screenMuted.delete(identity);
  applyScreenAudioVolume();
  screenAudioChanged();
}

export function setScreenAudioMuted(identity: string, muted: boolean) {
  if (muted) screenMuted.add(identity); else screenMuted.delete(identity);
  applyScreenAudioVolume();
  screenAudioChanged();
}

/** Состояние звука демонстрации участника; has — трансляция идёт со звуком. */
export function getScreenAudio(identity: string): { volume: number; muted: boolean; has: boolean } {
  return {
    volume: screenVolumes.get(identity) ?? 1,
    muted: screenMuted.has(identity),
    has: [...screenAudioEls.values()].some((a) => a.identity === identity),
  };
}

export function subscribeScreenAudio(cb: () => void): () => void {
  screenAudioListeners.add(cb);
  return () => { screenAudioListeners.delete(cb); };
}

export const getScreenAudioVersion = () => screenAudioVersion;

/** Переключает устройство вывода (динамики/наушники). */
export async function applyOutputDevice(deviceId: string): Promise<void> {
  const r = room;
  if (!r || !deviceId) return;
  // Страховка от «запомнившегося» битого deviceId (например, из другого ПК):
  // ставить несуществующее устройство — звук уходит в пустоту.
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!devices.some((d) => d.kind === 'audiooutput' && d.deviceId === deviceId)) {
      return;
    }
  } catch {
    /* enumerateDevices недоступен — пробуем применить как есть */
  }
  try {
    // LiveKit раскладывает sink по подключённым аудио-элементам
    await (r as unknown as { switchActiveDevice?: (kind: string, id: string) => Promise<boolean> })
      .switchActiveDevice?.('audiooutput', deviceId);
  } catch { /* ignore */ }
  // Усиление >100% идёт через WebAudio — у него свой sink.
  void setOutputBoostSink(deviceId);
  // Резерв: ставим sink напрямую на аудио-элементы (Electron поддерживает setSinkId)
  try {
    document.querySelectorAll('audio').forEach((el) => {
      const anyEl = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
      if (typeof anyEl.setSinkId === 'function') anyEl.setSinkId(deviceId).catch(() => {});
    });
  } catch { /* ignore */ }
}

export async function setMicEnabled(on: boolean) {
  if (!room) return;
  try { await room.localParticipant.setMicrophoneEnabled(on); } catch { /* ignore */ }
}

export async function setCameraEnabled(on: boolean): Promise<boolean> {
  if (!room) return false;
  const preset = getPreset();
  try {
    await room.localParticipant.setCameraEnabled(
      on,
      { resolution: preset.resolution, frameRate: preset.frameRate },
      { videoEncoding: { maxBitrate: preset.cameraBitrate, maxFramerate: preset.frameRate } },
    );
    return true;
  } catch {
    return false;
  }
}

export async function setScreenShareEnabled(on: boolean): Promise<boolean> {
  if (!room) return false;
  const preset = getPreset();
  try {
    if (on && shareSourceId) {
      // getDisplayMedia в main-процессе берёт источник отсюда.
      try { (window as any).electron?.setShareSource?.(shareSourceId); } catch { /* ignore */ }
    }
    await room.localParticipant.setScreenShareEnabled(
      on,
      // restrictOwnAudio — то же для браузера: звук самой страницы (голоса участников) не захватываем
      { audio: getShareAudio() ? { restrictOwnAudio: true } : false, suppressLocalAudioPlayback: false, resolution: preset.resolution },
      {
        // Один качественный слой: иначе adaptiveStream/симулкаст отдают низкое
        // разрешение для маленькой плитки и текст на экране «плывёт».
        simulcast: false,
        screenShareEncoding: { maxBitrate: preset.screenBitrate, maxFramerate: preset.frameRate },
        degradationPreference: 'maintain-resolution',
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** Перезапуск активной демонстрации (смена источника/звука) без потери окна. */
export async function restartScreenShare(): Promise<boolean> {
  if (!room || !room.localParticipant.isScreenShareEnabled) return false;
  await setScreenShareEnabled(false);
  return setScreenShareEnabled(true);
}

/** Применяет новые качество/звук к уже активным камере и демонстрации. */
export async function reapplyMediaQuality(): Promise<void> {
  if (!room) return;
  if (room.localParticipant.isCameraEnabled) {
    await setCameraEnabled(false);
    await setCameraEnabled(true);
  }
  if (room.localParticipant.isScreenShareEnabled) {
    await setScreenShareEnabled(false);
    await setScreenShareEnabled(true);
  }
}

export function isScreenSharing(): boolean {
  return room?.localParticipant.isScreenShareEnabled ?? false;
}

export async function disconnectRoom() {
  manualDisconnect = true;
  clearReconnectTimer();
  reconnectAttempts = 0;
  if (connTimer) { clearTimeout(connTimer); connTimer = null; }
  const r = room;
  room = null;
  currentCreds = null;
  currentVideoWanted = false;
  currentTarget = null;
  currentHandlers = null;
  currentOpts = { video: false };
  screenMuted.clear();
  qualityCache = new Map();
  teardownAudioProcessing();
  teardownRemoteAudio();
  if (!r) return;
  try { await r.disconnect(); } catch { /* ignore */ }
}

export function hasRoom(): boolean {
  return room !== null;
}

export function getRoomCreds(): LiveKitCreds | null {
  return currentCreds;
}

export function isVideoWanted(): boolean {
  return currentVideoWanted;
}

// --- Участники (для групповых звонков) ---

export interface LiveKitParticipantInfo {
  identity: string;
  userId: number | null;
  username: string;
}

/** Список участников комнаты (identity = user_id). */
export function listParticipants(): LiveKitParticipantInfo[] {
  if (!room) return [];
  const out: LiveKitParticipantInfo[] = [];
  room.remoteParticipants.forEach((p) => {
    out.push({
      identity: p.identity,
      userId: Number.isNaN(Number(p.identity)) ? null : Number(p.identity),
      username: p.name || p.identity,
    });
  });
  return out;
}

/** Видео-трек конкретного участника по identity (камера). null, если выкл/не подписан. */
export function getParticipantCameraStream(identity: string): MediaStream | null {
  if (!room) return null;
  const p = room.remoteParticipants.get(identity);
  if (!p) return null;
  const pub = p.getTrackPublication('camera' as never);
  const track = pub?.track;
  if (!track || (pub as unknown as { isMuted?: boolean })?.isMuted) return null;
  return cachedStream(`cam:${identity}`, track.mediaStreamTrack);
}

/** Видео-трек демонстрации экрана конкретного участника. null, если выкл/не подписан. */
export function getParticipantScreenStream(identity: string): MediaStream | null {
  if (!room) return null;
  const p = room.remoteParticipants.get(identity);
  if (!p) return null;
  const pub = p.getTrackPublication('screen_share' as never);
  const track = pub?.track;
  if (!track || (pub as unknown as { isMuted?: boolean })?.isMuted) return null;
  return cachedStream(`screen:${identity}`, track.mediaStreamTrack);
}

/** Список userId, которые сейчас демонстрируют экран. */
export function listScreenSharers(): number[] {
  if (!room) return [];
  const out: number[] = [];
  room.remoteParticipants.forEach((p) => {
    const pub = p.getTrackPublication('screen_share' as never);
    if (pub?.track && !(pub as unknown as { isMuted?: boolean })?.isMuted) {
      const n = Number(p.identity);
      if (!Number.isNaN(n)) out.push(n);
    }
  });
  return out;
}

/** Подписка на изменения участников (появление/уход) для группового UI. */
export function onParticipantsChanged(cb: () => void): () => void {
  if (!room) return () => {};
  const mod = lk;
  if (!mod) return () => {};
  const handler = () => cb();
  room
    .on(mod.RoomEvent.ParticipantConnected, handler)
    .on(mod.RoomEvent.ParticipantDisconnected, handler)
    .on(mod.RoomEvent.TrackSubscribed, handler)
    .on(mod.RoomEvent.TrackUnsubscribed, handler)
    .on(mod.RoomEvent.TrackMuted, handler)
    .on(mod.RoomEvent.TrackUnmuted, handler);
  return () => {
    if (!room) return;
    room
      .off(mod.RoomEvent.ParticipantConnected, handler)
      .off(mod.RoomEvent.ParticipantDisconnected, handler)
      .off(mod.RoomEvent.TrackSubscribed, handler)
      .off(mod.RoomEvent.TrackUnsubscribed, handler)
      .off(mod.RoomEvent.TrackMuted, handler)
      .off(mod.RoomEvent.TrackUnmuted, handler);
  };
}

/**
 * Подписка на активных спикеров (кто говорит прямо сейчас).
 * identities — identity участников (в нашей схеме это String(userId));
 * local/remote — флаги для ЛС-звонка, identities сами по себе — для группового.
 */
export function onSpeakingChanged(cb: (s: { identities: string[]; local: boolean; remote: boolean }) => void): () => void {
  if (!room) return () => {};
  const mod = lk;
  if (!mod) return () => {};
  const emit = () => {
    if (!room) return;
    const me = room.localParticipant?.identity;
    const identities = (room.activeSpeakers || []).map((p) => p.identity);
    cb({
      identities,
      local: !!me && identities.includes(me),
      remote: identities.some((i) => i !== me),
    });
  };
  room.on(mod.RoomEvent.ActiveSpeakersChanged, emit);
  emit();
  return () => {
    room?.off(mod.RoomEvent.ActiveSpeakersChanged, emit);
  };
}

// --- Качество соединения (индикатор связи в UI, как в Discord) ---

export type CallQuality = 'unknown' | 'poor' | 'average' | 'good' | 'excellent';

let qualityCache = new Map<string, CallQuality>();
let qualityEmit: (() => void) | null = null;

function mapQuality(q: unknown): CallQuality {
  switch (q) {
    case 'poor':
    case 'lost':
      return 'poor';
    case 'average':
      return 'average';
    case 'good':
      return 'good';
    default:
      return 'unknown';
  }
}

/** Снимает текущие значения качества (локальный + участники) и рассылает подписчикам. */
function qualitySnapshot() {
  if (!room) return;
  const out = new Map<string, CallQuality>();
  room.remoteParticipants.forEach((p) => {
    out.set(p.identity, mapQuality((p as unknown as { connectionQuality?: string }).connectionQuality));
  });
  const me = room.localParticipant?.identity;
  if (me) {
    out.set(me, mapQuality((room.localParticipant as unknown as { connectionQuality?: string }).connectionQuality));
  }
  qualityCache = out;
  qualityEmit?.();
}

/**
 * Подписка на изменения качества соединения: ключ — identity участника
 * (String(userId)), значение — уровень. Подписываться нужно ПОСЛЕ подключения
 * комнаты; до этого вернёт пустую отписку.
 */
export function onConnectionQuality(cb: (qualities: Record<string, CallQuality>) => void): () => void {
  const r = room;
  const mod = lk;
  if (!r || !mod) return () => {};
  qualityEmit = () => { if (room === r) cb(Object.fromEntries(qualityCache)); };
  qualitySnapshot();
  const handler = () => { if (room === r) qualitySnapshot(); };
  r.on(mod.RoomEvent.ConnectionQualityChanged, handler);
  r.on(mod.RoomEvent.ParticipantConnected, handler);
  r.on(mod.RoomEvent.ParticipantDisconnected, handler);
  return () => {
    if (room === r) qualityEmit = null;
    r?.off(mod.RoomEvent.ConnectionQualityChanged, handler);
    r?.off(mod.RoomEvent.ParticipantConnected, handler);
    r?.off(mod.RoomEvent.ParticipantDisconnected, handler);
  };
}


