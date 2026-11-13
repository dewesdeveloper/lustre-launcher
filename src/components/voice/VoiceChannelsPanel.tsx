import { useEffect, useRef, useState } from 'react';
import {
  Volume2, Plus, MicOff, HeadphoneOff, Video, Settings2, Trash2, Users, Lock, ArrowRightLeft, UserRoundX, Mic, Crown,
} from 'lucide-react';
import {
  joinVoiceChannel, moderateVoice, membersOf, createVoiceChannel, updateVoiceChannel, deleteVoiceChannel,
  setMemberVolume, getMemberVolume, getMemberScreenAudio, setMemberScreenVolume, type VoiceChannelInfo, type VoiceMember,
} from '../../api/voiceChannel';
import { useDialog } from '../Dialogs';
import { useVoice } from './useVoice';

interface Props {
  communityId: number;
  communityName: string;
  ownerId: number;
  selectedId: number | null;
  onSelect: (channelId: number) => void;
}

/**
 * Список голосовых каналов сообщества (левая колонка, как в Discord): кто сидит в каждом
 * канале, мьют/deafen/камера/стрим, говорящие подсвечены. Клик — зайти; ПКМ по участнику —
 * громкость и модерация, по каналу — настройки (владелец).
 */
export function VoiceChannelsPanel({ communityId, communityName, ownerId, selectedId, onSelect }: Props) {
  const v = useVoice();
  const dlg = useDialog();
  const com = v.communities[communityId];
  const [menu, setMenu] = useState<
    | { kind: 'member'; m: VoiceMember; x: number; y: number }
    | { kind: 'channel'; ch: VoiceChannelInfo; x: number; y: number }
    | null
  >(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const join = (ch: VoiceChannelInfo) => {
    onSelect(ch.id);
    if (!com?.canJoin) return;
    void joinVoiceChannel(ch, communityName);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) { setCreating(false); return; }
    try { await createVoiceChannel(communityId, name); setNewName(''); setCreating(false); }
    catch (e: any) { dlg.alert({ title: 'Не удалось создать канал', message: e?.response?.data?.error || 'Ошибка', danger: true }); }
  };

  if (!com?.loaded) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-white/[0.04] border border-[var(--line)] animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="tl-head text-[10px] uppercase tracking-[0.2em] text-pearl/72">Голосовые каналы</span>
        {com.canManage && (
          <button onClick={() => setCreating(true)} title="Создать канал" className="text-pearl/70 hover:text-accent transition-colors"><Plus size={15} /></button>
        )}
      </div>

      {!com.livekit && (
        <p className="mx-3 mb-2 px-2 py-1.5 border border-amber-400/30 bg-amber-400/10 tl-term text-[14px] text-amber-200/90">
          Сервер звонков не настроен — подключение к каналам недоступно
        </p>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3">
        {com.channels.map((ch) => {
          const members = membersOf(communityId, ch.id);
          const here = v.channelId === ch.id && v.status !== 'idle';
          const selected = selectedId === ch.id;
          const full = ch.user_limit > 0 && members.length >= ch.user_limit;
          return (
            <div key={ch.id} className="mb-0.5">
              <button
                onClick={() => join(ch)}
                onContextMenu={(e) => { if (!com.canManage) return; e.preventDefault(); setMenu({ kind: 'channel', ch, x: e.clientX, y: e.clientY }); }}
                title={full && !com.canManage ? 'Канал заполнен' : here ? 'Вы в этом канале' : 'Подключиться'}
                className={`group/ch w-full flex items-center gap-2 px-2 h-8 text-left transition-colors border-l-2 ${
                  selected ? 'bg-[rgb(var(--accent-rgb)/.14)] border-accent text-white' : 'border-transparent text-pearl/60 hover:text-pearl hover:bg-white/[0.04]'
                }`}
              >
                {full && !here ? <Lock size={15} className="shrink-0 text-pearl/70" /> : <Volume2 size={16} className={`shrink-0 ${here ? 'text-[var(--green2)]' : ''}`} />}
                <span className="tl-term text-[16px] truncate flex-1">{ch.name}</span>
                {ch.user_limit > 0 && (
                  <span className="tl-num text-[10px] px-1 border border-[var(--line)] text-pearl/55">{String(members.length).padStart(2, '0')}/{String(ch.user_limit).padStart(2, '0')}</span>
                )}
                {com.canManage && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setMenu({ kind: 'channel', ch, x: e.clientX, y: e.clientY }); }}
                    className="opacity-0 group-hover/ch:opacity-100 text-pearl/70 hover:text-accent"
                    title="Настройки канала"
                  >
                    <Settings2 size={13} />
                  </span>
                )}
              </button>

              {members.map((m) => {
                // себя LiveKit кладёт в activeSpeakers не всегда — берём localSpeaking
                const speaking = m.user_id === v.selfId ? v.localSpeaking && v.channelId === m.channel_id : v.speaking.includes(String(m.user_id));
                return (
                  <div
                    key={m.user_id}
                    onContextMenu={(e) => { e.preventDefault(); setMenu({ kind: 'member', m, x: e.clientX, y: e.clientY }); }}
                    className="flex items-center gap-2 pl-7 pr-2 h-7 hover:bg-white/[0.035] cursor-default"
                  >
                    <span className={`w-5 h-5 shrink-0 border transition-shadow ${speaking ? 'border-[var(--green2)] shadow-[0_0_0_1px_var(--green2),0_0_8px_rgb(52_211_153/.7)]' : 'border-[var(--line)]'}`}>
                      <img src={m.user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.user_id}`} alt="" className="w-full h-full object-cover" />
                    </span>
                    <span className={`tl-term text-[15px] truncate flex-1 ${speaking ? 'text-white' : 'text-pearl/70'}`}>
                      {m.user.display_name || m.user.username}
                    </span>
                    {m.user_id === ownerId && <Crown size={11} className="text-amber-300/80 shrink-0" />}
                    {m.stream && <span className="tl-head text-[10px] px-1 py-px bg-red-600 text-white tracking-[0.1em] shrink-0">LIVE</span>}
                    {m.video && <Video size={12} className="text-pearl/72 shrink-0" />}
                    {(m.server_mute || m.self_mute) && <MicOff size={12} className={`shrink-0 ${m.server_mute ? 'text-red-400' : 'text-pearl/72'}`} />}
                    {m.self_deaf && <HeadphoneOff size={12} className="text-pearl/72 shrink-0" />}
                  </div>
                );
              })}
            </div>
          );
        })}

        {creating && (
          <div className="flex items-center gap-2 px-2 h-9 border border-[var(--line-2)] bg-black/30 mt-1">
            <Volume2 size={15} className="text-pearl/72 shrink-0" />
            <input
              autoFocus
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
              onBlur={create}
              placeholder="Название канала"
              className="flex-1 bg-transparent outline-none tl-term text-[16px] text-pearl placeholder:text-pearl/60"
            />
          </div>
        )}

        {com.channels.length === 0 && !creating && (
          <p className="px-2 py-4 tl-term text-[15px] tl-muted">Каналов пока нет</p>
        )}
      </div>

      {menu?.kind === 'member' && (
        <MemberMenu
          x={menu.x} y={menu.y} m={menu.m}
          isMe={menu.m.user_id === v.selfId}
          canManage={!!com.canManage}
          channels={com.channels.filter((c) => c.id !== menu.m.channel_id)}
          onClose={() => setMenu(null)}
        />
      )}
      {menu?.kind === 'channel' && (
        <ChannelMenu
          x={menu.x} y={menu.y} ch={menu.ch}
          onClose={() => setMenu(null)}
          onRename={async () => {
            setMenu(null);
            const name = window.prompt('Новое название канала', menu.ch.name);
            if (name && name.trim() && name.trim() !== menu.ch.name) {
              try { await updateVoiceChannel(menu.ch, { name: name.trim() }); }
              catch (e: any) { dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось переименовать', danger: true }); }
            }
          }}
          onLimit={async (limit) => {
            setMenu(null);
            try { await updateVoiceChannel(menu.ch, { user_limit: limit }); }
            catch (e: any) { dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось сохранить', danger: true }); }
          }}
          onDelete={async () => {
            setMenu(null);
            const ok = await dlg.confirm({ title: 'Удалить канал', message: `Удалить «${menu.ch.name}»? Все, кто в нём сидит, будут отключены.`, confirmText: 'Удалить', danger: true });
            if (ok) {
              try { await deleteVoiceChannel(menu.ch); }
              catch (e: any) { dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось удалить', danger: true }); }
            }
          }}
        />
      )}
    </div>
  );
}

function useOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return ref;
}

const menuBox = 'fixed z-[95] w-[230px] bg-[#0d0a14] border border-[var(--line)] shadow-[0_8px_28px_rgba(0,0,0,.6)] py-1';
const row = 'w-full flex items-center gap-2.5 px-3 py-[7px] tl-term text-[15px] text-pearl/85 hover:bg-[rgb(var(--accent-rgb)/.16)] hover:text-white transition-colors text-left';

export function MemberMenu({ x, y, m, isMe, canManage, channels, onClose }: {
  x: number; y: number; m: VoiceMember; isMe: boolean; canManage: boolean; channels: VoiceChannelInfo[]; onClose: () => void;
}) {
  const ref = useOutside(onClose);
  const [vol, setVol] = useState(() => getMemberVolume(m.user_id));
  const [screenVol, setScreenVol] = useState(() => getMemberScreenAudio(m.user_id).volume);
  const screenHasAudio = !isMe && m.stream && getMemberScreenAudio(m.user_id).has;
  const [moving, setMoving] = useState(false);
  return (
    <div ref={ref} style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 300) }} className={menuBox}>
      <p className="px-3 pt-1 pb-2 tl-head text-[10px] uppercase tracking-[0.14em] text-white truncate">{m.user.display_name || m.user.username}</p>
      {!isMe && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between tl-term text-[14px] text-pearl/60 mb-1">
            <span>Громкость</span><span className="tl-num text-[10px] text-accent">{Math.round(vol * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={200} step={5} value={Math.round(vol * 100)}
            onChange={(e) => { const nv = Number(e.target.value) / 100; setVol(nv); setMemberVolume(m.user_id, nv); }}
            className="w-full accent-[var(--pink)]"
          />
        </div>
      )}
      {screenHasAudio && (
        <div className="px-3 pb-2">
          <div className="flex items-center justify-between tl-term text-[14px] text-pearl/60 mb-1">
            <span>Громкость трансляции</span><span className="tl-num text-[10px] text-accent">{Math.round(screenVol * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={200} step={5} value={Math.round(screenVol * 100)}
            aria-label="Громкость трансляции"
            onChange={(e) => { const nv = Number(e.target.value) / 100; setScreenVol(nv); setMemberScreenVolume(m.user_id, nv); }}
            className="w-full accent-[var(--pink)]"
          />
        </div>
      )}
      {canManage && (
        <>
          <div className="h-px bg-[var(--line)] my-1" />
          <button className={row} onClick={() => { moderateVoice(m.user_id, m.server_mute ? 'unmute' : 'mute'); onClose(); }}>
            {m.server_mute ? <Mic size={14} className="text-pearl/72" /> : <MicOff size={14} className="text-pearl/72" />}
            {m.server_mute ? 'Вернуть микрофон' : 'Выключить микрофон'}
          </button>
          {channels.length > 0 && (
            <button className={row} onClick={() => setMoving((s) => !s)}>
              <ArrowRightLeft size={14} className="text-pearl/72" /> Переместить в…
            </button>
          )}
          {moving && channels.map((c) => (
            <button key={c.id} className={`${row} pl-9`} onClick={() => { moderateVoice(m.user_id, 'move', c.id); onClose(); }}>
              <Volume2 size={13} className="text-pearl/70" /> {c.name}
            </button>
          ))}
          <button className={`${row} !text-red-400/90`} onClick={() => { moderateVoice(m.user_id, 'disconnect'); onClose(); }}>
            <UserRoundX size={14} /> Отключить от канала
          </button>
        </>
      )}
      {!canManage && isMe && <p className="px-3 pb-2 tl-term text-[14px] tl-muted">Это вы</p>}
    </div>
  );
}

function ChannelMenu({ x, y, ch, onClose, onRename, onLimit, onDelete }: {
  x: number; y: number; ch: VoiceChannelInfo; onClose: () => void;
  onRename: () => void; onLimit: (n: number) => void; onDelete: () => void;
}) {
  const ref = useOutside(onClose);
  const limits = [0, 2, 4, 5, 8, 10, 15, 25];
  return (
    <div ref={ref} style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 260) }} className={menuBox}>
      <p className="px-3 pt-1 pb-2 tl-head text-[10px] uppercase tracking-[0.14em] text-white truncate">{ch.name}</p>
      <button className={row} onClick={onRename}><Settings2 size={14} className="text-pearl/72" /> Переименовать</button>
      <div className="px-3 py-1.5">
        <p className="flex items-center gap-2 tl-term text-[14px] text-pearl/60 mb-1.5"><Users size={13} /> Лимит участников</p>
        <div className="flex flex-wrap gap-1">
          {limits.map((n) => (
            <button
              key={n}
              onClick={() => onLimit(n)}
              className={`tl-num text-[10px] px-1.5 h-6 border ${ch.user_limit === n ? 'bg-accent text-black border-accent' : 'border-[var(--line)] text-pearl/70 hover:border-[var(--line-2)]'}`}
            >
              {n === 0 ? '∞' : n}
            </button>
          ))}
        </div>
      </div>
      <div className="h-px bg-[var(--line)] my-1" />
      <button className={`${row} !text-red-400/90`} onClick={onDelete}><Trash2 size={14} /> Удалить канал</button>
    </div>
  );
}

