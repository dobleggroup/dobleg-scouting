import type { PitchHalf } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

export default function VideoAnalysisPitch({
  exact,
  zones,
  half = 'completa',
}: {
  exact: { x: number; y: number; label?: string }[]
  zones: { x1: number; y1: number; x2: number; y2: number }[]
  half?: PitchHalf
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

      {exact.map((p, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-yellow-400 shadow text-2xs font-bold text-apple-gray-900"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.label ? '18px' : '8px', height: p.label ? '18px' : '8px' }}
        >
          {p.label}
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
