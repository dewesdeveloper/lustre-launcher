import { Gamepad2 } from 'lucide-react';
import { modeLabels } from '../../constants';

interface GameModesProps {
  gameModes: Record<string, boolean>;
}

const GameModes = ({ gameModes }: GameModesProps) => {
  if (Object.keys(gameModes).length === 0) return null;

  return (
    <section>
      <div className="tl-sec-head">
        <span className="bar" />
        <h2><Gamepad2 size={15} className="text-accent" /> Игровые режимы</h2>
        <span className="line" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(gameModes).filter(([, v]) => v).map(([key]) => (
          <span key={key} className="tl-chip age">
            {modeLabels[key] || key}
          </span>
        ))}
      </div>
    </section>
  );
};

export default GameModes;
