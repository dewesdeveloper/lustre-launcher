import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { useEffect } from 'react';
import { ConnectivityProvider } from '../../src/context/ConnectivityContext';
import { AuthProvider } from '../../src/context/AuthContext';
import { SettingsProvider } from '../../src/context/SettingsContext';
import { DialogProvider } from '../../src/components/Dialogs';
import { UserAvatarHover } from '../../src/components/UserAvatarHover';
import { CommentItem } from '../../src/components/comments/CommentItem';
import { ReviewCard } from '../../src/components/reviews/ReviewCard';
import { ReviewForm } from '../../src/components/reviews/ReviewForm';
import MiniProfileCard from '../../src/components/MiniProfileCard';
import type { Comment } from '../../src/components/comments/types';

const sampleComment: Comment = {
  id: 1,
  game_id: 1,
  user_id: 2,
  content: 'Классная игра!',
  created_at: new Date(Date.now() - 60_000).toISOString(),
  author: {
    username: 'dewes',
    profile: {
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dewes',
      display_name: 'Дима',
      is_pro: false,
      frame_id: 'neon',
      avatar_frame_url: '',
      avatar_frame_scale: 1,
      tags: JSON.stringify([
        { text: 'Ветеран', color: '#22D3EE', custom: false, item_id: 1 },
        { text: 'Мастер', color: '#8B5CF6', custom: false, item_id: 2 },
        { text: 'Легенда', color: '#EAB308', custom: false, item_id: 3 },
      ]),
    },
  },
};

/** Статус в DOM — увидим его в --dump-dom */
function Marker() {
  useEffect(() => {
    const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    const hover = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
      return true;
    };
    const cardOf = (name: string) =>
      Array.from(document.querySelectorAll('.w-\\[300px\\]')).some((el) => el.textContent?.includes(name));

    (async () => {
      await sleep(150);
      const parts: string[] = [];

      hover('#comment-root .inline-flex');
      await sleep(700);
      const c = document.getElementById('comment-root');
      parts.push(cardOf('Дима') ? 'карточка-коммент:ЕСТЬ' : 'карточка-коммент:НЕТ');
      parts.push(c && c.querySelector('.rounded-\\[0\\.4rem\\]') ? 'рамка-коммент:ЕСТЬ' : 'рамка-коммент:НЕТ');
      parts.push(c && c.textContent?.includes('Ветеран') ? 'титул-коммент:ЕСТЬ' : 'титул-коммент:НЕТ');

      hover('#review-root .inline-flex');
      await sleep(700);
      const r = document.getElementById('review-root');
      parts.push(cardOf('ОтзывАвтор') ? 'карточка-отзыв:ЕСТЬ' : 'карточка-отзыв:НЕТ');
      parts.push(r && r.querySelector('.rounded-\\[0\\.4rem\\]') ? 'рамка-отзыв:ЕСТЬ' : 'рамка-отзыв:НЕТ');
      parts.push(r && r.textContent?.includes('Ветеран') ? 'титул-отзыв:ЕСТЬ' : 'титул-отзыв:НЕТ');

      hover('#form-root .inline-flex');
      await sleep(700);
      const f = document.getElementById('form-root');
      parts.push(cardOf('СвояЛичность') ? 'карточка-свой:ЕСТЬ' : 'карточка-свой:НЕТ');
      parts.push(f && f.querySelector('.rounded-\\[0\\.4rem\\]') ? 'рамка-свой:ЕСТЬ' : 'рамка-свой:НЕТ');
      parts.push(f && f.textContent?.includes('Ваш отзыв') ? 'форма:ОК' : 'форма:НЕТ');

      document.getElementById('status')!.textContent = parts.join(' | ');
    })();

    return () => undefined;
  }, []);

  return <div id="status">ОЖИДАНИЕ</div>;
}

function App() {
  return (
    <ConnectivityProvider>
      <AuthProvider>
        <SettingsProvider>
          <DialogProvider>
            <MemoryRouter>
              <div style={{ padding: 24 }}>
                <Marker />

                <div id="comment-root" style={{ maxWidth: 520, marginTop: 32 }}>
                  <CommentItem comment={sampleComment} canDelete={false} onDelete={() => {}} />
                </div>

                <div id="review-root" style={{ maxWidth: 520, marginTop: 32 }}>
                  <ReviewCard
                    review={{
                      id: 1,
                      game_id: 1,
                      user_id: 2,
                      positive: true,
                      content: 'Классная игра!',
                      created_at: new Date(Date.now() - 86_400_000).toISOString(),
                      author: {
                        username: 'reviewer',
                        profile: {
                          avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=reviewer',
                          display_name: 'ОтзывАвтор',
                          frame_id: 'neon',
                          avatar_frame_url: '',
                          avatar_frame_scale: 1,
                          tags: JSON.stringify([
                            { text: 'Ветеран', color: '#22D3EE', custom: false, item_id: 1 },
                            { text: 'Мастер', color: '#8B5CF6', custom: false, item_id: 2 },
                          ]),
                        },
                      },
                    }}
                    canDelete={false}
                    onDelete={() => {}}
                  />
                </div>

                <div style={{ marginTop: 32 }}>
                  <UserAvatarHover username="dewes" displayName="Дима" online>
                    <img
                      id="avatar-under-test"
                      src="https://api.dicebear.com/7.x/avataaars/svg?seed=dewes"
                      style={{ width: 32, height: 32, borderRadius: 6 }}
                      alt=""
                    />
                  </UserAvatarHover>
                </div>
                <div id="form-root" style={{ maxWidth: 520, marginTop: 32 }}>
                  <ReviewForm
                    user={{
                      username: 'me',
                      profile: {
                        avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me',
                        display_name: 'СвояЛичность',
                        frame_id: 'neon',
                      },
                    }}
                    myRating={null}
                    setMyRating={() => {}}
                    myContent=""
                    setMyContent={() => {}}
                    error=""
                    submitting={false}
                    onSubmit={() => {}}
                  />
                </div>

                <div style={{ marginTop: 32 }} id="mini-card-standalone">
                  <MiniProfileCard
                    preview
                    username="dewes"
                    data={{
                      id: 1,
                      username: 'dewes',
                      display_name: 'Дима',
                      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dewes',
                      frame_id: 'neon',
                      tags: JSON.stringify([
                        { text: 'Ветеран', color: '#22D3EE', custom: false, item_id: 1 },
                      ]),
                      level: 5,
                      level_xp: 12,
                      level_goal: 30,
                      stats: { games: 7, achievements: 3, friends: 4 },
                    }}
                  />
                </div>
              </div>
            </MemoryRouter>
          </DialogProvider>
        </SettingsProvider>
      </AuthProvider>
    </ConnectivityProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
