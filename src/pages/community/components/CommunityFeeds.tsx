import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconExternalLink, IconPlayerPlay, IconTrash, IconX } from '@tabler/icons-react';
import {
  deleteWorkshopItem, getBroadcasts, getScreenshotsFeed, getWorkshopFeed,
  type BroadcastItem, type FeedScreenshot, type FeedWorkshopItem,
} from '../../../api/community';
import { useAdultConsent } from '../../../components/AdultGate/AdultGate';
import { useDialog } from '../../../components/Dialogs';
import { useAuth } from '../../../context/AuthContext';
import { canModerate } from '../../../utils/roles';

export type CommunityFeedKind = 'screenshots' | 'workshop' | 'broadcasts';
export type PublishTab = 'image' | 'workshop';

const PAGE = 48;

function FeedHead({ title, hint, action }: { title: string; hint: string; action?: { label: string; onClick: () => void } | null }) {
  return (
    <div className="tl-sec-head">
      <span className="bar" />
      <h2>{title}</h2>
      <span className="tag">{hint}</span>
      <span className="line" />
      {action && <button type="button" onClick={action.onClick} className="tl-btn solid">{action.label}</button>}
    </div>
  );
}

function FeedMessage({ text }: { text: string }) {
  return <div className="tl-panel p-10 text-center tl-term text-[16px] tl-muted">{text}</div>;
}

/** Строка «скрыто 18+» — тот же порядок, что в каталоге: контент показывается после подтверждения. */
function AdultHiddenRow({ count }: { count: number }) {
  const { request } = useAdultConsent();
  if (count <= 0) return null;
  return (
    <div className="tl-warnrow justify-between mb-4">
      <span className="t">Скрыто публикаций 18+: {count}</span>
      <button type="button" className="tl-btn" onClick={() => request({ stay: true })}>Показать</button>
    </div>
  );
}

function usePagedFeed<T extends { ID: number }>(fetchPage: (before?: number) => Promise<T[]>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    setError(false);
    try {
      const page = await fetchPage(before);
      setItems((prev) => (before ? [...prev, ...page] : page));
      setHasMore(page.length >= PAGE);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { void load(); }, [load]);
  const more = () => { if (items.length) void load(items[items.length - 1].ID); };
  return { items, setItems, loading, error, hasMore, more };
}

function MoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-center mt-5">
      <button type="button" onClick={onClick} disabled={loading} className="tl-btn ghost">{loading ? 'Загрузка…' : 'Показать ещё'}</button>
    </div>
  );
}

function ScreenshotsFeed({ onPublish }: { onPublish: (() => void) | null }) {
  const navigate = useNavigate();
  const { confirmed } = useAdultConsent();
  const { items, loading, error, hasMore, more } = usePagedFeed<FeedScreenshot>(getScreenshotsFeed);
  const [zoom, setZoom] = useState<string | null>(null);
  const visible = confirmed ? items : items.filter((i) => !i.community?.is_adult);

  return (
    <section>
      <FeedHead title="СКРИНШОТЫ" hint="из всех сообществ" action={onPublish && { label: 'Опубликовать', onClick: onPublish }} />
      <AdultHiddenRow count={items.length - visible.length} />
      {error && <FeedMessage text="Не удалось загрузить скриншоты" />}
      {!error && !loading && visible.length === 0 && <FeedMessage text="Пока никто не опубликовал скриншоты" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((i) => (
          <article key={i.ID} className="tl-panel overflow-hidden">
            <button type="button" onClick={() => setZoom(i.url)} aria-label="Открыть скриншот" className="block w-full aspect-video bg-[#121017]">
              <img src={i.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
            <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--line)]">
              <span className="tl-term text-[14px] tl-muted truncate flex-1">
                {i.author?.profile?.display_name || i.author?.username || 'Игрок'}
              </span>
              <button type="button" onClick={() => navigate(`/community/${i.community_id}`)} className="tl-term text-[14px] text-accent hover:underline truncate max-w-[55%]">
                {i.community?.name}
              </button>
            </div>
          </article>
        ))}
      </div>
      {hasMore && <MoreButton loading={loading} onClick={more} />}
      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6" onClick={() => setZoom(null)}>
          <button type="button" aria-label="Закрыть" className="tl-btn ghost absolute top-4 right-4" onClick={() => setZoom(null)}><IconX size={16} /></button>
          <img src={zoom} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </section>
  );
}

function WorkshopFeed({ onPublish }: { onPublish: (() => void) | null }) {
  const navigate = useNavigate();
  const dlg = useDialog();
  const { user } = useAuth();
  const { confirmed } = useAdultConsent();
  const { items, setItems, loading, error, hasMore, more } = usePagedFeed<FeedWorkshopItem>(getWorkshopFeed);
  const visible = confirmed ? items : items.filter((i) => !i.community?.is_adult);

  const remove = async (item: FeedWorkshopItem) => {
    const ok = await dlg.confirm({ title: 'Удалить публикацию?', message: `«${item.title}» исчезнет из мастерской.`, danger: true });
    if (!ok) return;
    try {
      await deleteWorkshopItem(item.ID);
      setItems((prev) => prev.filter((x) => x.ID !== item.ID));
    } catch (e: any) {
      await dlg.alert({ title: 'Не удалось удалить', message: e?.response?.data?.error || 'Ошибка', danger: true });
    }
  };

  return (
    <section>
      <FeedHead title="МАСТЕРСКАЯ" hint="моды и дополнения" action={onPublish && { label: 'Добавить', onClick: onPublish }} />
      <AdultHiddenRow count={items.length - visible.length} />
      {error && <FeedMessage text="Не удалось загрузить мастерскую" />}
      {!error && !loading && visible.length === 0 && <FeedMessage text="В мастерской пока пусто — добавьте первый мод" />}
      <div className="space-y-3">
        {visible.map((i) => (
          <article key={i.ID} className="tl-panel flex gap-4 p-4">
            {i.image_url && <img src={i.image_url} alt="" loading="lazy" className="w-36 aspect-video object-cover shrink-0 border border-[var(--line)]" />}
            <div className="min-w-0 flex-1">
              <h3 className="tl-head text-[11px] text-white break-words">{i.title}</h3>
              {i.description && <p className="tl-term text-[15px] text-pearl/80 mt-1 whitespace-pre-wrap break-words line-clamp-4">{i.description}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 tl-term text-[14px] tl-muted">
                <span>{i.author?.profile?.display_name || i.author?.username || 'Игрок'}</span>
                <button type="button" onClick={() => navigate(`/community/${i.community_id}`)} className="text-accent hover:underline">{i.community?.name}</button>
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="tl-btn solid"><IconExternalLink size={14} /> Открыть</a>
              {(i.author_id === user?.id || canModerate(user?.role)) && (
                <button type="button" onClick={() => void remove(i)} className="tl-btn ghost"><IconTrash size={14} /> Удалить</button>
              )}
            </div>
          </article>
        ))}
      </div>
      {hasMore && <MoreButton loading={loading} onClick={more} />}
    </section>
  );
}

function BroadcastsFeed() {
  const navigate = useNavigate();
  const { confirmed } = useAdultConsent();
  const [items, setItems] = useState<BroadcastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      getBroadcasts()
        .then((list) => { if (alive) { setItems(list); setError(false); } })
        .catch(() => { if (alive) setError(true); })
        .finally(() => { if (alive) setLoading(false); });
    };
    load();
    // трансляции начинаются и заканчиваются сами по себе — держим список свежим
    const timer = setInterval(load, 20000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const visible = confirmed ? items : items.filter((i) => !i.community.is_adult);

  return (
    <section>
      <FeedHead title="ТРАНСЛЯЦИИ" hint="демонстрация экрана в голосовых каналах" />
      <AdultHiddenRow count={items.length - visible.length} />
      {error && <FeedMessage text="Не удалось загрузить трансляции" />}
      {!error && !loading && visible.length === 0 && (
        <FeedMessage text="Сейчас никто не транслирует. Зайдите в голосовой канал сообщества и включите демонстрацию экрана — трансляция появится здесь" />
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {visible.map((b) => (
          <article key={`${b.user.id}:${b.channel.id}`} className="tl-panel flex items-center gap-3 p-4">
            <img src={b.user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${b.user.id}`} alt="" className="w-11 h-11 object-cover border border-[var(--line)] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="tl-term text-[16px] text-white truncate">{b.user.display_name || b.user.username}</div>
              <div className="tl-term text-[14px] tl-muted truncate">{b.community.name} · {b.channel.name}</div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/community/${b.community.id}`, { state: { tab: 'voice', channelId: b.channel.id } })}
              className="tl-btn solid shrink-0"
            >
              <IconPlayerPlay size={14} /> Смотреть
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Содержимое вкладок «Скриншоты», «Мастерская» и «Трансляции» раздела «Сообщество». */
export default function CommunityFeed({ kind, onPublish }: {
  kind: CommunityFeedKind;
  onPublish: ((tab: PublishTab) => void) | null;
}) {
  if (kind === 'screenshots') return <ScreenshotsFeed onPublish={onPublish && (() => onPublish('image'))} />;
  if (kind === 'workshop') return <WorkshopFeed onPublish={onPublish && (() => onPublish('workshop'))} />;
  return <BroadcastsFeed />;
}
