import Select from './ui/Select';
import type { DriveInfo } from '../utils/appPaths';

const gb = (bytes: number) => {
  const v = bytes / 1024 ** 3;
  return v >= 100 ? `${Math.round(v)} ГБ` : `${v.toFixed(1)} ГБ`;
};

/** Выбор диска для скачивания или установки игр: буква, свободное место и пометка системного. */
export default function DriveSelect({ value, drives, systemDrive, onChange, disabled, className = 'w-full' }: {
  value: string;
  drives: DriveInfo[];
  systemDrive: string;
  onChange: (drive: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const options = drives.map((d) => ({
    value: d.root,
    label: `${d.root.slice(0, 2)} — свободно ${gb(d.free)} из ${gb(d.total)}${d.root === systemDrive ? ' · системный' : ''}`,
  }));
  return <Select value={value} options={options} onChange={onChange} disabled={disabled} className={className} />;
}
