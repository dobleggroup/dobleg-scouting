import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  Area, AreaChart,
} from 'recharts'
import type { GPSEntry } from '@/types'

interface GPSTabProps {
  gpsEntries: GPSEntry[]
  playerName: string
}

type MetricKey =
  | 'Distancia'
  | 'MetrosPorMin'
  | 'HSR'
  | 'VelMax'
  | 'Sprints'
  | 'AltaIntensidad'
  | 'PlayerLoad'
  | 'Acc3'
  | 'Dec3'

interface MetricConfig {
  key: MetricKey
  label: string
  shortLabel: string
  unit: string
  color: string
  description: string
}

// Green color palette only
const GREEN = '#22C55E' // brand-green

const METRICS_CONFIG: MetricConfig[] = [
  { key: 'Distancia', label: 'Distancia Total', shortLabel: 'Distancia', unit: 'm', color: GREEN, description: 'Metros recorridos en el partido' },
  { key: 'MetrosPorMin', label: 'Metros por Minuto', shortLabel: 'M/min', unit: 'm/min', color: GREEN, description: 'Intensidad de carrera' },
  { key: 'HSR', label: 'High Speed Running', shortLabel: 'HSR', unit: 'm', color: GREEN, description: 'Distancia a >21 km/h' },
  { key: 'VelMax', label: 'Velocidad Máxima', shortLabel: 'Vel. Max', unit: 'km/h', color: GREEN, description: 'Pico de velocidad alcanzado' },
  { key: 'Sprints', label: 'Sprints', shortLabel: 'Sprints', unit: '', color: GREEN, description: 'Cantidad de sprints realizados' },
  { key: 'AltaIntensidad', label: '% Alta Intensidad', shortLabel: '% AI', unit: '%', color: GREEN, description: 'Porcentaje de esfuerzo en alta intensidad' },
  { key: 'PlayerLoad', label: 'Player Load', shortLabel: 'PL', unit: '', color: GREEN, description: 'Carga física acumulada' },
  { key: 'Acc3', label: 'Aceleraciones >3m/s²', shortLabel: 'Acc>3', unit: '', color: GREEN, description: 'Explosividad en arranques' },
  { key: 'Dec3', label: 'Frenadas >3m/s²', shortLabel: 'Dec>3', unit: '', color: GREEN, description: 'Capacidad de frenado intenso' },
]

const formatDate = (date: Date): string => {
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
}

const formatNumber = (val: number, decimals = 0): string => {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`
  return val.toFixed(decimals)
}

export default function GPSTab({ gpsEntries, playerName }: GPSTabProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(['Distancia', 'HSR', 'Sprints'])
  const [viewMode, setViewMode] = useState<'evolution' | 'comparison' | 'summary'>('evolution')

  // Sort entries by date
  const sortedEntries = useMemo(() =>
    [...gpsEntries].sort((a, b) => a.Fecha.getTime() - b.Fecha.getTime()),
    [gpsEntries]
  )

  // Prepare chart data
  const chartData = useMemo(() =>
    sortedEntries.map(entry => ({
      date: formatDate(entry.Fecha),
      fullDate: entry.Fecha.toLocaleDateString('es-AR'),
      rival: entry.Rival,
      comp: entry.Competencia,
      minutos: entry.Minutos,
      ...METRICS_CONFIG.reduce((acc, m) => ({
        ...acc,
        [m.key]: entry[m.key],
      }), {}),
    })),
    [sortedEntries]
  )

  // Calculate averages and stats
  const stats = useMemo(() => {
    if (gpsEntries.length === 0) return null

    const calcStats = (key: MetricKey) => {
      const values = gpsEntries.map(e => e[key]).filter(v => v > 0)
      if (values.length === 0) return { avg: 0, max: 0, min: 0, last: 0 }
      return {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        max: Math.max(...values),
        min: Math.min(...values),
        last: gpsEntries[gpsEntries.length - 1][key],
      }
    }

    return METRICS_CONFIG.reduce((acc, m) => ({
      ...acc,
      [m.key]: calcStats(m.key),
    }), {} as Record<MetricKey, { avg: number; max: number; min: number; last: number }>)
  }, [gpsEntries])

  // Radar data for latest match
  const radarData = useMemo(() => {
    if (!stats || gpsEntries.length === 0) return []

    return METRICS_CONFIG.slice(0, 8).map(m => {
      const s = stats[m.key]
      const range = s.max - s.min
      const normalized = range > 0 ? ((s.last - s.min) / range) * 100 : 50
      return {
        metric: m.shortLabel,
        value: Math.round(normalized),
        fullMark: 100,
      }
    })
  }, [stats, gpsEntries])

  // Match-by-match comparison data
  const comparisonData = useMemo(() =>
    sortedEntries.slice(-5).map(entry => ({
      name: `vs ${entry.Rival?.substring(0, 12) || 'N/A'}`,
      Distancia: Math.round(entry.Distancia / 100),
      HSR: entry.HSR,
      Sprints: entry.Sprints * 10,
    })),
    [sortedEntries]
  )

  const toggleMetric = (key: MetricKey) => {
    setSelectedMetrics(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    )
  }

  if (gpsEntries.length === 0) {
    return (
      <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-8 text-center shadow-apple dark:shadow-apple-dark">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
          <svg className="w-8 h-8 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-2">Sin datos GPS</h3>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 max-w-sm mx-auto">
          No hay datos físicos registrados para {playerName}. Los datos se cargan partido a partido.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { value: gpsEntries.length, label: 'Partidos', unit: '' },
          { value: formatNumber(stats?.Distancia.avg || 0), label: 'Dist. prom.', unit: 'm' },
          { value: formatNumber(stats?.VelMax.max || 0, 1), label: 'Vel. máx.', unit: 'km/h' },
          { value: formatNumber(stats?.Sprints.avg || 0, 1), label: 'Sprints prom.', unit: '' },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-apple-gray-800 rounded-apple p-4 shadow-apple dark:shadow-apple-dark">
            <div className="text-2xl font-bold text-apple-gray-800 dark:text-white">
              {stat.value}
              {stat.unit && <span className="text-sm font-normal text-apple-gray-400 ml-1">{stat.unit}</span>}
            </div>
            <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-1 bg-apple-gray-100 dark:bg-apple-gray-700/50 p-1 rounded-apple w-fit">
        {[
          { id: 'evolution', label: 'Evolución' },
          { id: 'comparison', label: 'Comparación' },
          { id: 'summary', label: 'Resumen' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id as typeof viewMode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              viewMode === tab.id
                ? 'bg-white dark:bg-apple-gray-800 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Evolution View */}
      {viewMode === 'evolution' && (
        <div className="space-y-4">
          {/* Metric Selector Card */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Evolución de métricas</h3>
              <p className="text-xs text-apple-gray-400 mt-0.5">Seleccioná las métricas para visualizar (cada una en su propio gráfico)</p>
            </div>

            {/* Metric Selector */}
            <div className="flex flex-wrap gap-2">
              {METRICS_CONFIG.map(m => (
                <button
                  key={m.key}
                  onClick={() => toggleMetric(m.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    selectedMetrics.includes(m.key)
                      ? 'bg-brand-green text-white border-transparent shadow-sm'
                      : 'bg-white dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 border-apple-gray-200 dark:border-apple-gray-600 hover:border-brand-green/50'
                  }`}
                  title={m.description}
                >
                  {m.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Individual Charts for each selected metric */}
          {selectedMetrics.length === 0 && (
            <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-8 shadow-apple dark:shadow-apple-dark text-center">
              <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                Seleccioná al menos una métrica para ver su evolución
              </p>
            </div>
          )}

          <div className="grid gap-4">
            {selectedMetrics.map(metricKey => {
              const config = METRICS_CONFIG.find(m => m.key === metricKey)!
              const metricStats = stats?.[metricKey]

              return (
                <div
                  key={metricKey}
                  className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark"
                >
                  {/* Chart Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-brand-green" />
                      <div>
                        <h4 className="text-sm font-semibold text-apple-gray-800 dark:text-white">
                          {config.label}
                        </h4>
                        <p className="text-xs text-apple-gray-400">{config.description}</p>
                      </div>
                    </div>
                    {metricStats && (
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <div className="text-xs text-apple-gray-400">Promedio</div>
                          <div className="text-sm font-semibold text-apple-gray-800 dark:text-white tabular-nums">
                            {formatNumber(metricStats.avg, 1)} {config.unit}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-apple-gray-400">Máximo</div>
                          <div className="text-sm font-semibold text-apple-gray-800 dark:text-white tabular-nums">
                            {formatNumber(metricStats.max, 1)} {config.unit}
                          </div>
                        </div>
                        <button
                          onClick={() => toggleMetric(metricKey)}
                          className="ml-2 p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                          title="Quitar métrica"
                        >
                          <svg className="w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Individual Chart */}
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`gps-gradient-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={GREEN} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.3} vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: '#86868B', fontSize: 10 }}
                          axisLine={{ stroke: '#e5e7eb' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: '#86868B', fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          width={45}
                          tickFormatter={(val) => formatNumber(val)}
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1D1D1F',
                            border: 'none',
                            borderRadius: '10px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                            padding: '10px 14px',
                          }}
                          labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4, fontSize: 12 }}
                          itemStyle={{ color: '#fff', fontSize: 12 }}
                          formatter={(value: number) => [
                            `${formatNumber(value, 1)} ${config.unit}`,
                            config.label
                          ]}
                          labelFormatter={(label, payload) => {
                            const entry = payload?.[0]?.payload
                            return entry ? `${entry.fullDate} vs ${entry.rival}` : label
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey={metricKey}
                          name={metricKey}
                          stroke={GREEN}
                          strokeWidth={2}
                          fill={`url(#gps-gradient-${metricKey})`}
                          dot={{ fill: GREEN, r: 3, strokeWidth: 0 }}
                          activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Comparison View */}
      {viewMode === 'comparison' && (
        <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Últimos 5 partidos</h3>
            <p className="text-xs text-apple-gray-400 mt-0.5">Comparación de rendimiento físico</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#86868B', fontSize: 10 }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#86868B', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1D1D1F',
                    border: 'none',
                    borderRadius: '12px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Distancia') return [`${value * 100}m`, 'Distancia']
                    if (name === 'Sprints') return [`${value / 10}`, 'Sprints']
                    return [`${value}m`, name]
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => {
                    if (value === 'Distancia') return 'Distancia (x100m)'
                    if (value === 'Sprints') return 'Sprints (x10)'
                    return value
                  }}
                />
                <Bar dataKey="Distancia" fill={GREEN} radius={[4, 4, 0, 0]} />
                <Bar dataKey="HSR" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Sprints" fill="#15803d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Summary View */}
      {viewMode === 'summary' && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Radar Chart */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Perfil físico</h3>
              <p className="text-xs text-apple-gray-400 mt-0.5">Último partido registrado</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" strokeOpacity={0.5} />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fill: '#86868B', fontSize: 10 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: '#86868B', fontSize: 9 }}
                    tickCount={4}
                  />
                  <Radar
                    name="Rendimiento"
                    dataKey="value"
                    stroke={GREEN}
                    fill={GREEN}
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Stats Table */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Estadísticas</h3>
              <p className="text-xs text-apple-gray-400 mt-0.5">Promedios y máximos</p>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {METRICS_CONFIG.map(m => {
                const s = stats?.[m.key]
                if (!s) return null
                return (
                  <div key={m.key} className="flex items-center justify-between py-2.5 border-b border-apple-gray-100 dark:border-apple-gray-700/50 last:border-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-brand-green" />
                      <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300">{m.shortLabel}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-semibold text-apple-gray-800 dark:text-white tabular-nums">
                          {formatNumber(s.avg, 1)}
                        </div>
                        <div className="text-2xs text-apple-gray-400">prom.</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-brand-green tabular-nums">
                          {formatNumber(s.max, 1)}
                        </div>
                        <div className="text-2xs text-apple-gray-400">máx.</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Match History Table */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-apple-xl p-5 shadow-apple dark:shadow-apple-dark">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white">Historial de partidos</h3>
          <p className="text-xs text-apple-gray-400 mt-0.5">Datos físicos por encuentro</p>
        </div>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-apple-gray-500 dark:text-apple-gray-400 border-b border-apple-gray-100 dark:border-apple-gray-700">
                <th className="text-left py-2.5 px-2 font-medium text-xs">Fecha</th>
                <th className="text-left py-2.5 px-2 font-medium text-xs">Rival</th>
                <th className="text-right py-2.5 px-2 font-medium text-xs">Min</th>
                <th className="text-right py-2.5 px-2 font-medium text-xs">Dist.</th>
                <th className="text-right py-2.5 px-2 font-medium text-xs">M/min</th>
                <th className="text-right py-2.5 px-2 font-medium text-xs">HSR</th>
                <th className="text-right py-2.5 px-2 font-medium text-xs">Vel.</th>
                <th className="text-right py-2.5 px-2 font-medium text-xs">Spr.</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.slice().reverse().map((entry, i) => (
                <tr
                  key={i}
                  className="border-b border-apple-gray-50 dark:border-apple-gray-700/30 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 transition-colors"
                >
                  <td className="py-2.5 px-2 text-apple-gray-600 dark:text-apple-gray-400 text-xs">
                    {entry.Fecha.toLocaleDateString('es-AR')}
                  </td>
                  <td className="py-2.5 px-2 text-apple-gray-800 dark:text-white font-medium">
                    {entry.Rival || '-'}
                  </td>
                  <td className="py-2.5 px-2 text-right text-apple-gray-600 dark:text-apple-gray-400 tabular-nums">
                    {entry.Minutos}'
                  </td>
                  <td className="py-2.5 px-2 text-right font-medium text-apple-gray-800 dark:text-white tabular-nums">
                    {formatNumber(entry.Distancia)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-apple-gray-700 dark:text-apple-gray-300 tabular-nums">
                    {formatNumber(entry.MetrosPorMin, 1)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-apple-gray-700 dark:text-apple-gray-300 tabular-nums">
                    {formatNumber(entry.HSR)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-apple-gray-700 dark:text-apple-gray-300 tabular-nums">
                    {formatNumber(entry.VelMax, 1)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-apple-gray-700 dark:text-apple-gray-300 tabular-nums">
                    {entry.Sprints}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
