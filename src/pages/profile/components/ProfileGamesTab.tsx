import { Loader2 } from 'lucide-react';
import SectionHeader from './SectionHeader';
import EmptyBlock from './EmptyBlock';

type ProfileGamesTabProps = {
  library: any[] | null;
  onGameClick: (gameId: any) => void;
};

export default function ProfileGamesTab({ library, onGameClick }: ProfileGamesTabProps) {
  return (
    <div>
      {library === null ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-accent" size={26} /></div>
      ) : library.length === 0 ? (
        <EmptyBlock text="В библиотеке пока нет игр" />
      ) : (
        <>
          <SectionHeader title="Игры" count={library.length} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
            {library.map((entry: any) => (
              <article key={entry.id} className="tl-gcard" onClick={() => onGameClick(entry.game_id)}>
                <div className="thumb">
                  {entry.game?.header_image ? (
                    <img src={entry.game.header_image} alt={entry.game?.title} />
                  ) : (
                    <div className="w-full h-full bg-[var(--panel2)] flex items-center justify-center tl-head text-[10px] uppercase text-[var(--muted-2)]">Нет обложки</div>
                  )}
                </div>
                <div className="body">
                  <h3 className="truncate">{entry.game?.title}</h3>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
