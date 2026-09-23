// src/features/coaches/components/WyscoutPitches.tsx
// Canchas del informe PDF de Wyscout: formación (vertical, arco propio abajo) y mapa
// de calor por zona (horizontal, ataque hacia la derecha). Medidas reales de cancha
// (105 x 68) para que áreas, círculo y arcos tengan la proporción correcta.
import type { PitchPoint } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

const LINE = 'rgba(255,255,255,0.55)'
const LINE_W = 0.35
const GRASS_A = '#1F7A45'
const GRASS_B = '#1B6F3F'

/** Franjas de pasto + líneas de cancha en coordenadas de cancha vertical (68 x 105). */
function VerticalMarkings() {
  const stripes = Array.from({ length: 10 }, (_, i) => i)
  return (
    <g>
      {stripes.map(i => (
        <rect key={i} x={0} y={i * 10.5} width={68} height={10.5} fill={i % 2 ? GRASS_B : GRASS_A} />
      ))}
      <g fill="none" stroke={LINE} strokeWidth={LINE_W}>
        <rect x={1.5} y={1.5} width={65} height={102} rx={0.4} />
        <line x1={1.5} y1={52.5} x2={66.5} y2={52.5} />
        <circle cx={34} cy={52.5} r={9.15} />
        {/* área grande / chica / arco, arriba (rival) y abajo (propio) */}
        <rect x={13.84} y={1.5} width={40.32} height={16.5} />
        <rect x={24.84} y={1.5} width={18.32} height={5.5} />
        <path d="M 26.7 18 A 9.15 9.15 0 0 0 41.3 18" />
        <rect x={13.84} y={87} width={40.32} height={16.5} />
        <rect x={24.84} y={98} width={18.32} height={5.5} />
        <path d="M 26.7 87 A 9.15 9.15 0 0 1 41.3 87" />
      </g>
      <circle cx={34} cy={52.5} r={0.5} fill={LINE} />
      <circle cx={34} cy={12.5} r={0.4} fill={LINE} />
      <circle cx={34} cy={92.5} r={0.4} fill={LINE} />
    </g>
  )
}

/** Wyscout exporta la posición media normalizada a la caja de los 11 jugadores (0-100 en
 *  cada eje: el arquero en y=100, el 9 en y=0, los laterales en x=0/100). Dibujado tal cual
 *  quedan jugadores pegados o afuera de las líneas: se ubica la forma dentro del área real
 *  de juego -- arquero cerca del arco propio, el 9 a la altura de la medialuna rival. */
function toVerticalPitch(p: PitchPoint): { x: number; y: number } {
  return { x: 8 + (p.x / 100) * 52, y: 17 + (p.y / 100) * 73 }
}

function shortLabel(name: string | undefined): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

export function FormationPitch({ players }: { players: PitchPoint[] }) {
  return (
    <svg viewBox="0 0 68 105" className="w-full max-w-[300px] mx-auto block h-auto rounded-xl" role="img" aria-label="Posición media de los jugadores">
      <VerticalMarkings />
      {players.map((p, i) => {
        const { x, y } = toVerticalPitch(p)
        const label = shortLabel(p.label)
        const labelW = Math.max(8.5, label.length * 1.45 + 2.2)
        return (
          <g key={`${p.label}-${i}`}>
            <circle cx={x} cy={y} r={2.6} fill="#FFFFFF" stroke="rgba(6,6,7,0.35)" strokeWidth={0.3} />
            <circle cx={x} cy={y} r={1.05} fill="#15803D" />
            {label && (
              <g>
                <rect x={x - labelW / 2} y={y + 3.2} width={labelW} height={3.9} rx={1.95} fill="rgba(6,6,7,0.62)" />
                <text x={x} y={y + 6.05} textAnchor="middle" fontSize={2.4} fontWeight={600} fill="#FFFFFF">{label}</text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Franjas + líneas en coordenadas de cancha horizontal (105 x 68), ataque a la derecha. */
function HorizontalMarkings() {
  return (
    <g fill="none" stroke={LINE} strokeWidth={LINE_W}>
      <rect x={1.5} y={1.5} width={102} height={65} rx={0.4} />
      <line x1={52.5} y1={1.5} x2={52.5} y2={66.5} />
      <circle cx={52.5} cy={34} r={9.15} />
      <rect x={1.5} y={13.84} width={16.5} height={40.32} />
      <rect x={1.5} y={24.84} width={5.5} height={18.32} />
      <path d="M 18 26.7 A 9.15 9.15 0 0 1 18 41.3" />
      <rect x={87} y={13.84} width={16.5} height={40.32} />
      <rect x={98} y={24.84} width={5.5} height={18.32} />
      <path d="M 87 26.7 A 9.15 9.15 0 0 0 87 41.3" />
    </g>
  )
}

export interface ZoneCell { row: number; col: number; pct: number }

/** Grilla 3x3 de Wyscout sobre la cancha: columnas = tercios (propio, medio, ataque), filas =
 *  carriles en el mismo orden que el PDF. Cada zona se ilumina en blanco según su peso
 *  relativo (más clara = más acciones) -- igual en modo claro y oscuro, porque la cancha
 *  siempre es verde. Las líneas van debajo de las zonas para no cruzar los números. */
export function ZoneHeatPitch({ cells }: { cells: ZoneCell[] }) {
  const inner = { x: 1.5, y: 1.5, w: 102, h: 65 }
  const cw = inner.w / 3
  const rh = inner.h / 3
  const max = Math.max(...cells.map(c => c.pct), 1)
  return (
    <svg viewBox="0 0 105 68" className="w-full h-auto rounded-xl" role="img" aria-label="Porcentaje por zona de la cancha">
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x={i * 15} y={0} width={15} height={68} fill={i % 2 ? GRASS_B : GRASS_A} />
      ))}
      <HorizontalMarkings />
      {Array.from({ length: 9 }, (_, i) => {
        const row = Math.floor(i / 3)
        const col = i % 3
        const cell = cells.find(c => c.row === row && c.col === col)
        const x = inner.x + col * cw
        const y = inner.y + row * rh
        const alpha = cell ? 0.06 + 0.74 * (cell.pct / max) : 0
        const darkText = alpha > 0.5
        return (
          <g key={i}>
            <rect x={x + 0.5} y={y + 0.5} width={cw - 1} height={rh - 1} rx={1.4} fill="#FFFFFF" fillOpacity={alpha} />
            <text x={x + cw / 2} y={y + rh / 2 + 2.1} textAnchor="middle" fontSize={5.6} fontWeight={700}
              fill={darkText ? '#0E3B22' : '#FFFFFF'} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {cell ? `${Math.round(cell.pct)}%` : '–'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
