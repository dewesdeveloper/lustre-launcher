import { useEffect, useMemo, useState } from 'react';
import { IconHeart, IconTrophy, IconChevronUp, IconChevronDown, IconCheck, IconX, IconSettings } from '@tabler/icons-react';
import { setFavoritesOrder } from '../../../api/collections';
import { useDialog } from '../../../components/Dialogs';
import { useProUpgradeDialog } from '../../../components/ProUpgradeDialog';
import { notifyLibraryChanged } from '../../../utils/libraryEvents';
import { useProLimits } from '../../../api/proLimits';

interface FavEntry {
  id: number;
  game_id: number;
  favorite: boolean;
  favorite_order: number;
  game: { ID: number; title: string; header_image?: string; banner_url?: string; age_rating?: string };
}

function cover(g: FavEntry['game']) {
  return g?.header_image || g?.banner_url || '';
}

export default function FavoritesBlock({
  library, isOwnProfile, onGameClick,
}: {
  library: FavEntry[] | null;
  isOwnProfile: boolean;
  onGameClick: (gameId: number) => void;
}) {
  const { favorites: maxFavorites, is_pro: isPro } = useProLimits();
  const [editorOpen, setEditorOpen] = useState(false);

  const all = useMemo(() => (library || []).filter(e => e.favorite), [library]);
  const top = useMemo(
    () => all.filter(e => e.favorite_order > 0).sort((a, b) => a.favorite_order - b.favorite_order).slice(0, maxFavorites),
    [all, maxFavorites]
  );

  if (library === null) return null;
  if (all.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="tl-sec-head">
        <span className="bar" />
        <h2><IconHeart size={14} /> ЛЮБИМЫЕ ИГРЫ <span className="tl-term text-[14px] tl-pink">{top.length > 0 ? `${top.length}/${maxFavorites}` : `0/${maxFavorites}`}</span></h2>
        <span className="line" />
        {isOwnProfile && (
          <button
            onClick={() => setEditorOpen(true)}
            className="tl-head text-[10px] font-bold uppercase tracking-[0.14em] tl-muted hover:text-white transition-colors flex items-center gap-1.5"
          >
            <IconSettings size={12} /> Порядок
          </button>
        )}
      </div>

      {top.length === 0 ? (
        <p className="tl-term text-[15px] text-[var(--muted-2)]">
          Отметь игры как избранные в библиотеке и задай топ-5 — они появятся здесь.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {top.map((e, i) => (
            <button key={e.game_id} onClick={() => onGameClick(e.game_id)} className="group relative text-left cursor-pointer">
              <div className="relative aspect-[3/4] overflow-hidden bg-[var(--panel)] border border-[var(--line)] group-hover:border-[var(--line-2)] transition-colors">
                {cover(e.game) && (
                  <img src={cover(e.game)} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                <div className={`absolute top-2 left-2 w-6 h-6 flex items-center justify-center tl-head text-[10px] font-bold border ${i === 0 ? 'bg-accent text-black border-accent' : 'bg-black/70 text-white border-[var(--line-2)]'}`}>
                  {i + 1}
                </div>
                {i === 0 && (
                  <div className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-black bg-accent">
                    <IconTrophy size={13} />
                  </div>
                )}
                <p className="absolute bottom-0 left-0 right-0 p-2.5 tl-head text-[10px] font-bold uppercase tracking-tight text-white leading-tight line-clamp-2">
                  {e.game?.title}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {editorOpen && isOwnProfile && (
        <FavoritesEditor
          maxFavorites={maxFavorites}
          isPro={isPro}
          entries={all}
          initial={top.map(e => e.game_id)}
          onClose={() => setEditorOpen(false)}
          onSaved={() => { setEditorOpen(false); notifyLibraryChanged(); }}
        />
      )}
    </section>
  );
}

function FavoritesEditor({
  entries, initial, onClose, onSaved, maxFavorites, isPro,
}: {
  entries: FavEntry[];
  initial: number[];
  onClose: () => void;
  onSaved: () => void;
  maxFavorites: number;
  isPro: boolean;
}) {
  const dlg = useDialog();
  const offerPro = useProUpgradeDialog();
  const [order, setOrder] = useState<number[]>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ids = [...order];
    for (const e of entries) if (!ids.includes(e.game_id)) ids.push(e.game_id);
    setOrder(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...order];
    const t = idx + dir;
    if (t < 0 || t >= next.length) return;
    [next[idx], next[t]] = [next[t], next[idx]];
    setOrder(next);
  };

  const save = async () => {
    if (!isPro && order.length > maxFavorites) {
      await offerPro({
        title: 'Лимит избранного',
        message: `Обычный аккаунт закрепляет в топе до ${maxFavorites} игр, а у вас выбрано ${order.length}. С подпиской Pro — до 10. Без подписки сохранится только топ-${maxFavorites}. Открыть страницу подписки?`,
      });
      return;
    }
    setBusy(true);
    try {
      await setFavoritesOrder(order.slice(0, maxFavorites), maxFavorites);
      onSaved();
    } catch {
      dlg.alert({ title: 'Ошибка', message: 'Не удалось сохранить порядок', danger: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="tl-panel w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <h3 className="tl-head text-[11px] font-bold uppercase tracking-[0.12em] text-white mb-1">ЛЮБИМЫЕ ИГРЫ</h3>
        <p className="tl-term text-[15px] tl-muted mb-4">
          Первые игры становятся рейтингом в профиле
          {!isPro && (
            <span className="tl-pink"> · с подпиской Pro — до 10 в топе</span>
          )}
        </p>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {order.map((gameId, idx) => {
            const e = entries.find(x => x.game_id === gameId);
            return (
              <div key={gameId} className={`flex items-center gap-3 p-2 border ${idx < maxFavorites ? 'border-[var(--line-2)] bg-[rgb(var(--accent-rgb)/.06)]' : 'border-[var(--line)] bg-[rgb(var(--accent-rgb)/.02)]'}`}>
                <span className={`w-6 h-6 shrink-0 flex items-center justify-center tl-head text-[10px] font-bold ${idx === 0 ? 'bg-accent text-black' : 'bg-[#08050f] text-[var(--muted)] border border-[var(--line)]'}`}>{idx + 1}</span>
                {cover(e!.game) && <img src={cover(e!.game)} alt="" className="w-9 h-12 object-cover shrink-0 border border-[var(--line)]" />}
                <p className="flex-1 tl-head text-[10px] font-bold text-white truncate">{e!.game?.title}</p>
                {!isPro && idx === maxFavorites && (
                  <span
                    className="tl-head text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5 shrink-0"
                    style={{ color: '#fbbf24', border: '1px solid rgba(251,191,36,.5)', background: 'rgba(251,191,36,.1)' }}
                  >
                    Место с Pro
                  </span>
                )}
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => move(idx, -1)} className="tl-muted hover:text-accent cursor-pointer"><IconChevronUp size={14} /></button>
                  <button onClick={() => move(idx, 1)} className="tl-muted hover:text-accent cursor-pointer"><IconChevronDown size={14} /></button>
                </div>
                <button onClick={() => setOrder(order.filter(id => id !== gameId))} className="tl-muted hover:text-[#ff5b8a] cursor-pointer">
                  <IconX size={14} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={save}
            disabled={busy || order.length === 0}
            className="tl-btn solid flex-1"
          >
            <IconCheck size={14} /> Сохранить
          </button>
          <button onClick={onClose} className="tl-btn ghost">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
