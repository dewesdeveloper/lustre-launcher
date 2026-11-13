export function OrDivider() {
  return (
    <div className='my-6 flex items-center gap-4'>
      <div className='h-px flex-1' style={{ background: 'var(--line)' }} />
      <span className='tl-head text-[10px] font-bold uppercase tracking-[0.18em] tl-muted'>или</span>
      <div className='h-px flex-1' style={{ background: 'var(--line)' }} />
    </div>
  )
}
