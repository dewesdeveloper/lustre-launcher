import { useMemo, useState } from 'react';
import {
  Volume2, Mic, MicOff, Headphones, HeadphoneOff, Video, VideoOff, MonitorUp, MonitorOff,
  Minimize2, Users, Loader2, Lock, UserPlus, MessageSquare,
} from 'lucide-react';
import {
  joinVoiceChannel, leaveVoiceChannel, toggleVoiceMute, toggleVoiceDeaf, toggleVoiceVideo, setVoiceScreenShare,
  membersOf, getRemoteCamera, getRemoteScreen, type VoiceChannelInfo, type VoiceMember,
} from '../../api/voiceChannel';
import { ConnectionBars } from '../callStage';
import { CtlBtn, HangupBtn, PersonTile, StreamTile, gridStyle } from '../call/CallUI';
import ScreenSourcePicker, { type DesktopSource } from '../ScreenSourcePicker';
import { MemberMenu } from './VoiceChannelsPanel';
import { useVoice } from './useVoice';
import { VoiceChatPanel } from './VoiceChatPanel';
import { VoiceInviteDialog } from './VoiceInviteDialog';
import './voice.css';

interface Props {
  communityId: number;
  communityName: string;
  channel: VoiceChannelInfo;
}

type Tile =
  | { key: string; kind: 'user'; m: VoiceMember }
  | { key: string; kind: 'stream'; m: VoiceMember };

/** Голосовой канал: сцена участников (как в Discord), трансляции и панель управления. */
export function VoiceRoomView({ communityId, communityName, channel }: Props) {
  const v = useVoice();
  const com = v.communities[communityId];
  const members = membersOf(communityId, channel.id);
  const here = v.channelId === channel.id && v.status !== 'idle';
  const connecting = here && (v.status === 'connecting' || v.status === 'reconnecting');
  const [focus, setFocus] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [menu, setMenu] = useState<{ m: VoiceMember; x: number; y: number } | null>(null);
  const full = channel.user_limit > 0 && members.length >= channel.user_limit && !here;
  const canJoin = !!com?.canJoin && !!com?.livekit && (!full || !!com?.canManage);

  // плитки: участник + (если транслирует) отдельная плитка трансляции
  const tiles = useMemo<Tile[]>(() => {
    const out: Tile[] = [];
    for (const m of members) {
      if (m.stream) out.push({ key: `s:${m.user_id}`, kind: 'stream', m });
      out.push({ key: `u:${m.user_id}`, kind: 'user', m });
    }
    return out;
  }, [members]);
  const focused = focus ? tiles.find((t) => t.key === focus) ?? null : null;

  const startShare = (src?: DesktopSource) => {
    setPicker(false);
    void setVoiceScreenShare(true, src?.id);
  };
  const onShareClick = () => {
    if (v.sharing) { void setVoiceScreenShare(false); return; }
    if ((window as any).electron?.getDesktopSources) setPicker(true);
    else startShare();
  };

  return (
    <div className="flex flex-col min-h-0 h-full bg-[var(--bg)] border border-[var(--line)]">
      {/* шапка канала */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-[var(--line)] bg-[var(--panel)] shrink-0">
        <Volume2 size={18} className={here ? 'text-[var(--green2)]' : 'text-pearl/72'} />
        <span className="tl-head text-[11px] uppercase tracking-[0.14em] text-white truncate">{channel.name}</span>
        <span className="flex items-center gap-1 tl-term text-[15px] tl-muted">
          <Users size={13} /> {members.length}{channel.user_limit > 0 ? `/${channel.user_limit}` : ''}
        </span>
        <span className="flex-1" />
        {here && v.status === 'connected' && <ConnectionBars quality={v.quality} />}
        {connecting && <span className="flex items-center gap-1.5 tl-term text-[14px] text-amber-300"><Loader2 size={13} className="animate-spin" />{v.status === 'reconnecting' ? 'Переподключение…' : 'Подключение…'}</span>}
        {focused && (
          <button onClick={() => setFocus(null)} title="Сетка" className="text-pearl/72 hover:text-accent"><Minimize2 size={16} /></button>
        )}
        {com?.canJoin && (
          <>
            <button onClick={() => setInviting(true)} title="Пригласить друзей" aria-label="Пригласить друзей" className="text-pearl/72 hover:text-accent"><UserPlus size={16} /></button>
            <button onClick={() => setChatOpen((o) => !o)} title={chatOpen ? 'Скрыть чат канала' : 'Показать чат канала'} aria-label="Чат канала" aria-pressed={chatOpen} className={chatOpen ? 'text-accent' : 'text-pearl/72 hover:text-accent'}><MessageSquare size={16} /></button>
          </>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* сцена */}
      <div className="relative flex-1 min-h-0 p-3 vc-stage">
        {!here && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center px-6">
            <span className="w-20 h-20 flex items-center justify-center border border-[var(--line-2)] bg-[var(--panel)] text-accent shadow-[var(--glow)]">
              {full ? <Lock size={32} /> : <Volume2 size={34} />}
            </span>
            <div>
              <p className="tl-head text-[13px] uppercase tracking-[0.2em] text-white">{channel.name}</p>
              <p className="tl-term text-[16px] tl-muted mt-1">
                {members.length ? `Сейчас в канале: ${members.length}` : 'В канале никого нет — зайдите первым'}
              </p>
            </div>
            {members.length > 0 && (
              <div className="flex -space-x-2">
                {members.slice(0, 8).map((m) => (
                  <img key={m.user_id} src={m.user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.user_id}`} title={m.user.display_name || m.user.username}
                    className={`w-10 h-10 object-cover border-2 border-[var(--bg)] ${v.speaking.includes(String(m.user_id)) ? 'outline outline-2 outline-[var(--green2)]' : ''}`} alt="" />
                ))}
              </div>
            )}
            <button
              onClick={() => void joinVoiceChannel(channel, communityName)}
              disabled={!canJoin}
              className="tl-btn solid px-6"
            >
              <Volume2 size={14} /> {full ? 'Канал заполнен' : 'Присоединиться'}
            </button>
            {!com?.canJoin && <p className="tl-term text-[15px] tl-muted">Голосовые каналы доступны участникам сообщества</p>}
          </div>
        )}

        {here && (
          focused ? (
            <div className="h-full flex flex-col gap-3">
              <div className="flex-1 min-h-0">
                <StageTile tile={focused} v={v} big onFocus={() => setFocus(null)} onMenu={(m, x, y) => setMenu({ m, x, y })} />
              </div>
              <div className="flex gap-2 h-[110px] shrink-0 overflow-x-auto custom-scrollbar">
                {tiles.filter((t) => t.key !== focused.key).map((t) => (
                  <div key={t.key} className="w-[190px] shrink-0 h-full">
                    <StageTile tile={t} v={v} onFocus={() => setFocus(t.key)} onMenu={(m, x, y) => setMenu({ m, x, y })} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className={`h-full grid gap-3 ${tiles.length <= 1 ? 'max-w-[760px] mx-auto w-full' : ''}`}
              style={gridStyle(tiles.length)}
            >
              {tiles.map((t) => (
                <div key={t.key} className="min-h-0 min-w-0">
                  <StageTile tile={t} v={v} onFocus={() => setFocus(t.key)} onMenu={(m, x, y) => setMenu({ m, x, y })} />
                </div>
              ))}
            </div>
          )
        )}

        {v.notice && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 px-4 py-2 bg-[#0d0a14] border border-[var(--line-2)] shadow-[var(--glow)] tl-term text-[15px] text-pearl vc-pop">
            {v.notice}
          </div>
        )}
      </div>

      {/* панель управления */}
      {here && (
        <div className="flex items-center justify-center gap-2 h-16 border-t border-[var(--line)] bg-[var(--panel)] shrink-0">
          <CtlBtn
            on={!v.selfMute && !v.serverMute}
            danger={v.selfMute || v.serverMute}
            title={v.serverMute ? 'Микрофон выключен модератором' : v.selfMute ? 'Включить микрофон' : 'Выключить микрофон'}
            onClick={toggleVoiceMute}
          >
            {v.selfMute || v.serverMute ? <MicOff size={19} /> : <Mic size={19} />}
          </CtlBtn>
          <CtlBtn on={!v.selfDeaf} danger={v.selfDeaf} title={v.selfDeaf ? 'Включить звук' : 'Выключить звук'} onClick={toggleVoiceDeaf}>
            {v.selfDeaf ? <HeadphoneOff size={19} /> : <Headphones size={19} />}
          </CtlBtn>
          <span className="w-px h-8 bg-[var(--line)] mx-1" />
          <CtlBtn on={v.video} accent={v.video} title={v.video ? 'Выключить камеру' : 'Включить камеру'} onClick={() => void toggleVoiceVideo()} disabled={v.status !== 'connected'}>
            {v.video ? <Video size={19} /> : <VideoOff size={19} />}
          </CtlBtn>
          <CtlBtn on={v.sharing} accent={v.sharing} title={v.sharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'} onClick={onShareClick} disabled={v.status !== 'connected'}>
            {v.sharing ? <MonitorOff size={19} /> : <MonitorUp size={19} />}
          </CtlBtn>
          <span className="w-px h-8 bg-[var(--line)] mx-1" />
          <HangupBtn title="Отключиться" onClick={() => void leaveVoiceChannel()} label="Выйти" />
        </div>
      )}

      </div>
      {chatOpen && com?.canJoin && <VoiceChatPanel channelId={channel.id} canManage={!!com?.canManage} />}
      </div>

      {inviting && (
        <VoiceInviteDialog
          channelId={channel.id}
          channelName={channel.name}
          memberIds={members.map((m) => m.user_id)}
          onClose={() => setInviting(false)}
        />
      )}
      {picker && <ScreenSourcePicker open onClose={() => setPicker(false)} onPick={startShare} />}
      {menu && (
        <MemberMenu
          x={menu.x} y={menu.y} m={menu.m}
          isMe={menu.m.user_id === v.selfId}
          canManage={!!com?.canManage}
          channels={(com?.channels ?? []).filter((c) => c.id !== menu.m.channel_id)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function StageTile({ tile, v, big, onFocus, onMenu }: {
  tile: Tile; v: ReturnType<typeof useVoice>; big?: boolean; onFocus: () => void; onMenu: (m: VoiceMember, x: number, y: number) => void;
}) {
  const m = tile.m;
  const me = m.user_id === v.selfId;
  const name = m.user.display_name || m.user.username;
  void v.tracksVersion; // перерисовка при смене удалённых треков
  if (tile.kind === 'stream') {
    return (
      <StreamTile
        label={me ? 'Ваш экран' : `Экран: ${name}`}
        get={() => (me ? v.localScreen : getRemoteScreen(m.user_id))}
        big={big}
        audioIdentity={me ? undefined : String(m.user_id)}
        onClick={onFocus}
        onContextMenu={(x, y) => onMenu(m, x, y)}
      />
    );
  }
  return (
    <PersonTile
      name={name}
      avatarUrl={m.user.avatar_url}
      me={me}
      speaking={me ? v.localSpeaking : v.speaking.includes(String(m.user_id))}
      muted={m.self_mute}
      forceMuted={m.server_mute}
      deaf={m.self_deaf}
      camera={m.video ? () => (me ? v.localCam : getRemoteCamera(m.user_id)) : null}
      big={big}
      onClick={onFocus}
      onContextMenu={(x, y) => onMenu(m, x, y)}
    />
  );
}
