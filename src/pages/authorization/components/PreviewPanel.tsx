import { Stars } from './Stars'

// Превью-панель справа на страницах входа: панель TL с уголками,
// пиксельные подписи и график в цвете акцента.
function StatCard() {
  return (
    <div className="tl-panel w-[320px] p-6">
      <p className="tl-head text-[10px] font-bold uppercase tracking-[0.18em] tl-muted">
        Игроков с подпиской
      </p>
      <div className="mt-2 flex items-baseline gap-3">
        <p className="tl-num text-[30px] leading-none" style={{ color: 'var(--pink)' }}>18,579</p>
        <p className="tl-term text-[14px] tl-muted">за последние 30 дней</p>
      </div>
      <svg viewBox="0 0 300 80" className="mt-6 w-full" aria-hidden="true">
        <g stroke="rgba(255,45,143,.18)" strokeWidth="1">
          <line x1="0" y1="20" x2="300" y2="20" />
          <line x1="0" y1="40" x2="300" y2="40" />
          <line x1="0" y1="60" x2="300" y2="60" />
        </g>
        <polyline
          points="0,62 25,55 50,58 75,44 100,48 125,30 150,38 175,34 200,44 225,40 250,52 265,60 285,22 300,18"
          fill="none"
          stroke="var(--pink)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-6 space-y-3">
        <div className="h-2.5 w-3/4" style={{ background: 'rgb(var(--accent-rgb) / .12)' }} />
        <div className="h-2.5 w-1/2" style={{ background: 'rgb(var(--accent-rgb) / .12)' }} />
        <div className="h-2.5 w-2/3" style={{ background: 'rgb(var(--accent-rgb) / .12)' }} />
      </div>
    </div>
  )
}

export function PreviewPanel() {
  return (
    <div className="relative m-4 hidden flex-1 overflow-hidden tl-panel lg:block">
      <Stars count={80} />
      <div
        className="absolute -bottom-32 -left-24 h-[420px] w-[420px] rounded-full blur-[120px]"
        style={{ background: 'rgb(var(--accent-rgb) / .22)' }}
        aria-hidden="true"
      />
      <div
        className="absolute -right-20 -bottom-20 h-[360px] w-[360px] rounded-full blur-[120px]"
        style={{ background: 'rgb(var(--violet-rgb) / .18)' }}
        aria-hidden="true"
      />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <StatCard />
      </div>
    </div>
  )
}
