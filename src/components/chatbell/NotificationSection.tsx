import type { ReactNode } from 'react';

export const SectionTitle = ({ icon, children, count }: { icon: ReactNode; children: ReactNode; count?: number }) => (
  <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
    <span className="text-accent">{icon}</span>
    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-pearl/70">{children}</span>
    {!!count && count > 0 && (
      <span className="ml-auto text-[10px] font-black text-accent">{count}</span>
    )}
  </div>
);

interface NotificationSectionProps {
  icon: ReactNode;
  title: ReactNode;
  count?: number;
  children: ReactNode;
}

export const NotificationSection = ({ icon, title, count, children }: NotificationSectionProps) => (
  <>
    <SectionTitle icon={icon} count={count}>{title}</SectionTitle>
    {children}
  </>
);
