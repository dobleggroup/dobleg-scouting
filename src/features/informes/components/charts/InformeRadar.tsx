import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts'
import type { MetricStat } from '@/features/informes/types'

interface InformeRadarProps {
  stats: MetricStat[]
  keys: string[]
}

interface RadarTooltipPayload {
  subject: string
  jugadorRaw: string
}

function RadarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RadarTooltipPayload }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-apple-gray-700 dark:text-apple-gray-200 mb-1">{d.subject}</p>
      <p className="text-brand-green">Jugador: <strong>{d.jugadorRaw}</strong></p>
    </div>
  )
}

/**
 * Radar del jugador vs el promedio de la liga/pool.
 * Cada eje usa `stat.percentile` (0-100, ya calculado respetando higherIsBetter).
 * El promedio se representa como el punto medio del pool (percentil 50 constante),
 * ya que el percentil del jugador ya está normalizado contra el resto del grupo.
 */
export default function InformeRadar({ stats, keys }: InformeRadarProps) {
  const rows = keys
    .map(key => stats.find(s => s.def.key === key))
    .filter((s): s is MetricStat => !!s)

  if (rows.length === 0) {
    return (
      <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-8 text-center">
        Asigná métricas al radar en el paso 2 para verlo acá.
      </p>
    )
  }

  const data = rows.map(stat => ({
    subject: stat.def.short,
    jugador: stat.percentile ?? 0,
    promedio: 50,
    jugadorRaw: stat.value == null ? '—' : (stat.def.unit === '%' ? stat.value.toFixed(0) : stat.value.toFixed(2)),
  }))

  return (
    <div>
      <div className="flex items-center gap-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-brand-green" />
          <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200">Jugador</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#94A3B8" strokeWidth="2.5" strokeDasharray="5 4" /></svg>
          <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Promedio liga</span>
        </div>
      </div>
      <div style={{ height: Math.max(340, rows.length * 28) }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} margin={{ top: 20, right: 55, bottom: 20, left: 55 }}>
            <PolarGrid stroke="rgba(156,163,175,0.2)" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'currentColor', fontWeight: 500 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip content={<RadarTooltip />} />
            <Radar name="Jugador" dataKey="jugador" stroke="#22C55E" strokeWidth={2.5} fill="#22C55E" fillOpacity={0.22} />
            <Radar name="Promedio liga" dataKey="promedio" stroke="#94A3B8" strokeWidth={3} strokeDasharray="6 4" fill="#94A3B8" fillOpacity={0.06} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mt-2 text-center">
        Cada eje normalizado 0-100 (percentil). Verde = jugador · Punteado gris = promedio liga.
      </p>
    </div>
  )
}
