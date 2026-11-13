export default function SettingsToggle({ label, checked, onChange, disabled }: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-4 justify-between select-none ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      {label && <span className="tl-term text-[16px] tl-muted">{label}</span>}
      <span className={`tl-sw2 ${disabled ? 'pointer-events-none' : ''}`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
        <span className="tr" />
        <span className="kn" />
      </span>
    </label>
  );
}
