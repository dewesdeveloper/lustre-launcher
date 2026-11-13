import {
  IconChevronLeft, IconLifebuoy,
  IconInbox, IconChevronRight,
} from '@tabler/icons-react';

interface SupportHubProps {
  isStaff: boolean;
  onBack: () => void;
  onManage: () => void;
}

export const SupportHub = ({ isStaff, onBack, onManage }: SupportHubProps) => (
  <>
    <button onClick={onBack} className="tl-btn ghost mb-4 group">
      <IconChevronLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Назад
    </button>

    <header className="mb-8">
      <div className="tl-sec-head">
        <span className="bar" />
        <h2 className="tl-caps">
          <IconLifebuoy size={15} className="text-accent" /> Служба <span className="text-accent">поддержки</span>
        </h2>
        <span className="line" />
        <span className="tag">SUPPORT</span>
      </div>
      <p className="tl-term tl-muted text-[15px]">Отвечаем в среднем в течение 24 часов</p>
    </header>

    {/* Входящие — для поддержки */}
    {isStaff && (
      <button
        onClick={onManage}
        className="tl-vrow w-full mb-6 text-left cursor-pointer group hover:shadow-[inset_0_0_0_1px_var(--line-2)] transition-shadow"
      >
        <span className="ic">
          <IconInbox size={18} />
        </span>
        <div className="vt">
          <b>Входящие обращения</b>
          <div className="vd">Все обращения пользователей, ответы и статусы</div>
        </div>
        <IconChevronRight size={18} className="text-[var(--muted-2)] group-hover:text-accent group-hover:translate-x-1 transition-all shrink-0" />
      </button>
    )}
  </>
);
