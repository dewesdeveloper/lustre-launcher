import { IconChevronLeft } from '@tabler/icons-react';

/** Шапка страницы создания сообщества: назад к списку и заголовок по центру. */
export default function CreateCommunityHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="relative flex shrink-0 items-center border-b border-[var(--line)] px-8 py-5">
      <button
        type="button"
        onClick={onBack}
        className="group z-10 flex items-center gap-2 tl-head text-[10px] font-bold uppercase text-[var(--muted)] transition-colors hover:text-accent"
      >
        <IconChevronLeft size={18} className="transition-transform group-hover:-translate-x-1" /> В сообщество
      </button>
      <div className="absolute left-1/2 -translate-x-1/2 text-center">
        <h1 className="text-[20px] text-white">Новое <span className="text-accent">сообщество</span></h1>
        <p className="tl-head tl-muted mt-1 text-[10px] font-bold uppercase">Категория — игра из каталога, тематика — из справочника</p>
      </div>
    </header>
  );
}
