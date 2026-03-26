import { useScoutsGG } from '@/context/ScoutsGGContext'

interface ScoutsGGBadgeProps {
  playerName: string
  /** 'icon' = solo ojo (default) | 'pill' = etiqueta "GG" con fondo */
  variant?: 'icon' | 'pill'
  className?: string
}

export default function ScoutsGGBadge({ playerName, variant = 'icon', className = '' }: ScoutsGGBadgeProps) {
  const { isInScoutsGG } = useScoutsGG()

  if (!isInScoutsGG(playerName)) return null

  if (variant === 'pill') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold bg-brand-green/15 text-brand-green flex-shrink-0 ${className}`}
        title="En Scouts GG"
      >
        <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
        </svg>
        GG
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center justify-center text-brand-green flex-shrink-0 ${className}`}
      title="En Scouts GG"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
      </svg>
    </span>
  )
}
