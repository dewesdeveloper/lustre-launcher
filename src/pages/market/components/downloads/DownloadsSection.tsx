import React from 'react';
import type { Download, InstalledGame } from '../../types';
import DownloadCard from './DownloadCard';
import InstalledCard from './InstalledCard';

export function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="tl-sec-head">
        <span className="bar" />
        <h2>{title}</h2>
        <span className="count">// {count}</span>
        <span className="line" />
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

interface DownloadsSectionProps {
  downloads: Download[];
  installed: InstalledGame[];
  installStates: Record<string, { phase: string; percent: number }>;
  installErrors: Record<string, string>;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
  onInstall: (id: string) => void;
  onOpenGame: (gameId: number) => void;
  onPlay: (id: string) => void;
  onReveal: (id: string) => void;
  onUninstall: (g: InstalledGame) => void;
}

const DownloadsSection = ({
  downloads,
  installed,
  installStates,
  installErrors,
  onPause,
  onResume,
  onRemove,
  onInstall,
  onOpenGame,
  onPlay,
  onReveal,
  onUninstall,
}: DownloadsSectionProps) => {
  const active = downloads.filter(d => d.status === 'downloading');
  const paused = downloads.filter(d => d.status === 'paused');
  const completed = downloads.filter(d => d.status === 'completed');
  // ошибки раньше не попадали ни в один раздел — загрузка просто пропадала со страницы
  const failed = downloads.filter(d => !['downloading', 'paused', 'completed'].includes(d.status));

  const card = (dl: Download, withInstall = false) => (
    <DownloadCard
      key={dl.id}
      dl={dl}
      onPause={onPause}
      onResume={onResume}
      onRemove={onRemove}
      onOpenGame={onOpenGame}
      onInstall={withInstall ? onInstall : undefined}
      installState={withInstall ? installStates[dl.id] : undefined}
      installError={withInstall ? installErrors[dl.id] : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {active.length > 0 && <Section title="СКАЧИВАЮТСЯ" count={active.length}>{active.map(d => card(d))}</Section>}
      {failed.length > 0 && <Section title="С ОШИБКОЙ" count={failed.length}>{failed.map(d => card(d))}</Section>}
      {paused.length > 0 && <Section title="НА ПАУЗЕ" count={paused.length}>{paused.map(d => card(d))}</Section>}
      {completed.length > 0 && <Section title="СКАЧАНО" count={completed.length}>{completed.map(d => card(d, true))}</Section>}
      {installed.length > 0 && (
        <Section title="УСТАНОВЛЕННЫЕ ИГРЫ" count={installed.length}>
          {installed.map(g => (
            <InstalledCard key={g.id} game={g} onPlay={onPlay} onReveal={onReveal} onUninstall={onUninstall} />
          ))}
        </Section>
      )}
    </div>
  );
};

export default DownloadsSection;
