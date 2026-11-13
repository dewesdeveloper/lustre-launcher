import type { ReactNode } from 'react';

type InputBlockProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: ReactNode;
  placeholder?: string;
  maxLength?: number;
};

export default function InputBlock({ label, value, onChange, icon, placeholder, maxLength }: InputBlockProps) {
  return (
    <div className="text-left">
      <label className="tl-head text-[10px] font-bold uppercase tracking-[0.16em] tl-muted flex items-center gap-2 mb-[7px]">{icon} {label}</label>
      <input className="tl-field" maxLength={maxLength} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}
