import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { joinByInvite, previewInvite, type InvitePreview } from '../../api/community';
import InviteCard from './components/InviteCard';

const serverError = (err: any, fallback: string): string => err?.response?.data?.error || fallback;

/** Страница ссылки-приглашения: что за сообщество и кнопка «вступить». */
export default function CommunityInvitePage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    let alive = true;
    previewInvite(code)
      .then((p) => alive && setPreview(p))
      .catch((err) => alive && setError(serverError(err, 'Ссылка-приглашение недействительна')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [code]);

  const join = async () => {
    if (!code || joining) return;
    setJoining(true);
    setError('');
    try {
      await joinByInvite(code);
      setJoined(true);
      // короткая пауза, чтобы успели увидеть «вы вступили»
      setTimeout(() => navigate('/community'), 900);
    } catch (err) {
      setError(serverError(err, 'Не удалось присоединиться'));
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="custom-scrollbar flex h-full items-center justify-center overflow-y-auto p-8 text-left">
      <InviteCard
        loading={loading}
        preview={preview}
        joining={joining}
        joined={joined}
        error={error}
        onJoin={join}
        onBack={() => navigate('/community')}
      />
    </div>
  );
}
