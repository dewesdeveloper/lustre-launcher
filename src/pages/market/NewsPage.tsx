import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { IconArrowRight, IconEye, IconLoader2, IconNews, IconPlus, IconRefresh, IconSearch, IconSparkles, IconTag, IconX } from '@tabler/icons-react';
import { StoreSubNav } from './StoreSubNav';
import { getNews, viewNews, type NewsItem } from '../../api/news';
import { useAuth } from '../../context/AuthContext';
import { hasAdmin } from '../../admin';

/** Рубрики ленты: подпись фильтра и цвет метки (классы tl-chip) */
const RUBRICS: { id: string; label: string; chip: string }[] = [
  { id: 'update', label: 'Обновления', chip: 'common' },
  { id: 'game', label: 'Игры', chip: 'rare' },
  { id: 'cosmetics', label: 'Оформление', chip: 'epic' },
  { id: 'subscription', label: 'Подписки', chip: 'legendary' },
  { id: 'community', label: 'Сообщество', chip: 'ok' },
  { id: 'general', label: 'Общее', chip: 'age' },
];
const GENERAL = RUBRICS[RUBRICS.length - 1];
const rubricOf = (id: string) => RUBRICS.find((r) => r.id === id) ?? GENERAL;

const longDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });

/** Метки новости: рубрика, «для вас», дата */
function Meta({ item, long = false }: { item: NewsItem; long?: boolean }) {
  const r = rubricOf(item.category);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`tl-chip ${r.chip}`}>{r.label}</span>
      {item.for_you && <span className="tl-chip rare"><IconSparkles size={10} className="mr-1 inline align-[-1px]" />Для вас</span>}
      {typeof item.views === 'number' && item.views > 0 && (
        <span className="tl-term ml-auto flex items-center gap-1 text-[14px] text-[var(--muted-2)]" title="Просмотры">
          <IconEye size={13} /> {item.views.toLocaleString('ru-RU')}
        </span>
      )}
      {item.created_at && (
        <time className={`tl-term ${typeof item.views === 'number' && item.views > 0 ? '' : 'ml-auto '} text-[14px] text-[var(--muted-2)]`}>{long ? longDate(item.created_at) : shortDate(item.created_at)}</time>
      )}
    </div>
  );
}

function Tags({ item }: { item: NewsItem }) {
  if (!item.tags?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <IconTag size={12} className="text-[var(--muted-2)]" />
      {item.tags.map((t) => <span key={t.id} className="tl-chip age">{t.name}</span>)}
    </div>
  );
}

/** Главная новость — крупно, картинка слева */
function Featured({ item, onRead }: { item: NewsItem; onRead: () => void }) {
  return (
    <article className="tl-panel tl-gcard group grid cursor-pointer grid-cols-1 overflow-hidden lg:grid-cols-[1.4fr_1fr]" onClick={onRead}>
      <div className="relative aspect-video overflow-hidden bg-[#121017] lg:aspect-auto lg:min-h-[320px]">
        {item.image_url
          ? <img src={item.image_url} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
          : <div className="absolute inset-0 bg-gradient-to-br from-violet/30 via-[#121017] to-accent/25" />}
        <span className="tl-head absolute left-4 top-4 bg-black/60 px-2 py-1 text-[9px] font-bold uppercase tracking-[.24em] text-accent">// Главное</span>
      </div>
      <div className="flex flex-col gap-4 p-7">
        <Meta item={item} long />
        <h2 className="tl-pixel text-[22px] leading-tight text-white transition-colors group-hover:text-accent">{item.title}</h2>
        <p className="tl-term line-clamp-6 whitespace-pre-wrap text-[16px] leading-relaxed text-pearl/75">{item.content}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
          <Tags item={item} />
          <span className="tl-btn solid">Читать <IconArrowRight size={14} /></span>
        </div>
      </div>
    </article>
  );
}

function NewsCard({ item, onRead }: { item: NewsItem; onRead: () => void }) {
  return (
    <article className="tl-panel tl-gcard group flex cursor-pointer flex-col overflow-hidden" onClick={onRead}>
      {item.image_url && (
        <div className="relative aspect-[16/7] overflow-hidden border-b border-[var(--line)] bg-[#121017]">
          <img src={item.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <Meta item={item} />
        <h3 className="line-clamp-2 !text-[13px] transition-colors group-hover:text-accent">{item.title}</h3>
        <p className="tl-term line-clamp-4 whitespace-pre-wrap text-[15px] leading-relaxed text-pearl/70">{item.content}</p>
        <span className="tl-head mt-auto flex items-center gap-1.5 pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-[var(--muted)] group-hover:text-accent">
          Читать полностью <IconArrowRight size={12} />
        </span>
      </div>
    </article>
  );
}

/** Окно чтения новости целиком */
function Reader({ item, onClose, onLink }: { item: NewsItem; onClose: () => void; onLink: (to: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" onClick={onClose}>
      <article className="tl-panel flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
        {item.image_url && <img src={item.image_url} alt="" className="max-h-72 w-full shrink-0 border-b border-[var(--line)] object-cover" />}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-7">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex-1"><Meta item={item} long /></div>
            <button type="button" onClick={onClose} title="Закрыть" className="tl-muted shrink-0 transition-colors hover:text-white"><IconX size={18} /></button>
          </div>
          <h2 className="tl-pixel text-[22px] leading-tight text-white">{item.title}</h2>
          <p className="tl-wrap tl-term mt-4 whitespace-pre-wrap text-[17px] leading-relaxed text-pearl/80">{item.content}</p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Tags item={item} />
            {item.link && (
              <button type="button" onClick={() => onLink(item.link)} className="tl-btn solid">Подробнее <IconArrowRight size={14} /></button>
            )}
          </div>
        </div>
      </article>
    </div>,
    document.body,
  );
}

/** Лента новостей платформы: главная новость, рубрики, поиск и «только для вас»; администратору — создание. */
export default function NewsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPublish = hasAdmin && user?.role === 'admin';
  const [rubric, setRubric] = useState('all');
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [forYou, setForYou] = useState(false);
  const [reading, setReadingState] = useState<NewsItem | null>(null);
  // Открытие новости засчитывает просмотр (сервер считает одного пользователя один раз)
  const setReading = useCallback((n: NewsItem | null) => {
    setReadingState(n);
    if (!n) return;
    void viewNews(n.id).then((views) => {
      if (views === null) return;
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, views } : x)));
      setReadingState((cur) => (cur && cur.id === n.id ? { ...cur, views } : cur));
    });
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(false);
    getNews(rubric)
      .then(setItems, () => { setItems([]); setError(true); })
      .finally(() => setLoading(false));
  }, [rubric]);

  useEffect(refresh, [refresh]);

  // Переход из уведомления о важной новости: /news?id=… — сразу открываем её
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('id')) || 0;
  useEffect(() => {
    if (!openId || loading) return;
    const found = items.find((n) => n.id === openId);
    if (found) {
      setReading(found);
      setParams({}, { replace: true });
    } else if (rubric !== 'all') {
      setRubric('all'); // новость из другой рубрики — ищем во всех
    } else {
      setParams({}, { replace: true });
    }
  }, [openId, items, loading, rubric, setParams, setReading]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((n) => (!forYou || n.for_you)
      && (!q || `${n.title}\n${n.content}\n${(n.tags ?? []).map((t) => t.name).join(' ')}`.toLowerCase().includes(q)));
  }, [items, query, forYou]);
  const filtered = !!query.trim() || forYou;
  const [featured, ...rest] = shown;
  const forYouCount = items.filter((n) => n.for_you).length;

  const openLink = (to: string) => {
    setReading(null);
    if (/^https?:\/\//i.test(to)) window.open(to, '_blank', 'noopener,noreferrer');
    else navigate(to);
  };

  return (
    <div className="animate-in fade-in pb-12 duration-500 text-left">
      <StoreSubNav />
      <div className="mx-auto max-w-[1240px] px-6 pt-8">
        <header className="tl-panel relative mb-6 overflow-hidden p-8">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70" style={{
            backgroundImage: 'radial-gradient(560px 220px at 90% 0%, rgb(var(--accent-rgb)/.2), transparent 70%), linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
            backgroundSize: 'auto, 28px 28px, 28px 28px',
          }} />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="tl-head mb-3 text-[10px] font-bold uppercase tracking-[.3em] text-accent">// Newsroom</p>
              <h1 className="tl-pixel flex items-center gap-3 text-[30px] leading-tight text-white" style={{ textShadow: 'var(--glow)' }}>
                <IconNews size={30} className="text-accent" /> Новости <span className="text-accent">Lustre</span>
              </h1>
              <p className="tl-term mt-2 text-[16px] text-[var(--muted)]">Обновления платформы, игры, оформление и подписки. Отмеченное «Для вас» подобрано по вашим интересам.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canPublish && (
                <button type="button" onClick={() => navigate('/admin/news')} className="tl-btn solid"><IconPlus size={14} /> Создать</button>
              )}
              <button type="button" title="Обновить" onClick={refresh} className="tl-btn ghost"><IconRefresh size={14} /></button>
            </div>
          </div>
        </header>

        <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="tl-tabs">
            {[{ id: 'all', label: 'Все' }, ...RUBRICS].map((r) => (
              <button key={r.id} type="button" onClick={() => setRubric(r.id)} className={`tl-tab ${rubric === r.id ? 'active' : ''}`}>{r.label}</button>
            ))}
          </div>
          <div className="flex flex-1 items-center gap-2 lg:justify-end">
            <button type="button" aria-pressed={forYou} onClick={() => setForYou((v) => !v)} disabled={!forYouCount}
              className={`tl-chip cursor-pointer disabled:cursor-default disabled:opacity-50 ${forYou ? 'rare' : 'text-[var(--muted)] hover:text-white'}`}>
              <IconSparkles size={10} className="mr-1 inline align-[-1px]" />Для вас{forYouCount ? ` · ${forYouCount}` : ''}
            </button>
            <div className="relative w-full lg:w-72">
              <div className="tl-prefix">
                <span className="at"><IconSearch size={15} /></span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} data-search-hotkey="page" placeholder="Поиск по новостям…" className="tl-field dense" />
              </div>
              {query && (
                <button type="button" title="Очистить" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-accent"><IconX size={13} /></button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24"><IconLoader2 className="animate-spin text-accent" size={30} /></div>
        ) : shown.length === 0 ? (
          <div className="tl-panel p-14 text-center">
            <IconNews className="mx-auto mb-4 text-[var(--muted-2)]" size={32} />
            <p className="tl-head text-[11px] font-bold uppercase tracking-[.2em] text-white">
              {error ? 'Не удалось загрузить новости' : filtered ? 'Ничего не найдено' : 'Новостей пока нет'}
            </p>
            {filtered && !error && (
              <button type="button" onClick={() => { setQuery(''); setForYou(false); }} className="tl-btn ghost mx-auto mt-5">Сбросить поиск</button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <Featured item={featured} onRead={() => setReading(featured)} />
            {rest.length > 0 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rest.map((n) => <NewsCard key={n.id} item={n} onRead={() => setReading(n)} />)}
              </div>
            )}
          </div>
        )}
      </div>

      {reading && <Reader item={reading} onClose={() => setReading(null)} onLink={openLink} />}
    </div>
  );
}
