// src/features/coaches/components/summary/ScatterWidget.tsx
// Grafico de dispersion de un puesto: cada jugador es un punto, las lineas punteadas son la
// mediana del grupo y el cuadrante de arriba a la derecha (verde) es el de los que rinden por
// encima en las dos metricas.
import { useMemo } from 'react'
import WidgetCard, { WidgetMessage } from './WidgetCard'
import { axisRange, buildScatter, placeLabels, pointLabel, POSITION_GROUPS, type ScatterDef } from '@/features/coaches/wyscoutSquad/scatterPlots'
import { formatMetric } from '@/features/coaches/wyscoutSquad/widgetDefs'
import type { SquadPlayer } from '@/features/coaches/wyscoutSquad/wyscoutSquadTypes'

const W = 440
const H = 300
const PAD = { left: 46, right: 14, top: 14, bottom: 42 }

function ticks(lo: number, hi: number): number[] {
  return Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)
}

export default function ScatterWidget({ def, players, teamMatches, minMinutes }: {
  def: ScatterDef
  players: SquadPlayer[]
  teamMatches: number
  minMinutes: number
}) {
  const data = useMemo(() => buildScatter(players, def, { minMinutes, teamMatches }), [players, def, minMinutes, teamMatches])
  const isPctX = def.x.format === 'pct'
  const isPctY = def.y.format === 'pct'
  const xr = axisRange(data.points.map(p => p.x), isPctX)
  const yr = axisRange(data.points.map(p => p.y), isPctY)
  const pw = W - PAD.left - PAD.right
  const ph = H - PAD.top - PAD.bottom
  const sx = (v: number) => PAD.left + ((v - xr.lo) / (xr.hi - xr.lo)) * pw
  const sy = (v: number) => PAD.top + ph - ((v - yr.lo) / (yr.hi - yr.lo)) * ph
  // Los mejores se dibujan al final (arriba de los demas) y ubican su nombre primero.
  const ordered = [...data.points].sort((a, b) => Number(b.best) - Number(a.best))
  const labels = placeLabels(
    ordered.map(p => ({ px: sx(p.x), py: sy(p.y), text: pointLabel(p.name) })),
    { left: PAD.left + 2, right: W - PAD.right - 2, top: PAD.top + 2, bottom: PAD.top + ph - 2 },
    5.4, 11,
  )
  const best = data.points.filter(p => p.best).sort((a, b) => b.x + b.y - (a.x + a.y))
  const fmtX = (v: number) => formatMetric(v, def.x.format === 'pct' ? 'pct' : 'dec2')
  const fmtY = (v: number) => formatMetric(v, def.y.format === 'pct' ? 'pct' : 'dec2')

  return (
    <WidgetCard
      title={def.title}
      description={`${def.question} ${POSITION_GROUPS[def.group].label} con al menos ${minMinutes} minutos. Las líneas punteadas son la mediana del grupo.`}
    >
      {data.points.length < 2 ? (
        <WidgetMessage>No hay suficientes {POSITION_GROUPS[def.group].label.toLowerCase()} con esos minutos para comparar.</WidgetMessage>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={def.title}>
            {/* cuadrante destacado */}
            {data.xMid !== null && data.yMid !== null && (
              <g>
                <rect x={sx(data.xMid)} y={PAD.top} width={W - PAD.right - sx(data.xMid)} height={sy(data.yMid) - PAD.top}
                  className="fill-brand-green/10" rx={4} />
              </g>
            )}
            {/* grilla y ejes */}
            {ticks(xr.lo, xr.hi).map((t, i) => (
              <g key={`x${i}`}>
                <line x1={sx(t)} x2={sx(t)} y1={PAD.top} y2={PAD.top + ph} className="stroke-apple-gray-200 dark:stroke-apple-gray-700" strokeWidth={0.6} />
                <text x={sx(t)} y={PAD.top + ph + 13} textAnchor="middle" fontSize={8.5} className="fill-apple-gray-400">{fmtX(t)}</text>
              </g>
            ))}
            {ticks(yr.lo, yr.hi).map((t, i) => (
              <g key={`y${i}`}>
                <line x1={PAD.left} x2={PAD.left + pw} y1={sy(t)} y2={sy(t)} className="stroke-apple-gray-200 dark:stroke-apple-gray-700" strokeWidth={0.6} />
                <text x={PAD.left - 6} y={sy(t) + 3} textAnchor="end" fontSize={8.5} className="fill-apple-gray-400">{fmtY(t)}</text>
              </g>
            ))}
            {data.xMid !== null && (
              <line x1={sx(data.xMid)} x2={sx(data.xMid)} y1={PAD.top} y2={PAD.top + ph} strokeDasharray="4 3" strokeWidth={1}
                className="stroke-apple-gray-400 dark:stroke-apple-gray-500" />
            )}
            {data.yMid !== null && (
              <line x1={PAD.left} x2={PAD.left + pw} y1={sy(data.yMid)} y2={sy(data.yMid)} strokeDasharray="4 3" strokeWidth={1}
                className="stroke-apple-gray-400 dark:stroke-apple-gray-500" />
            )}
            <text x={PAD.left + pw / 2} y={H - 6} textAnchor="middle" fontSize={10} fontWeight={600} className="fill-apple-gray-600 dark:fill-apple-gray-300">
              {def.x.label} →
            </text>
            <text x={12} y={PAD.top + ph / 2} textAnchor="middle" fontSize={10} fontWeight={600} transform={`rotate(-90 12 ${PAD.top + ph / 2})`}
              className="fill-apple-gray-600 dark:fill-apple-gray-300">
              {def.y.label} →
            </text>
            {/* jugadores */}
            {[...ordered].reverse().map(p => (
              <circle key={p.name} cx={sx(p.x)} cy={sy(p.y)} r={p.best ? 5.5 : 4.5}
                className={p.best ? 'fill-brand-green stroke-white dark:stroke-apple-gray-800' : 'fill-apple-gray-400 dark:fill-apple-gray-500 stroke-white dark:stroke-apple-gray-800'}
                strokeWidth={1.5}>
                <title>{`${p.name}: ${def.x.label} ${fmtX(p.x)} · ${def.y.label} ${fmtY(p.y)}`}</title>
              </circle>
            ))}
            {ordered.map((p, i) => (
              <text key={`l-${p.name}`} x={labels[i].x} y={labels[i].y} textAnchor={labels[i].anchor} fontSize={9.5}
                fontWeight={p.best ? 700 : 500}
                className={p.best ? 'fill-apple-gray-800 dark:fill-white' : 'fill-apple-gray-500 dark:fill-apple-gray-400'}>
                {pointLabel(p.name)}
              </text>
            ))}
          </svg>
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-2">
            {best.length
              ? <>Arriba a la derecha: <b className="text-apple-gray-800 dark:text-white">{best.map(p => pointLabel(p.name)).join(', ')}</b></>
              : 'Nadie supera la mediana en las dos cosas a la vez.'}
          </p>
        </>
      )}
    </WidgetCard>
  )
}
