export default function SettingsCard({ title, desc, icon, onClick }: { title: string; desc: string; icon: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tl-panel p-[18px] text-left transition-all group hover:shadow-[0_0_18px_rgb(var(--accent-rgb)/0.18)]"
    >
      <div className="text-accent mb-3 group-hover:scale-110 transition-transform">{icon}</div>
      <h4 className="tl-head text-[11px] font-bold text-white mb-1.5">{title}</h4>
      <p className="tl-term text-[15px] text-[var(--muted-2)] leading-relaxed">{desc}</p>
    </button>
  );
}
