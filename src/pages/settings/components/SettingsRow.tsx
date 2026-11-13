export default function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="tl-srow">
      <span className="k tl-head text-[10px] uppercase tracking-[0.14em]">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}
