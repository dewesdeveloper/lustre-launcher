import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { IconArrowRight, IconLoader2, IconNews, IconPlus, IconRefresh, IconSparkles, IconTag } from '@tabler/icons-react';
import { getNews, type NewsItem } from '../../api/news';
import { useAuth } from '../../context/AuthContext';
import { hasAdmin } from '../../admin';

/** Рубрики ленты: подпись фильтра, подпись метки на карточке и её цвета */
const RUBRICS: { id: string; filter: string; badge: string; tone: string }[] = [
  { id: 'update', filter: 'Обновления', badge: 'Обновление', tone: 'text-cyan bg-cyan/10 border-cyan/20' },
  { id: 'game', filter: 'Игры', badge: 'Игры', tone: 'text-accent bg-accent/10 border-accent/20' },
  { id: 'cosmetics', filter: 'Оформление', badge: 'Оформление', tone: 'text-violet bg-violet/10 border-violet/20' },
  { id: 'subscription', filter: 'Подписки', badge: 'Подписки', tone: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  { id: 'community', filter: 'Сообщество', badge: 'Сообщество', tone: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  { id: 'general', filter: 'Общее', badge: 'Общее', tone: 'text-pearl/72 bg-white/5 border-white/10' },
];
const GENERAL = RUBRICS[RUBRICS.length - 1];
const rubricOf = (id: string) => RUBRICS.find((r) => r.id === id) ?? GENERAL;

const longDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });

function NewsCard({ item, index, onLink }: { item: NewsItem; index: number; onLink: (to: string) => void }) {
  const rubric = rubricOf(item.category);
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="bg-[#09070c] border border-white/5 rounded-[2rem] p-7 hover:border-accent/25 transition-all duration-500"
    >
      <div className="flex flex-wrap items-center gap-2.5 mb-3">
        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${rubric.tone}`}>{rubric.badge}</span>
        {item.for_you && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-accent/30 bg-accent/10 text-accent">
            <IconSparkles size={10} /> Для вас
          </span>
        )}
        {item.created_at && <time className="ml-auto text-[10px] font-black uppercase tracking-widest text-pearl/60">{longDate(item.created_at)}</time>}
      </div>

      {item.image_url && <img src={item.image_url} alt="" className="w-full h-52 object-cover rounded-2xl mb-4 border border-white/5" />}

      <h2 className="text-lg font-black text-white uppercase tracking-tight">{item.title}</h2>
      <p className="tl-wrap text-sm text-pearl/70 font-medium leading-relaxed whitespace-pre-wrap mt-2.5">{item.content}</p>

      {!!item.tags?.length && (
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <IconTag size={12} className="text-pearl/55" />
          {item.tags.map((t) => (
            <span key={t.id} className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest bg-violet/10 border border-violet/20 text-violet/80">{t.name}</span>
          ))}
        </div>
      )}

      {item.link && (
        <button
          type="button"
          onClick={() => onLink(item.link)}
          className="group mt-5 flex items-center gap-2 px-5 py-3 bg-white/[0.04] border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-pearl/60 hover:text-white hover:border-accent/40 transition-all"
        >
          Подробнее <IconArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </button>
      )}
    </motion.article>
  );
}

/** Лента новостей платформы с фильтром по рубрикам; администратору — кнопка создания. */
export default function NewsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canPublish = hasAdmin && user?.role === 'admin';
  const [rubric, setRubric] = useState('all');
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    getNews(rubric)
      .then(setItems, () => setItems([]))
      .finally(() => setLoading(false));
  }, [rubric]);

  useEffect(refresh, [refresh]);

  const filters = [{ id: 'all', filter: 'Все' }, ...RUBRICS];

  return (
    <div className="p-8 max-w-4xl mx-auto animate-in fade-in duration-700 text-left">
      <header className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter text-white flex items-center gap-3">
            <IconNews className="text-accent" size={32} /> Новости <span className="text-accent">Lustre</span>
          </h1>
          <p className="text-pearl/60 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Персональная лента: обновления, игры, оформление и подписки</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canPublish && (
            <button
              type="button"
              onClick={() => navigate('/admin/news')}
              className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-accent/20"
            >
              <IconPlus size={14} /> Создать
            </button>
          )}
          <button
            type="button"
            title="Обновить"
            onClick={refresh}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-pearl/70 hover:text-white hover:border-accent/40 transition-all"
          >
            <IconRefresh size={16} />
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 mb-7">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setRubric(f.id)}
            className={`px-3.5 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${rubric === f.id
              ? 'bg-gradient-to-r from-accent to-violet text-white border-transparent shadow-[0_0_18px_rgb(var(--accent-rgb)/0.3)]'
              : 'bg-white/[0.02] border-white/5 text-pearl/60 hover:border-white/15'}`}
          >
            {f.filter}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex justify-center py-24"><IconLoader2 className="animate-spin text-accent" size={30} /></div>
      ) : items.length === 0 ? (
        <div className="rounded-[2rem] bg-white/[0.02] border border-white/5 p-14 text-center">
          <IconNews className="mx-auto text-pearl/60 mb-4" size={32} />
          <p className="text-sm font-black uppercase tracking-widest text-pearl/60">Новостей пока нет</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((n, i) => <NewsCard key={n.id} item={n} index={i} onLink={(to) => navigate(to)} />)}
        </div>
      )}
    </div>
  );
}
