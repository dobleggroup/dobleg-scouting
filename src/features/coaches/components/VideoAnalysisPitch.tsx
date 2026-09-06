import type { PitchHalf } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

interface PitchPointInput {
  x: number
  y: number
  label?: string
}

/** 'marker': puntos con pocas etiquetas (formaciones, balón parado) -- un punto
 *  chico + la etiqueta como pastilla debajo, nunca metida adentro del punto.
 *  'heat': nubes densas de eventos (decenas/cientos de puntos) -- sin texto,
 *  cada punto es un resplandor que se suma con blend-mode sobre los vecinos,
 *  así la densidad se lee como calor en vez de como puntos amarillos pisándose. */
type DotStyle = 'marker' | 'heat'

export default function VideoAnalysisPitch({
  exact,
  zones,
  half = 'completa',
  dotStyle = 'marker',
}: {
  exact: PitchPointInput[]
  zones: { x1: number; y1: number; x2: number; y2: number }[]
  half?: PitchHalf
  dotStyle?: DotStyle
}) {
  // 'propia'/'rival' recortan el viewBox a la mitad de arriba/abajo -- los puntos
  // ya vienen normalizados 0-100 sobre esa mitad (el parser hizo esa cuenta), asi
  // que el recorte es solo visual, no hace falta reescalar `exact` aca.
  const viewBoxByHalf: Record<PitchHalf, string> = {
    completa: '0 0 100 130',
    propia: '0 65 100 65',
    rival: '0 0 100 65',
  }

  return (
    <div className="bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-2xl p-4 relative w-full aspect-[3/4] max-w-md mx-auto shadow-2xl overflow-hidden">
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={viewBoxByHalf[half]} preserveAspectRatio="none">
        <rect x="2" y="2" width="96" height="126" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
        <circle cx="50" cy="65" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <line x1="2" y1="65" x2="98" y2="65" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <rect x="20" y="2" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <rect x="20" y="108" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
      </svg>

      {zones.map((z, i) => (
        <div
          key={i}
          className="absolute bg-brand-green/30 rounded-md"
          style={{ left: `${z.x1}%`, top: `${z.y1}%`, width: `${z.x2 - z.x1}%`, height: `${z.y2 - z.y1}%` }}
        />
      ))}

      {dotStyle === 'heat'
        ? exact.map((p, i) => (
            <div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: '9%',
                height: '7%',
                background: 'radial-gradient(circle, rgba(250,204,21,0.55) 0%, rgba(250,204,21,0.22) 45%, rgba(250,204,21,0) 75%)',
                mixBlendMode: 'screen',
              }}
            />
          ))
        : exact.map((p, i) => (
            <div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 ring-2 ring-emerald-900/70 shadow flex-shrink-0" />
              {p.label && (
                <span className="max-w-[4.5rem] truncate rounded px-1 py-px text-[9px] font-semibold leading-tight text-white bg-apple-gray-900/75 whitespace-nowrap">
                  {p.label}
                </span>
              )}
            </div>
          ))}

      {exact.length === 0 && zones.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs text-white/70 text-center px-6">Sin datos de posición para esta categoría.</p>
        </div>
      )}
    </div>
  )
}
