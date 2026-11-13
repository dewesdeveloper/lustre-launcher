import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, LogIn } from 'lucide-react';
import api from './../api';
import { useAuth } from './../context/AuthContext';
import { reviewRating, type Review, type ReviewRating, type ReviewsResponse } from './reviews/types';
import { RatingBar } from './reviews/RatingBar';
import { ReviewForm } from './reviews/ReviewForm';
import { ReviewCard } from './reviews/ReviewCard';
import { canModerate } from '../utils/roles';

interface Props {
  gameId: number;
}

const GameReviews = ({ gameId }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [myRating, setMyRating] = useState<ReviewRating | null>(null);
  const [myContent, setMyContent] = useState('');
  const [error, setError] = useState('');
  // Отправка без оценки: вместо текста ошибки подсвечиваем кнопки оценки
  // (счётчик перезапускает анимацию при каждом повторном нажатии)
  const [ratingAttention, setRatingAttention] = useState(0);
  const [hasMyReview, setHasMyReview] = useState(false);

  const pickRating = (value: ReviewRating | null) => {
    setMyRating(value);
    if (value) setRatingAttention(0);
  };

  const fetchReviews = async () => {
    try {
      const res = await api.get(`/reviews/${gameId}`);
      setData(res.data);
      if (user) {
        const myReview = res.data.reviews.find((r: Review) => r.user_id === user.id);
        setHasMyReview(!!myReview);
        if (myReview) {
          setMyRating(reviewRating(myReview));
          setMyContent(myReview.content);
        }
      }
    } catch (err) {
      console.error("Failed to fetch reviews:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReviews(); }, [gameId, user]);

  const handleSubmit = async () => {
    if (myRating === null) {
      setError('');
      setRatingAttention((n) => n + 1);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.post('/reviews/', {
        game_id: gameId,
        positive: myRating === 'positive',
        neutral: myRating === 'neutral',
        content: myContent,
      });
      await fetchReviews();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Не удалось отправить отзыв');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: number) => {
    try {
      await api.delete(`/reviews/${reviewId}`);
      setMyRating(null);
      setMyContent('');
      setHasMyReview(false);
      await fetchReviews();
    } catch (err) {
      console.error("Failed to delete review:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={24} className="animate-spin text-violet" />
      </div>
    );
  }

  const positiveCount = data?.positive_count || 0;
  const negativeCount = data?.negative_count || 0;
  // старый сервер не знает про нейтральные — считаем их по списку
  const neutralCount = data?.neutral_count ?? (data?.reviews.filter((r) => r.neutral).length || 0);
  const total = positiveCount + negativeCount + neutralCount;

  return (
    <section>
      {/* Header with stats */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="flex items-center gap-2 text-pearl font-bold uppercase text-sm tracking-widest">
          Отзывы
          {total > 0 && (
            <span className="text-[10px] text-pearl/60 font-normal normal-case tracking-normal">
              ({total} {total === 1 ? 'отзыв' : 'отзывов'})
            </span>
          )}
        </h2>
        {total > 0 && <RatingBar positive={positiveCount} neutral={neutralCount} negative={negativeCount} />}
      </div>

      {/* Review form */}
      {user && (
        <ReviewForm
          user={user}
          myRating={myRating}
          setMyRating={pickRating}
          attention={ratingAttention}
          isUpdate={hasMyReview}
          myContent={myContent}
          setMyContent={setMyContent}
          error={error}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}

      {/* Гость: форма отзыва скрыта — предлагаем войти */}
      {!user && (
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="tl-btn ghost block"
        >
          <LogIn size={14} /> Войти, чтобы написать отзыв
        </button>
      )}

      {/* Reviews list */}
      <div className="space-y-3">
        {data?.reviews.map(review => (
          <ReviewCard
            key={review.id}
            review={review}
            canDelete={!!user && (user.id === review.user_id || canModerate(user.role))}
            onDelete={handleDelete}
          />
        ))}

        {data?.reviews.length === 0 && (
          <p className="text-center text-pearl/55 text-xs uppercase tracking-[0.2em] py-8">
            Отзывов пока нет. Будьте первым!
          </p>
        )}
      </div>
    </section>
  );
};

export default GameReviews;
