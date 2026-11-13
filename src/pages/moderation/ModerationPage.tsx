import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Trash2, ThumbsUp, ThumbsDown, Meh, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import { Loading } from '../../components/Loading';
import { canModerate } from '../../utils/roles';
import {
  getModerationFeed, getModerationLog, moderateDelete,
  type ModerationItem, type ModerationLogEntry, type ModerationType,
} from '../../api/moderation';

const TYPE_LABEL: Record<ModerationType, string> = {
  comment: 'Комментарий в профиле',
  game_comment: 'Комментарий к игре',
  game_review: 'Отзыв',
  community_post: 'Обсуждение',
  community_post_comment: 'Ответ в обсуждении',
  community_image: 'Изображение',
  community_workshop: 'Мастерская',
  voice_message: 'Чат голосового канала',
  community: 'Сообщество',
};

const TABS: [ModerationType | 'all', string][] = [
  ['all', 'Всё'],
  ['comment', 'Профили'],
  ['game_comment', 'Комментарии к играм'],
  ['game_review', 'Отзывы'],
  ['community_post', 'Обсуждения'],
  ['community_post_comment', 'Ответы'],
  ['community_image', 'Изображения'],
  ['community_workshop', 'Мастерская'],
  ['voice_message', 'Чаты каналов'],
  ['community', 'Сообщества'],
];

const fmt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Модерация контента: лента свежих комментариев, отзывов, обсуждений, изображений и
 *  сообществ с удалением, плюс журнал удалений. Доступ — moderator, manager, admin. */
export default function ModerationPage() {
  const { user } = useAuth();
  const [view, setView] = useState<'feed' | 'log'>('feed');
  const [type, setType] = useState<ModerationType | 'all'>('all');

  if (!canModerate(user?.role)) {
    return (
      <div className="max-w-[900px] mx-auto px-6 py-16">
        <div className="tl-panel p-[22px] flex items-center gap-3">
          <ShieldAlert className="text-[var(--pink)]" />
          <p className="tl-term text-[17px] text-[var(--muted)]">Раздел доступен только модераторам.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8 flex flex-col gap-5">
      <div className="tl-sec-head" style={{ marginBottom: 0 }}>
        <span className="bar" />
        <h2>Модерация</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="tl-tabs">
          <button className={`tl-tab ${view === 'feed' ? 'active' : ''}`} onClick={() => setView('feed')}>Контент</button>
          <button className={`tl-tab ${view === 'log' ? 'active' : ''}`} onClick={() => setView('log')}>Журнал</button>
        </div>
      </div>

      {view === 'feed' ? (
        <>
          <div className="tl-tabs flex-wrap">
            {TABS.map(([id, label]) => (
              <button key={id} className={`tl-tab ${type === id ? 'active' : ''}`} onClick={() => setType(id)}>{label}</button>
            ))}
          </div>
          <Feed type={type} />
        </>
      ) : (
        <Log />
      )}
    </div>
  );
}

function Feed({ type }: { type: ModerationType | 'all' }) {
  const dlg = useDialog();
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    setError('');
    try {
      const page = await getModerationFeed(type, before);
      setItems((prev) => (before ? [...prev, ...page.items] : page.items));
      setNext(page.next_before);
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Не удалось загрузить контент');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (it: ModerationItem) => {
    const extra = it.type === 'community' ? ' Вместе с ним удалятся все его обсуждения, ответы и изображения.' : '';
    const ok = await dlg.confirm({
      title: `Удалить: ${TYPE_LABEL[it.type].toLowerCase()}`,
      message: `Удаление нельзя отменить, оно попадёт в журнал модерации.${extra}`,
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await moderateDelete(it.type, it.id);
      setItems((prev) => prev.filter((x) => !(x.type === it.type && x.id === it.id)));
    } catch (e: any) {
      dlg.alert({ title: 'Не удалось удалить', message: e?.response?.data?.error || 'Попробуйте ещё раз', danger: true });
    }
  };

  if (loading && items.length === 0) return <Loading label="Контент" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <button className="tl-btn ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} /> Обновить
        </button>
      </div>
      {error && <p className="tl-term text-[16px] text-red-300">{error}</p>}
      {!error && items.length === 0 && (
        <div className="tl-panel p-[22px] tl-term text-[17px] text-[var(--muted)]">Здесь пока пусто.</div>
      )}
      {items.map((it) => <ItemCard key={`${it.type}:${it.id}`} it={it} onDelete={() => remove(it)} />)}
      {next && (
        <button className="tl-btn self-center" onClick={() => void load(next)} disabled={loading}>
          {loading ? 'Загружаем…' : 'Показать ещё'}
        </button>
      )}
    </div>
  );
}

function contextLink(it: ModerationItem): string | null {
  switch (it.context_type) {
    case 'profile': return it.context_ref ? `/profile/${it.context_ref}` : null;
    case 'game': return `/games/${it.context_id}`;
    case 'community': return `/community/${it.context_id}`;
    case 'post': return it.context_parent_id ? `/community/${it.context_parent_id}/post/${it.context_id}` : null;
  }
}

function ItemCard({ it, onDelete }: { it: ModerationItem; onDelete: () => void }) {
  const author = it.author;
  const name = author?.profile?.display_name || author?.username || 'Пользователь';
  const avatar = author?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${author?.username || author?.id}`;
  // у обсуждения ссылка — на само обсуждение, у остального — на место, где лежит контент
  const link = it.type === 'community_post' ? `/community/${it.context_id}/post/${it.id}` : contextLink(it);
  const where = it.type === 'community' ? '' : it.context_name;

  return (
    <article className="tl-panel p-4 flex gap-4">
      <img src={avatar} alt="" className="w-10 h-10 object-cover border border-[var(--line)] bg-black shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to={`/profile/${author?.username}`} className="text-[15px] font-semibold text-white hover:text-[var(--pink)] transition-colors">{name}</Link>
          <span className="tl-chip">{TYPE_LABEL[it.type]}</span>
          {it.type === 'game_review' && (
            it.neutral ? (
              <span className="inline-flex items-center gap-1 text-[14px] text-amber-300"><Meh size={13} /> Нейтральный</span>
            ) : (
              <span className={`inline-flex items-center gap-1 text-[14px] ${it.positive ? 'text-emerald-300' : 'text-red-300'}`}>
                {it.positive ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />} {it.positive ? 'Рекомендует' : 'Не рекомендует'}
              </span>
            )
          )}
          <span className="text-[13px] text-[var(--muted)]">{fmt(it.created_at)}</span>
        </div>
        {where && (
          <div className="text-[14px] text-[var(--muted)] mt-1">
            {link ? <Link to={link} className="hover:text-white underline-offset-2 hover:underline">{where}</Link> : where}
          </div>
        )}
        {it.title && (
          link && it.type === 'community_post'
            ? <Link to={link} className="block text-[16px] font-semibold text-white mt-2 hover:text-[var(--pink)] tl-wrap">{it.title}</Link>
            : <div className="text-[16px] font-semibold text-white mt-2 tl-wrap">{it.title}</div>
        )}
        {it.content && <p className="text-[15px] text-pearl/85 mt-1.5 whitespace-pre-wrap tl-wrap">{it.content}</p>}
        {it.image_url && (
          <img src={it.image_url} alt="" className="mt-3 max-h-[220px] max-w-full object-contain border border-[var(--line)] bg-black" />
        )}
      </div>
      <button onClick={onDelete} className="tl-btn danger self-start shrink-0" title="Удалить">
        <Trash2 size={13} /> Удалить
      </button>
    </article>
  );
}

function Log() {
  const [rows, setRows] = useState<ModerationLogEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getModerationLog().then(setRows).catch((e) => setError(e?.response?.data?.error || 'Не удалось загрузить журнал'));
  }, []);

  if (error) return <p className="tl-term text-[16px] text-red-300">{error}</p>;
  if (!rows) return <Loading label="Журнал" />;
  if (rows.length === 0) return <div className="tl-panel p-[22px] tl-term text-[17px] text-[var(--muted)]">Удалений пока не было.</div>;

  return (
    <div className="tl-panel divide-y divide-[var(--line)]">
      {rows.map((r) => {
        let content = '';
        try { content = JSON.parse(r.meta || '{}').content || ''; } catch { /* старая запись */ }
        return (
          <div key={r.id} className="p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-white">{r.username || `#${r.user_id}`}</span>
              <span className="text-[14px] text-[var(--muted)]">удалил(а)</span>
              <span className="tl-chip">{TYPE_LABEL[r.target_type] || r.target_type}</span>
              {r.target_name && <span className="text-[14px] text-pearl/85 tl-wrap">«{r.target_name}»</span>}
              <span className="text-[13px] text-[var(--muted)] ml-auto">{fmt(r.created_at)}</span>
            </div>
            {content && <p className="text-[14px] text-pearl/75 mt-1.5 whitespace-pre-wrap tl-wrap">{content}</p>}
          </div>
        );
      })}
    </div>
  );
}
