import { useSettings } from '../../../context/SettingsContext';
import SettingsToggle from './SettingsToggle';

export default function StoreTab() {
  const { settings, updateSettings } = useSettings();
  const filters = settings.store_content_filters;
  const ageRating = settings.store_age_rating;
  const hideAdult = settings.hide_adult_games;

  const toggleFilter = (key: string) => {
    const next = { ...filters, [key]: !filters[key as keyof typeof filters] };
    updateSettings({ store_content_filters: next });
  };

  const setAge = (val: string) => {
    updateSettings({ store_age_rating: val });
  };

  const setHideAdult = (val: boolean) => {
    updateSettings({ hide_adult_games: val });
  };

  const CONTENT_FILTERS: { key: string; label: string; desc: string }[] = [
    { key: 'sexual_content', label: 'Сексуальный контент', desc: 'Явные сексуальные сцены, эротика, взрослый контент' },
    { key: 'nudity', label: 'Обнажённость', desc: 'Откровенные сцены, обнажённое тело' },
    { key: 'violence', label: 'Графическое насилие', desc: 'Чрезмерно жестокие сцены насилия' },
    { key: 'gore', label: 'Кровь и жестокость', desc: 'Кровь, отрубленные конечности,калечения' },
    { key: 'strong_language', label: 'Нецензурная лексика', desc: 'Чрезмерная ненормативная лексика' },
    { key: 'gambling', label: 'Азартные игры', desc: 'Реальные азартные игры, казино' },
    { key: 'horror', label: 'Экстремальные ужасы', desc: 'Психологический ужас, пытки, экстремальный хоррор' },
    { key: 'mature_themes', label: 'Зрелые темы', desc: 'Наркотики, суицид, насилие над детьми' },
  ];

  const AGE_RATINGS = ['3+', '7+', '10+', '12+', '16+', '18+'];

  return (
    <div className="flex flex-col gap-5">
      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>ВОЗРАСТНОЙ РЕЙТИНГ</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Показывать игры с рейтингом не выше:</p>
        <div className="tl-tabs">
          {AGE_RATINGS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setAge(r)}
              className={`tl-tab ${ageRating === r ? 'active' : ''}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <div className="flex items-center gap-4">
          <span className="w-11 h-11 shrink-0 border border-red-500/40 bg-red-500/10 text-red-400 tl-head text-[11px] font-bold flex items-center justify-center">18+</span>
          <div className="min-w-0">
            <p className="tl-head text-[10px] font-bold uppercase tracking-[0.1em] text-white">Скрывать игры для взрослых</p>
            <p className="tl-term text-[15px] text-[var(--muted-2)] mt-1">Игры с отметкой «Для взрослых» не будут показываться в магазине</p>
          </div>
          <div className="ml-auto shrink-0">
            <SettingsToggle label="" checked={hideAdult} onChange={() => setHideAdult(!hideAdult)} />
          </div>
        </div>
      </div>

      <div className="tl-panel p-[22px]">
        <h3 className="tl-head text-[11px] font-bold text-white mb-1" style={{ textShadow: 'var(--glow-sm)' }}>ФИЛЬТРЫ КОНТЕНТА</h3>
        <p className="tl-term text-[16px] tl-muted mb-4">Скрывать игры с отмеченными типами контента:</p>
        <div className="flex flex-col gap-2.5">
          {CONTENT_FILTERS.map(f => (
            <div key={f.key} className="tl-vrow">
              <div className="vt">
                <b>{f.label}</b>
                <div className="vd">{f.desc}</div>
              </div>
              <SettingsToggle label="" checked={filters[f.key as keyof typeof filters]} onChange={() => toggleFilter(f.key)} />
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          updateSettings({
            store_content_filters: { sexual_content: true, nudity: true, violence: true, gore: true, strong_language: true, gambling: true, horror: true, mature_themes: true },
            store_age_rating: '18+',
          });
        }}
        className="tl-btn ghost self-start"
      >
        Сбросить настройки магазина
      </button>
    </div>
  );
}
