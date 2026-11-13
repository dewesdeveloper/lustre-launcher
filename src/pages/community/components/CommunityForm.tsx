import { useMemo, useState, type ReactNode } from 'react';
import { IconLock, IconUsers, IconWorld } from '@tabler/icons-react';
import type { CommunityGame, CommunityTheme } from '../../../api/community';
import ImageUpload from '../../../components/ImageUpload';
import { Loading } from '../../../components/Loading';
import CharCounter from '../../../components/CharCounter';
import { DESCRIPTION_MAX, NAME_MAX, type CommunityDraft } from './communityDraft';


type CommunityFormProps = {
  draft: CommunityDraft;
  onChange: (patch: Partial<CommunityDraft>) => void;
  games: CommunityGame[];
  themes: CommunityTheme[];
  loading: boolean;
  submitting: boolean;
  error: string;
  onSubmit: () => void;
  onCancel: () => void;
};

const LABEL = 'mb-3 block tl-head text-[10px] font-bold uppercase tracking-[.2em] text-[var(--muted)]';

function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="tl-panel p-6">
      {title && <p className={LABEL}>{title}</p>}
      {children}
    </section>
  );
}

/** Выбор игры каталога (категории сообщества) с поиском по названию */
function GamePicker({ games, loading, value, onPick }: { games: CommunityGame[]; loading: boolean; value: number | null; onPick: (id: number) => void }) {
  const [query, setQuery] = useState('');
  const chosen = games.find((g) => g.ID === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? games.filter((g) => g.title.toLowerCase().includes(q)) : games;
  }, [games, query]);

  return (
    <>
      {chosen && (
        <div className="tl-preset on mb-4 flex cursor-default items-center gap-3">
          {chosen.header_image && <img src={chosen.header_image} alt="" className="h-10 w-20 border border-[var(--line)] object-cover" />}
          <div>
            <p className="tl-head text-[10px] font-bold uppercase tracking-[.2em] text-accent">Выбранная категория</p>
            <p className="mt-1 text-xs font-bold text-white">{chosen.title}</p>
          </div>
        </div>
      )}
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск игры в каталоге..." className="tl-field mb-3" />
      <div className="tl-panel custom-scrollbar max-h-64 divide-y divide-[rgb(var(--accent-rgb)/.12)] overflow-y-auto">
        {loading && <Loading />}
        {!loading && shown.length === 0 && <p className="tl-term tl-muted px-5 py-4 text-[15px]">Игры не найдены</p>}
        {!loading && shown.map((g) => (
          <button
            key={g.ID}
            type="button"
            onClick={() => onPick(g.ID)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${g.ID === value ? 'text-accent' : 'text-[var(--muted)] hover:text-white'}`}
          >
            {g.header_image
              ? <img src={g.header_image} alt="" className="h-8 w-16 shrink-0 border border-[var(--line)] object-cover" />
              : <span className="h-8 w-16 shrink-0 border border-[var(--line)]" />}
            <span className="truncate text-xs font-bold">{g.title}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/** Карточка выбора вида сообщества */
function VisibilityOption({ on, icon, title, hint, onPick }: { on: boolean; icon: ReactNode; title: string; hint: string; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} className={`tl-preset ${on ? 'on' : ''}`}>
      <span className={`pt ${on ? '[&>svg]:text-accent' : '[&>svg]:text-[var(--muted)]'}`}>{icon}{title}</span>
      <span className="pd">{hint}</span>
    </button>
  );
}

function SummaryCell({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="tl-head tl-muted mb-1 text-[10px] font-bold uppercase tracking-[.2em]">{label}</p>
      <p className={`tl-head line-clamp-1 text-[12px] font-bold ${tone}`}>{value || '—'}</p>
    </div>
  );
}

/** Форма создания сообщества: название и описание, обложка, игра, тематика, вид и итог. */
export default function CommunityForm({ draft, onChange, games, themes, loading, submitting, error, onSubmit, onCancel }: CommunityFormProps) {
  const game = games.find((g) => g.ID === draft.gameId);
  const theme = themes.find((t) => t.id === draft.themeId);

  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Panel title="Название *">
          <input
            value={draft.name}
            maxLength={NAME_MAX}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Например: Найт-Сити после заката"
            className="tl-field"
          />
          <CharCounter value={draft.name} max={NAME_MAX} />
          <p className={`${LABEL} mt-5`}>Описание</p>
          <textarea
            rows={4}
            value={draft.description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="О чём это сообщество?"
            className="tl-field resize-none"
          />
          <CharCounter value={draft.description} max={DESCRIPTION_MAX} />
        </Panel>

        <Panel>
          <ImageUpload
            folder="communities"
            label="Обложка сообщества (необязательно)"
            currentUrl={draft.coverUrl}
            onUpload={(url) => onChange({ coverUrl: url })}
            onRemove={() => onChange({ coverUrl: '' })}
          />
        </Panel>

        <Panel title="Категория (игра) *">
          <GamePicker games={games} loading={loading} value={draft.gameId} onPick={(gameId) => onChange({ gameId })} />
        </Panel>

        <Panel title="Тематика *">
          <div className="flex flex-wrap gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ themeId: t.id })}
                className={`tl-chip tl-tagpick ${t.id === draft.themeId ? 'on' : 'text-[var(--muted)]'}`}
              >
                {t.name}
              </button>
            ))}
            {loading && <Loading />}
            {!loading && themes.length === 0 && <p className="tl-term tl-muted text-[15px]">Тематики ещё не загружены</p>}
          </div>
        </Panel>

        <Panel title="Вид сообщества *">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <VisibilityOption
              on={!draft.isPrivate}
              icon={<IconWorld size={16} />}
              title="Публичное"
              hint="Видно всем игрокам Lustre в общем списке сообществ"
              onPick={() => onChange({ isPrivate: false })}
            />
            <VisibilityOption
              on={draft.isPrivate}
              icon={<IconLock size={16} />}
              title="Приватное"
              hint="Не показывается в общем списке: вступают только по вашей ссылке-приглашению"
              onPick={() => onChange({ isPrivate: true })}
            />
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center gap-6">
            <SummaryCell label="Название" value={draft.name.trim()} />
            <SummaryCell label="Категория" value={game?.title ?? ''} tone="text-violet" />
            <SummaryCell label="Тематика" value={theme?.name ?? ''} tone="text-accent" />
            <SummaryCell label="Вид" value={draft.isPrivate ? 'Приватное' : 'Публичное'} tone={draft.isPrivate ? 'text-violet' : 'text-cyan'} />
            <span className="flex shrink-0 items-center gap-1.5 text-[var(--muted)]" title="Участников после создания">
              <IconUsers size={16} />
              <span className="tl-term text-[16px]">1</span>
            </span>
          </div>
        </Panel>

        {error && <div className="tl-warnrow"><span className="t">{error}</span></div>}

        <div className="flex gap-3 pb-4">
          <button type="button" onClick={onSubmit} disabled={submitting || loading} className="tl-btn solid flex-1">
            {submitting ? 'Создаём...' : 'Создать сообщество'}
          </button>
          <button type="button" onClick={onCancel} className="tl-btn ghost">Отмена</button>
        </div>
      </div>
    </div>
  );
}
