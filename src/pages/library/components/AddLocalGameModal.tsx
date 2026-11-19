import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, FolderSearch, HardDrive, Loader2, Search, X } from 'lucide-react';
import api from '../../../api';
import { compileQuery, scoreGame } from '../../../utils/gameSearch';
import { addLocalGame, guessTitleFromExe, pickGameExe } from '../../../utils/localGame';

// «Добавить игру с ПК»: игра уже стоит на компьютере — указываем её exe, выбираем игру каталога
// (лаунчер сам предлагает по названию папки) и добавляем в библиотеку как установленную.

type IndexGame = { id: number; title: string; developer: string; publisher: string; header_image: string; is_adult: boolean; tags: string[] };

let indexCache: IndexGame[] | null = null;
async function loadIndex(): Promise<IndexGame[]> {
  if (indexCache) return indexCache;
  try {
    indexCache = (await api.get<IndexGame[]>('/games/search-index')).data || [];
  } catch { return []; }
  return indexCache;
}

type Props = { open: boolean; onClose: () => void; onAdded: () => void };

export default function AddLocalGameModal({ open, onClose, onAdded }: Props) {
  const [exe, setExe] = useState('');
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<IndexGame[] | null>(indexCache);
  const [picked, setPicked] = useState<IndexGame | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    if (!open) return;
    setExe(''); setQuery(''); setPicked(null); setError(''); setDone('');
    void loadIndex().then(setIndex);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q || !index) return [];
    const compiled = compileQuery(q);
    return index
      .map((g) => ({ g, s: scoreGame({ title: g.title, developer: g.developer, publisher: g.publisher, tags: (g.tags || []).map((name) => ({ name })) }, compiled) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 6)
      .map((x) => x.g);
  }, [query, index]);

  // лучший вариант по названию папки выбираем сразу — игроку остаётся подтвердить
  useEffect(() => {
    if (exe && !picked && results.length) setPicked(results[0]);
  }, [exe, results, picked]);

  if (!open) return null;

  const chooseExe = async () => {
    const path = await pickGameExe();
    if (!path) return;
    setExe(path);
    setPicked(null);
    setError('');
    setQuery(guessTitleFromExe(path));
  };

  const submit = async () => {
    if (!exe || !picked) return;
    setBusy(true);
    setError('');
    const err = await addLocalGame(picked.id, picked.title, exe);
    setBusy(false);
    if (err) { setError(err); return; }
    setDone(picked.title);
    onAdded();
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div className="tl-panel w-full max-w-xl p-6 text-left" onMouseDown={(e) => e.stopPropagation()}>
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="tl-head flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.16em] text-white">
              <HardDrive size={16} className="text-accent" /> Добавить игру с компьютера
            </h3>
            <p className="tl-term mt-1 text-[14px] tl-muted">
              Игра уже установлена без лаунчера? Укажите её exe — она появится в библиотеке, с запуском, временем в игре и облачными сохранениями.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="tl-btn ghost"><X size={14} /></button>
        </header>

        {done ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 tl-term text-[15px] text-[var(--green2)]">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> «{done}» добавлена в библиотеку как установленная.
            </p>
            <p className="tl-term text-[14px] tl-muted">Лаунчер не перемещает и не удаляет файлы этой игры: «Удалить» в библиотеке уберёт только запись.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="tl-btn ghost" onClick={() => { setDone(''); setExe(''); setQuery(''); setPicked(null); }}>Добавить ещё</button>
              <button type="button" className="tl-btn solid" onClick={onClose}>Готово</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="tl-head mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white">1. Файл запуска игры</p>
              <div className="flex items-center gap-2">
                <button type="button" className="tl-btn solid shrink-0" onClick={chooseExe}>
                  <FolderSearch size={14} /> {exe ? 'Другой файл' : 'Выбрать exe'}
                </button>
                <span className="tl-term min-w-0 truncate text-[14px] text-pearl/80" title={exe}>{exe || 'не выбран'}</span>
              </div>
            </div>

            {exe && (
              <div>
                <p className="tl-head mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white">2. Какая это игра из каталога</p>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
                    placeholder="Название игры"
                    className="tl-field with-icon w-full"
                    autoFocus
                  />
                </div>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {!index ? (
                    <p className="flex items-center gap-2 tl-term text-[14px] tl-muted"><Loader2 size={13} className="animate-spin" /> Загружаем каталог…</p>
                  ) : results.length === 0 ? (
                    <p className="tl-term text-[14px] tl-muted">Не нашли — попробуйте другое название. Добавить можно только игру, которая есть в каталоге Lustre.</p>
                  ) : results.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setPicked(g)}
                      className={`flex w-full items-center gap-3 border px-2 py-1.5 text-left transition-colors ${picked?.id === g.id ? 'border-accent bg-accent/15' : 'border-transparent hover:bg-accent/[0.08]'}`}
                    >
                      {g.header_image
                        ? <img src={g.header_image} alt="" loading="lazy" className="h-9 w-[76px] shrink-0 border border-[var(--line)] object-cover" />
                        : <span className="h-9 w-[76px] shrink-0 border border-[var(--line)] bg-black/30" />}
                      <span className="min-w-0">
                        <span className="block truncate tl-term text-[15px] text-white">{g.title}</span>
                        <span className="block truncate tl-term text-[13px] text-[var(--muted)]">{g.developer || g.publisher}</span>
                      </span>
                      {picked?.id === g.id && <CheckCircle2 size={15} className="ml-auto shrink-0 text-accent" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="tl-term text-[14px] text-[#ff8fab]">{error}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" className="tl-btn ghost" onClick={onClose}>Отмена</button>
              <button type="button" className="tl-btn solid" disabled={!exe || !picked || busy} onClick={submit}>
                {busy && <Loader2 size={14} className="animate-spin" />} Добавить в библиотеку
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
