import { useEffect, useState } from 'react';
import ImageOr from '../../../components/ImageOr';
import { useNavigate } from 'react-router-dom';
import { IconActivity, IconChevronRight } from '@tabler/icons-react';
import { getUserActivity, type ActivityItem, type ActivityKind } from '../../../api/activity';
import BadgeEmblem from '../../../components/BadgeEmblem';
import { rarityStyles, type BadgeRarity } from '../../../api/badges';

const VERB: Record<string, string> = {
  library_add: 'добавил(а) в библиотеку',
  favorite: 'добавил(а) в избранное',
  badge_earned: 'получил(а) значок',
  comment: 'оставил(а) комментарий',
  follow: 'подписался(ась) на',
  group: 'создал(а) группу',
  review: 'оставил(а) отзыв',
  title_equip: 'надел(а) титул',
  level_up: 'вышел(а) на уровень',
};

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} дн назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function ActivityBlock({ username, isOwnProfile }: { username: string; isOwnProfile: boolean }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    getUserActivity(username, 5).then(d => setItems(d.items || [])).catch(() => setItems(null));
  }, [username]);

  if (!items || items.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="tl-sec-head">
        <span className="bar" />
        <h2><IconActivity size={14} /> АКТИВНОСТЬ</h2>
        <span className="line" />
        {isOwnProfile && (
          <button
            onClick={() => navigate('/activity')}
            className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted hover:text-white transition-colors flex items-center gap-1.5"
          >
            Вся лента <IconChevronRight size={12} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {items.map(it => {
          const isBadge = it.kind === ('badge_earned' as ActivityKind);
          const rarity = (it.meta?.rarity as BadgeRarity) || 'common';
          const label = (rarityStyles[rarity] || rarityStyles.common).label;
          return (
            <div key={it.id} className="tl-panel p-4">
              <div className="flex items-center gap-2.5">
                {isBadge ? (
                  <BadgeEmblem code={it.meta?.code || 'unknown'} rarity={rarity} size={34} />
                ) : (
                  <ImageOr
                    src={it.target_image}
                    className="w-[34px] h-[34px] object-cover border border-[var(--line-2)] shrink-0"
                    fallback={<div className="w-[34px] h-[34px] border border-[var(--line)] bg-[#08050f] shrink-0" />}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-extrabold text-white truncate">
                    {VERB[it.kind] || 'обновил(а) профиль'}
                    {it.target_name && <span className="text-accent"> {it.target_name}</span>}
                  </div>
                  <div className="tl-term text-[14px] tl-muted truncate">{ago(it.created_at)}</div>
                </div>
                {isBadge && <span className="tl-chip epic shrink-0">{label}</span>}
              </div>
              {it.meta?.excerpt && (
                <p className="text-[13px] leading-relaxed text-[#d9c4d3] mt-3">{it.meta.excerpt}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
