import type { ReactNode } from 'react'

// Основная кнопка формы в стиле TL (розовая заливка,
// пиксельный капслок, прямые углы).
export function PrimaryButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="tl-btn solid w-full h-12 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}
