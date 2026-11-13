import { useEffect, useState } from 'react';
import { X, Camera, Loader2, Pencil, Check, UserPlus, LogOut, Crown, MessageSquare, UserMinus, Phone } from 'lucide-react';
import api from '../../../api';
import { addGroupMembers, removeGroupMember, updateGroup } from '../../../api/groups';
import { useDialog } from '../../../components/Dialogs';
import ProBadge from '../../../components/ProBadge';
import type { ChatController } from '../useChatController';
import { nameColor, pluralRu } from '../model';
import { formatLastSeen } from './chatUtils';
import { ChatAvatar } from './ui';

/** Правая панель группы (как «Информация о группе» в Telegram). */
export function GroupInfoPanel({ ctl, onClose, onCall }: { ctl: ChatController; onClose: () => void; onCall: () => void }) {
  const item = ctl.activeItem;
  const dlg = useDialog();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item?.title ?? '');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState<any[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);

  useEffect(() => { setName(item?.title ?? ''); setEditing(false); setAdding(false); }, [item?.key, item?.title]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item || item.ref.kind !== 'group') return null;
  const groupId = item.ref.id;
  const isOwner = item.ownerId === ctl.myId;
  const members = [...(ctl.thread?.members ?? [])].sort((a, b) => {
    const rank = (u: typeof a) => (u.is_owner ? 0 : u.id === ctl.myId ? 1 : ctl.onlineIds.has(u.id) ? 2 : 3);
    return rank(a) - rank(b);
  });

  const fail = (e: any, title: string) => dlg.alert({ title, message: e?.response?.data?.error || 'Попробуйте ещё раз', danger: true });

  const saveName = async () => {
    const v = name.trim();
    if (!v || v === item.title) { setEditing(false); return; }
    setBusy(true);
    try { await updateGroup(groupId, { name: v }); await ctl.refreshGroups(); setEditing(false); }
    catch (e) { fail(e, 'Не удалось переименовать'); }
    finally { setBusy(false); }
  };

  const uploadAvatar = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post(`/upload/group?group_id=${groupId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await updateGroup(groupId, { avatar_url: res.data.url });
      await ctl.refreshGroups();
    } catch (e) { fail(e, 'Не удалось загрузить аватар'); }
    finally { setBusy(false); }
  };

  const openAdd = async () => {
    setAdding(true);
    setPicked([]);
    if (friends === null) {
      try { setFriends((await api.get('/friends/list')).data || []); } catch { setFriends([]); }
    }
  };

  const confirmAdd = async () => {
    if (!picked.length) { setAdding(false); return; }
    setBusy(true);
    try { await addGroupMembers(groupId, picked); await ctl.loadMembers(groupId); await ctl.refreshGroups(); setAdding(false); }
    catch (e) { fail(e, 'Не удалось добавить участников'); }
    finally { setBusy(false); }
  };

  const kick = async (userId: number, label: string) => {
    const self = userId === ctl.myId;
    const ok = await dlg.confirm({
      title: self ? 'Покинуть группу' : 'Исключить участника',
      message: self ? `Вы выйдете из «${item.title}». Вернуться можно только по приглашению.` : `Исключить ${label} из группы?`,
      confirmText: self ? 'Выйти' : 'Исключить',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeGroupMember(groupId, userId);
      if (self) { ctl.setActive(null); await ctl.refreshGroups(); onClose(); }
      else { await ctl.loadMembers(groupId); await ctl.refreshGroups(); }
    } catch (e) { fail(e, 'Не удалось'); }
  };

  const memberIds = new Set(members.map((m) => m.id));
  // /friends/list отдаёт дружбы с friend_details (как в CreateGroupModal)
  const candidates = (friends ?? []).map((f: any) => f.friend_details).filter(Boolean).map((fd: any) => ({
    id: fd.id as number,
    username: fd.username as string,
    display_name: fd.profile?.display_name as string | undefined,
    avatar_url: fd.profile?.avatar_url as string | undefined,
  })).filter((f) => f.id && !memberIds.has(f.id));

  return (
    <aside className="w-[300px] shrink-0 border-l border-[var(--line)] bg-[var(--panel)] flex flex-col min-h-0 lc-pop max-[1080px]:absolute max-[1080px]:right-0 max-[1080px]:top-0 max-[1080px]:bottom-0 max-[1080px]:z-40 max-[1080px]:shadow-[-16px_0_40px_rgba(0,0,0,.6)]">
      <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--line)] shrink-0">
        <span className="tl-head text-[10px] uppercase tracking-[0.18em] text-pearl/80">Информация</span>
        <button onClick={onClose} className="text-pearl/70 hover:text-white" title="Закрыть"><X size={16} /></button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col items-center px-4 pt-5 pb-4 border-b border-[var(--line)]">
          <label className="relative cursor-pointer group/av" title="Сменить аватар">
            <ChatAvatar src={item.avatarUrl} size={92} group />
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 group-hover/av:opacity-100 transition-opacity">
              {busy ? <Loader2 size={20} className="animate-spin text-white" /> : <Camera size={20} className="text-white" />}
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ''; }} />
          </label>

          {editing ? (
            <div className="flex items-center gap-1 mt-3 w-full">
              <input
                autoFocus
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditing(false); setName(item.title); } }}
                className="tl-field flex-1 h-8 tl-term text-[15px]"
              />
              <button onClick={saveName} disabled={busy} className="w-8 h-8 flex items-center justify-center bg-accent text-black"><Check size={15} /></button>
            </div>
          ) : (
            <p className="flex items-center gap-2 mt-3 tl-head text-[12px] uppercase tracking-[0.14em] text-white text-center">
              {item.title}
              {isOwner && (
                <button onClick={() => setEditing(true)} className="text-pearl/70 hover:text-accent" title="Переименовать"><Pencil size={12} /></button>
              )}
            </p>
          )}
          <p className="tl-term text-[15px] tl-muted mt-1">
            {members.length} {pluralRu(members.length, 'участник', 'участника', 'участников')}
          </p>

          <div className="grid grid-cols-2 gap-2 w-full mt-4">
            <button onClick={onCall} className="flex flex-col items-center gap-1.5 py-2.5 border border-[var(--line)] bg-white/[0.03] hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.10)] transition-colors">
              <Phone size={15} className="text-pearl/70" />
              <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/60">Звонок</span>
            </button>
            <button onClick={openAdd} className="flex flex-col items-center gap-1.5 py-2.5 border border-[var(--line)] bg-white/[0.03] hover:border-[var(--line-2)] hover:bg-[rgb(var(--accent-rgb)/.10)] transition-colors">
              <UserPlus size={15} className="text-pearl/70" />
              <span className="tl-head text-[10px] uppercase tracking-[0.14em] text-pearl/60">Добавить</span>
            </button>
          </div>
        </div>

        {adding ? (
          <div className="px-2 py-2">
            <p className="px-2 pb-2 tl-head text-[10px] uppercase tracking-[0.18em] text-pearl/70">Выберите друзей</p>
            {friends === null && <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-pearl/70" /></div>}
            {friends !== null && candidates.length === 0 && <p className="px-2 py-4 tl-term text-[15px] tl-muted">Все друзья уже в группе</p>}
            {candidates.map((f) => {
              const on = picked.includes(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== f.id) : [...p, f.id]))}
                  className={`w-full flex items-center gap-3 px-2 py-1.5 text-left ${on ? 'bg-[rgb(var(--accent-rgb)/.14)]' : 'hover:bg-white/[0.04]'}`}
                >
                  <ChatAvatar src={f.avatar_url} size={34} />
                  <span className="flex-1 min-w-0 tl-head text-[10px] uppercase tracking-[0.1em] text-pearl/85 truncate">{f.display_name || f.username}</span>
                  <span className={`w-4 h-4 border flex items-center justify-center ${on ? 'bg-accent border-accent text-black' : 'border-[var(--line-2)]'}`}>{on && <Check size={11} />}</span>
                </button>
              );
            })}
            <div className="flex gap-2 px-2 pt-3">
              <button onClick={() => setAdding(false)} className="tl-btn ghost flex-1">Отмена</button>
              <button onClick={confirmAdd} disabled={busy || !picked.length} className="tl-btn solid flex-1">Добавить{picked.length ? ` (${picked.length})` : ''}</button>
            </div>
          </div>
        ) : (
          <div className="py-2">
            <p className="px-4 pb-1 tl-head text-[10px] uppercase tracking-[0.18em] text-pearl/70">Участники</p>
            {members.map((u) => {
              const online = u.id === ctl.myId || ctl.onlineIds.has(u.id);
              const playing = ctl.playing.get(u.id);
              const label = u.display_name || u.username;
              const ls = formatLastSeen(ctl.lastSeen.get(u.id));
              return (
                <div key={u.id} className="group/m flex items-center gap-3 px-4 py-1.5 hover:bg-white/[0.035]">
                  <ChatAvatar src={u.avatar_url} size={36} online={online && u.id !== ctl.myId} playing={!!playing} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="tl-head text-[10px] uppercase tracking-[0.1em] truncate" style={{ color: nameColor(u.id) }}>{label}</span>
                      {u.is_pro && <ProBadge size="sm" />}
                      {u.is_owner && <Crown size={11} className="text-amber-300 shrink-0" />}
                    </span>
                    <span className="block tl-term text-[13px] leading-tight">
                      {u.id === ctl.myId ? <span className="tl-muted">это вы</span>
                        : playing ? <span className="text-accent">играет в {playing}</span>
                        : online ? <span className="text-[var(--green2)]">в сети</span>
                        : <span className="tl-muted">{ls ? `был(а) ${ls}` : 'не в сети'}</span>}
                    </span>
                  </span>
                  {u.id !== ctl.myId && (
                    <button onClick={() => ctl.openDmWith(u.id)} title="Написать" className="opacity-0 group-hover/m:opacity-100 text-pearl/70 hover:text-accent"><MessageSquare size={14} /></button>
                  )}
                  {isOwner && u.id !== ctl.myId && (
                    <button onClick={() => kick(u.id, label)} title="Исключить" className="opacity-0 group-hover/m:opacity-100 text-pearl/70 hover:text-red-400"><UserMinus size={14} /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isOwner && (
        <button onClick={() => kick(ctl.myId, '')} className="flex items-center justify-center gap-2 h-11 border-t border-[var(--line)] tl-head text-[10px] uppercase tracking-[0.16em] text-red-400/80 hover:text-red-300 hover:bg-red-500/10 shrink-0">
          <LogOut size={14} /> Покинуть группу
        </button>
      )}
    </aside>
  );
}
