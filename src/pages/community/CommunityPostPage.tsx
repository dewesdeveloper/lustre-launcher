import { useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { IconArrowLeft, IconLoader2, IconMessage2, IconSend, IconTrash } from '@tabler/icons-react';
import { LogIn } from 'lucide-react';
import {
  addPostComment, deletePostComment, getCommunityPost, getPostComments,
  type Community, type CommunityCreator, type CommunityPost, type CommunityPostComment,
} from '../../api/community';
import ProBadge, { PRO_NICK_CLASS } from '../../components/ProBadge';
import CharCounter from '../../components/CharCounter';
import { useDialog } from '../../components/Dialogs';
import { useAuth } from '../../context/AuthContext';
import { canModerate } from '../../utils/roles';

const REPLY_MAX = 2000;
const avatarOf = (author: CommunityCreator | undefined, fallbackId: number) =>
  author?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${fallbackId}`;
const nameOf = (author: CommunityCreator | undefined) => author?.profile?.display_name || author?.username || 'Игрок';

/** Ник автора (градиентом у Pro) с плашкой Pro */
function AuthorName({ author, className = '' }: { author?: CommunityCreator; className?: string }) {
  const pro = Boolean(author?.profile?.is_pro);
  return (
    <>
      {pro && <ProBadge />}
      <span className={`${className} ${pro ? PRO_NICK_CLASS : ''}`}>{nameOf(author)}</span>
    </>
  );
}

function Reply({ reply, canDelete, onDelete }: { reply: CommunityPostComment; canDelete: boolean; onDelete: () => void }) {
  const when = reply.CreatedAt
    ? new Date(reply.CreatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  return (
    <div className="tl-vrow group">
      <div className="ic"><img src={avatarOf(reply.author, reply.author_id)} alt="" className="h-full w-full object-cover" /></div>
      <div className="vt min-w-0">
        <b>
          <span className="inline-flex flex-wrap items-center gap-2.5">
            <AuthorName author={reply.author} />
            {when && <span className="tl-term text-[15px] font-normal text-[var(--muted-2)]">{when}</span>}
          </span>
        </b>
        <p className="tl-wrap mt-2 whitespace-pre-wrap text-sm leading-relaxed text-pearl/60">{reply.content}</p>
      </div>
      {canDelete && (
        <button type="button" title="Удалить сообщение" onClick={onDelete} className="tl-btn ghost shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <IconTrash size={14} />
        </button>
      )}
    </div>
  );
}

/** Поле ответа: Enter — отправить, Shift+Enter — перенос строки */
function ReplyBox({ onSend }: { onSend: (text: string) => Promise<string | null> }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    const problem = await onSend(value);
    setSending(false);
    setError(problem ?? '');
    if (!problem) setText('');
  };

  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    void send();
  };

  return (
    <>
      <textarea rows={3} value={text} maxLength={REPLY_MAX} onChange={(e) => setText(e.target.value)} onKeyDown={keys} placeholder="Написать в обсуждение..." className="tl-field resize-none" />
      <CharCounter value={text} max={REPLY_MAX} />
      {error && <div className="tl-warnrow mt-3"><span className="t">{error}</span></div>}
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="tl-head text-[10px] font-bold uppercase text-[var(--muted-2)]">Enter — отправить · Shift+Enter — новая строка</span>
        <button type="button" onClick={() => void send()} disabled={sending || !text.trim()} className="tl-btn solid">
          {sending ? <IconLoader2 size={15} className="animate-spin" /> : <IconSend size={15} />} Отправить
        </button>
      </div>
    </>
  );
}

/** Страница обсуждения: тема, ответы участников и поле ответа. */
export default function CommunityPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const id = Number(postId);
  const navigate = useNavigate();
  const dialog = useDialog();
  const { user } = useAuth();

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [replies, setReplies] = useState<CommunityPostComment[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.all([getCommunityPost(id), getPostComments(id)])
      .then(([found, list]) => {
        if (!alive) return;
        setPost(found.post);
        setCommunity(found.community);
        setReplies(list);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('missing'));
    return () => { alive = false; };
  }, [id]);

  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center"><IconLoader2 className="animate-spin text-accent" size={34} /></div>;
  }

  if (status === 'missing' || !post || !community) {
    return (
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center p-8">
        <div className="tl-panel p-12 text-center">
          <h1 className="mb-2 text-[20px] text-white">Обсуждение недоступно</h1>
          <p className="tl-term tl-muted mb-8 text-[16px]">Оно не существует или у вас нет доступа</p>
          <button type="button" onClick={() => navigate('/community')} className="tl-btn solid">К сообществам</button>
        </div>
      </div>
    );
  }

  // удалять ответы может автор ответа, владелец сообщества и модератор
  const moderator = user?.id === community.creator_id || canModerate(user?.role);

  const sendReply = async (text: string): Promise<string | null> => {
    try {
      const created = await addPostComment(id, text);
      setReplies((list) => [...list, created]);
      return null;
    } catch (err: any) {
      return err?.response?.data?.error || 'Не удалось отправить сообщение';
    }
  };

  const removeReply = async (replyId: number) => {
    if (!(await dialog.confirm({ title: 'Удалить сообщение?', message: 'Сообщение исчезнет из обсуждения.', confirmText: 'Удалить', danger: true }))) return;
    try {
      await deletePostComment(replyId);
      setReplies((list) => list.filter((r) => r.ID !== replyId));
    } catch (err: any) {
      await dialog.alert({ title: 'Не удалось удалить', message: err?.response?.data?.error || 'Ошибка сервера', danger: true });
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-8 text-left animate-in fade-in duration-700">
      <button
        type="button"
        onClick={() => navigate(`/community/${community.ID}`)}
        className="group mb-5 flex items-center gap-2 tl-head text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)] transition-colors hover:text-accent"
      >
        <IconArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" /> {community.name}
      </button>

      <article className="tl-panel mb-6 p-7">
        <div className="flex items-start gap-4">
          <img src={avatarOf(post.author, post.author_id)} alt="" className="h-11 w-11 shrink-0 border border-[var(--line-2)] object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <AuthorName author={post.author} className="tl-head text-[10px] font-bold uppercase text-[var(--muted)]" />
              {post.CreatedAt && <time className="tl-term text-[15px] text-[var(--muted-2)]">{new Date(post.CreatedAt).toLocaleDateString('ru-RU')}</time>}
            </div>
            <h1 className="tl-wrap mt-2 text-[20px] text-white">{post.title}</h1>
            {post.content && <p className="tl-wrap mt-3 whitespace-pre-wrap text-sm leading-relaxed text-pearl/60">{post.content}</p>}
          </div>
        </div>
      </article>

      <div className="tl-sec-head">
        <span className="bar" />
        <h2><IconMessage2 size={15} className="text-accent" /> Обсуждение</h2>
        <span className="count">// {replies.length}</span>
        <span className="line" />
      </div>

      <div className="mb-6 space-y-3">
        {replies.length === 0 ? (
          <div className="tl-panel p-10 text-center">
            <p className="tl-head tl-muted text-[11px] font-bold uppercase tracking-[.2em]">Пока нет сообщений</p>
            <p className="tl-term mt-2 text-[15px] text-[var(--muted-2)]">Начните обсуждение первым</p>
          </div>
        ) : (
          replies.map((r) => (
            <Reply key={r.ID} reply={r} canDelete={moderator || user?.id === r.author_id} onDelete={() => void removeReply(r.ID)} />
          ))
        )}
      </div>

      <div className="tl-panel p-5">
        {user ? (
          <ReplyBox onSend={sendReply} />
        ) : (
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="tl-head tl-muted text-center text-[10px] font-bold uppercase tracking-[.14em] sm:text-left">Войдите, чтобы комментировать</p>
            <button type="button" onClick={() => navigate('/login')} className="tl-btn ghost shrink-0"><LogIn size={14} /> Войти</button>
          </div>
        )}
      </div>
    </div>
  );
}
