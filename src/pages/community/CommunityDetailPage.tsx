import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { IconChevronLeft, IconMessage2, IconPhoto, IconPlus } from '@tabler/icons-react';
import { LogIn, Volume2 } from 'lucide-react';
import {
  addCommunityImage, createCommunityPost, deleteCommunityImage, deleteCommunityPost,
  getCommunity, getCommunityImages, getCommunityPosts,
  type Community, type CommunityImage, type CommunityPost,
} from '../../api/community';
import ImageUpload from '../../components/ImageUpload';
import { useDialog } from '../../components/Dialogs';
import { useAuth } from '../../context/AuthContext';
import { useAdultGate } from '../../components/AdultGate/AdultGate';
import CommunityVoiceSection from '../../components/voice/CommunityVoiceSection';
import { useVoice } from '../../components/voice/useVoice';
import { canModerate } from '../../utils/roles';
import type { Tab } from './types';
import CommunityDetailHero from './components/CommunityDetailHero';
import CommunityImageCard from './components/CommunityImageCard';
import PostCard from './components/PostCard';
import DiscussionComposer from './components/DiscussionComposer';

type NavState = { tab?: Tab; channelId?: number } | null;
const errorText = (err: any, fallback: string): string => err?.response?.data?.error || fallback;
const MUTED_CAPS = 'tl-head tl-muted text-[11px] font-bold uppercase tracking-[.2em]';

/** Призыв войти вместо действий для гостя */
function LoginPrompt({ text, onLogin, boxed = false }: { text: string; onLogin: () => void; boxed?: boolean }) {
  const button = <button type="button" onClick={onLogin} className="tl-btn ghost"><LogIn size={14} /> Войти</button>;
  if (!boxed) return <button type="button" onClick={onLogin} className="tl-btn ghost"><LogIn size={14} /> {text}</button>;
  return (
    <div className="tl-panel flex min-h-[140px] flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="tl-head tl-muted text-[10px] font-bold uppercase tracking-[.16em]">{text}</p>
      {button}
    </div>
  );
}

/** Галерея: загрузка новых изображений (для тех, кто может публиковать) и сетка карточек */
function Gallery({ images, canPost, guest, uploadKey, canDelete, onAdd, onDelete, onLogin }: {
  images: CommunityImage[];
  canPost: boolean;
  guest: boolean;
  uploadKey: number;
  canDelete: (img: CommunityImage) => boolean;
  onAdd: (url: string) => void;
  onDelete: (id: number) => void;
  onLogin: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {canPost && (
        <div className="tl-panel p-4">
          {/* key сбрасывает поле загрузки после каждой картинки */}
          <ImageUpload key={uploadKey} folder="communities" label="Добавить изображение" onUpload={onAdd} />
        </div>
      )}
      {guest && <LoginPrompt boxed text="Войдите, чтобы добавлять изображения" onLogin={onLogin} />}
      {images.map((img) => (
        <CommunityImageCard key={img.ID} image={img} canDelete={canDelete(img)} onDelete={() => onDelete(img.ID)} />
      ))}
      {images.length === 0 && (
        <p className={`${MUTED_CAPS} py-10 text-center ${canPost ? 'self-center md:col-span-2 xl:col-span-2' : 'col-span-full'}`}>
          {canPost ? 'Загрузите первое изображение сообщества' : 'Изображений пока нет'}
        </p>
      )}
    </div>
  );
}

/** Новое обсуждение: состояние формы и отправка */
function useNewDiscussion(communityId: number, onCreated: (post: CommunityPost) => void) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setOpen(false);
    setError('');
  };

  const submit = async () => {
    if (!title.trim()) {
      setError('Введите заголовок обсуждения');
      return;
    }
    setSending(true);
    setError('');
    try {
      onCreated(await createCommunityPost(communityId, { title: title.trim(), content: content.trim() }));
      setTitle('');
      setContent('');
      setOpen(false);
    } catch (err) {
      setError(errorText(err, 'Не удалось создать обсуждение'));
    } finally {
      setSending(false);
    }
  };

  return { open, setOpen, title, setTitle, content, setContent, sending, error, close, submit };
}

/** Страница сообщества: обложка и вкладки «Изображения», «Обсуждения», «Голосовые каналы». */
export default function CommunityDetailPage() {
  const communityId = Number(useParams<{ id: string }>().id);
  const navigate = useNavigate();
  const nav = useLocation().state as NavState;
  const dialog = useDialog();
  const voice = useVoice();
  const { user } = useAuth();

  const [community, setCommunity] = useState<Community | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [images, setImages] = useState<CommunityImage[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [uploadKey, setUploadKey] = useState(0);
  const [tab, setTab] = useState<Tab>(nav?.tab === 'discussions' || nav?.tab === 'voice' ? nav.tab : 'images');
  const discussion = useNewDiscussion(communityId, (post) => setPosts((list) => [post, ...list]));

  // переход с плашки «Голосовая связь», когда страница уже открыта
  useEffect(() => {
    if (nav?.tab) setTab(nav.tab);
  }, [nav?.tab, nav?.channelId]);

  // сообщество по игре 18+ требует подтверждения возраста
  useAdultGate(Boolean(community?.game?.is_adult));

  useEffect(() => {
    if (!communityId) return;
    let alive = true;
    setStatus('loading');
    Promise.all([getCommunity(communityId), getCommunityImages(communityId), getCommunityPosts(communityId)])
      .then(([details, gallery, discussions]) => {
        if (!alive) return;
        setCommunity(details.community);
        setIsMember(details.is_member);
        setImages(gallery);
        setPosts(discussions);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('missing'));
    return () => { alive = false; };
  }, [communityId]);

  if (status === 'loading') {
    return <div className="mx-auto max-w-[1600px] p-8"><div className="tl-panel h-64 animate-pulse" /></div>;
  }

  if (status === 'missing' || !community) {
    return (
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-center p-8">
        <div className="tl-panel p-12 text-center">
          <h1 className="mb-2 text-[20px] text-white">Сообщество недоступно</h1>
          <p className="tl-term tl-muted mb-8 text-[16px]">Оно не существует или это приватное сообщество, куда у вас нет приглашения</p>
          <button type="button" onClick={() => navigate('/community')} className="tl-btn solid">Вернуться в сообщества</button>
        </div>
      </div>
    );
  }

  const login = () => navigate('/login');
  const owner = user?.id === community.creator_id;
  // гость только читает; в приватном публикуют владелец и участники, в публичном — все вошедшие
  const canPost = Boolean(user) && (owner || isMember || !community.is_private);
  // чужой контент удаляют владелец сообщества и модераторы
  const moderates = owner || canModerate(user?.role);
  const mine = (authorId: number) => moderates || user?.id === authorId;

  const confirmDelete = (what: string) =>
    dialog.confirm({ title: `Удалить ${what}?`, message: 'Восстановить будет нельзя.', confirmText: 'Удалить', danger: true });
  const fail = (title: string, err: unknown, fallback: string) =>
    dialog.alert({ title, message: errorText(err, fallback), danger: true });

  const addImage = async (url: string) => {
    try {
      const created = await addCommunityImage(communityId, url);
      setImages((list) => [created, ...list]);
    } catch (err) {
      await fail('Изображение не добавлено', err, 'Не удалось добавить изображение');
    } finally {
      setUploadKey((k) => k + 1);
    }
  };

  const removeImage = async (imageId: number) => {
    if (!(await confirmDelete('изображение'))) return;
    try {
      await deleteCommunityImage(imageId);
      setImages((list) => list.filter((i) => i.ID !== imageId));
    } catch (err) {
      await fail('Не удалось удалить', err, 'Не удалось удалить изображение');
    }
  };

  const removePost = async (postId: number) => {
    if (!(await confirmDelete('обсуждение'))) return;
    try {
      await deleteCommunityPost(postId);
      setPosts((list) => list.filter((p) => p.ID !== postId));
    } catch (err) {
      await fail('Не удалось удалить', err, 'Не удалось удалить обсуждение');
    }
  };

  const tabs: { id: Tab; label: string; icon: ReactNode; count: number }[] = [
    { id: 'images', label: 'Изображения', icon: <IconPhoto size={15} />, count: images.length },
    { id: 'discussions', label: 'Обсуждения', icon: <IconMessage2 size={15} />, count: posts.length },
    { id: 'voice', label: 'Голосовые каналы', icon: <Volume2 size={15} />, count: voice.communities[communityId]?.members.length ?? 0 },
  ];

  const creator = community.creator;

  return (
    <div className="mx-auto max-w-[1600px] p-8 text-left animate-in fade-in duration-700">
      <button
        type="button"
        onClick={() => navigate('/community')}
        className="group mb-6 flex items-center gap-2 tl-head text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)] transition-colors hover:text-accent"
      >
        <IconChevronLeft size={16} className="transition-transform group-hover:-translate-x-1" /> Все сообщества
      </button>

      <CommunityDetailHero
        community={community}
        creatorName={creator?.profile?.display_name || creator?.username || 'Игрок'}
        creatorAvatar={creator?.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${community.creator_id}`}
      />

      <div className="tl-tabs mb-8">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`tl-tab ${tab === t.id ? 'active' : ''}`}>
            {t.icon} {t.label}
            <span className="tl-term text-[14px] opacity-70">({t.count})</span>
          </button>
        ))}
      </div>

      {tab === 'voice' && (user
        ? <CommunityVoiceSection communityId={communityId} communityName={community.name} ownerId={community.creator_id} initialChannelId={nav?.channelId ?? null} />
        : (
          <div className="tl-panel p-14 text-center">
            <p className={`${MUTED_CAPS} mb-4`}>Войдите, чтобы заходить в голосовые каналы</p>
            <button type="button" onClick={login} className="tl-btn ghost"><LogIn size={14} /> Войти</button>
          </div>
        ))}

      {tab === 'images' && (
        <Gallery
          images={images}
          canPost={canPost}
          guest={!user}
          uploadKey={uploadKey}
          canDelete={(img) => mine(img.author_id)}
          onAdd={(url) => void addImage(url)}
          onDelete={(id) => void removeImage(id)}
          onLogin={login}
        />
      )}

      {tab === 'discussions' && (
        <div className="max-w-4xl space-y-6">
          {canPost && !discussion.open && (
            <button type="button" onClick={() => discussion.setOpen(true)} className="tl-btn solid"><IconPlus size={15} /> Создать обсуждение</button>
          )}
          {!user && <LoginPrompt text="Войти, чтобы создать обсуждение" onLogin={login} />}

          {discussion.open && (
            <DiscussionComposer
              postTitle={discussion.title}
              postContent={discussion.content}
              postError={discussion.error}
              submitting={discussion.sending}
              onTitleChange={discussion.setTitle}
              onContentChange={discussion.setContent}
              onSubmit={() => void discussion.submit()}
              onClose={discussion.close}
            />
          )}

          {posts.length === 0 ? (
            <div className="tl-panel p-14 text-center">
              <p className={MUTED_CAPS}>Обсуждений пока нет</p>
              <p className="tl-term mt-2 text-[15px] text-[var(--muted-2)]">{canPost ? 'Создайте первое обсуждение' : 'Участники ещё ничего не опубликовали'}</p>
            </div>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.ID}
                post={post}
                canDelete={mine(post.author_id)}
                onDelete={() => void removePost(post.ID)}
                onOpen={() => navigate(`/community/${communityId}/post/${post.ID}`)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
