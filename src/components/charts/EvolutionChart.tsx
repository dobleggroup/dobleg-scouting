import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from 'recharts'
import type { EvolutionEntry } from '@/types'

interface EvolutionChartProps {
  evolution: EvolutionEntry[]
  playerSK: string
}

const EXCLUDED_COLS = new Set([
  'JugadorNombre', 'JugadorSK', 'PosicionSK', 'PosicionGeneral', 'PosicionGeneralSK',
  'CompeticionSK', 'PartidoSK', 'Date', 'Partido', 'Competition', 'Posicion_Principal',
  'imagen',
])

function formatMetricLabel(rawName: string): string {
  const LABEL_MAP: Record<string, string> = {
    'Minutos_jugados': 'Minutos jugados',
    'Acciones_totales': 'Acciones totales',
    'Acciones_totales_logradas': 'Acciones exitosas',
    'Goles': 'Goles',
    'Asistencias': 'Asistencias',
    'Tiros': 'Tiros',
    'Tiros_logrados': 'Tiros a puerta',
    'xG': 'xG',
    'xA': 'xA',
    'Pases': 'Pases totales',
    'Pases_logrados': 'Pases completados',
    'Pases_largos': 'Pases largos',
    'Pases_largos_logrados': 'Pases largos completados',
    'Pases_profundidad': 'Pases en profundidad',
    'Pases_profundidad_logrados': 'Pases profundidad completados',
    'Pases_ultimo_tercio': 'Pases al ultimo tercio',
    'Pases_ultimo_tercio_logrados': 'Pases ult. tercio completados',
    'Pases_area_penalti': 'Pases al area',
    'Pases_area_penalti_logrados': 'Pases al area completados',
    'Pases_recibidos': 'Pases recibidos',
    'Pases_hacia_adelante': 'Pases hacia adelante',
    'Pases_hacia_adelante_logrados': 'Pases adelante completados',
    'Pases_hacia_atras': 'Pases hacia atras',
    'Pases_hacia_atras_logrados': 'Pases atras completados',
    'Asistencias_tiro': 'Asistencias de tiro',
    'Second_assists': 'Segundas asistencias',
    'Centros': 'Centros',
    'Centros_precisos': 'Centros precisos',
    'Regates': 'Regates intentados',
    'Regates_logrados': 'Regates exitosos',
    'Duelos': 'Duelos totales',
    'Duelos_ganados': 'Duelos ganados',
    'Duelos_aereos': 'Duelos aereos',
    'Duelos_aereos_ganados': 'Duelos aereos ganados',
    'Duelos_defensivos': 'Duelos defensivos',
    'Duelos_defensivos_ganados': 'Duelos defensivos ganados',
    'Duelos_ofensivos': 'Duelos ofensivos',
    'Duelos_ofensivos_ganados': 'Duelos ofensivos ganados',
    'Duelos_por_balon_perdido': 'Duelos tras perdida',
    'Duelos_por_balon_perdido_ganados': 'Duelos tras perdida ganados',
    'Interceptaciones': 'Interceptaciones',
    'Entradas_ras_suelo': 'Entradas',
    'Entradas_ras_suelo_logradas': 'Entradas exitosas',
    'Despejes': 'Despejes',
    'Balones_perdidos': 'Balones perdidos',
    'Balones_perdidos_propia_mitad': 'Perdidas en campo propio',
    'Balones_recuperados': 'Balones recuperados',
    'Balones_recuperados_mitad_adv': 'Recuperaciones campo rival',
    'Tarjeta_amarilla': 'Tarjetas amarillas',
    'Tarjeta_roja': 'Tarjetas rojas',
    'Tarjetas_amarillas': 'Tarjetas amarillas',
    'Tarjetas_rojas': 'Tarjetas rojas',
    'Faltas': 'Faltas cometidas',
    'Faltas_recibidas': 'Faltas recibidas',
    'Toques_area_penalti': 'Toques en area',
    'Fuera_de_juego': 'Fueras de juego',
    'Carreras_profundidad': 'Carreras en profundidad',
  }

  if (LABEL_MAP[rawName]) return LABEL_MAP[rawName]

  return rawName
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase())
    .trim()
}

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Todo' },
  { value: '12', label: '1 ano' },
  { value: '6', label: '6 meses' },
  { value: '3', label: '3 meses' },
  { value: '1', label: '1 mes' },
]

interface SingleChartProps {
  playerData: EvolutionEntry[]
  metric: string
  onRemove?: () => void
  availableMetrics: string[]
  onMetricChange: (m: string) => void
}

function SingleChart({ playerData, metric, onRemove, availableMetrics, onMetricChange }: SingleChartProps) {
  const { chartData, stats } = useMemo(() => {
    const values = playerData.map(entry => parseFloat(String(entry[metric] ?? '').replace(',', '.')) || 0)

    const data = playerData.map((entry, idx) => ({
      date: entry.Date,
      partido: entry.Partido,
      value: values[idx],
    }))

    const sum = values.reduce((a, b) => a + b, 0)
    const avg = values.length > 0 ? sum / values.length : 0
    const max = Math.max(...values, 0)

    return { chartData: data, stats: { avg, max } }
  }, [playerData, metric])

  return (
    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <select
          value={metric}
          onChange={e => onMetricChange(e.target.value)}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-green/30"
        >
          {availableMetrics.map(m => (
            <option key={m} value={m}>{formatMetricLabel(m)}</option>
          ))}
        </select>

        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-brand-green"></span>
            Prom: <span className="font-medium text-gray-700 dark:text-gray-300">{stats.avg.toFixed(1)}</span>
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Max: <span className="font-medium text-gray-700 dark:text-gray-300">{stats.max.toFixed(0)}</span>
          </span>
          {onRemove && (
            <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none">&times;</button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 25, left: 10 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              angle={-40}
              textAnchor="end"
              height={40}
              tickFormatter={v => {
                const parts = v.split('-')
                return `${parts[2]}/${parts[1]}`
              }}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#9CA3AF' }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: 'none',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#fff'
              }}
              formatter={(value: number) => [value.toFixed(2), formatMetricLabel(metric)]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.partido ?? ''}
            />
            <ReferenceLine y={stats.avg} stroke="#22C55E" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#22C55E"
              strokeWidth={2}
              dot={{ fill: '#22C55E', r: 2.5, strokeWidth: 0 }}
              activeDot={{ r: 4, fill: '#22C55E' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function EvolutionChart({ evolution, playerSK }: EvolutionChartProps) {
  const [period, setPeriod] = useState('all')
  const [charts, setCharts] = useState<string[]>(['Goles'])

  const allPlayerData = useMemo(() => {
    return evolution
      .filter(e => String(e.JugadorSK) === String(playerSK))
      .sort((a, b) => a.Date.localeCompare(b.Date))
  }, [evolution, playerSK])

  const playerData = useMemo(() => {
    if (period === 'all') return allPlayerData
    const months = parseInt(period)
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    return allPlayerData.filter(e => new Date(e.Date) >= cutoff)
  }, [allPlayerData, period])

  const availableMetrics = useMemo(() => {
    if (allPlayerData.length === 0) return []
    const firstRow = allPlayerData[0]
    return Object.keys(firstRow)
      .filter(k => !EXCLUDED_COLS.has(k) && firstRow[k] !== undefined)
      .filter(k => !isNaN(parseFloat(String(firstRow[k]).replace(',', '.'))))
  }, [allPlayerData])

  useMemo(() => {
    if (charts[0] === 'Goles' && !availableMetrics.includes('Goles') && availableMetrics.length > 0) {
      setCharts([availableMetrics[0]])
    }
  }, [availableMetrics])

  const addChart = () => {
    if (charts.length < 8) {
      const unused = availableMetrics.find(m => !charts.includes(m))
      if (unused) setCharts([...charts, unused])
    }
  }

  const removeChart = (idx: number) => {
    if (charts.length > 1) setCharts(charts.filter((_, i) => i !== idx))
  }

  const updateChart = (idx: number, metric: string) => {
    setCharts(charts.map((c, i) => i === idx ? metric : c))
  }

  if (allPlayerData.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No hay datos de evolucion para este jugador.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Periodo:</span>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  period === opt.value
                    ? 'bg-brand-green text-black'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{playerData.length} partidos</span>
          {charts.length < 8 && (
            <button
              onClick={addChart}
              className="px-3 py-1 text-xs font-medium text-brand-green border border-brand-green rounded-lg hover:bg-brand-green/10 transition-colors"
            >
              + Agregar ({charts.length}/8)
            </button>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="space-y-4">
        {charts.map((metric, idx) => (
          <SingleChart
            key={`${metric}-${idx}`}
            playerData={playerData}
            metric={metric}
            availableMetrics={availableMetrics}
            onMetricChange={(m) => updateChart(idx, m)}
            onRemove={charts.length > 1 ? () => removeChart(idx) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
