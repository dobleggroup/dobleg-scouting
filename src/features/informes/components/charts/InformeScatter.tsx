import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { MetricDef, ScatterAssignment } from '@/features/informes/types'

interface InformeScatterProps {
  scatter: ScatterAssignment
  matrix: Record<string, (number | null)[]>
  defs: MetricDef[]
  protagonistIndex: number
}

interface Point { x: number; y: number }

function average(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null
}

interface ScatterTooltipPayload { x: number; y: number }

function makeScatterTooltip(xLabel: string, yLabel: string) {
  return function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterTooltipPayload }> }) {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    return (
      <div className="bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="text-apple-gray-600 dark:text-apple-gray-300">{xLabel}: <strong>{d.x.toFixed(2)}</strong></p>
        <p className="text-apple-gray-600 dark:text-apple-gray-300">{yLabel}: <strong>{d.y.toFixed(2)}</strong></p>
      </div>
    )
  }
}

/** Scatter de dos métricas: pool + protagonista resaltado, líneas de referencia en ambos promedios. */
export default function InformeScatter({ scatter, matrix, defs, protagonistIndex }: InformeScatterProps) {
  const xCol = matrix[scatter.xKey]
  const yCol = matrix[scatter.yKey]
  const xLabel = defs.find(d => d.key === scatter.xKey)?.label ?? scatter.xKey
  const yLabel = defs.find(d => d.key === scatter.yKey)?.label ?? scatter.yKey

  if (!xCol || !yCol) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-6 text-center">
        Sin datos disponibles para este scatter.
      </p>
    )
  }

  const poolPoints: Point[] = []
  let playerPoint: Point | null = null
  const len = Math.max(xCol.length, yCol.length)
  for (let i = 0; i < len; i++) {
    const x = xCol[i]
    const y = yCol[i]
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) continue
    if (i === protagonistIndex) {
      playerPoint = { x, y }
    } else {
      poolPoints.push({ x, y })
    }
  }

  const allX = [...poolPoints.map(p => p.x), ...(playerPoint ? [playerPoint.x] : [])]
  const allY = [...poolPoints.map(p => p.y), ...(playerPoint ? [playerPoint.y] : [])]
  const avgX = average(allX)
  const avgY = average(allY)

  if (!playerPoint && poolPoints.length === 0) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-6 text-center">
        Sin datos disponibles para este scatter.
      </p>
    )
  }

  const ScatterTooltip = makeScatterTooltip(xLabel, yLabel)

  return (
    <div>
      <div className="flex items-center gap-5 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-brand-green border-2 border-white dark:border-apple-gray-800 shadow" />
          <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200">Jugador</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-slate-300 dark:bg-slate-500" />
          <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Resto del pool</span>
        </div>
      </div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 15, right: 20, left: 20, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.1)" />
            <XAxis
              type="number" dataKey="x" tick={{ fontSize: 11 }}
              label={{ value: xLabel, position: 'insideBottom', offset: -12, fontSize: 11, fill: '#9CA3AF' }}
            />
            <YAxis
              type="number" dataKey="y" tick={{ fontSize: 11 }}
              label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#9CA3AF' }}
            />
            <Tooltip content={<ScatterTooltip />} />
            {avgX != null && (
              <ReferenceLine x={avgX} stroke="rgba(156,163,175,0.5)" strokeDasharray="4 4" label={{ value: `prom X: ${avgX.toFixed(2)}`, position: 'top', fontSize: 10, fill: '#9CA3AF' }} />
            )}
            {avgY != null && (
              <ReferenceLine y={avgY} stroke="rgba(156,163,175,0.5)" strokeDasharray="4 4" label={{ value: `prom Y: ${avgY.toFixed(2)}`, position: 'right', fontSize: 10, fill: '#9CA3AF' }} />
            )}
            {poolPoints.length > 0 && (
              <Scatter name="Pool" data={poolPoints} shape={(props: { cx?: number; cy?: number }) => (
                <circle cx={props.cx} cy={props.cy} r={4.5} fill="rgba(148,163,184,0.55)" />
              )} />
            )}
            {playerPoint && (
              <Scatter name="Jugador" data={[playerPoint]} shape={(props: { cx?: number; cy?: number }) => (
                <circle cx={props.cx} cy={props.cy} r={9} fill="#22C55E" stroke="white" strokeWidth={2.5} />
              )} />
            )}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {scatter.caption && (
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-2 text-center italic">{scatter.caption}</p>
      )}
    </div>
  )
}
