import { CheckCircle2, XCircle } from 'lucide-react';
import type { InstalledGame } from '../types';

interface Props {
  installed: InstalledGame | null;
  lastLaunch: string;
  playtime: string;
  addedAt: string;
}

const label = 'tl-head text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]';
const value = 'tl-term text-[16px] text-white mt-1 leading-none';

const GameStatsPanel = ({ installed, lastLaunch, playtime, addedAt }: Props) => (
  <div className="flex items-center gap-7">
    <div>
      <p className={label}>Последний запуск</p>
      <p className={value}>{lastLaunch}</p>
    </div>
    <div>
      <p className={label}>Наиграно</p>
      <p className={value}>{playtime}</p>
    </div>
    <div>
      <p className={label}>В библиотеке</p>
      <p className={value}>{addedAt}</p>
    </div>
    <div>
      <p className={label}>Статус</p>
      <p className={`mt-1 flex items-center gap-1.5 tl-st ${installed ? 'ok' : 'no'}`}>
        {installed ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
        {installed ? 'Установлена' : 'Не установлена'}
      </p>
    </div>
  </div>
);

export default GameStatsPanel;
