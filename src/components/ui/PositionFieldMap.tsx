import type { Position } from '@/types/scoring'

interface Props {
  position: Position
  className?: string
}

export default function PositionFieldMap({ position, className = '' }: Props) {
  return (
    <div className={className}>
      <div className="bg-apple-gray-100 dark:bg-apple-gray-800/50 rounded-xl p-5 flex justify-center">
        <svg viewBox="0 0 380 260" className="w-full max-w-md h-auto">
          <defs>
            <linearGradient id="posZoneGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22C55E" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#22C55E" stopOpacity="0.08"/>
            </linearGradient>
          </defs>

          {/* Campo */}
          <rect x="15" y="15" width="350" height="230" rx="3" fill="none" stroke="currentColor" className="text-apple-gray-300 dark:text-apple-gray-600" strokeWidth="1.5"/>

          {/* Línea central */}
          <line x1="190" y1="15" x2="190" y2="245" stroke="currentColor" className="text-apple-gray-300 dark:text-apple-gray-600" strokeWidth="1"/>

          {/* Círculo central */}
          <circle cx="190" cy="130" r="35" fill="none" stroke="currentColor" className="text-apple-gray-300 dark:text-apple-gray-600" strokeWidth="1"/>
          <circle cx="190" cy="130" r="2.5" fill="currentColor" className="text-apple-gray-300 dark:text-apple-gray-600"/>

          {/* Área izquierda */}
          <rect x="15" y="55" width="52" height="150" fill="none" stroke="currentColor" className="text-apple-gray-300 dark:text-apple-gray-600" strokeWidth="1"/>
          <rect x="15" y="90" width="20" height="80" fill="none" stroke="currentColor" className="text-apple-gray-300 dark:text-apple-gray-600" strokeWidth="1"/>

          {/* Área derecha */}
          <rect x="313" y="55" width="52" height="150" fill="none" stroke="currentColor" className="text-apple-gray-300 dark:text-apple-gray-600" strokeWidth="1"/>
          <rect x="345" y="90" width="20" height="80" fill="none" stroke="currentColor" className="text-apple-gray-300 dark:text-apple-gray-600" strokeWidth="1"/>

          {/* Zonas por posición */}
          {position === 'ARQ' && (
            <rect x="18" y="70" width="35" height="120" rx="12" fill="url(#posZoneGradient)"/>
          )}
          {position === 'CB' && (
            <rect x="55" y="70" width="70" height="120" rx="16" fill="url(#posZoneGradient)"/>
          )}
          {position === 'LD' && (
            <rect x="40" y="187" width="110" height="55" rx="14" fill="url(#posZoneGradient)"/>
          )}
          {position === 'LI' && (
            <rect x="40" y="18" width="110" height="55" rx="14" fill="url(#posZoneGradient)"/>
          )}
          {position === 'VC' && (
            <rect x="95" y="65" width="105" height="130" rx="18" fill="url(#posZoneGradient)"/>
          )}
          {position === 'VI' && (
            <rect x="155" y="55" width="115" height="150" rx="20" fill="url(#posZoneGradient)"/>
          )}
          {position === 'EXT' && (
            <>
              <rect x="220" y="18" width="120" height="60" rx="14" fill="url(#posZoneGradient)"/>
              <rect x="220" y="182" width="120" height="60" rx="14" fill="url(#posZoneGradient)"/>
            </>
          )}
          {position === 'DEL' && (
            <rect x="265" y="60" width="85" height="140" rx="18" fill="url(#posZoneGradient)"/>
          )}
        </svg>
      </div>
      <p className="text-center text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1.5">{POSITION_NAMES[position]}</p>
    </div>
  )
}

const POSITION_NAMES: Record<Position, string> = {
  ARQ: 'Arquero',
  CB: 'Defensor Central',
  LD: 'Lateral Derecho',
  LI: 'Lateral Izquierdo',
  VC: 'Volante Central',
  VI: 'Volante Interior',
  EXT: 'Extremo',
  DEL: 'Delantero',
}
