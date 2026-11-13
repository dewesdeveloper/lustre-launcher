import { IconAlertTriangle, IconCheck, IconLock, IconWorld } from '@tabler/icons-react';
import type { InvitePreview } from '../../../api/community';

type InviteCardProps = {
  loading: boolean;
  preview: InvitePreview | null;
  joining: boolean;
  joined: boolean;
  error: string;
  onJoin: () => void;
  onBack: () => void;
};

/** Карточка приглашения: проверка ссылки, ошибка или сообщество с кнопкой «Присоединиться». */
export default function InviteCard({ loading, preview, joining, joined, error, onJoin, onBack }: InviteCardProps) {
  if (loading) {
    return (
      <div className="tl-panel w-full max-w-lg p-10 text-center">
        <p className="tl-head tl-muted animate-pulse text-[11px] font-bold uppercase tracking-[.25em]">Проверяем приглашение...</p>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="tl-panel w-full max-w-lg p-10 text-center">
        <IconAlertTriangle size={40} className="mx-auto mb-4 text-[#ff5b8a]" />
        <h1 className="mb-2 text-[20px] text-white">Приглашение недействительно</h1>
        <p className="tl-term tl-muted mb-8 text-[16px]">{error || 'Ссылка-приглашение недействительна'}</p>
        <button type="button" onClick={onBack} className="tl-btn solid">Вернуться в сообщества</button>
      </div>
    );
  }

  return (
    <div className="tl-panel w-full max-w-lg p-10 text-center">
      <p className="tl-head tl-muted mb-3 text-[10px] font-bold uppercase tracking-[.25em]">Вас пригласили в сообщество</p>
      <h1 className="mb-5 break-words text-[26px] text-white" style={{ textShadow: 'var(--glow)' }}>{preview.name}</h1>
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        <span className="tl-chip age">{preview.game_title}</span>
        <span className="tl-chip rare">{preview.theme_name}</span>
        {preview.is_private
          ? <span className="tl-chip warn inline-flex items-center gap-1.5"><IconLock size={10} /> Приватное</span>
          : <span className="tl-chip ok inline-flex items-center gap-1.5"><IconWorld size={10} /> Публичное</span>}
      </div>

      {joined ? (
        <div className="tl-chip ok mx-auto inline-flex items-center gap-2"><IconCheck size={14} /> Вы вступили! Переходим...</div>
      ) : (
        <div className="flex gap-3">
          <button type="button" onClick={onJoin} disabled={joining} className="tl-btn solid flex-1">{joining ? 'Вступаем...' : 'Присоединиться'}</button>
          <button type="button" onClick={onBack} className="tl-btn ghost">Позже</button>
        </div>
      )}
      {error && !joined && <div className="tl-warnrow mb-0! mt-4 text-left"><span className="t">{error}</span></div>}
    </div>
  );
}
