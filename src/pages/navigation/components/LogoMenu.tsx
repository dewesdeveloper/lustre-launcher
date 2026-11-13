import type { MenuEntry } from './menuItems';
import { DropMenu } from './DropMenu';
import Tooltip from '../../../components/Tooltip';
import { publicAsset } from '../../../utils/webBase';

interface LogoMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  items: MenuEntry[];
}

export const LogoMenu = ({ isOpen, onToggle, onClose, items }: LogoMenuProps) => (
  <>
    <Tooltip label="Lustre" hint="Главное меню" align="left">
      <button
        onClick={onToggle}
        className="group/logo flex items-center gap-3 px-1.5 py-1 -mx-1 transition-all duration-200 cursor-pointer"
      >
        <span className="w-[34px] h-[34px] flex items-center justify-center shrink-0 transition-transform duration-200 group-hover/logo:scale-105">
          <img src={publicAsset('logo.svg')} alt="Lustre" className="w-full h-full object-contain" draggable={false} />
        </span>
        <span className="hidden md:flex flex-col items-start leading-none">
          <span className="tl-glitch-title tl-pixel text-[13px] text-white" data-text="LUSTRE">LUSTRE</span>
          <span className="tl-head text-[10px] text-[var(--muted)] tracking-[0.3em] mt-0.5">CYBER LOUNGE</span>
        </span>
      </button>
    </Tooltip>

    <DropMenu open={isOpen} entries={items} onClose={onClose} place="left-0 mt-2 w-60 z-[120]" />
  </>
);
