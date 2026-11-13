import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useDialog } from '../../components/Dialogs';
import { IconSend, IconTrash, IconHeart, IconHeartFilled, IconCornerDownRight, IconX } from '@tabler/icons-react';
import { UserAvatarHover } from '../../components/UserAvatarHover';
import ProBadge, { PRO_NICK_CLASS } from '../../components/ProBadge';
import CharCounter from '../../components/CharCounter';
import {
  getWallComments, postWallComment, toggleCommentLike, deleteWallComment,
  type WallComment,
} from '../../api/social';

export default function CommentsSection({ profileId, canDelete = false }: { profileId: number; canDelete?: boolean }) {
  const { user } = useAuth();
  const dlg = useDialog();
  const [comments, setComments] = useState<WallComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<WallComment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  useEffect(() => {
    getWallComments(profileId).then(setComments).catch(() => setComments([]));
  }, [profileId]);

  const { roots, repliesOf } = useMemo(() => {
    const replies: Record<number, WallComment[]> = {};
    const rootList: WallComment[] = [];
    for (const c of comments) {
      if (c.parent_id && c.parent_id !== c.id) {
        (replies[c.parent_id] ||= []).push(c);
      } else {
        rootList.push(c);
      }
    }
    return { roots: rootList.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), repliesOf: (id: number) => replies[id] || [] };
  }, [comments]);

  // удаление с подтверждением; ответы на комментарий уходят вместе с ним
  const handleDelete = async (id: number) => {
    const sure = await dlg.confirm({ title: 'Удалить комментарий', message: 'Удалить этот комментарий вместе с ответами?', confirmText: 'Удалить', danger: true });
    if (!sure) return;
    await deleteWallComment(id).then(
      () => setComments((list) => list.filter((c) => c.id !== id && c.parent_id !== id)),
      () => dlg.alert({ title: 'Ошибка', message: 'Не удалось удалить комментарий', danger: true }),
    );
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setIsLoading(true);
    try {
      const res = await postWallComment(profileId, newComment.trim());
      setComments(prev => [res, ...prev]);
      setNewComment('');
    } catch (e: any) {
      dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось отправить комментарий', danger: true });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyTo || !replyText.trim()) return;
    setReplyBusy(true);
    try {
      const res = await postWallComment(profileId, replyText.trim(), replyTo.id);
      setComments(prev => [...prev, res]);
      setReplyText('');
      setReplyTo(null);
    } catch (e: any) {
      dlg.alert({ title: 'Ошибка', message: e?.response?.data?.error || 'Не удалось отправить ответ', danger: true });
    } finally {
      setReplyBusy(false);
    }
  };

  const handleLike = async (c: WallComment) => {
    setComments(prev => prev.map(x => (x.id === c.id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x)));
    try {
      const res = await toggleCommentLike(c.id);
      setComments(prev => prev.map(x => (x.id === c.id ? { ...x, liked: res.liked, likes: res.likes } : x)));
    } catch {
      setComments(prev => prev.map(x => (x.id === c.id ? { ...x, liked: c.liked, likes: c.likes } : x)));
    }
  };

  const avatar = (c: WallComment) => c.author?.profile?.avatar_url || '';

  const renderComment = (c: WallComment, isReply = false) => (
    <div key={c.id} className={`flex gap-3 group ${isReply ? 'ml-11 mt-3' : ''}`}>
      <UserAvatarHover
        username={c.author?.username}
        displayName={c.author?.profile?.display_name}
        avatarUrl={c.author?.profile?.avatar_url}
      >
        <img
          src={avatar(c)}
          className={`${isReply ? 'h-7 w-7' : 'h-10 w-10'} border border-[var(--line)] group-hover:border-[var(--line-2)] transition-all shrink-0`}
          alt=""
        />
      </UserAvatarHover>
      <div className="flex-1 border-b border-[rgb(var(--accent-rgb)/.12)] pb-4 min-w-0">
        <div className="flex items-center justify-between mb-1 gap-2">
          <span className="font-bold text-white text-sm flex items-center gap-2 min-w-0">
            {c.author?.profile?.is_pro && <ProBadge />}
            <span className={`truncate ${c.author?.profile?.is_pro ? PRO_NICK_CLASS : ''}`}>
              {c.author?.profile?.display_name || c.author?.username}
            </span>
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <span className="tl-term text-[14px] text-[var(--muted-2)]">
              {new Date(c.created_at).toLocaleDateString()}
            </span>
            {canDelete && (
              <button onClick={() => handleDelete(c.id)} title="Удалить комментарий" className="tl-muted hover:text-[#ff5b8a] transition-colors cursor-pointer">
                <IconTrash size={14} />
              </button>
            )}
          </div>
        </div>
        <p className="tl-wrap text-[13px] leading-relaxed text-[#d9c4d3] break-words">{c.content}</p>
        <div className="flex items-center gap-4 mt-2">
          <button
            onClick={() => handleLike(c)}
            className={`flex items-center gap-1.5 tl-head text-[10px] font-bold uppercase tracking-[0.14em] transition-colors cursor-pointer ${c.liked ? 'text-accent' : 'text-[var(--muted-2)] hover:text-accent'}`}
          >
            {c.liked ? <IconHeartFilled size={13} /> : <IconHeart size={13} />}
            {c.likes > 0 ? c.likes : 'Нравится'}
          </button>
          {!isReply && (
            <button
              onClick={() => { setReplyTo(c); setReplyText(''); }}
              className="flex items-center gap-1.5 tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted-2)] hover:text-accent transition-colors cursor-pointer"
            >
              <IconCornerDownRight size={13} /> Ответить
            </button>
          )}
        </div>

        {!isReply && repliesOf(c.id).length > 0 && (
          <div className="mt-3 space-y-3">
            {repliesOf(c.id).map(r => renderComment(r, true))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row items-start gap-8 mt-10 w-full">
      <div className="tl-panel flex-1 w-full min-w-0 p-6">
        <div className="flex justify-between items-center mb-6 border-b border-[var(--line)] pb-4">
          <h2 className="tl-head text-[13px] font-bold text-white flex items-center gap-3">
            СТЕНА ПРОФИЛЯ
            <span className="tl-term text-[15px] tl-pink border border-[var(--line-2)] px-2">{roots.length}</span>
          </h2>
        </div>

        <div className="flex gap-4 mb-8">
          <img src={user?.profile?.avatar_url} className="h-10 w-10 border border-[var(--line-2)] shrink-0" alt="" />
          <div className="flex-1 relative">
            <textarea maxLength={1000}
              placeholder="Добавить комментарий..."
              className="tl-field resize-none h-24"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
            />
            <CharCounter value={newComment} max={1000} />
            <button
              disabled={isLoading}
              onClick={handleSubmit}
              className="absolute bottom-3 right-3 bg-accent p-2 text-[#0b0210] hover:bg-[#ff4f9e] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <IconSend size={18} />
            </button>
          </div>
        </div>

        {replyTo && (
          <div className="flex gap-3 mb-6 pl-14">
            <div className="flex-1 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.05)] p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-pink flex items-center gap-1.5">
                  <IconCornerDownRight size={12} />
                  Ответ для {replyTo.author?.profile?.display_name || replyTo.author?.username}
                </span>
                <button onClick={() => setReplyTo(null)} className="tl-muted hover:text-white transition-colors cursor-pointer">
                  <IconX size={14} />
                </button>
              </div>
              <textarea maxLength={1000}
                autoFocus
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleReply(); }}
                placeholder="Ваш ответ..."
                className="tl-field resize-none h-16"
              />
              <CharCounter value={replyText} max={1000} />
              <div className="flex justify-end mt-2">
                <button
                  disabled={replyBusy || !replyText.trim()}
                  onClick={handleReply}
                  className="tl-btn solid"
                >
                  <IconSend size={13} /> Ответить
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {roots.length === 0 ? (
            <p className="tl-term text-[15px] text-[var(--muted-2)]">Комментариев пока нет — будьте первым.</p>
          ) : (
            roots.map(c => renderComment(c))
          )}
        </div>
      </div>
    </div>
  );
}
