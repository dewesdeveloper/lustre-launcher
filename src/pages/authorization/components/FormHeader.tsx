export function FormHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <h1
        className="mt-5 tl-pixel text-[20px] leading-tight text-white uppercase"
        style={{ textShadow: 'var(--glow)' }}
      >
        {title}
      </h1>
      <p className="mt-3 tl-term text-[15px] tl-muted">{subtitle}</p>
      <span className="mt-4 w-16 h-px" style={{ background: 'var(--line-2)' }} />
    </div>
  )
}
