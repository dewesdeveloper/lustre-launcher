import { useMemo } from 'react'

export function Stars({ count = 50 }: { count?: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() < 0.85 ? 1 : 2,
        opacity: 0.15 + Math.random() * 0.45,
      })),
    [count],
  )

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute rounded-full bg-pearl"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
        />
      ))}
    </div>
  )
}
