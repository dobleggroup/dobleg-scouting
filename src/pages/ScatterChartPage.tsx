import { useMemo, useState, useRef } from 'react'
import CopyChartButton from '@/components/ui/CopyChartButton'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Label, LabelList } from 'recharts'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import AddToReportButton from '@/components/pdf/AddToReportButton'
import ScoutsGGBadge from '@/components/ui/ScoutsGGBadge'
import { smartSearch } from '@/lib/search'
import type { EnrichedPlayer } from '@/types'
import { useScoreLookup } from '@/hooks/usePlayerStats'
import { normalizeName } from '@/utils/scoring'

// Color interpolation from red (bad) to yellow (medium) to green (good)
function getColorForValue(value: number, min: number, max: number): string {
  if (max === min) return '#F59E0B' // amber if no range

  // Normalize to 0-1
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)))

  // Color stops: red (0) -> orange (0.25) -> yellow (0.5) -> lime (0.75) -> green (1)
  if (normalized <= 0.25) {
    // Red to Orange
    const t = normalized / 0.25
    const r = 239
    const g = Math.round(68 + (158 - 68) * t)
    const b = Math.round(68 + (11 - 68) * t)
    return `rgb(${r}, ${g}, ${b})`
  } else if (normalized <= 0.5) {
    // Orange to Yellow
    const t = (normalized - 0.25) / 0.25
    const r = Math.round(245 - (245 - 234) * t)
    const g = Math.round(158 + (179 - 158) * t)
    const b = Math.round(11 + (8 - 11) * t)
    return `rgb(${r}, ${g}, ${b})`
  } else if (normalized <= 0.75) {
    // Yellow to Lime
    const t = (normalized - 0.5) / 0.25
    const r = Math.round(234 - (234 - 132) * t)
    const g = Math.round(179 + (204 - 179) * t)
    const b = Math.round(8 + (22 - 8) * t)
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Lime to Green
    const t = (normalized - 0.75) / 0.25
    const r = Math.round(132 - (132 - 34) * t)
    const g = Math.round(204 + (197 - 204) * t)
    const b = Math.round(22 + (94 - 22) * t)
    return `rgb(${r}, ${g}, ${b})`
  }
}

// Get a darker version of a color for the stroke
function getDarkerColor(color: string): string {
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!match) return color
  const r = Math.max(0, Math.round(parseInt(match[1]) * 0.7))
  const g = Math.max(0, Math.round(parseInt(match[2]) * 0.7))
  const b = Math.max(0, Math.round(parseInt(match[3]) * 0.7))
  return `rgb(${r}, ${g}, ${b})`
}

// Metric categories for organized dropdowns - based on Wyscout glossary
const METRIC_GROUPS = {
  general: {
    label: 'General',
    icon: '📊',
    metrics: ['ggScore', 'minutesPlayed', 'ageNum', 'marketValueRaw', 'monthsRemaining']
  },
  shooting: {
    label: 'Finalización',
    icon: '⚽',
    metrics: ['Goles', 'xG', 'xG/90', 'Remates/90', 'Remates a portería/90', 'Remates a portería, %', 'Toques en el área de penalti/90']
  },
  creation: {
    label: 'Creación',
    icon: '🎯',
    metrics: ['Asistencias', 'xA', 'xA/90', 'Jugadas claves/90', 'Pases progresivos exitosos/90']
  },
  passing: {
    label: 'Pase',
    icon: '📐',
    metrics: ['Pases/90', 'Pases precisos/90', 'Pases, %', 'Pases hacia adelante/90', 'Precisión pases hacia adelante, %', 'Pases largos/90', 'Precisión pases largos, %']
  },
  dribbling: {
    label: 'Regate y Progresión',
    icon: '💨',
    metrics: ['Gambetas completadas/90', 'Gambetas completadas, %', 'Carreras en progresión/90', 'Acciones de ataque exitosas/90']
  },
  duels: {
    label: 'Duelos',
    icon: '💪',
    metrics: ['Duelos ganados, %', 'Duelos atacantes ganados/90', 'Duelos atacantes ganados, %', 'Duelos defensivos ganados, %', 'Duelos aéreos ganados, %']
  },
  defense: {
    label: 'Defensa',
    icon: '🛡️',
    metrics: ['Interceptaciones/90', 'Entradas/90', 'Rechaces/90', 'Acciones defensivas realizadas/90']
  },
  crossing: {
    label: 'Centros',
    icon: '↗️',
    metrics: ['Centros/90', 'Centros precisos/90', 'Precisión centros, %']
  }
}

// Flatten for easy access
const METRIC_OPTIONS = Object.values(METRIC_GROUPS).flatMap(g => g.metrics)

// Get display name for metric
function getMetricDisplayName(metric: string): string {
  const names: Record<string, string> = {
    'ggScore': 'GG Score',
    'minutesPlayed': 'Minutos jugados',
    'ageNum': 'Edad',
    'marketValueRaw': 'Valor de mercado (€)',
    'monthsRemaining': 'Meses de contrato',
    'Goles': 'Goles',
    'Asistencias': 'Asistencias',
    'xG': 'xG (Goles esperados)',
    'xA': 'xA (Asist. esperadas)',
    'xG/90': 'xG por 90 min',
    'xA/90': 'xA por 90 min',
    'Remates/90': 'Remates/90',
    'Remates a portería/90': 'Tiros a puerta/90',
    'Remates a portería, %': 'Precisión de tiro %',
    'Toques en el área de penalti/90': 'Toques en área/90',
    'Pases/90': 'Pases/90',
    'Pases precisos/90': 'Pases precisos/90',
    'Pases, %': 'Precisión de pase %',
    'Pases hacia adelante/90': 'Pases adelante/90',
    'Precisión pases hacia adelante, %': 'Pases adelante %',
    'Pases largos/90': 'Pases largos/90',
    'Precisión pases largos, %': 'Pases largos %',
    'Pases progresivos exitosos/90': 'Pases progresivos/90',
    'Jugadas claves/90': 'Pases clave/90',
    'Centros/90': 'Centros/90',
    'Centros precisos/90': 'Centros precisos/90',
    'Precisión centros, %': 'Precisión centros %',
    'Gambetas completadas/90': 'Regates exitosos/90',
    'Gambetas completadas, %': 'Efectividad regate %',
    'Duelos atacantes ganados/90': 'Duelos ofensivos/90',
    'Duelos atacantes ganados, %': 'Duelos ofensivos %',
    'Acciones de ataque exitosas/90': 'Acciones ofensivas/90',
    'Carreras en progresión/90': 'Carreras progresivas/90',
    'Duelos ganados, %': 'Duelos ganados %',
    'Duelos defensivos ganados, %': 'Duelos defensivos %',
    'Duelos aéreos ganados, %': 'Duelos aéreos %',
    'Interceptaciones/90': 'Intercepciones/90',
    'Entradas/90': 'Entradas/90',
    'Rechaces/90': 'Despejes/90',
    'Acciones defensivas realizadas/90': 'Acciones defensivas/90',
  }
  return names[metric] || metric
}

// Wyscout-based metric explanations
const METRIC_EXPLANATIONS: Record<string, string> = {
  'ggScore': 'Puntuación global calculada ponderando múltiples métricas según la posición del jugador.',
  'xG': 'Expected Goals: Modelo predictivo que evalúa la probabilidad de gol de cada remate basándose en ubicación, tipo de asistencia, método de disparo y contexto del juego.',
  'xG/90': 'xG normalizado por 90 minutos. Indica la calidad de las oportunidades que genera un jugador independientemente de los minutos jugados.',
  'xA': 'Expected Assists: Suma de valores xG de los remates generados por los pases del jugador.',
  'xA/90': 'xA normalizado por 90 minutos. Mide la capacidad de crear ocasiones de gol de alta calidad.',
  'Goles': 'Goles marcados en la temporada. Comparar con xG revela si el jugador sobre/sub-rinde su rendimiento esperado.',
  'Asistencias': 'Pases que resultan directamente en gol. Comparar con xA indica eficiencia en creación.',
  'Remates/90': 'Cantidad de remates por 90 minutos. Indica participación en ataque y llegada al área.',
  'Remates a portería, %': 'Porcentaje de remates que van a portería. Mide precisión en la finalización.',
  'Toques en el área de penalti/90': 'Toques en el área rival por 90 min. Indicador clave para delanteros de área.',
  'Jugadas claves/90': 'Pases que generan remates (incluyendo asistencias). Métrica fundamental de creatividad.',
  'Pases progresivos exitosos/90': 'Pases que avanzan significativamente hacia portería rival. Clave para mediocampistas creativos.',
  'Gambetas completadas/90': 'Regates exitosos por 90 min. Mide capacidad de desborde individual.',
  'Gambetas completadas, %': 'Efectividad en el regate. >50% es excelente, <40% sugiere pérdidas excesivas.',
  'Duelos ganados, %': 'Porcentaje general de duelos ganados. Métrica de intensidad y capacidad física.',
  'Duelos aéreos ganados, %': 'Porcentaje de duelos aéreos ganados. Crucial para defensores centrales y delanteros de área.',
  'Interceptaciones/90': 'Cortes de pase rival por 90 min. Indica lectura del juego y posicionamiento.',
  'Carreras en progresión/90': 'Conducciones que avanzan el balón significativamente. Mide capacidad de transporte.',
  'Pases, %': 'Precisión general de pase. >85% es sólido, >90% es excelente.',
  'Centros/90': 'Centros intentados por 90 min. Indicador de participación en ataque lateral.',
  'Precisión centros, %': 'Efectividad de centros. >30% es bueno para extremos.',
}

// Get metric explanation
function getMetricExplanation(metric: string): string {
  return METRIC_EXPLANATIONS[metric] || `Métrica que mide ${getMetricDisplayName(metric).toLowerCase()}.`
}

// Get value from player. An optional ggScoreResolver supports dual-source scoring (CSV 0-100 or Supabase 1-10).
function getPlayerValue(
  player: EnrichedPlayer,
  metric: string,
  ggScoreResolver?: (player: EnrichedPlayer) => number | null
): number | null {
  if (metric === 'ggScore') {
    if (ggScoreResolver) return ggScoreResolver(player)
    return player.ggScore ?? null
  }
  if (metric === 'minutesPlayed') return player.minutesPlayed
  if (metric === 'ageNum') return player.ageNum
  if (metric === 'marketValueRaw') return player.marketValueRaw || null
  if (metric === 'monthsRemaining') return player.monthsRemaining

  const val = player[metric as keyof EnrichedPlayer]
  if (val === undefined || val === null || val === '') return null
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'))
  return isNaN(num) ? null : num
}

// Smart analysis combinations - what do different metric pairs tell us?
const METRIC_PAIR_INSIGHTS: Record<string, string> = {
  'xG|Goles': 'Comparar xG vs Goles revela la eficiencia de finalización. Jugadores por encima de la diagonal (más goles que xG) son finalizadores elite. Por debajo, están sub-rindiendo o tienen mala suerte.',
  'Goles|xG': 'Comparar xG vs Goles revela la eficiencia de finalización. Jugadores por encima de la diagonal (más goles que xG) son finalizadores elite.',
  'xA|Asistencias': 'xA vs Asistencias muestra quién convierte mejor las ocasiones creadas. Más asistencias que xA indica que sus compañeros finalizan bien.',
  'Remates/90|xG/90': 'Volumen de remates vs calidad de ocasiones. Alto xG/90 con pocos remates = pocas pero buenas oportunidades. Muchos remates con bajo xG = tiros de baja calidad.',
  'Gambetas completadas/90|Duelos atacantes ganados, %': 'Regates vs efectividad en duelos muestra el perfil de desborde. Alto en ambos = extremo desequilibrante.',
  'Pases progresivos exitosos/90|Jugadas claves/90': 'Pases progresivos vs pases clave identifica el perfil creativo. Alto en ambos = mediocampista creativo top.',
  'Interceptaciones/90|Duelos defensivos ganados, %': 'Intercepciones vs duelos defensivos diferencia lectores de juego (alta intercepción) vs guerreros (alto duelo).',
  'xG/90|Toques en el área de penalti/90': 'xG/90 vs toques en área identifica delanteros de área pura. Alto en ambos = referente de área clásico.',
  'Pases, %|Pases progresivos exitosos/90': 'Precisión vs progresión. Alto en ambos = mediocampista completo. Alta precisión/baja progresión = jugador conservador.',
  'ageNum|marketValueRaw': 'Edad vs valor de mercado. Jóvenes con alto valor = prospectos premium. Veteranos con valor = rendimiento probado.',
  'ggScore|marketValueRaw': 'Score vs valor muestra jugadores sobrevalorados (bajo score/alto valor) o infravalorados (alto score/bajo valor).',
  'Centros/90|Precisión centros, %': 'Volumen vs precisión de centros. El balance ideal depende del estilo: equipos de posesión prefieren precisión.',
}

// Generate simple, easy-to-understand analysis
function generateAnalysis(
  data: Array<{ player: EnrichedPlayer; x: number; y: number; z: number }>,
  xMetric: string,
  yMetric: string,
  zMetric: string
): string {
  if (data.length === 0) return 'Selecciona una liga para ver el análisis.'

  const xAvg = data.reduce((sum, d) => sum + d.x, 0) / data.length
  const yAvg = data.reduce((sum, d) => sum + d.y, 0) / data.length

  // Find top performers (arriba y derecha = mejor en ambas métricas)
  const topRight = data.filter(d => d.x > xAvg && d.y > yAvg)
  const best = [...data].sort((a, b) => (b.x + b.y) - (a.x + a.y)).slice(0, 3)
  const greenest = [...data].sort((a, b) => b.z - a.z).slice(0, 3)

  let analysis = ''

  // Simple intro
  analysis += `Se analizaron **${data.length} jugadores**.\n\n`

  // Where to look
  analysis += `**¿Dónde buscar los mejores?**\n`
  analysis += `Los jugadores más completos están arriba a la derecha del gráfico (${topRight.length} jugadores).\n`
  analysis += `El color verde indica mejor ${getMetricDisplayName(zMetric).toLowerCase()}.\n\n`

  // Top 3 overall
  if (best.length > 0) {
    analysis += `**Los 3 mejores en este análisis:**\n`
    best.forEach((d, i) => {
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'
      analysis += `${emoji} **${d.player.Jugador}** - ${d.player.Equipo}\n`
    })
    analysis += '\n'
  }

  // Greenest (best in color metric)
  if (greenest.length > 0 && zMetric !== 'ggScore') {
    analysis += `**Mejor ${getMetricDisplayName(zMetric)}:** ${greenest[0].player.Jugador}\n\n`
  }

  // Simple tip based on quadrant
  const topRightPct = Math.round((topRight.length / data.length) * 100)
  if (topRightPct > 25) {
    analysis += `**Resumen:** Hay varios buenos jugadores para elegir (${topRightPct}% en zona elite).`
  } else if (topRightPct > 10) {
    analysis += `**Resumen:** Pocos jugadores destacan en ambas métricas. Revisa los marcados arriba.`
  } else {
    analysis += `**Resumen:** Es difícil encontrar jugadores buenos en ambas cosas a la vez. Considera priorizar una métrica.`
  }

  return analysis
}

export default function ScatterChartPage() {
  const { external, internal, loading } = useData()
  const navigate = useNavigate()
  const chartRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  // Supabase score lookup (1-10 scale). Falls back to CSV ggScore (0-100) when not ready or not found.
  const { lookup: scoreLookup, ready: scoreReady } = useScoreLookup()

  function getPlayerScoreValue(player: EnrichedPlayer): number | null {
    if (scoreReady && scoreLookup.size > 0) {
      const key = normalizeName(player.Jugador)
      const entry = scoreLookup.get(key)
      if (entry) return entry.score
    }
    return player.ggScore ?? null
  }

  // State for metric selection
  const [xMetric, setXMetric] = useState('xG')
  const [yMetric, setYMetric] = useState('Goles')
  const [zMetric, setZMetric] = useState('ggScore')

  // Filters
  const [source, setSource] = useState<'all' | 'external' | 'internal'>('all')
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([])
  const [selectedPositions, setSelectedPositions] = useState<string[]>([])
  const [minMinutes, setMinMinutes] = useState(200)
  const [ageRange, setAgeRange] = useState<[number, number]>([15, 40])

  // Search and selection
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightedPlayer, setHighlightedPlayer] = useState<string | null>(null)
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set())

  // All players
  const allPlayers = useMemo(() => {
    if (source === 'external') return external
    if (source === 'internal') return internal
    return [...external, ...internal]
  }, [external, internal, source])

  // Get unique leagues
  const leagues = useMemo(() => {
    const set = new Set<string>()
    allPlayers.forEach(p => { if (p.Liga) set.add(p.Liga) })
    return Array.from(set).sort()
  }, [allPlayers])

  // Get unique positions
  const positions = useMemo(() => {
    const set = new Set<string>()
    allPlayers.forEach(p => { if (p['Posición']) set.add(p['Posición']) })
    return Array.from(set).sort()
  }, [allPlayers])

  // Age range from data
  const { minAge, maxAge } = useMemo(() => {
    const ages = allPlayers.map(p => p.ageNum).filter(a => a > 0)
    return {
      minAge: ages.length > 0 ? Math.min(...ages) : 15,
      maxAge: ages.length > 0 ? Math.max(...ages) : 45
    }
  }, [allPlayers])

  // Search results for autocomplete
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return []
    return smartSearch(allPlayers, searchTerm, p => `${p.Jugador} ${p.Equipo || ''}`, 8)
  }, [allPlayers, searchTerm])

  // Filter and prepare data
  const chartData = useMemo(() => {
    // Require at least one league selected
    if (selectedLeagues.length === 0) return []

    return allPlayers
      .filter(p => {
        if (p.minutesPlayed < minMinutes) return false
        if (!selectedLeagues.includes(p.Liga)) return false
        if (selectedPositions.length > 0 && !selectedPositions.includes(p['Posición'])) return false
        if (p.ageNum < ageRange[0] || p.ageNum > ageRange[1]) return false
        return true
      })
      .map(player => {
        const x = getPlayerValue(player, xMetric, getPlayerScoreValue)
        const y = getPlayerValue(player, yMetric, getPlayerScoreValue)
        const z = getPlayerValue(player, zMetric, getPlayerScoreValue)
        if (x === null || y === null || z === null) return null
        const id = `${player.Jugador}-${player.Equipo}`
        return { player, x, y, z, name: player.Jugador, id }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)
  }, [allPlayers, xMetric, yMetric, zMetric, selectedLeagues, selectedPositions, minMinutes, ageRange])

  // Toggle league selection
  const toggleLeague = (league: string) => {
    setSelectedLeagues(prev =>
      prev.includes(league) ? prev.filter(l => l !== league) : [...prev, league]
    )
  }

  // Toggle position selection
  const togglePosition = (position: string) => {
    setSelectedPositions(prev =>
      prev.includes(position) ? prev.filter(p => p !== position) : [...prev, position]
    )
  }

  // Toggle player selection (for marking on chart)
  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayers(prev => {
      const newSet = new Set(prev)
      if (newSet.has(playerId)) {
        newSet.delete(playerId)
      } else {
        newSet.add(playerId)
      }
      return newSet
    })
  }

  // Highlight player from search
  const highlightPlayer = (player: EnrichedPlayer) => {
    const id = `${player.Jugador}-${player.Equipo}`
    setHighlightedPlayer(id)
    setSearchTerm('')
    // Auto-clear highlight after 5 seconds
    setTimeout(() => setHighlightedPlayer(null), 5000)
  }

  // Clear all selections
  const clearSelections = () => {
    setSelectedPlayers(new Set())
    setHighlightedPlayer(null)
  }

  // Calculate min/max for z metric (for color scale)
  const { zMin, zMax } = useMemo(() => {
    if (chartData.length === 0) return { zMin: 0, zMax: 100 }
    const zValues = chartData.map(d => d.z)
    return {
      zMin: Math.min(...zValues),
      zMax: Math.max(...zValues)
    }
  }, [chartData])

  // Analysis
  const analysis = useMemo(() =>
    generateAnalysis(chartData, xMetric, yMetric, zMetric),
    [chartData, xMetric, yMetric, zMetric]
  )

  // Export to PDF
  const exportToPDF = async () => {
    if (!chartRef.current) return
    setExporting(true)

    try {
      const canvas = await html2canvas(chartRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      })

      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = canvas.width
      const imgHeight = canvas.height
      const ratio = Math.min((pdfWidth - 20) / imgWidth, (pdfHeight - 20) / imgHeight)

      const imgX = (pdfWidth - imgWidth * ratio) / 2
      const imgY = 10

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio)

      const fileName = `dispersion_${xMetric}_vs_${yMetric}_${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(fileName)
    } catch (error) {
      console.error('Error exporting PDF:', error)
    } finally {
      setExporting(false)
    }
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]?.payload) return null
    const data = payload[0].payload
    const zColor = getColorForValue(data.z, zMin, zMax)
    const isSelected = selectedPlayers.has(data.id)

    return (
      <div className={`bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl border-2 p-4 max-w-xs ${isSelected ? 'border-blue-500' : 'border-apple-gray-200 dark:border-apple-gray-700'}`}>
        <div className="flex items-center gap-3 mb-3">
          {data.player.Imagen ? (
            <img src={data.player.Imagen} alt="" className={`w-11 h-11 rounded-full object-cover ring-2 ${isSelected ? 'ring-blue-500' : 'ring-apple-gray-200 dark:ring-apple-gray-600'}`} />
          ) : (
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ${isSelected ? 'ring-blue-500 bg-blue-500' : 'ring-white/30'}`}
              style={{ backgroundColor: isSelected ? undefined : zColor }}
            >
              {data.player.Jugador.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-apple-gray-800 dark:text-white truncate">{data.player.Jugador}</p>
              <ScoutsGGBadge playerName={data.player.Jugador} />
              {isSelected && <span className="text-2xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">MARCADO</span>}
            </div>
            <p className="text-xs text-apple-gray-500 truncate">{data.player.Equipo}</p>
            <p className="text-2xs text-apple-gray-400">{data.player['Posición']} · {data.player.ageNum} años</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-lg">
            <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{data.x.toFixed(1)}</p>
            <p className="text-2xs text-apple-gray-400 truncate">{getMetricDisplayName(xMetric)}</p>
          </div>
          <div className="p-2 bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-lg">
            <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{data.y.toFixed(1)}</p>
            <p className="text-2xs text-apple-gray-400 truncate">{getMetricDisplayName(yMetric)}</p>
          </div>
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${zColor}15` }}>
            <p className="text-lg font-bold" style={{ color: zColor }}>{data.z.toFixed(1)}</p>
            <p className="text-2xs text-apple-gray-400 truncate">{getMetricDisplayName(zMetric)}</p>
          </div>
        </div>
        <p className="mt-2 text-center text-2xs text-apple-gray-400">
          Click para {isSelected ? 'desmarcar' : 'marcar'}
        </p>
      </div>
    )
  }

  if (loading) return <LoadingSpinner fullScreen message="Cargando datos..." />

  // Calculate averages for reference lines
  const xAvg = chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.x, 0) / chartData.length : 0
  const yAvg = chartData.length > 0 ? chartData.reduce((sum, d) => sum + d.y, 0) / chartData.length : 0

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
            Grafico de Dispersion
          </h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            Compara jugadores en multiples dimensiones
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddToReportButton
            type="scatter"
            title={`Dispersion: ${getMetricDisplayName(xMetric)} vs ${getMetricDisplayName(yMetric)}`}
            description={`Grafico de dispersion con ${chartData.length} jugadores. Color por ${getMetricDisplayName(zMetric)}.`}
            captureId="scatter-chart-container"
            source="Dispersion"
            variant="compact"
            players={chartData.filter(d => selectedPlayers.has(d.id)).map(d => d.name)}
          />
          <CopyChartButton targetId="scatter-chart-container" filename="dispersion" />
          <button
            onClick={exportToPDF}
            disabled={exporting || chartData.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-800 rounded-xl font-medium text-sm hover:bg-apple-gray-700 dark:hover:bg-apple-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Exportando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Exportar PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Metric Selectors */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* X Axis */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-apple-gray-500 uppercase tracking-wider">
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-bold">X</span>
              Eje Horizontal
            </label>
            <select
              value={xMetric}
              onChange={e => setXMetric(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border-0 text-apple-gray-800 dark:text-white font-medium focus:ring-2 focus:ring-brand-green"
            >
              {Object.entries(METRIC_GROUPS).map(([key, group]) => (
                <optgroup key={key} label={`${group.icon} ${group.label}`}>
                  {group.metrics.map(m => (
                    <option key={m} value={m}>{getMetricDisplayName(m)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 line-clamp-2 min-h-[2.5rem]">
              {getMetricExplanation(xMetric)}
            </p>
          </div>

          {/* Y Axis */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-apple-gray-500 uppercase tracking-wider">
              <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-xs font-bold">Y</span>
              Eje Vertical
            </label>
            <select
              value={yMetric}
              onChange={e => setYMetric(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border-0 text-apple-gray-800 dark:text-white font-medium focus:ring-2 focus:ring-brand-green"
            >
              {Object.entries(METRIC_GROUPS).map(([key, group]) => (
                <optgroup key={key} label={`${group.icon} ${group.label}`}>
                  {group.metrics.map(m => (
                    <option key={m} value={m}>{getMetricDisplayName(m)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 line-clamp-2 min-h-[2.5rem]">
              {getMetricExplanation(yMetric)}
            </p>
          </div>

          {/* Color metric */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-apple-gray-500 uppercase tracking-wider">
              <span className="w-6 h-6 rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 flex items-center justify-center text-white text-xs font-bold shadow-inner">C</span>
              Color (3ra métrica)
            </label>
            <select
              value={zMetric}
              onChange={e => setZMetric(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700 border-0 text-apple-gray-800 dark:text-white font-medium focus:ring-2 focus:ring-brand-green"
            >
              {Object.entries(METRIC_GROUPS).map(([key, group]) => (
                <optgroup key={key} label={`${group.icon} ${group.label}`}>
                  {group.metrics.map(m => (
                    <option key={m} value={m}>{getMetricDisplayName(m)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 line-clamp-2 min-h-[2.5rem]">
              {getMetricExplanation(zMetric)}
            </p>
          </div>
        </div>

        {/* Advanced Filters */}
        <div className="pt-5 border-t border-apple-gray-100 dark:border-apple-gray-700 space-y-4">
          {/* Row 1: Source, Min Minutes, Age Range */}
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <label className="text-xs text-apple-gray-500 font-medium">Fuente:</label>
              <select
                value={source}
                onChange={e => setSource(e.target.value as typeof source)}
                className="px-3 py-1.5 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 border-0 text-sm"
              >
                <option value="all">Todos</option>
                <option value="external">Externo</option>
                <option value="internal">Interno</option>
              </select>
            </div>

            {/* Minutes Slider */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-apple-gray-500 font-medium whitespace-nowrap">Min. minutos:</label>
              <div className="flex items-center gap-2 flex-1 max-w-[180px]">
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={50}
                  value={minMinutes}
                  onChange={e => setMinMinutes(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                />
                <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 w-12 text-right tabular-nums">{minMinutes}</span>
              </div>
            </div>

            {/* Age Range Dual Slider */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-apple-gray-500 font-medium">Edad:</label>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 w-6 tabular-nums">{ageRange[0]}</span>
                <div className="relative w-28 h-5 flex items-center">
                  <input
                    type="range"
                    min={minAge}
                    max={maxAge}
                    value={ageRange[0]}
                    onChange={e => {
                      const val = parseInt(e.target.value)
                      if (val < ageRange[1]) setAgeRange([val, ageRange[1]])
                    }}
                    className="absolute w-full h-1.5 bg-apple-gray-200 dark:bg-apple-gray-600 rounded-full appearance-none cursor-pointer accent-brand-green"
                  />
                  <input
                    type="range"
                    min={minAge}
                    max={maxAge}
                    value={ageRange[1]}
                    onChange={e => {
                      const val = parseInt(e.target.value)
                      if (val > ageRange[0]) setAgeRange([ageRange[0], val])
                    }}
                    className="absolute w-full h-1.5 bg-transparent rounded-full appearance-none cursor-pointer accent-brand-green"
                  />
                </div>
                <span className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 w-6 tabular-nums">{ageRange[1]}</span>
              </div>
            </div>
          </div>

          {/* Row 2: Leagues Multi-select */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className={`text-xs font-medium ${selectedLeagues.length === 0 ? 'text-brand-green' : 'text-apple-gray-500'}`}>
                Ligas {selectedLeagues.length === 0 && <span className="text-brand-green">*</span>}
              </label>
              {selectedLeagues.length > 0 && (
                <button
                  onClick={() => setSelectedLeagues([])}
                  className="text-2xs text-apple-gray-400 hover:text-red-500 transition-colors"
                >
                  Limpiar
                </button>
              )}
              <button
                onClick={() => setSelectedLeagues(leagues)}
                className="text-2xs text-brand-green hover:text-brand-green/80 transition-colors"
              >
                Todas
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {leagues.map(l => (
                <button
                  key={l}
                  onClick={() => toggleLeague(l)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedLeagues.includes(l)
                      ? 'bg-brand-green text-gray-900 shadow-sm'
                      : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Positions Multi-select */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium text-apple-gray-500">Posiciones</label>
              {selectedPositions.length > 0 && (
                <button
                  onClick={() => setSelectedPositions([])}
                  className="text-2xs text-apple-gray-400 hover:text-red-500 transition-colors"
                >
                  Limpiar
                </button>
              )}
              <span className="text-2xs text-apple-gray-400">
                {selectedPositions.length === 0 ? '(todas)' : `(${selectedPositions.length})`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {positions.map(p => (
                <button
                  key={p}
                  onClick={() => togglePosition(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    selectedPositions.includes(p)
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Search and Summary */}
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
            {/* Player Search */}
            <div className="relative flex-1 min-w-[250px] max-w-md">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar jugador para ubicar en el gráfico..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-700 border-0 text-sm placeholder:text-apple-gray-400 focus:ring-2 focus:ring-brand-green"
                />
              </div>
              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-apple-gray-800 rounded-xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 max-h-64 overflow-y-auto">
                  {searchResults.map((player, idx) => {
                    const isInChart = chartData.some(d => d.player.Jugador === player.Jugador && d.player.Equipo === player.Equipo)
                    return (
                      <button
                        key={idx}
                        onClick={() => highlightPlayer(player)}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors text-left"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-apple-gray-800 dark:text-white">{player.Jugador}</p>
                          <p className="text-xs text-apple-gray-500">{player.Equipo} · {player.Liga}</p>
                        </div>
                        {isInChart ? (
                          <span className="text-xs bg-brand-green/20 text-brand-green px-2 py-0.5 rounded-full">En gráfico</span>
                        ) : (
                          <span className="text-xs text-apple-gray-400">No visible</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Selected Players Count */}
            {selectedPlayers.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg font-medium">
                  {selectedPlayers.size} marcado{selectedPlayers.size > 1 ? 's' : ''}
                </span>
                <button
                  onClick={clearSelections}
                  className="text-xs text-apple-gray-400 hover:text-red-500 transition-colors"
                >
                  Limpiar
                </button>
              </div>
            )}

            {/* Summary */}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400">
                {chartData.length} jugadores
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div ref={chartRef} id="scatter-chart-container" className="bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 p-6">
        {/* Chart Title for PDF */}
        <div className="mb-6 text-center">
          <h2 className="text-xl font-bold text-apple-gray-800 dark:text-white">
            {getMetricDisplayName(xMetric)} vs {getMetricDisplayName(yMetric)}
          </h2>
          <p className="text-sm text-apple-gray-500 mt-1">
            Color: {getMetricDisplayName(zMetric)} | {chartData.length} jugadores analizados
          </p>
        </div>

        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[500px] text-apple-gray-500">
            <div className="w-20 h-20 mb-6 rounded-2xl bg-gradient-to-br from-brand-green/20 to-brand-green/5 flex items-center justify-center">
              <svg className="w-10 h-10 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            {selectedLeagues.length === 0 ? (
              <>
                <p className="text-xl font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-2">Selecciona al menos una liga</p>
                <p className="text-sm text-apple-gray-400 max-w-md text-center">Elige una o más ligas en los filtros de arriba para cargar los jugadores</p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium mb-1">Sin datos disponibles</p>
                <p className="text-sm">Ajusta los filtros para ver jugadores</p>
              </>
            )}
          </div>
        ) : (
          <div className="h-[600px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 30, right: 50, bottom: 70, left: 70 }}>
                <XAxis
                  type="number"
                  dataKey="x"
                  name={getMetricDisplayName(xMetric)}
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickLine={{ stroke: '#E5E7EB' }}
                  axisLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
                  domain={['dataMin - 0.5', 'dataMax + 0.5']}
                >
                  <Label
                    value={getMetricDisplayName(xMetric)}
                    position="bottom"
                    offset={45}
                    style={{ fill: '#374151', fontWeight: 600, fontSize: 13 }}
                  />
                </XAxis>
                <YAxis
                  type="number"
                  dataKey="y"
                  name={getMetricDisplayName(yMetric)}
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickLine={{ stroke: '#E5E7EB' }}
                  axisLine={{ stroke: '#D1D5DB', strokeWidth: 1 }}
                  domain={['dataMin - 0.5', 'dataMax + 0.5']}
                >
                  <Label
                    value={getMetricDisplayName(yMetric)}
                    angle={-90}
                    position="left"
                    offset={50}
                    style={{ fill: '#374151', fontWeight: 600, fontSize: 13 }}
                  />
                </YAxis>
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#9CA3AF' }} />
                <ReferenceLine
                  x={xAvg}
                  stroke="#6B7280"
                  strokeDasharray="6 4"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                >
                  <Label value="Prom." position="top" fill="#6B7280" fontSize={9} />
                </ReferenceLine>
                <ReferenceLine
                  y={yAvg}
                  stroke="#6B7280"
                  strokeDasharray="6 4"
                  strokeOpacity={0.5}
                  strokeWidth={1}
                />
                <Scatter
                  data={chartData}
                  onClick={(data: any) => {
                    if (data?.payload?.id) {
                      togglePlayerSelection(data.payload.id)
                    }
                  }}
                >
                  {chartData.map((entry, index) => {
                    const color = getColorForValue(entry.z, zMin, zMax)
                    const strokeColor = getDarkerColor(color)
                    const isHighlighted = highlightedPlayer === entry.id
                    const isSelected = selectedPlayers.has(entry.id)
                    const isSpecial = isHighlighted || isSelected

                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={isSpecial ? '#3B82F6' : color}
                        stroke={isSpecial ? '#1D4ED8' : strokeColor}
                        strokeWidth={isSpecial ? 4 : 2}
                        fillOpacity={isSpecial ? 1 : 0.8}
                        style={{
                          cursor: 'pointer',
                          filter: isHighlighted ? 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.8))' : isSelected ? 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))' : 'none',
                        }}
                      />
                    )
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Selected Players List (for PDF) */}
        {selectedPlayers.size > 0 && (
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border-2 border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 rounded-full bg-blue-500 shadow-md" />
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Jugadores Marcados ({selectedPlayers.size})</span>
              <span className="text-xs text-blue-500 ml-auto">Click en un círculo para desmarcar</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {chartData.filter(d => selectedPlayers.has(d.id)).map((d, idx) => {
                const color = getColorForValue(d.z, zMin, zMax)
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-2 bg-white dark:bg-apple-gray-800 rounded-xl group"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-blue-500 ring-offset-2"
                      style={{ backgroundColor: color }}
                    >
                      {idx + 1}
                    </div>
                    <button
                      onClick={() => {
                        const encoded = encodeURIComponent(d.player.Jugador)
                        navigate(`/jugador/${encoded}?source=${d.player.source}`)
                      }}
                      className="flex-1 min-w-0 text-left hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-apple-gray-800 dark:text-white truncate group-hover:text-brand-green transition-colors">{d.player.Jugador}</p>
                        <ScoutsGGBadge playerName={d.player.Jugador} />
                      </div>
                      <p className="text-xs text-apple-gray-500 truncate">{d.player.Equipo} · {d.player.ageNum} años</p>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const encoded = encodeURIComponent(d.player.Jugador)
                          navigate(`/jugador/${encoded}?source=${d.player.source}`)
                        }}
                        className="p-1.5 hover:bg-brand-green/10 rounded-lg transition-colors"
                        title="Ver ficha"
                      >
                        <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </button>
                      <button
                        onClick={() => togglePlayerSelection(d.id)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        title="Desmarcar"
                      >
                        <svg className="w-4 h-4 text-apple-gray-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Legend - Color Scale */}
        {chartData.length > 0 && (
          <div className="mt-6 p-5 bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-2xl">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300">{getMetricDisplayName(zMetric)}:</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-apple-gray-500 font-medium">{zMin.toFixed(1)}</span>
                <div className="w-48 h-4 rounded-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 shadow-inner" />
                <span className="text-xs text-apple-gray-500 font-medium">{zMax.toFixed(1)}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-apple-gray-500">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Bajo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span>Medio</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Alto</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-apple-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-5 h-0 border-t border-dashed border-apple-gray-400" />
                <span>Línea de promedio</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500 ring-2 ring-blue-300" />
                <span>Jugador marcado</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                <span>Click para marcar/desmarcar</span>
              </div>
            </div>
          </div>
        )}

        {/* Analysis Section */}
        <div className="mt-8 pt-6 border-t border-apple-gray-100 dark:border-apple-gray-700">
          <h3 className="font-bold text-lg text-apple-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center shadow-lg shadow-brand-green/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </span>
            Análisis Inteligente
          </h3>
          <div className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-apple-gray-700/50 dark:to-apple-gray-800 rounded-2xl p-6 border border-apple-gray-100 dark:border-apple-gray-700">
            <div className="prose prose-sm dark:prose-invert max-w-none text-apple-gray-600 dark:text-apple-gray-300 leading-relaxed">
              {analysis.split('\n').map((line, i) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <h4 key={i} className="font-bold text-apple-gray-800 dark:text-white mt-4 mb-2">{line.replace(/\*\*/g, '')}</h4>
                }
                if (line.startsWith('**')) {
                  const parts = line.split('**')
                  return (
                    <p key={i} className="mb-2">
                      <strong className="text-apple-gray-800 dark:text-white">{parts[1]}</strong>
                      {parts[2]}
                    </p>
                  )
                }
                if (line.startsWith('•')) {
                  return <p key={i} className="ml-4 text-sm">{line}</p>
                }
                if (line.match(/^\d\./)) {
                  return <p key={i} className="ml-2 py-1 border-l-2 border-brand-green pl-3">{line}</p>
                }
                return line ? <p key={i} className="mb-2">{line}</p> : <br key={i} />
              })}
            </div>
          </div>
        </div>

        {/* Footer for PDF */}
        <div className="mt-8 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700 flex items-center justify-between text-xs text-apple-gray-400">
          <span>Scout Platform by Doble G Sports</span>
          <span>{new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}
