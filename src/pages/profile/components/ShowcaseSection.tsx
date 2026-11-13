import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { IconTrophy, IconCalendar, IconPlus, IconTrash } from '@tabler/icons-react';
import api from '../../../api';
import type { EditProfileForm, Showcase } from '../constants';
import { useProLimits } from '../../../api/proLimits';
import { useProUpgradeDialog } from '../../../components/ProUpgradeDialog';
import Select from '../../../components/ui/Select';

type ShowcaseSectionProps = {
  formData: EditProfileForm;
  setFormData: Dispatch<SetStateAction<EditProfileForm>>;
};

const TYPE_OPTIONS = [
  { value: 'achievements', label: 'Редкие достижения' },
  { value: 'text', label: 'Своё текстовое поле' },
  { value: 'fav_game', label: 'Любимая игра' },
];

export default function ShowcaseSection({ formData, setFormData }: ShowcaseSectionProps) {
  const { showcases: maxShowcases, is_pro: isPro } = useProLimits();
  const offerPro = useProUpgradeDialog();
  const showcases = formData.showcases || [];
  const [library, setLibrary] = useState<any[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  const hasFavGame = showcases.some(s => s.type === 'fav_game');

  // Библиотека игр нужна для витрин «Любимая игра»
  useEffect(() => {
    if (!hasFavGame || library.length > 0) return;
    setLoadingLibrary(true);
    api.get('/library/')
      .then((res) => setLibrary(res.data || []))
      .catch(() => setLibrary([]))
      .finally(() => setLoadingLibrary(false));
  }, [hasFavGame]);

  const update = (index: number, patch: Partial<Showcase>) => {
    const next = showcases.map((s, i) => (i === index ? { ...s, ...patch } : s));
    setFormData({ ...formData, showcases: next });
  };

  const addShowcase = () => {
    if (showcases.length >= maxShowcases) {
      if (!isPro) {
        offerPro({
          title: 'Лимит витрин',
          message: `Обычный аккаунт — до ${maxShowcases} витрин, с подпиской Pro — до 6. Открыть страницу подписки?`,
        });
      }
      return;
    }
    setFormData({ ...formData, showcases: [...showcases, { type: 'text', data: '' }] });
  };

  const removeShowcase = (index: number) => {
    setFormData({ ...formData, showcases: showcases.filter((_, i) => i !== index) });
  };

  return (
    <div className="flex flex-col gap-5 text-left">
      <div className="tl-panel p-[22px]">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div>
            <h3 className="tl-head text-[11px] font-bold text-white" style={{ textShadow: 'var(--glow-sm)' }}>ВИТРИНЫ ПРОФИЛЯ</h3>
            <p className="tl-term text-[15px] tl-muted mt-1">До {maxShowcases} витрин — они отображаются в профиле над комментариями</p>
          </div>
          <span className={`tl-head text-[10px] font-bold uppercase tracking-[0.14em] ${showcases.length >= maxShowcases ? 'text-accent' : 'tl-muted'}`}>
            {showcases.length} / {maxShowcases}
          </span>
        </div>

        {showcases.length === 0 && (
          <div className="p-6 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.04)]">
            <h4 className="tl-head text-[10px] font-bold text-white uppercase tracking-[0.1em] mb-2">Пока нет витрин</h4>
            <p className="tl-term text-[15px] tl-muted leading-relaxed">
              Добавьте до трёх витрин: свои достижения, текстовое поле или любимую игру из библиотеки.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4 mt-4">
          {showcases.map((item, index) => {
            const selectedGame = library.find((g) => String(g.game_id) === String(item.data));
            return (
              <div key={index} className="border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.02)] p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 border border-[var(--line)] bg-[#08050f] flex items-center justify-center tl-term text-[15px] tl-muted shrink-0">
                    {index + 1}
                  </span>
                  <Select
                    value={item.type}
                    onChange={(v) => update(index, { type: String(v), data: '' })}
                    className="flex-1 min-w-[220px]"
                    buttonClassName="px-4 py-2.5 text-[10px]"
                    options={TYPE_OPTIONS}
                  />
                  <button
                    onClick={() => removeShowcase(index)}
                    title="Убрать витрину"
                    className="w-10 h-10 border border-[var(--line-2)] text-[var(--muted)] hover:text-[#ff5b8a] hover:border-[#ff5b8a] flex items-center justify-center transition-all cursor-pointer shrink-0"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>

                {/* Текстовое поле */}
                {item.type === 'text' && (
                  <div>
                    <textarea
                      value={item.data}
                      onChange={(e) => update(index, { data: e.target.value })}
                      maxLength={500}
                      placeholder="Напишите что-нибудь интересное..."
                      className="tl-field h-32 resize-none"
                    />
                    <p className="text-right tl-term text-[14px] text-[var(--muted-2)] mt-1.5">{item.data.length} / 500</p>
                  </div>
                )}

                {/* Редкие достижения */}
                {item.type === 'achievements' && (
                  <div className="flex items-start gap-4 p-4 border border-[var(--line)] bg-[rgb(var(--accent-rgb)/.03)]">
                    <div className="w-11 h-11 border border-[var(--line-2)] flex items-center justify-center text-accent shrink-0">
                      <IconTrophy size={20} />
                    </div>
                    <p className="tl-term text-[15px] tl-muted leading-relaxed">
                      В витрине будут показаны ваши награды из раздела «Награды» (до 8 штук).
                    </p>
                  </div>
                )}

                {/* Любимая игра */}
                {item.type === 'fav_game' && (
                  <div className="flex flex-col gap-3">
                    <Select
                      value={item.data}
                      onChange={(v) => update(index, { data: String(v) })}
                      className="w-full"
                      buttonClassName="px-4 py-2.5 text-[10px]"
                      placeholder={loadingLibrary ? 'Загрузка библиотеки...' : 'Игра не выбрана'}
                      disabled={loadingLibrary}
                      options={library.map((g) => ({
                        value: String(g.game_id),
                        label: g.game?.title || 'Без названия',
                      }))}
                    />
                    {!loadingLibrary && library.length === 0 && (
                      <p className="tl-term text-[14px] text-[var(--muted-2)]">В библиотеке нет игр — добавьте игру в магазине, чтобы выбрать её.</p>
                    )}
                    {selectedGame && (
                      <div className="tl-gcard max-w-md">
                        <div className="thumb">
                          {selectedGame.game?.header_image && (
                            <img src={selectedGame.game.header_image} alt="" draggable={false} />
                          )}
                        </div>
                        <div className="body">
                          <h3 className="truncate">{selectedGame.game?.title}</h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            {selectedGame.game?.developer && (
                              <span className="tl-term text-[14px] tl-muted">{selectedGame.game.developer}</span>
                            )}
                            {selectedGame.game?.release_date && (
                              <span className="flex items-center gap-1.5 tl-term text-[14px] tl-muted">
                                <IconCalendar size={12} /> {new Date(selectedGame.game.release_date).toLocaleDateString('ru-RU')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={addShowcase}
          disabled={isPro && showcases.length >= maxShowcases}
          className={`tl-btn ghost block w-full mt-4 ${!isPro && showcases.length >= maxShowcases ? 'text-[#fbbf24] border-[rgba(251,191,36,.4)]' : ''}`}
        >
          <IconPlus size={16} />
          {showcases.length >= maxShowcases
            ? (isPro ? `Максимум ${maxShowcases} витрины` : `Максимум ${maxShowcases} — с Pro больше`)
            : 'Добавить витрину'}
        </button>
      </div>
    </div>
  );
}
