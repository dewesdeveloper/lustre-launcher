import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createCommunity, getCommunityGames, getCommunityThemes,
  type CommunityGame, type CommunityTheme,
} from '../../api/community';
import CreateCommunityHeader from './components/CreateCommunityHeader';
import CommunityForm from './components/CommunityForm';
import { EMPTY_DRAFT, type CommunityDraft } from './components/communityDraft';

/** Что не так с черновиком (первое, что нужно исправить), или null */
function problemOf(draft: CommunityDraft): string | null {
  if (!draft.name.trim()) return 'Введите название сообщества';
  if (!draft.gameId) return 'Выберите категорию (игру)';
  if (!draft.themeId) return 'Выберите тематику';
  return null;
}

/** Создание сообщества: справочники игр и тематик, форма, отправка. */
export default function CreateCommunityPage() {
  const navigate = useNavigate();
  const [games, setGames] = useState<CommunityGame[]>([]);
  const [themes, setThemes] = useState<CommunityTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<CommunityDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([getCommunityGames(), getCommunityThemes()])
      .then(([g, t]) => {
        if (!alive) return;
        setGames(g);
        setThemes(t);
      })
      .catch(() => { /* пустые списки — форма покажет «не найдено» */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const toList = () => navigate('/community');

  const submit = async () => {
    const problem = problemOf(draft);
    setError(problem ?? '');
    if (problem || draft.gameId === null || draft.themeId === null) return;

    setSubmitting(true);
    try {
      const created = await createCommunity({
        name: draft.name.trim(),
        description: draft.description.trim(),
        cover_url: draft.coverUrl,
        game_id: draft.gameId,
        theme_id: draft.themeId,
        is_private: draft.isPrivate,
      });
      navigate('/community', { state: { created } });
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Не удалось создать сообщество');
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col text-left font-sans">
      <CreateCommunityHeader onBack={toList} />
      <CommunityForm
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        games={games}
        themes={themes}
        loading={loading}
        submitting={submitting}
        error={error}
        onSubmit={submit}
        onCancel={toList}
      />
    </div>
  );
}
