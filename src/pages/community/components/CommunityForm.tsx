import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconChevronDown, IconLock, IconUsers, IconWorld } from '@tabler/icons-react';
import type { CommunityGame, CommunityTheme } from '../../../api/community';
import ImageUpload from '../../../components/ImageUpload';
import { Loading } from '../../../components/Loading';
import CharCounter from '../../../components/CharCounter';
import { DESCRIPTION_MAX, NAME_MAX, type CommunityDraft } from './communityDraft';
import { COMMUNITY_FORMATS } from '../formats';


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

/** Выпадающий список игр каталога с поиском (категория сообщества формата «Игры») */
function GamePicker({ games, loading, value, onPick }: { games: CommunityGame[]; loading: boolean; value: number | null; onPick: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const chosen = games.find((g) => g.ID === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? games.filter((g) => g.title.toLowerCase().includes(q)) : games).slice(0, 200);
  }, [games, query]);

  // клик вне списка — закрыть
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`tl-field flex items-center gap-3 text-left ${open ? 'border-[color:var(--color-accent)]' : ''}`}
      >
        {chosen?.header_image
          ? <img src={chosen.header_image} alt="" className="h-7 w-14 shrink-0 border border-[var(--line)] object-cover" />
          : null}
        <span className={`flex-1 truncate ${chosen ? 'text-white' : 'text-[var(--muted)]'}`}>{chosen ? chosen.title : 'Выберите игру из каталога'}</span>
        <IconChevronDown size={16} className={`shrink-0 text-[var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-[var(--line-2)] bg-[#0f0a17] p-2 shadow-[0_12px_30px_rgba(0,0,0,.6)]">
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск игры..." className="tl-field mb-2" />
          <div className="custom-scrollbar max-h-64 overflow-y-auto">
            {loading && <Loading />}
            {!loading && shown.length === 0 && <p className="tl-term tl-muted px-3 py-3 text-[15px]">Игры не найдены</p>}
            {!loading && shown.map((g) => (
              <button
                key={g.ID}
                type="button"
                onClick={() => { onPick(g.ID); setOpen(false); setQuery(''); }}
                className={`flex w-full items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-white/5 ${g.ID === value ? 'text-accent' : 'text-[var(--muted)] hover:text-white'}`}
              >
                {g.header_image
                  ? <img src={g.header_image} alt="" className="h-8 w-16 shrink-0 border border-[var(--line)] object-cover" />
                  : <span className="h-8 w-16 shrink-0 border border-[var(--line)]" />}
                <span className="truncate text-xs font-bold">{g.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
  const format = COMMUNITY_FORMATS.find((f) => f.id === draft.format);
  const category = draft.format === 'games' ? game?.title ?? '' : format?.label ?? '';

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

        <Panel title="Формат сообщества *">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {COMMUNITY_FORMATS.map(({ id, label, hint, Icon }) => {
              const on = draft.format === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange({ format: id })}
                  className={`tl-preset flex flex-col items-start gap-1.5 text-left ${on ? 'on' : ''}`}
                >
                  <Icon size={20} className={on ? 'text-accent' : 'text-[var(--muted)]'} />
                  <span className="pt">{label}</span>
                  <span className="pd">{hint}</span>
                </button>
              );
            })}
          </div>
          {draft.format === 'games' && (
            <div className="mt-5">
              <p className={LABEL}>Игра *</p>
              <GamePicker games={games} loading={loading} value={draft.gameId} onPick={(gameId) => onChange({ gameId })} />
            </div>
          )}
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
            <SummaryCell label="Категория" value={category} tone="text-violet" />
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
