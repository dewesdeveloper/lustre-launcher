import { Minus, Square, X } from 'lucide-react';
import Tooltip from '../../../components/Tooltip';

export const WindowControls = () => {
  const electron = (window as any).electron;

  return (
    <div className="flex items-stretch h-full ml-1">
      <Tooltip label="Свернуть" align="right" className="h-full">
        <button
          onClick={() => electron?.minimize?.()}
          className="h-full w-12 flex items-center justify-center text-pearl/60 hover:text-pearl hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Minus size={14} strokeWidth={2.5} />
        </button>
      </Tooltip>
      <Tooltip label="Развернуть" align="right" className="h-full">
        <button
          onClick={() => electron?.maximize?.()}
          className="h-full w-12 flex items-center justify-center text-pearl/60 hover:text-pearl hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Square size={12} strokeWidth={2.5} />
        </button>
      </Tooltip>
      <Tooltip label="Закрыть" align="right" className="h-full">
        <button
          onClick={() => electron?.close?.()}
          className="h-full w-12 flex items-center justify-center text-pearl/60 hover:text-white hover:bg-accent transition-colors cursor-pointer"
        >
          <X size={15} strokeWidth={2.5} />
        </button>
      </Tooltip>
    </div>
  );
};
