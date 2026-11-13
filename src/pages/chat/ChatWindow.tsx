import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, X, Forward, Trash2, Copy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import { useProUpgradeDialog } from '../../components/ProUpgradeDialog';
import { startCall } from '../../api/call';
import { joinGroupCall, startGroupCall } from '../../api/groupCall';
import { useGroupActiveCall } from '../../api/groupCallPresence';
import type { ConversationMediaKind } from '../../api/chat';
import { useChatController } from './useChatController';
import { useProLimits } from '../../api/proLimits';
import { type ChatItem, type Msg, pluralRu } from './model';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatTitleBar, ThreadHeader, PinnedBar, ChatSearchBar } from './components/ThreadHeader';
import { GroupCallBanner } from './components/GroupCallBanner';
import { MessageFeed } from './components/MessageFeed';
import { Composer, AttachDialog, type ComposerMode } from './components/Composer';
import { MessageContextMenu } from './components/MessageContextMenu';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { ForwardPickerDialog } from './components/ForwardPickerDialog';
import CreateGroupModal from './components/CreateGroupModal';
import { ChatProfilePanel } from './components/ChatProfilePanel';
import { ChatMediaGallery } from './components/ChatMediaGallery';
import { GroupInfoPanel } from './components/GroupInfoPanel';
import { MediaViewer } from './components/MediaViewer';
import { isSearchHotkey } from '../../utils/searchHotkey';
import './chat.css';

type Deleting =
  | { kind: 'messages'; ids: number[] }
  | { kind: 'chat'; item: ChatItem };

/**
 * Окно сообщений в духе Telegram Desktop: список чатов с папками и поиском, лента с
 * подгрузкой истории, реакциями, ответами, закрепами и поиском по чату.
 * Состояние и WS — в useChatController, здесь только компоновка и диалоги.
 * embedded — чат внутри другого экрана (игровой оверлей): без оконной шапки, по высоте
 * родителя; targetUserId — открыть диалог с этим пользователем (targetNonce — повторно).
 */
export default function ChatWindow({ embedded = false, targetUserId, targetNonce = 0 }: { embedded?: boolean; targetUserId?: number; targetNonce?: number } = {}) {
  const { user } = useAuth();
  const me = useMemo(() => ({
    id: user?.id ?? 0,
    username: user?.username || 'me',
    display_name: (user?.profile as any)?.display_name || user?.username,
    avatar_url: (user?.profile as any)?.avatar_url,
  }), [user]);
  const ctl = useChatController(me);
  // длина сообщения: 4096, с Lustre Pro — 32 768
  const proLimits = useProLimits();
  const [searchParams] = useSearchParams();
  const dlg = useDialog();
  const offerPro = useProUpgradeDialog();
  const electron = (window as any).electron;

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [menu, setMenu] = useState<{ msg: Msg; x: number; y: number } | null>(null);
  const [mode, setMode] = useState<ComposerMode>({ kind: 'none' });
  const [forwarding, setForwarding] = useState<number[] | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [attach, setAttach] = useState<File[] | null>(null);
  const [viewer, setViewer] = useState<Msg | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [mediaGallery, setMediaGallery] = useState<ConversationMediaKind | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const item = ctl.activeItem;
  const thread = ctl.thread;
  const isGroup = item?.ref.kind === 'group';
  const activeCall = useGroupActiveCall(item?.ref.kind === 'group' ? item.ref.id : null);

  // смена чата — сбрасываем локальные режимы
  useEffect(() => {
    setSelected(new Set());
    setMenu(null);
    setMode({ kind: 'none' });
    setSearchOpen(false);
    setSearchQuery('');
    setMediaGallery(null);
    if (!isGroup) setInfoOpen(false);
  }, [ctl.activeKey, isGroup]);

  // открыть диалог по ?user= и по IPC из главного окна
  const targetUser = Number(targetUserId || searchParams.get('user'));
  useEffect(() => { if (targetUser) ctl.openDmWith(targetUser).catch(() => {}); }, [targetUser, targetNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const off = electron?.onChatTarget?.((id: number) => { if (Number(id)) ctl.openDmWith(Number(id)).catch(() => {}); });
    return () => { if (typeof off === 'function') off(); };
  }, [ctl.openDmWith]); // eslint-disable-line react-hooks/exhaustive-deps

  // «пульс» открытого диалога или группы — главное окно не показывает тосты по ним
  useEffect(() => {
    const beat = () => {
      if (ctl.active?.kind === 'dm') localStorage.setItem('lh_active_chat', JSON.stringify({ conv: ctl.active.id, ts: Date.now() }));
      else if (ctl.active?.kind === 'group') localStorage.setItem('lh_active_chat', JSON.stringify({ group: ctl.active.id, ts: Date.now() }));
    };
    beat();
    const t = setInterval(beat, 5000);
    return () => clearInterval(t);
  }, [ctl.active]);

  // горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isSearchHotkey(e) && ctl.active) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        if (selected.size) setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl.active, selected.size]);

  const senderName = useCallback((id: number) => {
    if (id === ctl.myId) return 'Вы';
    const u = thread?.members.find((x) => x.id === id);
    if (u) return u.display_name || u.username;
    return item?.ref.kind === 'dm' ? item.title : 'Участник';
  }, [ctl.myId, thread?.members, item]);

  // ---- звонки ----
  const callPeer = (withVideo: boolean) => {
    if (!item) return;
    if (item.ref.kind === 'group') {
      // Звонок уже идёт — подключаемся к нему, а не начинаем новый
      const g = { groupId: item.ref.id, groupName: item.title, me, callId: activeCall?.call_id };
      if (electron?.startGroupCall) electron.startGroupCall(g);
      else if (window.opener) localStorage.setItem('lh_start_group_call', JSON.stringify({ ...g, ts: Date.now() }));
      else if (g.callId) joinGroupCall(g.callId, g.groupId, g.groupName, me);
      else startGroupCall(g.groupId, g.groupName, me);
      return;
    }
    const c = item.conv!;
    const peer = { id: c.other_user.id, username: c.other_user.username, display_name: c.other_user.display_name, avatar_url: c.other_user.avatar_url };
    if (electron?.startCall) electron.startCall(peer);
    else if (window.opener) localStorage.setItem('lh_start_call', JSON.stringify({ ...peer, video: withVideo, ts: Date.now() }));
    else startCall(peer, withVideo);
  };

  // ---- отправка ----
  const handleSend = (text: string) => {
    if (mode.kind === 'edit') {
      if (text !== mode.msg.content) ctl.editMessage(mode.msg.id, text);
      setMode({ kind: 'none' });
      return;
    }
    ctl.sendText(text, mode.kind === 'reply' ? mode.msg.id : undefined);
    setMode({ kind: 'none' });
  };

  const editLast = () => {
    const last = [...(thread?.messages ?? [])].reverse()
      .find((m) => m.sender_id === ctl.myId && m.id > 0 && !m.deleted_at && m.kind !== 'call' && !!m.content);
    if (last) setMode({ kind: 'edit', msg: last });
  };

  const sendFiles = async (caption: string, onProgress: Parameters<typeof ctl.sendFiles>[2]) => {
    if (!attach) return;
    try {
      await ctl.sendFiles(attach, caption, onProgress);
      setAttach(null);
    } catch (e: any) {
      setAttach(null);
      if (e?.response?.data?.code === 'file_too_large') {
        await offerPro({ title: 'Файл слишком большой', message: `${e.response.data.error}. С подпиской Pro лимиты вложений выше. Открыть страницу подписки?` });
      } else {
        await dlg.alert({ title: 'Не удалось отправить файл', message: e?.response?.data?.error || 'Ошибка загрузки', danger: true });
      }
    }
  };

  // ---- меню сообщения ----
  const menuMsg = menu?.msg ? thread?.messages.find((m) => m.id === menu.msg.id) ?? menu.msg : null;
  const mine = !!menuMsg && menuMsg.sender_id === ctl.myId;
  const isOwner = isGroup && item?.ownerId === ctl.myId;
  const canPin = (m: Msg) => !isGroup || m.sender_id === ctl.myId || isOwner;

  const toggleSelect = (id: number) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selectedMsgs = (thread?.messages ?? []).filter((m) => selected.has(m.id));
  const canDeleteForAll = (ids: number[]) => !isGroup || isOwner
    || ids.every((id) => thread?.messages.find((m) => m.id === id)?.sender_id === ctl.myId);

  const copySelected = async () => {
    const text = selectedMsgs.filter((m) => !m.deleted_at && m.content)
      .map((m) => (selectedMsgs.length > 1 ? `${senderName(m.sender_id)}: ${m.content}` : m.content)).join('\n');
    if (text) { try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } }
    setSelected(new Set());
  };

  const deleteDialog = (() => {
    if (!deleting) return null;
    if (deleting.kind === 'messages') {
      const n = deleting.ids.length;
      return {
        title: n > 1 ? `Удалить ${n} ${pluralRu(n, 'сообщение', 'сообщения', 'сообщений')}` : 'Удалить сообщение',
        message: n > 1 ? `Вы точно хотите удалить ${n} ${pluralRu(n, 'сообщение', 'сообщения', 'сообщений')}?` : 'Вы точно хотите удалить это сообщение?',
        showForAll: canDeleteForAll(deleting.ids),
      };
    }
    const it = deleting.item;
    if (it.ref.kind === 'group') {
      const owner = it.ownerId === ctl.myId;
      return {
        title: owner ? 'Удалить группу' : 'Скрыть группу',
        message: owner
          ? 'Отметьте «удалить у всех», чтобы удалить группу и её историю для всех участников. Иначе группа просто скроется у вас.'
          : 'Группа будет скрыта из списка и появится снова при новом сообщении.',
        showForAll: owner,
      };
    }
    return { title: 'Удалить чат', message: `Удалить переписку с ${it.title}?`, showForAll: true };
  })();

  const confirmDelete = async (forAll: boolean) => {
    if (!deleting) return;
    const d = deleting;
    setDeleting(null);
    if (d.kind === 'messages') {
      ctl.deleteMessages(d.ids, forAll);
      setSelected(new Set());
    } else {
      try { await ctl.deleteChat(d.item, forAll); }
      catch (e: any) { dlg.alert({ title: 'Не удалось удалить', message: e?.response?.data?.error || 'Попробуйте ещё раз', danger: true }); }
    }
  };

  const totalUnread = ctl.items.reduce((s, i) => s + (i.unread > 0 ? 1 : 0), 0);

  return (
    <div className={`${embedded ? 'h-full' : 'h-screen shadow-2xl'} w-full bg-main-bg flex flex-col overflow-hidden font-sans text-pearl select-none border border-[var(--line)]`}>
      {!embedded && <ChatTitleBar unread={totalUnread} />}

      <div className="relative flex-1 flex min-h-0">
        <ChatSidebar ctl={ctl} onCreateGroup={() => setShowCreate(true)} onDeleteChat={(it) => setDeleting({ kind: 'chat', item: it })} />

        {item ? (
          <section className="flex-1 min-w-0 flex flex-col">
            <ThreadHeader
              ctl={ctl}
              searchOpen={searchOpen}
              infoOpen={infoOpen}
              onToggleSearch={() => { setSearchOpen((v) => !v); setSearchQuery(''); }}
              onToggleInfo={() => setInfoOpen((v) => !v)}
              onCall={callPeer}
            />
            {searchOpen && (
              <ChatSearchBar ctl={ctl} onQueryChange={setSearchQuery} onClose={() => { setSearchOpen(false); setSearchQuery(''); }} />
            )}
            {activeCall && <GroupCallBanner call={activeCall} myId={ctl.myId} onJoin={() => callPeer(false)} />}
            {thread && thread.pinned.length > 0 && !searchOpen && (
              <PinnedBar pinned={thread.pinned} canUnpin={canPin} onJump={ctl.jumpTo} onUnpin={(id) => ctl.pinMessage(id, false)} />
            )}

            <MessageFeed
              ctl={ctl}
              highlight={searchOpen ? searchQuery : undefined}
              selectedIds={selected}
              onToggleSelect={toggleSelect}
              onContext={(m, x, y) => setMenu({ msg: m, x, y })}
              onReply={(m) => setMode({ kind: 'reply', msg: m, name: senderName(m.sender_id) })}
              onOpenMedia={(m) => setViewer(m)}
              onCallBack={() => callPeer(false)}
              onOpenProfile={(uid) => { if (uid !== ctl.myId) setInfoOpen(true); }}
              onDropFiles={(files) => setAttach(files)}
            />

            {selected.size > 0 ? (
              <div className="flex items-center gap-2 px-4 h-[56px] border-t border-[var(--line)] bg-[var(--panel)] shrink-0">
                <button onClick={() => setSelected(new Set())} className="text-pearl/72 hover:text-white" title="Снять выделение (Esc)"><X size={17} /></button>
                <span className="tl-head text-[10px] uppercase tracking-[0.16em] text-white">
                  {selected.size} {pluralRu(selected.size, 'сообщение', 'сообщения', 'сообщений')}
                </span>
                <span className="flex-1" />
                <button onClick={copySelected} className="tl-btn ghost flex items-center gap-2"><Copy size={13} /> Копировать</button>
                <button onClick={() => setForwarding([...selected])} className="tl-btn ghost flex items-center gap-2"><Forward size={13} /> Переслать</button>
                <button onClick={() => setDeleting({ kind: 'messages', ids: [...selected] })} className="tl-btn danger flex items-center gap-2"><Trash2 size={13} /> Удалить</button>
              </div>
            ) : (
              <>
              {ctl.sendBlock && ctl.sendBlock.key === ctl.activeKey && (
                <SendBlockNotice block={ctl.sendBlock} onDone={ctl.clearSendBlock} />
              )}
              <Composer
                threadKey={ctl.activeKey!}
                draft={ctl.drafts[ctl.activeKey!] || ''}
                onDraft={(t) => ctl.setDraft(ctl.activeKey!, t)}
                mode={mode}
                onCancelMode={() => setMode({ kind: 'none' })}
                onSend={handleSend}
                onEditLast={editLast}
                onTyping={ctl.notifyTyping}
                onFiles={(files) => setAttach(files)}
                maxLen={proLimits.message_len}
              />
              </>
            )}
          </section>
        ) : (
          <section className="lc-feed flex-1 flex flex-col items-center justify-center gap-4 text-center px-10">
            <span className="w-20 h-20 flex items-center justify-center border border-[var(--line-2)] bg-[var(--panel)] text-accent shadow-[var(--glow)]">
              <MessageSquare size={34} />
            </span>
            <p className="tl-head text-[11px] uppercase tracking-[0.22em] text-white">Выберите чат</p>
            <p className="tl-term text-[16px] tl-muted max-w-xs">Слева — личные переписки и группы. Ctrl+F — поиск по чатам.</p>
            <button onClick={() => setShowCreate(true)} className="tl-btn solid">Создать группу</button>
          </section>
        )}

        {infoOpen && isGroup && (
          <GroupInfoPanel ctl={ctl} onClose={() => setInfoOpen(false)} onCall={() => callPeer(false)} />
        )}
      </div>

      {/* ---- оверлеи ---- */}
      {menu && menuMsg && (
        <MessageContextMenu
          x={menu.x}
          y={menu.y}
          mine={mine}
          isDeleted={!!menuMsg.deleted_at}
          hasText={!!menuMsg.content}
          canEdit={mine && !menuMsg.deleted_at && menuMsg.kind !== 'call' && !!menuMsg.content}
          canPin={canPin(menuMsg)}
          pinned={!!menuMsg.pinned_at}
          canDeleteForAll={canDeleteForAll([menuMsg.id])}
          myReactions={(menuMsg.reactions || []).filter((r) => r.user_ids.includes(ctl.myId)).map((r) => r.emoji)}
          attachmentUrl={menuMsg.attachment_url}
          onReact={(e) => ctl.react(menuMsg.id, e)}
          onReply={() => { setMode({ kind: 'reply', msg: menuMsg, name: senderName(menuMsg.sender_id) }); setMenu(null); }}
          onEdit={() => { setMode({ kind: 'edit', msg: menuMsg }); setMenu(null); }}
          onPin={() => { ctl.pinMessage(menuMsg.id, !menuMsg.pinned_at); setMenu(null); }}
          onCopy={async () => { try { await navigator.clipboard.writeText(menuMsg.content); } catch { /* ignore */ } setMenu(null); }}
          onForward={() => { setForwarding([menuMsg.id]); setMenu(null); }}
          onDelete={() => { setDeleting({ kind: 'messages', ids: [menuMsg.id] }); setMenu(null); }}
          onSelect={() => { toggleSelect(menuMsg.id); setMenu(null); }}
          onClose={() => setMenu(null)}
        />
      )}

      {deleting && deleteDialog && (
        <DeleteConfirmDialog
          title={deleteDialog.title}
          message={deleteDialog.message}
          showForAll={deleteDialog.showForAll}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}

      {forwarding && (
        <ForwardPickerDialog
          conversations={ctl.conversations}
          groups={ctl.groups}
          count={forwarding.length}
          onPick={(type, id) => { ctl.forwardMessages(forwarding, type, id); setForwarding(null); setSelected(new Set()); }}
          onClose={() => setForwarding(null)}
        />
      )}

      {attach && <AttachDialog files={attach} onCancel={() => setAttach(null)} onSend={sendFiles} maxLen={proLimits.message_len} />}

      {viewer && (
        <MediaViewer
          start={viewer}
          messages={thread?.messages ?? []}
          senderName={senderName}
          onClose={() => setViewer(null)}
          onReply={(m) => setMode({ kind: 'reply', msg: m, name: senderName(m.sender_id) })}
          onForward={(m) => setForwarding([m.id])}
        />
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={async (groupId) => {
            setShowCreate(false);
            await ctl.refreshGroups();
            ctl.openThread({ kind: 'group', id: groupId });
          }}
        />
      )}

      {infoOpen && !isGroup && item?.conv && (
        <ChatProfilePanel
          open
          username={item.conv.other_user.username}
          avatarUrl={item.conv.other_user.avatar_url}
          online={ctl.onlineIds.has(item.conv.other_user.id)}
          lastSeenAt={ctl.lastSeen.get(item.conv.other_user.id)}
          playing={ctl.playing.get(item.conv.other_user.id)}
          conversationId={item.conv.id}
          onCall={(withVideo) => { setInfoOpen(false); callPeer(withVideo); }}
          onClose={() => setInfoOpen(false)}
          onOpenMedia={(kind) => setMediaGallery(kind)}
        />
      )}

      {mediaGallery && item?.ref.kind === 'dm' && (
        <ChatMediaGallery conversationId={item.ref.id} kind={mediaGallery} onClose={() => setMediaGallery(null)} />
      )}
    </div>
  );
}

/** Плашка над полем ввода: сообщение не отправлено из-за лимита, с обратным отсчётом */
function SendBlockNotice({ block, onDone }: { block: { message: string; until: number }; onDone: () => void }) {
  const [left, setLeft] = useState(() => Math.ceil((block.until - Date.now()) / 1000));
  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.ceil((block.until - Date.now()) / 1000);
      setLeft(s);
      if (s <= 0) onDone();
    }, 500);
    return () => clearInterval(t);
  }, [block, onDone]);
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-amber-400/30 bg-amber-400/10 shrink-0">
      <span className="tl-term text-[15px] text-amber-200 flex-1">{block.message}</span>
      {left > 0 && <span className="tl-num text-[11px] text-amber-300 tabular-nums">{left} с</span>}
      <button onClick={onDone} className="text-amber-200/60 hover:text-white" title="Скрыть"><X size={14} /></button>
    </div>
  );
}
