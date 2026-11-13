import { motion, AnimatePresence } from 'framer-motion';
import { IconDownload, IconCircleCheck, IconPlayerPause } from '@tabler/icons-react';

export interface Download {
  id: string;
  gameTitle: string;
  progress: number;
  downloadSpeed: number;
  status: string;
}

const formatSpeed = (bps: number) => {
  if (!bps || bps <= 0) return '—';
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} КБ/с`;
  return `${(bps / 1024 / 1024).toFixed(1)} МБ/с`;
};

interface DownloadStatusProps {
  active: Download[];
  paused: Download[];
  completed: Download[];
  total: number;
  pct: number;
  totalSpeed: number;
  currentGame: string;
  onOpenDownloads: () => void;
}

export const DownloadStatus = ({ active, paused, completed, total, pct, totalSpeed, currentGame, onOpenDownloads }: DownloadStatusProps) => (
  <div className="flex flex-col items-center">
    {active.length > 0 ? (
      <button
        onClick={onOpenDownloads}
        title={currentGame}
        className="flex items-center gap-2.5 text-[14px] hover:text-pearl transition-colors"
      >
        <motion.span
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          className="relative flex"
        >
          <span className="absolute inset-0 rounded-full bg-cyan/40 blur-[6px] animate-pulse" />
          <IconDownload size={15} className="text-cyan relative" />
        </motion.span>

        <AnimatePresence mode="popLayout">
          <motion.span
            key={pct}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.25 }}
            className="tracking-tighter tabular-nums"
          >
            Загрузка {pct}% · {formatSpeed(totalSpeed)}
          </motion.span>
        </AnimatePresence>

        <span className="text-violet/40 text-[12px] tabular-nums">{active.length} | {total}</span>
      </button>
    ) : paused.length > 0 ? (
      <button
        onClick={onOpenDownloads}
        title={currentGame}
        className="flex items-center gap-2 text-[14px] hover:text-pearl transition-colors"
      >
        <IconPlayerPause size={14} className="text-yellow-400" />
        <span className="tracking-tighter">Пауза</span>
        <span className="text-violet/40 text-[12px] tabular-nums">{paused.length} | {total}</span>
      </button>
    ) : completed.length > 0 ? (
      <button
        onClick={onOpenDownloads}
        className="flex items-center gap-2 text-[14px] hover:text-pearl transition-colors"
      >
        <motion.span
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          className="relative flex"
        >
          <span className="absolute inset-0 rounded-full bg-green-400/30 blur-[6px] animate-pulse" />
          <IconCircleCheck size={15} className="text-green-400 relative" />
        </motion.span>
        <motion.span
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="tracking-tighter text-green-400/90"
        >
          Загрузка завершена
        </motion.span>
        <span className="text-violet/40 text-[12px] tabular-nums">{completed.length} | {total}</span>
      </button>
    ) : (
      <button
        onClick={onOpenDownloads}
        className="flex items-center gap-2 text-[14px] text-violet/40 hover:text-pearl transition-colors"
      >
        <IconDownload size={14} />
        <span className="tracking-tighter">Загрузки</span>
      </button>
    )}
  </div>
);
