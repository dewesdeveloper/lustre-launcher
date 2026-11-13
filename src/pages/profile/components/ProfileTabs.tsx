type ProfileTabsProps = {
  activeTab: string;
  onSelect: (tab: string) => void;
};

export default function ProfileTabs({ activeTab, onSelect }: ProfileTabsProps) {
  return (
    <div className="mt-[18px] tl-tabs">
      {[
        { id: 'overview', label: 'Обзор' },
        { id: 'games', label: 'Игры' },
        { id: 'inventory', label: 'Инвентарь' },
      ].map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`tl-tab ${activeTab === t.id ? 'active' : ''}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
