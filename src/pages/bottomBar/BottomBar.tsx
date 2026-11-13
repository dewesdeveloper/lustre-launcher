import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { IconPlus, IconShieldCheck, IconList } from '@tabler/icons-react';
import { DownloadStatus, type Download } from './components/DownloadStatus';
import { FriendsButton } from './components/FriendsButton';
import { hasAdmin } from '../../admin';

export default function BottomBar() {
  const navigate = useNavigate();
  const [downloads, setDownloads] = useState<Download[]>([]);
  const electron = (window as any).electron;
  const { user } = useAuth();
  const role = (user as any)?.role;
  // кнопки админки — только если в сборке есть закрытый модуль (src/admin.ts)
  const isAdmin = hasAdmin && role === 'admin';
  const isStaff = hasAdmin && (role === 'admin' || role === 'manager');

  useEffect(() => {
    electron?.torrentList?.().then((list: Download[]) => {
      if (list) setDownloads(list);
    });
    const off = electron?.onTorrentUpdate?.((list: Download[]) => setDownloads(list || []));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  const active = downloads.filter(d => d.status === 'downloading');
  const paused = downloads.filter(d => d.status === 'paused');
  const completed = downloads.filter(d => d.status === 'completed');

  const overall = active.length > 0
    ? active.reduce((s, d) => s + d.progress, 0) / active.length
    : 0;
  const pct = Math.floor(overall * 100);
  const totalSpeed = active.reduce((s, d) => s + (d.downloadSpeed || 0), 0);
  const currentGame = active[0]?.gameTitle || paused[0]?.gameTitle || '';

  const handleOpenFriends = () => {
    electron?.openFriends?.();
  };

  return (
    <footer className="relative h-16 bg-[#0b0512] border-t border-[var(--line-2)] flex items-center justify-between px-4 text-[11px] tl-term text-[var(--muted)] select-none overflow-hidden">
      {/* Левая часть */}
      <div className="flex items-center gap-4">
        {isStaff && (
          <>
            {isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="flex items-center gap-1.5 hover:text-pearl transition-colors group cursor-pointer"
              >
                <div className="p-0.5 border border-accent/40 rounded-sm group-hover:border-accent">
                  <IconShieldCheck size={15} stroke={3} />
                </div>
                <span className='text-[14px]'>Админ-панель</span>
              </button>
            )}
            <button
              onClick={() => navigate('/admin/games')}
              className="flex items-center gap-1.5 hover:text-pearl transition-colors group cursor-pointer"
            >
              <div className="p-0.5 border border-violet/30 rounded-sm group-hover:border-pearl">
                <IconList size={15} stroke={3} />
              </div>
              <span className='text-[14px]'>Игры</span>
            </button>
            <button
              onClick={() => navigate('/add-game')}
              className="flex items-center gap-1.5 hover:text-pearl transition-colors group cursor-pointer"
            >
              <div className="p-0.5 border border-violet/30 rounded-sm group-hover:border-pearl">
                <IconPlus size={15} stroke={3} />
              </div>
              <span className='text-[14px]'>Добавить игру</span>
            </button>
            <button
              onClick={() => navigate('/admin-shop')}
              className="flex items-center gap-1.5 hover:text-pearl transition-colors group cursor-pointer"
            >
              <div className="p-0.5 border border-violet/30 rounded-sm group-hover:border-pearl">
                <IconPlus size={15} stroke={3} />
              </div>
              <span className='text-[14px]'>Управление магазином</span>
            </button>
          </>
        )}
      </div>

      {/* Центр — живой статус загрузок */}
      <DownloadStatus
        active={active}
        paused={paused}
        completed={completed}
        total={downloads.length}
        pct={pct}
        totalSpeed={totalSpeed}
        currentGame={currentGame}
        onOpenDownloads={() => navigate('/downloads')}
      />

      {/* Правая часть */}
      <FriendsButton onClick={handleOpenFriends} />

      {/* Живая прогресс-линия по нижнему краю */}
      <AnimatePresence>
        {active.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-0 left-0 w-full h-[3px] bg-violet/10"
          >
            <motion.div
              className="h-full bg-linear-to-r from-accent via-violet to-cyan"
              style={{ boxShadow: '0 0 14px rgba(58, 134, 255, 0.7)' }}
              animate={{ width: `${overall * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </footer>
  );
}
