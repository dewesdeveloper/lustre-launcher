import { ThumbsUp, ThumbsDown, Meh, Send, Loader2 } from 'lucide-react';
import type { ReviewRating } from './types';
import { UserAvatarHover } from '../UserAvatarHover';
import AvatarFrame from '../AvatarFrame';

import CharCounter from '../CharCounter';
interface ReviewFormUser {
  username: string;
  profile?: {
    avatar_url: string;
    display_name?: string;
    frame_id?: string;
    avatar_frame_url?: string;
    avatar_frame_scale?: number;
    is_pro?: boolean;
  };
}

interface ReviewFormProps {
  user: ReviewFormUser;
  myRating: ReviewRating | null;
  setMyRating: (value: ReviewRating | null) => void;
  myContent: string;
  setMyContent: (value: string) => void;
  error: string;
  submitting: boolean;
  onSubmit: () => void;
  /** >0 — пытались отправить без оценки: подсветить выбор (растёт при каждой попытке) */
  attention?: number;
  /** У пользователя уже есть отзыв — кнопка «Обновить», иначе «Отправить» */
  isUpdate?: boolean;
}

const RATING_OPTIONS = [
  {
    value: 'positive' as const, label: 'Положительный', Icon: ThumbsUp, fill: 'fill-green-400',
    on: 'bg-green-500/10 border-green-500/30 text-green-400',
    idle: 'bg-white/5 border-white/5 text-pearl/60 hover:border-green-500/20 hover:text-green-400/60',
  },
  {
    value: 'neutral' as const, label: 'Нейтральный', Icon: Meh, fill: '',
    on: 'bg-amber-400/10 border-amber-400/30 text-amber-300',
    idle: 'bg-white/5 border-white/5 text-pearl/60 hover:border-amber-400/20 hover:text-amber-300/60',
  },
  {
    value: 'negative' as const, label: 'Отрицательный', Icon: ThumbsDown, fill: 'fill-red-400',
    on: 'bg-red-500/10 border-red-500/30 text-red-400',
    idle: 'bg-white/5 border-white/5 text-pearl/60 hover:border-red-500/20 hover:text-red-400/60',
  },
];

export const ReviewForm = ({ user, myRating, setMyRating, myContent, setMyContent, error, submitting, onSubmit, attention = 0, isUpdate = false }: ReviewFormProps) => (
  <div className="bg-black/20 p-5 rounded-2xl border border-violet/5 mb-6">
    <div className="flex items-center gap-3 mb-4">
      <UserAvatarHover
        username={user.username}
        displayName={user.profile?.display_name}
        avatarUrl={user.profile?.avatar_url}
      >
        <AvatarFrame
          avatarUrl={user.profile?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
          frameId={user.profile?.frame_id}
          frameUrl={user.profile?.avatar_frame_url}
          isPro={!!user.profile?.is_pro}
          size="xs"
        />
      </UserAvatarHover>
      <span className="text-xs font-bold text-pearl/60">Ваш отзыв</span>
    </div>

    <div
      key={attention}
      className={`flex flex-wrap items-center gap-2 ${attention > 0 ? 'review-rating-attention mb-2' : 'mb-4'}`}
    >
      {RATING_OPTIONS.map(({ value, label, Icon, on, idle, fill }) => {
        const active = myRating === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setMyRating(active ? null : value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${active ? on : idle}`}
          >
            <Icon size={14} className={active ? fill : ''} />
            {label}
          </button>
        );
      })}
    </div>
    {attention > 0 && (
      <p className="text-amber-300 text-xs mb-4" role="status">Выберите оценку, чтобы отправить отзыв</p>
    )}

    <textarea maxLength={4000}
      value={myContent}
      onChange={(e) => setMyContent(e.target.value)}
      placeholder="Напишите своё мнение об игре (необязательно)..."
      rows={3}
      className="w-full bg-[#16161a] border border-violet/20 rounded-xl px-4 py-3 text-sm text-pearl placeholder:text-pearl/55 focus:outline-none focus:border-accent/40 transition-all resize-none"
    />
    <CharCounter value={myContent} max={4000} className="mb-3" />

    {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

    <div className="flex justify-end">
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="flex items-center gap-2 px-5 py-2 bg-accent hover:bg-accent/80 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {isUpdate ? 'Обновить отзыв' : 'Отправить'}
      </button>
    </div>
  </div>
);
