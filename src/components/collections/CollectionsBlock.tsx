import { useCallback, useEffect, useState } from 'react';
import { IconFolderPlus, IconTrash, IconLock, IconWorld, IconX, IconCheck, IconPlus, IconPencil } from '@tabler/icons-react';
import {
  getUserCollections, getCollection, createCollection, updateCollection, deleteCollection,
  removeGameFromCollection, addGameToCollection, type Collection, type CollectionDetails,
} from '../../api/collections';
import api from '../../api';
import { useDialog } from '../Dialogs';
import { useProUpgradeDialog } from '../ProUpgradeDialog';
import { useProLimits } from '../../api/proLimits';

/**
 * Коллекции игр: создание, редактирование, удаление,
 * просмотр состава, добавление/удаление игр. Используется на странице
 * профиля (свои/чужие коллекции) и в библиотеке (только свои).
 */
// «1 игра», «3 игры», «11 игр», «21 игра»
function gamesWord(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'игра';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'игры';
  return 'игр';
}

export default function CollectionsBlock({
  username, isOwnProfile, onGameClick,
}: {
  username: string;
  isOwnProfile: boolean;
  onGameClick: (gameId: number) => void;
}) {
  const dlg = useDialog();
  const offerPro = useProUpgradeDialog();
  const { collections: maxCollections, is_pro: isPro } = useProLimits();
  const [items, setItems] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [open, setOpen] = useState<CollectionDetails | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getUserCollections(username)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [username]);

  useEffect(load, [load]);

  // true — успешно; false — окно остаётся открытым, и кнопку можно нажать снова
  const handleCreate = async (name: string, isPublic: boolean, description: string): Promise<boolean> => {
    try {
      await createCollection({ name, is_public: isPublic, description: description.trim() || undefined });
      setCreating(false);
      load();
      return true;
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error;
      dlg.alert({
        title: 'Ошибка',
        message: serverMsg || 'Не удалось создать коллекцию',
        danger: true,
      });
      return false;
    }
  };

  const handleUpdate = async (patch: { name: string; is_public: boolean; description: string }): Promise<boolean> => {
    if (!editing) return false;
    try {
      await updateCollection(editing.id, {
        name: patch.name,
        is_public: patch.is_public,
        description: patch.description,
      });
      setEditing(null);
      load();
      // Открытая карточка деталей — обновляем, если она про эту коллекцию
      if (open?.id === editing.id) setOpen(await getCollection(editing.id));
      return true;
    } catch (e: any) {
      dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось изменить коллекцию', danger: true });
      return false;
    }
  };

  const handleDelete = async (col: Collection) => {
    const ok = await dlg.confirm({
      title: 'Удалить коллекцию', message: `Коллекция «${col.name}» будет удалена безвозвратно`,
      confirmText: 'Удалить', danger: true,
    });
    if (!ok) return;
    try {
      await deleteCollection(col.id);
      if (open?.id === col.id) setOpen(null);
      load();
    } catch {
      dlg.alert({ title: 'Ошибка', message: 'Не удалось удалить коллекцию', danger: true });
    }
  };

  const openDetails = async (col: Collection) => {
    try {
      setOpen(await getCollection(col.id));
    } catch {
      dlg.alert({ title: 'Ошибка', message: 'Не удалось открыть коллекцию', danger: true });
    }
  };

  if (loading) return null;

  return (
    <section className="mb-6">
      <div className="tl-sec-head">
        <span className="bar" />
        <h2>КОЛЛЕКЦИИ <span className="tl-term text-[14px] tl-pink">{items.length}/{maxCollections}</span></h2>
        <span className="line" />
        {isOwnProfile && (
          <button
            onClick={() => {
              if (items.length >= maxCollections) {
                if (!isPro) {
                  offerPro({
                    title: 'Лимит коллекций',
                    message: `Обычный аккаунт — до ${maxCollections} коллекций, а с подпиской Pro — до 50. Открыть страницу подписки?`,
                  });
                } else {
                  dlg.alert({ title: 'Лимит коллекций', message: `Доступно ${maxCollections} коллекций. С подпиской Lustre Pro — 50`, tone: 'info' });
                }
                return;
              }
              setCreating(true);
            }}
            className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <IconFolderPlus size={12} /> Создать
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="tl-term text-[15px] text-[var(--muted-2)]">
          {isOwnProfile
            ? 'Создай коллекцию и собери в неё игры из библиотеки.'
            : 'Пользователь пока не создал коллекций.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map(col => (
            <div key={col.id} className="group relative">
              <button onClick={() => openDetails(col)} className="w-full text-left cursor-pointer">
                <div className="relative aspect-[16/10] overflow-hidden bg-[var(--panel)] border border-[var(--line)] group-hover:border-[var(--line-2)] transition-colors">
                  {col.cover_url && (
                    <img src={col.cover_url} alt="" loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                  <div className="absolute top-2 right-2">
                    {col.is_public
                      ? <IconWorld size={13} className="text-white/60" />
                      : <IconLock size={13} className="text-[#ffb020]" />}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="tl-head text-[10px] font-bold uppercase tracking-tight text-white leading-tight line-clamp-1">{col.name}</p>
                    <p className="tl-term text-[13px] tl-muted mt-0.5">
                      {col.games_count} {gamesWord(col.games_count)}
                    </p>
                  </div>
                </div>
              </button>
              {col.is_owner && (
                <>
                  <button
                    onClick={() => handleDelete(col)}
                    title="Удалить коллекцию"
                    className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center bg-black/70 border border-[var(--line-2)] text-[var(--muted)] hover:text-[#ff5b8a] hover:border-[#ff5b8a] transition-colors cursor-pointer"
                  >
                    <IconTrash size={12} />
                  </button>
                  <button
                    onClick={() => setEditing(col)}
                    title="Редактировать коллекцию"
                    className="absolute top-2 left-10 w-6 h-6 flex items-center justify-center bg-black/70 border border-[var(--line-2)] text-[var(--muted)] hover:text-white hover:border-white transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                  >
                    <IconPencil size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreate={handleCreate}
        />
      )}

      {editing && (
        <EditModal
          col={editing}
          onClose={() => setEditing(null)}
          onSave={handleUpdate}
        />
      )}

      {open && (
        <DetailsModal
          col={open}
          onClose={() => { setOpen(null); load(); }}
          onGameClick={onGameClick}
          onEdit={open.is_owner ? () => { setEditing(open); } : undefined}
          onAdd={async (gameId) => {
            try {
              await addGameToCollection(open.id, gameId);
              const fresh = await getCollection(open.id);
              setOpen(fresh);
              load();
            } catch {
              dlg.alert({ title: 'Ошибка', message: 'Не удалось добавить игру в коллекцию', danger: true });
            }
          }}
          onRemove={async (gameId) => {
            try {
              await removeGameFromCollection(open.id, gameId);
              const fresh = await getCollection(open.id);
              setOpen(fresh);
              load();
            } catch {
              dlg.alert({ title: 'Ошибка', message: 'Не удалось убрать игру', danger: true });
            }
          }}
        />
      )}
    </section>
  );
}

function CreateModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (name: string, isPublic: boolean, description: string) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    // при ошибке (например, лимит коллекций) кнопка снова активна — раньше зависала
    if (!(await onCreate(name.trim(), isPublic, description))) setBusy(false);
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.12em] text-white mb-4">НОВАЯ КОЛЛЕКЦИЯ</h3>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="Название коллекции"
        className="tl-field mb-3"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
        placeholder="Описание (необязательно)"
        rows={2}
        className="tl-field mb-3 resize-none"
      />
      <label className="flex items-center gap-2 tl-term text-[15px] tl-muted cursor-pointer mb-5">
        <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)}
          className="accent-[color:var(--color-accent)] cursor-pointer" />
        Публичная коллекция (видна всем)
      </label>
      <div className="flex gap-2">
        <button disabled={!name.trim() || busy} onClick={submit} className="tl-btn solid flex-1">
          <IconCheck size={14} /> Создать
        </button>
        <button onClick={onClose} className="tl-btn ghost">Отмена</button>
      </div>
    </ModalShell>
  );
}

function EditModal({ col, onClose, onSave }: {
  col: Collection;
  onClose: () => void;
  onSave: (patch: { name: string; is_public: boolean; description: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState(col.name);
  const [description, setDescription] = useState(col.description || '');
  const [isPublic, setIsPublic] = useState(col.is_public);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    if (!(await onSave({ name: name.trim(), is_public: isPublic, description: description.trim() }))) setBusy(false);
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.12em] text-white mb-4">РЕДАКТИРОВАНИЕ КОЛЛЕКЦИИ</h3>
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="Название коллекции"
        className="tl-field mb-3"
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Описание (необязательно)"
        rows={2}
        className="tl-field mb-3 resize-none"
      />
      <label className="flex items-center gap-2 tl-term text-[15px] tl-muted cursor-pointer mb-5">
        <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)}
          className="accent-[color:var(--color-accent)] cursor-pointer" />
        Публичная коллекция (видна всем)
      </label>
      <div className="flex gap-2">
        <button disabled={!name.trim() || busy} onClick={submit} className="tl-btn solid flex-1">
          <IconCheck size={14} /> Сохранить
        </button>
        <button onClick={onClose} className="tl-btn ghost">Отмена</button>
      </div>
    </ModalShell>
  );
}

function DetailsModal({
  col, onClose, onGameClick, onRemove, onAdd, onEdit,
}: {
  col: CollectionDetails;
  onClose: () => void;
  onGameClick: (gameId: number) => void;
  onRemove: (gameId: number) => Promise<void>;
  onAdd?: (gameId: number) => Promise<void>;
  onEdit?: () => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <ModalShell onClose={onClose} wide>
      <div className="flex items-start justify-between gap-4 mb-1">
        <h3 className="tl-wrap tl-head text-[13px] font-bold uppercase tracking-tight text-white">{col.name}</h3>
        <div className="flex items-center gap-2">
          {col.is_owner && onEdit && (
            <button onClick={onEdit} className="tl-btn ghost !py-2" title="Редактировать коллекцию">
              <IconPencil size={13} /> Изменить
            </button>
          )}
          {col.is_owner && onAdd && (
            <button onClick={() => setPicking(true)} className="tl-btn ghost !py-2">
              <IconPlus size={13} /> Добавить игру
            </button>
          )}
          <button onClick={onClose} className="tl-muted hover:text-white transition-colors cursor-pointer"><IconX size={18} /></button>
        </div>
      </div>

      {picking ? (
        <AddGamePicker
          onPick={async (gameId) => { await onAdd?.(gameId); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      ) : (
        <>
          {col.description && <p className="tl-wrap tl-term text-[15px] tl-muted mb-3">{col.description}</p>}
          <p className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)] mb-4">
            {col.games_count} {gamesWord(col.games_count)}
            {!col.is_public && ' · приватная'}
          </p>

          {col.games.length === 0 ? (
            <p className="tl-term text-[15px] text-[var(--muted-2)]">В коллекции пока нет игр.</p>
          ) : (
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
              {col.games.map((g, i) => (
                <div key={g.id} className="flex items-center gap-3 p-2 border border-transparent hover:border-[var(--line)] hover:bg-[rgb(var(--accent-rgb)/.03)] transition-colors group">
                  <span className="w-5 tl-term text-[15px] text-[var(--muted-2)] shrink-0">{i + 1}</span>
                  {g.game && (g.game.header_image || g.game.banner_url) && (
                    <img src={g.game.header_image || g.game.banner_url} alt="" className="w-10 h-14 object-cover shrink-0 border border-[var(--line)]" />
                  )}
                  <button onClick={() => { onGameClick(g.game_id); onClose(); }} className="flex-1 text-left min-w-0 cursor-pointer">
                    <p className="text-[11px] font-bold text-white truncate hover:text-accent transition-colors">{g.game?.title}</p>
                    {g.game?.age_rating && <p className="tl-term text-[13px] text-[var(--muted-2)]">{g.game.age_rating}</p>}
                  </button>
                  {col.is_owner && (
                    <button
                      onClick={() => onRemove(g.game_id)}
                      title="Убрать из коллекции"
                      className="tl-muted hover:text-[#ff5b8a] transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

// Выбор игры из библиотеки, чтобы добавить её в коллекцию (только для владельца).
function AddGamePicker({ onPick, onClose }: { onPick: (gameId: number) => Promise<void>; onClose: () => void }) {
  const [games, setGames] = useState<{ id: number; title: string; img: string }[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/library/')
      .then(res => setGames((res.data || []).map((e: any) => ({
        id: Number(e.game_id),
        title: String(e.game?.title || ''),
        img: String(e.game?.header_image || e.game?.banner_url || ''),
      }))))
      .catch(() => setGames([]));
  }, []);

  const query = q.trim().toLowerCase();
  const list = (games || []).filter(g => g.title.toLowerCase().includes(query));

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 mb-3">
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Поиск по библиотеке..."
          className="tl-field flex-1"
        />
        <button onClick={onClose} className="tl-btn ghost">
          <IconX size={13} /> Отмена
        </button>
      </div>

      {games === null ? (
        <p className="tl-term text-[15px] tl-muted">Загрузка библиотеки…</p>
      ) : list.length === 0 ? (
        <p className="tl-term text-[15px] text-[var(--muted-2)]">
          {games?.length ? 'Нет игр по запросу.' : 'В библиотеке пока нет игр.'}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-1">
          {list.map(g => (
            <button
              key={g.id}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try { await onPick(g.id); } finally { setBusy(false); }
              }}
              className="w-full flex items-center gap-3 p-2 border border-transparent hover:border-[var(--line)] hover:bg-[rgb(var(--accent-rgb)/.04)] transition-colors text-left disabled:opacity-50 cursor-pointer"
            >
              {g.img && <img src={g.img} alt="" className="w-10 h-14 object-cover shrink-0 border border-[var(--line)]" />}
              <span className="flex-1 min-w-0 text-[11px] font-bold text-white truncate">{g.title}</span>
              <IconPlus size={14} className="text-accent shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModalShell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}>
      <div
        className={`tl-panel w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 max-h-[85vh] overflow-hidden flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
