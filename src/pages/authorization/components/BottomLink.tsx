export function BottomLink({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return (
    <p className='mt-8 text-center tl-term text-[14px] tl-muted'>
      {text}{' '}
      <button
        type='button'
        onClick={onClick}
        className='tl-head text-[10px] font-bold uppercase tracking-[0.14em] text-accent hover:text-white transition-colors cursor-pointer'
      >
        {action}
      </button>
    </p>
  )
}
