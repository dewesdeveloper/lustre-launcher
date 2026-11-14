import { useEffect, useState, type ComponentType } from 'react';
import { IconAward, IconCalendar, IconDeviceGamepad, IconStar } from '@tabler/icons-react';
import api from '../../api';
import { getUserBadges, type UserBadge } from '../../api/badges';
import BadgeEmblem from '../../components/BadgeEmblem';
import { parseShowcases, type Showcase } from './constants';

type FavGame = { title: string; header_image?: string; banner_url?: string; developer?: string; release_date?: string };

const MAX_BADGES = 8;

function Hint({ children }: { children: string }) {
  return <p className="tl-head py-6 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">{children}</p>;
}

/** Витрина «Редкие достижения»: до восьми полученных значков пользователя */
function BadgesShelf({ userId }: { userId?: number }) {
  const [list, setList] = useState<UserBadge[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getUserBadges(userId).then((b) => alive && setList(b), () => alive && setList([]));
    return () => { alive = false; };
  }, [userId]);

  if (!list) {
    return (
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square animate-pulse border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.03)]" />)}
      </div>
    );
  }
  if (list.length === 0) return <Hint>Награды пока не получены</Hint>;

  return (
    <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
      {list.slice(0, MAX_BADGES).map(({ ID, badge }) => (
        <div key={ID} title={`${badge?.name} — ${badge?.description}`} className="flex aspect-square cursor-default items-center justify-center transition-transform hover:scale-110">
          <BadgeEmblem code={badge?.code} rarity={badge?.rarity} size={52} />
        </div>
      ))}
    </div>
  );
}

/** Витрина «Любимая игра»: карточка игры по id из настроек витрины */
function FavoriteGame({ gameId }: { gameId: number }) {
  const [game, setGame] = useState<FavGame | null>(null);
  const [pending, setPending] = useState(!!gameId);

  useEffect(() => {
    if (!gameId) { setGame(null); setPending(false); return; }
    let alive = true;
    setPending(true);
    api.get<FavGame>(`/games/${gameId}`)
      .then((res) => alive && setGame(res.data), () => alive && setGame(null))
      .finally(() => alive && setPending(false));
    return () => { alive = false; };
  }, [gameId]);

  if (pending) return <div className="h-24 animate-pulse border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.03)]" />;
  if (!game) return <Hint>Игра не выбрана</Hint>;

  return (
    <div className="tl-gcard max-w-md">
      <div className="thumb"><img src={game.header_image || game.banner_url} alt={game.title} draggable={false} /></div>
      <div className="body">
        <h3 className="truncate">{game.title}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {game.developer && <span className="tl-term truncate text-[14px] tl-muted">{game.developer}</span>}
          {game.release_date && (
            <span className="tl-term flex items-center gap-1.5 text-[14px] tl-muted">
              <IconCalendar size={12} /> {new Date(game.release_date).toLocaleDateString('ru-RU')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Типы витрин: заголовок, иконка с цветом и содержимое */
const KINDS: Record<string, { title: string; Icon: ComponentType<{ size?: number; className?: string }>; tone: string; Body: ComponentType<{ item: Showcase; userId?: number }> }> = {
  achievements: { title: 'Редкие достижения', Icon: IconAward, tone: 'text-accent', Body: ({ userId }) => <BadgesShelf userId={userId} /> },
  text: {
    title: 'Информация',
    Icon: IconStar,
    tone: 'text-cyan',
    Body: ({ item }) => <p className="tl-term whitespace-pre-line text-[16px] italic leading-relaxed text-[#d9c4d3]">«{item.data || 'Никакой информации не указано...'}»</p>,
  },
  fav_game: { title: 'Любимая игра', Icon: IconDeviceGamepad, tone: 'text-violet', Body: ({ item }) => <FavoriteGame gameId={Number(item.data) || 0} /> },
};

/** Витрины профиля (до трёх), выбранные пользователем в настройках. Неизвестные типы пропускаются. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- профиль приходит с сервера в свободной форме
export const ProfileShowcase = ({ profile, userId }: { profile: any; userId?: number }) => {
  const items = parseShowcases(profile).filter((s) => s.type in KINDS);
  if (items.length === 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-6 text-left">
      {items.map((item, i) => {
        const { title, Icon, tone, Body } = KINDS[item.type];
        return (
          <section key={`${item.type}-${i}`} className="tl-panel p-[22px]">
            <h3 className="tl-head mb-4 flex items-center gap-3 text-[11px] font-bold uppercase text-white" style={{ textShadow: 'var(--glow-sm)' }}>
              <Icon size={15} className={tone} /> {title}
            </h3>
            <Body item={item} userId={userId} />
          </section>
        );
      })}
    </div>
  );
};
