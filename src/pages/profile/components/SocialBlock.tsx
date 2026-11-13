import { useEffect, useState } from 'react';
import { IconUserPlus, IconUserCheck, IconUsers } from '@tabler/icons-react';
import { getFollowStatus, toggleFollow, type FollowStatus } from '../../../api/social';

export default function SocialBlock({ userId, isOwnProfile }: { userId: number; isOwnProfile: boolean }) {
  const [status, setStatus] = useState<FollowStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getFollowStatus(userId).then(setStatus).catch(() => setStatus(null));
  }, [userId]);

  const onToggle = async () => {
    setBusy(true);
    try {
      const res = await toggleFollow(userId);
      setStatus(s => (s ? { ...s, is_following: res.is_following, followers: res.followers } : s));
    } catch {
      /* offline / error — состояние не меняем */
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <section className="mb-6">
      <div className="tl-sec-head">
        <span className="bar" />
        <h2><IconUsers size={14} /> СОЦИАЛЬНОЕ</h2>
        <span className="line" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-4 px-4 py-2.5 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.04)]">
          <span className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] tl-muted">
            Подписчики <span className="tl-term text-[16px] text-white tabular-nums ml-1">{status.followers}</span>
          </span>
          <span className="w-px h-4 bg-[var(--line)]" />
          <span className="tl-head text-[10px] font-bold uppercase tracking-[0.12em] tl-muted">
            Подписки <span className="tl-term text-[16px] text-white tabular-nums ml-1">{status.following}</span>
          </span>
        </div>

        {!isOwnProfile && (
          <button
            onClick={onToggle}
            disabled={busy}
            className={`tl-btn ${status.is_following ? 'ghost' : 'solid'}`}
          >
            {status.is_following ? <IconUserCheck size={14} /> : <IconUserPlus size={14} />}
            {status.is_following ? 'Вы подписаны' : 'Подписаться'}
          </button>
        )}
      </div>
    </section>
  );
}
