import { useState, useEffect, type ReactNode } from 'react';
import api from '../../api';
import { useDialog } from '../../components/Dialogs';
import { openChatWindow } from '../../utils/openChat';
import { friendInviteUrl } from '../../utils/inviteLinks';
import { startCall } from '../../api/call';
import { getPresence, usePresenceVersion } from '../../api/presence';
import { useAuth } from '../../context/AuthContext';
import {
  IconSearch, IconLoader2, IconUserPlus, IconUsers, IconCopy, IconCheck, IconX,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { FriendCard } from './components/FriendCard';
import { RemoveFriendDialog } from './components/RemoveFriendDialog';

type Tab = 'all' | 'online' | 'offline' | 'requests';
type Sort = 'status' | 'name' | 'level';

// Строка заявки в сайдбаре
const ReqRow = ({
  avatar, name, meta, actions,
}: { avatar: string; name: string; meta: string; actions: ReactNode }) => (
  <div className="flex items-center gap-3 py-3 border-b border-dashed border-[rgb(var(--accent-rgb)/.15)] last:border-b-0 last:pb-0 first:pt-0">
    <div className="w-10 h-10 shrink-0 border border-[var(--line-2)] overflow-hidden">
      <img src={avatar} alt="" className="w-full h-full object-cover" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="tl-head text-[10px] font-bold uppercase tracking-[.1em] text-white truncate">{name}</div>
      <div className="tl-term text-[15px] text-[var(--muted-2)] truncate">{meta}</div>
    </div>
    {actions}
  </div>
);

export default function FriendsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dlg = useDialog();

  const [friends, setFriends] = useState<any[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [outgoing, setOutgoing] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('status');
  const [copied, setCopied] = useState(false);

  // состояние модалки удаления друга
  const [showModal, setShowModal] = useState(false);
  const [friendToDelete, setFriendToDelete] = useState<any>(null);

  // перерисовка при изменениях онлайн-статуса (WS presence)
  usePresenceVersion();

  const fetchFriends = () => {
    setIsLoading(true);
    api.get('/friends/list').then(res => {
      // API уже отдаёт только принятых друзей: {id, online_status, friend_details}
      setFriends(res.data);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  };

  const fetchRequests = () => {
    api.get('/friends/pending').then(res => {
      setIncoming(res.data.incoming || []);
      setOutgoing(res.data.outgoing || []);
    }).catch(() => {});
  };

  useEffect(() => {
    fetchFriends();
    fetchRequests();
  }, []);

  const handleRemoveConfirm = async () => {
    if (!friendToDelete) return;
    try {
      await api.delete('/friends/remove', {
        data: { friend_id: friendToDelete.friend_details.id }
      });
      setShowModal(false);
      setFriendToDelete(null);
      fetchFriends();
    } catch {
      dlg.alert({ title: 'Ошибка', message: 'Не удалось удалить друга', danger: true });
    }
  };

  const handleRequestAction = async (id: number, action: 'accept' | 'delete') => {
    try {
      if (action === 'accept') {
        await api.post('/friends/accept', { request_id: id });
        fetchFriends();
      } else {
        await api.delete('/friends/request', { data: { request_id: id } });
      }
      fetchRequests();
    } catch {
      dlg.alert({ title: 'Ошибка', message: 'Не удалось выполнить действие', danger: true });
    }
  };

  const copyCode = async () => {
    if (!user?.friend_code) return;
    try {
      await navigator.clipboard.writeText(user.friend_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* буфер обмена недоступен */ }
  };

  const nameOf = (f: any) =>
    f.friend_details?.profile?.display_name || f.friend_details?.username || '';
  const isOnline = (f: any) => !!getPresence(f.friend_details.id)?.online;
  const onlineCount = friends.filter(isOnline).length;
  const requestCount = incoming.length + outgoing.length;

  const filtered = friends
    .filter((f: any) => {
      const q = search.toLowerCase();
      return nameOf(f).toLowerCase().includes(q)
        || (f.friend_details?.username || '').toLowerCase().includes(q);
    })
    .filter((f: any) => (tab === 'online' ? isOnline(f) : tab === 'offline' ? !isOnline(f) : true))
    .sort((a: any, b: any) => {
      if (sort === 'name') return nameOf(a).localeCompare(nameOf(b), 'ru');
      if (sort === 'level') {
        return (b.friend_details?.profile?.level || 0) - (a.friend_details?.profile?.level || 0);
      }
      // сначала в сети, затем по алфавиту
      return (isOnline(a) ? 0 : 1) - (isOnline(b) ? 0 : 1)
        || nameOf(a).localeCompare(nameOf(b), 'ru');
    });

  // «Сейчас играют»: счётчик игр среди друзей из WS-presence
  const gameCounts: { game: string; n: number }[] = [];
  friends.forEach((f: any) => {
    const g = getPresence(f.friend_details.id)?.playing;
    if (!g) return;
    const row = gameCounts.find(r => r.game === g);
    if (row) row.n += 1;
    else gameCounts.push({ game: g, n: 1 });
  });
  gameCounts.sort((a, b) => b.n - a.n);
  const topGames = gameCounts.slice(0, 4);
  const onlinePct = friends.length ? Math.round((onlineCount / friends.length) * 100) : 0;

  const panelTitle = 'tl-pixel text-[10px] text-white mb-3.5 [text-shadow:var(--glow-sm)]';

  if (isLoading) return <IconLoader2 className="animate-spin text-accent mx-auto mt-20" size={40} />;

  return (
    <div className="animate-in fade-in duration-500 relative max-w-[1240px] mx-auto pb-10">
      {/* строка статуса модуля */}
      <div className="tl-ticker">
        <span className="live"><IconUsers size={14} /> // FRIENDS MODULE</span>
        <span>network: {friends.length} nodes</span>
        <span>· online: {onlineCount}</span>
        <span>· requests: {requestCount}</span>
      </div>

      <div className="tl-sec-head mt-2">
        <span className="bar" />
        <h2>ДРУЗЬЯ</h2>
        <span className="count">// {friends.length} контактов</span>
        <span className="line" />
        <span className="tag">{onlineCount} ONLINE</span>
      </div>

      {/* тулбар: вкладки + поиск + сортировка + действие */}
      <div className="tl-toolbar">
        <div className="tl-tabs">
          <button className={`tl-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            Все · {friends.length}
          </button>
          <button className={`tl-tab ${tab === 'online' ? 'active' : ''}`} onClick={() => setTab('online')}>
            В сети · {onlineCount}
          </button>
          <button className={`tl-tab ${tab === 'offline' ? 'active' : ''}`} onClick={() => setTab('offline')}>
            Не в сети · {friends.length - onlineCount}
          </button>
          <button className={`tl-tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
            Заявки · {requestCount}
          </button>
        </div>

        <div className="relative" style={{ flex: 1, minWidth: 200, maxWidth: 340 }}>
          <IconSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
          <input
            className="tl-field"
            style={{ paddingLeft: 40 }}
            data-search-hotkey="page"
            placeholder="Поиск по нику или имени…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className="tl-select" value={sort} onChange={e => setSort(e.target.value as Sort)}>
          <option value="status">Сортировка: сначала в сети</option>
          <option value="name">По алфавиту</option>
          <option value="level">По уровню</option>
        </select>

        <span className="spacer" />

        <button className="tl-btn" onClick={() => navigate('/friends/add')}>
          <IconUserPlus size={14} /> Добавить друга
        </button>
      </div>

      <div className="grid grid-cols-1 gap-[22px] xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ===== ОСНОВНАЯ КОЛОНКА ===== */}
        <div>
          {tab === 'requests' ? (
            <div className="flex flex-col gap-8">
              <section>
                <div className="tl-sec-head">
                  <span className="bar" />
                  <h2>Входящие заявки</h2>
                  <span className="count">// {incoming.length}</span>
                  <span className="line" />
                </div>
                <div className="flex flex-col gap-3">
                  {incoming.map((req: any) => (
                    <div key={req.id} className="tl-vrow">
                      <div className="ic overflow-hidden">
                        <img src={req.sender_details.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="vt">
                        <b>{req.sender_details.profile.display_name}</b>
                        <span className="vd block">@{req.sender_details.username} · LVL {req.sender_details.profile.level}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleRequestAction(req.id, 'accept')}
                          className="tl-btn"
                          style={{ padding: '8px 10px', color: 'var(--green2)', borderColor: 'rgba(52,211,153,.5)', background: 'rgba(52,211,153,.10)' }}
                          title="Принять заявку"
                        >
                          <IconCheck size={16} />
                        </button>
                        <button
                          onClick={() => handleRequestAction(req.id, 'delete')}
                          className="tl-btn ghost"
                          style={{ padding: '8px 10px' }}
                          title="Отклонить"
                        >
                          <IconX size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {incoming.length === 0 && (
                    <div className="tl-panel py-8 text-center">
                      <p className="tl-term tl-muted text-[16px] uppercase tracking-[0.1em]">Нет входящих заявок</p>
                    </div>
                  )}
                </div>
              </section>

              <section>
                <div className="tl-sec-head">
                  <span className="bar" />
                  <h2>Исходящие заявки</h2>
                  <span className="count">// {outgoing.length}</span>
                  <span className="line" />
                </div>
                <div className="flex flex-col gap-3 opacity-80">
                  {outgoing.map((req: any) => (
                    <div key={req.id} className="tl-vrow">
                      <div className="ic overflow-hidden">
                        <img src={req.receiver_details.profile.avatar_url} alt="" className="w-full h-full object-cover grayscale" />
                      </div>
                      <div className="vt">
                        <b style={{ color: 'rgba(255,255,255,.7)' }}>{req.receiver_details.profile.display_name}</b>
                        <span className="vd block">@{req.receiver_details.username}</span>
                      </div>
                      <span className="tl-chip warn shrink-0">Ожидание ответа</span>
                      <button onClick={() => handleRequestAction(req.id, 'delete')} className="tl-btn ghost shrink-0">
                        <IconX size={14} /> Отменить
                      </button>
                    </div>
                  ))}
                  {outgoing.length === 0 && (
                    <div className="tl-panel py-8 text-center">
                      <p className="tl-term tl-muted text-[16px] uppercase tracking-[0.1em]">Нет отправленных заявок</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : filtered.length === 0 ? (
            <div className="tl-panel py-16 text-center">
              <p className="tl-term tl-muted text-[16px] uppercase tracking-[0.1em]">
                {friends.length === 0
                  ? 'Список друзей пуст'
                  : search
                    ? 'Никого не найдено'
                    : tab === 'online'
                      ? 'Сейчас никто не в сети'
                      : 'Все друзья в сети'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-[14px] content-start">
              {filtered.map((f: any) => (
                <FriendCard
                  key={f.id}
                  friend={f}
                  onOpenProfile={() => navigate(`/profile/${f.friend_details.username}`)}
                  onMessage={() => openChatWindow(f.friend_details.id)}
                  onCall={() => startCall({
                    id: f.friend_details.id,
                    username: f.friend_details.profile.display_name,
                    avatar_url: f.friend_details.profile.avatar_url,
                  })}
                  onRemove={() => {
                    setFriendToDelete(f);
                    setShowModal(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ===== ПРАВЫЙ САЙДБАР (как в шаблоне) ===== */}
        <aside className="flex flex-col gap-4">
          {/* ВАШ КОД ДРУГА */}
          <div className="tl-panel p-5">
            <h3 className={panelTitle}>ВАШ КОД ДРУГА</h3>
            <div className="flex items-stretch mb-3">
              <div className="flex-1 grid place-items-center px-2.5 py-3 bg-[#08050f] border border-r-0 border-[var(--line)] tl-term text-[22px] tracking-[.22em] text-[var(--pink)] [text-shadow:var(--glow-sm)]">
                {user?.friend_code || '—'}
              </div>
              <button className="tl-btn" style={{ padding: '0 14px' }} onClick={copyCode}>
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
            <p className="tl-term text-[15px] text-[var(--muted-2)] leading-snug break-words">
              Отдайте код другу — или отправьте ссылку {friendInviteUrl(user?.friend_code)}
            </p>
          </div>

          {/* ЗАЯВКИ */}
          <div className="tl-panel p-5">
            <h3 className={panelTitle}>
              ЗАЯВКИ <span className="tl-term text-[15px] text-[var(--pink)] [text-shadow:none]">// {requestCount}</span>
            </h3>

            {requestCount === 0 ? (
              <p className="tl-term text-[15px] text-[var(--muted-2)]">Нет заявок</p>
            ) : (
              <>
                {incoming.slice(0, 3).map((req: any) => (
                  <ReqRow
                    key={`in-${req.id}`}
                    avatar={req.sender_details.profile.avatar_url}
                    name={req.sender_details.profile.display_name}
                    meta={`@${req.sender_details.username} · LVL ${req.sender_details.profile.level}`}
                    actions={
                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => handleRequestAction(req.id, 'accept')}
                          className="tl-btn"
                          style={{ padding: '7px 9px', color: 'var(--green2)', borderColor: 'rgba(52,211,153,.5)', background: 'rgba(52,211,153,.10)' }}
                          title="Принять"
                        >
                          <IconCheck size={14} />
                        </button>
                        <button
                          onClick={() => handleRequestAction(req.id, 'delete')}
                          className="tl-btn ghost"
                          style={{ padding: '7px 9px' }}
                          title="Отклонить"
                        >
                          <IconX size={14} />
                        </button>
                      </div>
                    }
                  />
                ))}

                {outgoing.slice(0, 2).map((req: any) => (
                  <ReqRow
                    key={`out-${req.id}`}
                    avatar={req.receiver_details.profile.avatar_url}
                    name={req.receiver_details.profile.display_name}
                    meta={`@${req.receiver_details.username} · заявка отправлена`}
                    actions={<span className="tl-chip warn shrink-0">Ожидание</span>}
                  />
                ))}
              </>
            )}

            <button className="tl-btn ghost block mt-3.5" onClick={() => setTab('requests')}>
              <IconUsers size={14} /> Все заявки
            </button>
          </div>

          {/* СВОДКА */}
          <div className="tl-panel p-5">
            <h3 className={panelTitle}>СВОДКА</h3>
            <div className="tl-srow"><span className="k">Всего друзей</span><span className="v">{friends.length}</span></div>
            <div className="tl-srow"><span className="k">Сейчас в сети</span><span className="v">{onlineCount}</span></div>
            <div className="tl-srow"><span className="k">Входящие заявки</span><span className="v">{incoming.length}</span></div>
            <div className="tl-srow"><span className="k">Исходящие</span><span className="v">{outgoing.length}</span></div>
          </div>

          {/* СЕЙЧАС ИГРАЮТ */}
          <div className="tl-panel p-5">
            <h3 className={panelTitle}>СЕЙЧАС ИГРАЮТ</h3>
            {topGames.length === 0 ? (
              <div className="tl-srow"><span className="k">Никто не играет</span><span className="v">—</span></div>
            ) : (
              topGames.map(g => (
                <div key={g.game} className="tl-srow"><span className="k">{g.game}</span><span className="v">{g.n}</span></div>
              ))
            )}
            <div className="tl-prog mt-3">
              <div className="t"><div className="f" style={{ width: `${onlinePct}%` }} /></div>
            </div>
            <div className="tl-term text-[15px] text-[var(--muted-2)] mt-2 tracking-[.05em]">
              {onlineCount} / {friends.length} ДРУЗЕЙ В СЕТИ
            </div>
          </div>

          {/* БЫСТРЫЙ СТАРТ */}
          <div className="tl-panel p-5">
            <h3 className={panelTitle}>БЫСТРЫЙ СТАРТ</h3>
            <button className="tl-btn block mb-2.5" onClick={() => openChatWindow()}>
              <IconUsers size={14} /> Открыть чаты
            </button>
            <button className="tl-btn ghost block" onClick={() => navigate('/friends/add')}>
              <IconUserPlus size={14} /> Пригласить по коду
            </button>
          </div>
        </aside>
      </div>

      {/* --- МОДАЛЬНОЕ ОКНО УДАЛЕНИЯ ДРУГА --- */}
      {showModal && (
        <RemoveFriendDialog
          friendName={friendToDelete?.friend_details.profile.display_name}
          onConfirm={handleRemoveConfirm}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
