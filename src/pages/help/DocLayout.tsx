import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft } from '@tabler/icons-react';

/** Раздел документа: заголовок без номера и абзацы */
export type DocClause = { title: string; paragraphs: ReactNode[] };

type LegalDocPageProps = {
  /** заголовок из двух частей: «Политика» + выделенное «конфиденциальности» */
  title: [string, string];
  subtitle: string;
  clauses: DocClause[];
};

const REVISION = 'Обновлено 10 сентября 2026 г.';

/** Страница правового документа: «Назад», заголовок, пронумерованные разделы и дата редакции. */
export function LegalDocPage({ title: [lead, accent], subtitle, clauses }: LegalDocPageProps) {
  const navigate = useNavigate();
  return (
    <article className="mx-auto max-w-4xl animate-in fade-in p-8 text-left duration-700">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="group mb-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-pearl/70 transition-all hover:text-accent"
      >
        <IconChevronLeft size={16} className="transition-transform group-hover:-translate-x-1" /> Назад
      </button>

      <header className="mb-8">
        <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white">{lead} <span className="text-accent">{accent}</span></h1>
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.3em] text-pearl/60">{subtitle}</p>
      </header>

      <div className="space-y-8 rounded-[2rem] border border-white/5 bg-[#09070c] p-8">
        {clauses.map((c, i) => (
          <section key={c.title}>
            <h2 className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-pearl/60">{i + 1}. {c.title}</h2>
            <div className="space-y-3 text-sm leading-relaxed text-pearl/70">
              {c.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-6 text-center text-[10px] font-black uppercase tracking-[0.3em] text-pearl/55">Lustre · {REVISION}</footer>
    </article>
  );
}
