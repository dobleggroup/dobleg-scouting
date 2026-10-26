import { PITCH_SPOTS } from '@/services/marketService'

/**
 * Canchita para marcar qué posiciones busca un club (se pueden marcar varias).
 * La cancha es verde en claro y en oscuro, así que el texto va siempre en
 * blanco sobre verde (o verde sobre blanco cuando está marcada).
 */
export default function PitchPositionPicker({ value, onChange, disabled = [] }: {
  value: string[]
  onChange: (next: string[]) => void
  /** Posiciones que la búsqueda ya tiene: se ven, pero no se pueden tocar. */
  disabled?: string[]
}) {
  const toggle = (label: string) =>
    onChange(value.includes(label) ? value.filter(v => v !== label) : [...value, label])

  return (
    <div
      className="relative w-full max-w-[22rem] mx-auto aspect-[4/5] rounded-2xl overflow-hidden shadow-inner select-none"
      style={{ background: 'repeating-linear-gradient(180deg, #15803d 0 10%, #166534 10% 20%)' }}
    >
      {/* Líneas de la cancha */}
      <div className="absolute inset-2.5 border-2 border-white/45 rounded-md pointer-events-none" />
      <div className="absolute left-2.5 right-2.5 top-1/2 border-t-2 border-white/45 pointer-events-none" />
      <div className="absolute left-1/2 top-1/2 w-20 h-20 -translate-x-1/2 -translate-y-1/2 border-2 border-white/45 rounded-full pointer-events-none" />
      <div className="absolute left-1/2 top-2.5 w-[46%] h-[15%] -translate-x-1/2 border-2 border-t-0 border-white/45 pointer-events-none" />
      <div className="absolute left-1/2 bottom-2.5 w-[46%] h-[15%] -translate-x-1/2 border-2 border-b-0 border-white/45 pointer-events-none" />

      {PITCH_SPOTS.map(spot => {
        const taken = disabled.includes(spot.label)
        const selected = !taken && value.includes(spot.label)
        return (
          <button
            key={`${spot.label}-${spot.x}`}
            type="button"
            disabled={taken}
            onClick={() => toggle(spot.label)}
            aria-pressed={selected}
            aria-label={spot.label}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
              selected
                ? 'bg-white text-green-800 shadow-lg ring-2 ring-white'
                : taken
                  ? 'bg-black/25 text-white/70 cursor-not-allowed'
                  : 'bg-black/20 text-white border border-white/70 hover:bg-white/20'
            }`}
          >
            {(selected || taken) && (
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            )}
            {spot.name}
          </button>
        )
      })}
    </div>
  )
}
