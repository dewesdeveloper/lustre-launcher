import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IconBook, IconChevronRight, IconCircleFilled, IconDeviceGamepad, IconPackage,
  IconPhoto, IconPlayerPlay, IconStar, IconTools,
} from '@tabler/icons-react';
import api from '../../api';
import { presenceLabel, usePresence } from '../../api/presence';
import GameMiniCover from '../../components/GameMiniCover';
import { UserAvatarHover } from '../../components/UserAvatarHover';
import { Loading } from '../../components/Loading';

/** Запись из /friends/user/:username — нужны только данные самого друга */
type Friend = {
  id: number;
  friend_details: {
    id: number;
    username: string;
    profile: { display_name: string; avatar_url: string; level: number };
  };
};

const PREVIEW = 5; // сколько друзей показывать в боковой колонке
const REFRESH_MS = 60_000; // раз в минуту — чтобы статусы не устаревали

/** Разделы профиля; без tab — раздела пока нет, пункт неактивен */
const SECTIONS: { label: string; icon: ReactNode; tab?: string }[] = [
  { label: 'Игры', icon: <IconDeviceGamepad size={16} />, tab: 'games' },
  { label: 'Инвентарь', icon: <IconPackage size={16} />, tab: 'inventory' },
  { label: 'Скриншоты', icon: <IconPhoto size={16} /> },
  { label: 'Видео', icon: <IconPlayerPlay size={16} /> },
  { label: 'Мастерская', icon: <IconTools size={16} /> },
  { label: 'Обзоры', icon: <IconStar size={16} /> },
  { label: 'Руководства', icon: <IconBook size={16} /> },
];

/** Строка друга с живым статусом: «В сети», «Играет в …» или «Не в сети». */
function FriendLine({ friend }: { friend: Friend['friend_details'] }) {
  const navigate = useNavigate();
  const presence = usePresence(friend.id);
  const online = !!presence;
  const playing = !!presence?.playing;
  const { profile } = friend;
  const avatar = profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.username}`;
  const ring = playing ? 'border-accent' : online ? 'border-cyan' : 'border-[var(--line)] grayscale';

  return (
    <div role="link" tabIndex={0} onClick={() => navigate(`/profile/${friend.username}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/profile/${friend.username}`)} className="group flex cursor-pointer items-center gap-3">
      <div className="relative">
        <UserAvatarHover username={friend.username} avatarUrl={profile.avatar_url} displayName={profile.display_name} online={online}>
          <img src={avatar} alt="" className={`w-9 h-9 border transition-colors ${ring}`} />
        </UserAvatarHover>
        {online && <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 border-2 border-[#0f0a17] ${playing ? 'bg-accent' : 'bg-cyan'}`} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`tl-head truncate text-[10px] font-bold transition-colors group-hover:text-white ${online ? 'text-white/70' : 'text-white/60'}`}>{profile.display_name}</p>
        <p className={`tl-term text-[13px] ${online ? 'text-accent' : 'text-[var(--muted-2)]'}`}>{presenceLabel(presence).text}</p>
      </div>
      <GameMiniCover presence={presence} size="xs" />
      <span className="flex h-6 w-7 items-center justify-center border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.04)] tl-term text-[14px] text-violet">{profile.level}</span>
    </div>
  );
}

/** Друзья владельца профиля: null — ещё грузятся, 'hidden' — скрыты его настройками приватности */
function useProfileFriends(username?: string) {
  const [friends, setFriends] = useState<Friend[] | 'hidden' | null>(null);

  useEffect(() => {
    if (!username) return;
    let alive = true;
    const pull = () => api.get<Friend[]>(`/friends/user/${username}`).then(
      (res) => alive && setFriends(res.data.slice(0, PREVIEW)),
      (err) => {
        if (!alive) return;
        // при сетевой ошибке оставляем прошлый список (или пустой при первой загрузке)
        setFriends((prev) => (err?.response?.status === 403 ? 'hidden' : prev ?? []));
      },
    );
    pull();
    const timer = setInterval(pull, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [username]);

  return friends;
}

/** Правая колонка профиля: статус, разделы профиля и короткий список друзей. */
export const ProfileSidebar = () => {
  const navigate = useNavigate();
  const { username } = useParams();
  const friends = useProfileFriends(username);

  const note = (text: string) => <p className="tl-head py-2 text-center text-[10px] uppercase text-[var(--muted-2)]">{text}</p>;

  return (
    <aside className="sticky top-4 hidden w-full space-y-5 lg:block">
      <div className="tl-panel flex items-center gap-3 p-4">
        <span className="relative flex">
          <IconCircleFilled size={12} className="animate-pulse text-accent" />
          <IconCircleFilled size={12} className="absolute inset-0 animate-pulse text-cyan opacity-50 blur-sm" />
        </span>
        <span className="tl-head text-[10px] font-bold uppercase tracking-[0.24em] text-accent drop-shadow-[0_0_8px_rgb(var(--accent-rgb)/0.5)]">В сети</span>
      </div>

      <nav className="tl-panel overflow-hidden">
        {SECTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => s.tab && username && navigate(`/profile/${username}?tab=${s.tab}`)}
            className="group flex w-full items-center gap-3 border-b border-[rgb(var(--accent-rgb)/.12)] px-5 py-3.5 transition-all last:border-0 hover:bg-[rgb(var(--accent-rgb)/.07)]"
          >
            <span className="text-violet transition-colors group-hover:text-accent">{s.icon}</span>
            <span className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)] group-hover:text-white">{s.label}</span>
          </button>
        ))}
      </nav>

      <section className="tl-panel p-5">
        <button type="button" onClick={() => navigate('/friends')} className="group mb-5 flex w-full items-center justify-between">
          <h3 className="tl-head text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)] transition-colors group-hover:text-white">Друзья</h3>
          <IconChevronRight size={16} className="text-violet" />
        </button>
        <div className="space-y-4">
          {friends === null ? <Loading />
            : friends === 'hidden' ? note('Список скрыт приватностью')
            : friends.length === 0 ? note('Нет друзей')
            : friends.map((f) => <FriendLine key={f.id} friend={f.friend_details} />)}
        </div>
      </section>
    </aside>
  );
};
