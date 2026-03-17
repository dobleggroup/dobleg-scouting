import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getScoreColorClass, getScoreBgClass } from '@/components/ui/ScoreBar'
import PortfolioValueChart from '@/components/charts/PortfolioValueChart'
import LeagueAnalysis from '@/components/dashboard/LeagueAnalysis'
import type { EnrichedPlayer, MonitoringPlayer } from '@/types'

// Helper to format currency
function formatValue(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}K`
  return `€${value}`
}

// Helper to format large numbers
function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`
  return num.toString()
}

interface StatCardProps {
  label: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  large?: boolean
}

function StatCard({ label, value, subtitle, large }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-5 border border-apple-gray-200 dark:border-apple-gray-700">
      <p className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className={`font-bold text-apple-gray-800 dark:text-white ${large ? 'text-3xl' : 'text-2xl'}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  )
}

interface PlayerRowProps {
  player: EnrichedPlayer
  metric?: string
  metricValue?: string | number
  onClick: () => void
}

function PlayerRow({ player, metric, metricValue, onClick }: PlayerRowProps) {
  const scoreColor = getScoreColorClass(player.ggScore ?? null)
  const scoreBg = getScoreBgClass(player.ggScore ?? null)

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 transition-colors text-left"
    >
      {player.Imagen ? (
        <img src={player.Imagen} alt="" className="w-10 h-10 rounded-full object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-sm font-bold text-apple-gray-500">
          {player.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{player.Jugador}</p>
        <p className="text-xs text-apple-gray-500 truncate">{player.Equipo} · {player.ageNum} años</p>
      </div>
      <div className="text-right">
        {metricValue !== undefined ? (
          <>
            <p className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200">{metricValue}</p>
            <p className="text-2xs text-apple-gray-400">{metric}</p>
          </>
        ) : (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scoreBg} ${scoreColor}`}>
            {player.ggScore?.toFixed(1) ?? '—'}
          </span>
        )}
      </div>
    </button>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
  action?: { label: string; onClick: () => void }
}

function Section({ title, children, action }: SectionProps) {
  return (
    <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-apple-gray-100 dark:border-apple-gray-700 flex items-center justify-between">
        <h3 className="font-semibold text-apple-gray-800 dark:text-white">{title}</h3>
        {action && (
          <button
            onClick={action.onClick}
            className="text-xs font-medium text-brand-green hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}

function ProgressBar({ value, max, color = 'bg-brand-green' }: { value: number; max: number; color?: string }) {
  const percentage = Math.min(100, (value / max) * 100)
  return (
    <div className="h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${percentage}%` }} />
    </div>
  )
}

// Monitoring player row component
interface MonitoringRowProps {
  player: MonitoringPlayer
  metric?: string
  metricValue?: string | number
  onClick: () => void
  highlight?: 'green' | 'amber' | 'red'
}

function MonitoringRow({ player, metric, metricValue, onClick, highlight }: MonitoringRowProps) {
  const displayName = player['Nombre jugador'] || player.Jugador
  const initials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('')
  const image = player.metricsPlayer?.Imagen

  const highlightClasses = highlight === 'green'
    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-500'
    : highlight === 'amber'
    ? 'bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-500'
    : highlight === 'red'
    ? 'bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500'
    : ''

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 transition-colors text-left ${highlightClasses}`}
    >
      {image ? (
        <img src={image} alt="" className="w-10 h-10 rounded-full object-cover" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center text-sm font-bold text-apple-gray-500">
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{displayName}</p>
        <p className="text-xs text-apple-gray-500 truncate">{player.Club} · {player.Edad} años</p>
      </div>
      <div className="text-right">
        {metricValue !== undefined ? (
          <>
            <p className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200">{metricValue}</p>
            <p className="text-2xs text-apple-gray-400">{metric}</p>
          </>
        ) : player.ggScore ? (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getScoreBgClass(player.ggScore)} ${getScoreColorClass(player.ggScore)}`}>
            {player.ggScore.toFixed(1)}
          </span>
        ) : null}
      </div>
    </button>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { internal, monitoring, marketValueHistory, loading } = useData()

  // Filter only players with meaningful data
  const activePlayers = useMemo(() =>
    internal.filter(p => p.minutesPlayed >= 100 || p.ggScore !== null),
    [internal]
  )


  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalPlayers = internal.length
    const withScore = internal.filter(p => p.ggScore !== null)
    const totalValue = internal.reduce((sum, p) => sum + (p.marketValueRaw || 0), 0)
    const avgAge = internal.length > 0
      ? internal.reduce((sum, p) => sum + p.ageNum, 0) / internal.length
      : 0
    const avgScore = withScore.length > 0
      ? withScore.reduce((sum, p) => sum + (p.ggScore ?? 0), 0) / withScore.length
      : 0

    // Contract situations
    const contractCritical = internal.filter(p => p.monthsRemaining !== null && p.monthsRemaining <= 6).length
    const contractWarning = internal.filter(p => p.monthsRemaining !== null && p.monthsRemaining > 6 && p.monthsRemaining <= 12).length

    // Age groups
    const young = internal.filter(p => p.ageNum <= 21).length
    const peak = internal.filter(p => p.ageNum > 21 && p.ageNum <= 28).length
    const veteran = internal.filter(p => p.ageNum > 28).length

    // Score distribution
    const elite = withScore.filter(p => (p.ggScore ?? 0) >= 60).length
    const good = withScore.filter(p => (p.ggScore ?? 0) >= 45 && (p.ggScore ?? 0) < 60).length
    const developing = withScore.filter(p => (p.ggScore ?? 0) < 45).length

    return {
      totalPlayers,
      totalValue,
      avgAge,
      avgScore,
      contractCritical,
      contractWarning,
      young,
      peak,
      veteran,
      elite,
      good,
      developing,
    }
  }, [internal])

  // Top performers
  const topPerformers = useMemo(() =>
    [...internal]
      .filter(p => p.ggScore !== null)
      .sort((a, b) => (b.ggScore ?? 0) - (a.ggScore ?? 0))
      .slice(0, 5),
    [internal]
  )

  // Most valuable
  const mostValuable = useMemo(() =>
    [...internal]
      .filter(p => p.marketValueRaw > 0)
      .sort((a, b) => b.marketValueRaw - a.marketValueRaw)
      .slice(0, 5),
    [internal]
  )

  // Contract alerts (expiring soon)
  const contractAlerts = useMemo(() =>
    [...internal]
      .filter(p => p.monthsRemaining !== null && p.monthsRemaining <= 12 && p.monthsRemaining >= 0)
      .sort((a, b) => (a.monthsRemaining ?? 999) - (b.monthsRemaining ?? 999))
      .slice(0, 5),
    [internal]
  )

  // Young talents (high score for age)
  const youngTalents = useMemo(() =>
    [...internal]
      .filter(p => p.ageNum <= 21 && p.ggScore !== null && (p.ggScore ?? 0) >= 40)
      .sort((a, b) => (b.ggScore ?? 0) - (a.ggScore ?? 0))
      .slice(0, 5),
    [internal]
  )

  // Undervalued gems (high score, low value)
  const undervalued = useMemo(() =>
    [...internal]
      .filter(p => p.ggScore !== null && (p.ggScore ?? 0) >= 50 && p.marketValueRaw > 0 && p.marketValueRaw <= 500_000)
      .sort((a, b) => (b.ggScore ?? 0) / (b.marketValueRaw || 1) - (a.ggScore ?? 0) / (a.marketValueRaw || 1))
      .slice(0, 5),
    [internal]
  )

  // ─── SEGUIMIENTO RECOMMENDATIONS ─────────────────────────────────────────────

  // Best opportunities - players in seguimiento that outperform Doble G average
  const recommendedSignings = useMemo(() =>
    [...monitoring]
      .filter(p => p.hasEnoughData && p.scoreDiff != null && p.scoreDiff > 0 && p.ggScore != null)
      .sort((a, b) => (b.scoreDiff ?? 0) - (a.scoreDiff ?? 0))
      .slice(0, 5),
    [monitoring]
  )

  // Best value opportunities (high opportunity score)
  const bestValueOpportunities = useMemo(() =>
    [...monitoring]
      .filter(p => p.hasEnoughData && p.opportunityScore != null && p.opportunityScore > 3)
      .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
      .slice(0, 5),
    [monitoring]
  )

  // Contract opportunities in seguimiento
  const contractOpportunities = useMemo(() =>
    [...monitoring]
      .filter(p => p.monthsRemaining != null && p.monthsRemaining <= 12 && p.ggScore != null && p.ggScore >= 40)
      .sort((a, b) => (a.monthsRemaining ?? 999) - (b.monthsRemaining ?? 999))
      .slice(0, 5),
    [monitoring]
  )

  // Seguimiento stats
  const seguimientoStats = useMemo(() => {
    const withScore = monitoring.filter(p => p.ggScore != null && p.hasEnoughData)
    const aboveAvg = monitoring.filter(p => (p.scoreDiff ?? -1) > 0)
    const contractSoon = monitoring.filter(p => (p.monthsRemaining ?? 999) <= 12)
    return {
      total: monitoring.length,
      withScore: withScore.length,
      aboveDobleG: aboveAvg.length,
      contractSoon: contractSoon.length,
    }
  }, [monitoring])

  // Position distribution
  const positionDistribution = useMemo(() => {
    const groups: Record<string, number> = {
      'Arqueros': 0,
      'Defensores': 0,
      'Mediocampistas': 0,
      'Delanteros': 0,
    }

    internal.forEach(p => {
      const pos = (p['Posición'] || '').toLowerCase()
      if (pos.includes('arquer') || pos.includes('porter')) groups['Arqueros']++
      else if (pos.includes('defens') || pos.includes('lateral') || pos.includes('central')) groups['Defensores']++
      else if (pos.includes('volante') || pos.includes('medio') || pos.includes('pivote') || pos.includes('interior')) groups['Mediocampistas']++
      else if (pos.includes('delant') || pos.includes('extrem') || pos.includes('punta')) groups['Delanteros']++
    })

    return groups
  }, [internal])

  const navigateToPlayer = (player: EnrichedPlayer) => {
    navigate(`/jugador/${encodeURIComponent(player.Jugador)}?source=interno`)
  }

  const navigateToMonitoringPlayer = (player: MonitoringPlayer) => {
    const pos = encodeURIComponent(player['Posición'] || '')
    navigate(`/jugador/${encodeURIComponent(player.Jugador)}?source=seguimiento&pos=${pos}`)
  }

  if (loading) return <LoadingSpinner fullScreen message="Cargando dashboard..." />

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
          Panel Interno
        </h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
          Jugadores Doble G Sports Group
        </p>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Jugadores Representados"
          value={kpis.totalPlayers}
          large
        />
        <StatCard
          label="Valor Total Portfolio"
          value={formatValue(kpis.totalValue)}
          subtitle={`Promedio: ${formatValue(kpis.totalValue / kpis.totalPlayers || 0)}`}
          large
        />
        <StatCard
          label="Edad Promedio"
          value={kpis.avgAge.toFixed(1)}
          subtitle="años"
          large
        />
        <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-5 border border-apple-gray-200 dark:border-apple-gray-700">
          <p className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-1">
            Score Promedio
          </p>
          <p className={`text-3xl font-bold ${
            kpis.avgScore >= 55 ? 'text-brand-green' :
            kpis.avgScore >= 45 ? 'text-emerald-500' :
            kpis.avgScore >= 35 ? 'text-amber-500' : 'text-red-500'
          }`}>
            {kpis.avgScore.toFixed(1)}
          </p>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
            {kpis.avgScore >= 55 ? 'Excelente' :
             kpis.avgScore >= 45 ? 'Bueno' :
             kpis.avgScore >= 35 ? 'Regular' : 'Bajo'} · GG Score
          </p>
        </div>
      </div>

      {/* Portfolio Value Evolution Section */}
      {marketValueHistory.length > 0 && (
        <div className="mb-8">
          <Section title="Evolución del Valor del Portfolio">
            <PortfolioValueChart
              data={marketValueHistory}
              players={internal}
              onPlayerClick={(playerName) => {
                const player = internal.find(p => p.Jugador === playerName)
                if (player) {
                  navigate(`/jugador/${encodeURIComponent(player.Jugador)}?source=interno`)
                }
              }}
            />
          </Section>
        </div>
      )}

      {/* Alert Banner */}
      {kpis.contractCritical > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-red-800 dark:text-red-200">
                {kpis.contractCritical} jugador{kpis.contractCritical > 1 ? 'es' : ''} con contrato crítico
              </p>
              <p className="text-sm text-red-600 dark:text-red-400">
                Contratos que vencen en menos de 6 meses. Requiere acción inmediata.
              </p>
            </div>
            <button
              onClick={() => navigate('/interno')}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Ver detalles
            </button>
          </div>
          {/* Show critical players */}
          <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800/50 flex flex-wrap gap-2">
            {contractAlerts.filter(p => (p.monthsRemaining ?? 99) <= 6).slice(0, 5).map((p, i) => (
              <button
                key={i}
                onClick={() => navigateToPlayer(p)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-apple-gray-800 rounded-lg text-sm hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors border border-red-200 dark:border-red-800"
              >
                <span className="font-medium text-apple-gray-800 dark:text-white">{p.Jugador}</span>
                <span className="text-red-600 dark:text-red-400 text-xs font-semibold">{p.monthsRemaining}m</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Three Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Distribution Cards */}
        <Section title="Composición del Portfolio">
          <div className="space-y-4">
            {/* Age Distribution */}
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-apple-gray-600 dark:text-apple-gray-400">Por Edad</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-apple-gray-500 w-24">Jovenes (≤21)</span>
                  <div className="flex-1">
                    <ProgressBar value={kpis.young} max={kpis.totalPlayers} color="bg-purple-500" />
                  </div>
                  <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 w-8 text-right">{kpis.young}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-apple-gray-500 w-24">Peak (22-28)</span>
                  <div className="flex-1">
                    <ProgressBar value={kpis.peak} max={kpis.totalPlayers} color="bg-brand-green" />
                  </div>
                  <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 w-8 text-right">{kpis.peak}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-apple-gray-500 w-24">Veteranos (29+)</span>
                  <div className="flex-1">
                    <ProgressBar value={kpis.veteran} max={kpis.totalPlayers} color="bg-amber-500" />
                  </div>
                  <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 w-8 text-right">{kpis.veteran}</span>
                </div>
              </div>
            </div>

            {/* Performance Distribution */}
            <div className="pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-apple-gray-600 dark:text-apple-gray-400">Por Rendimiento</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-apple-gray-500 w-24">Elite (60+)</span>
                  <div className="flex-1">
                    <ProgressBar value={kpis.elite} max={kpis.totalPlayers} color="bg-emerald-500" />
                  </div>
                  <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 w-8 text-right">{kpis.elite}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-apple-gray-500 w-24">Buenos (45-59)</span>
                  <div className="flex-1">
                    <ProgressBar value={kpis.good} max={kpis.totalPlayers} color="bg-blue-500" />
                  </div>
                  <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 w-8 text-right">{kpis.good}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-apple-gray-500 w-24">En desarrollo</span>
                  <div className="flex-1">
                    <ProgressBar value={kpis.developing} max={kpis.totalPlayers} color="bg-apple-gray-400" />
                  </div>
                  <span className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200 w-8 text-right">{kpis.developing}</span>
                </div>
              </div>
            </div>

            {/* Position Distribution */}
            <div className="pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-apple-gray-600 dark:text-apple-gray-400">Por Posición</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(positionDistribution).map(([pos, count]) => (
                  <div key={pos} className="bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{count}</p>
                    <p className="text-xs text-apple-gray-500">{pos}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Contract Situations */}
        <Section
          title="Situación de Contratos"
          action={{ label: 'Ver todos', onClick: () => navigate('/interno') }}
        >
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-apple-gray-700 dark:text-apple-gray-200">Critico (&lt;6 meses)</span>
              </div>
              <span className="font-bold text-red-600 dark:text-red-400">{kpis.contractCritical}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-sm text-apple-gray-700 dark:text-apple-gray-200">Alerta (6-12 meses)</span>
              </div>
              <span className="font-bold text-amber-600 dark:text-amber-400">{kpis.contractWarning}</span>
            </div>
          </div>

          {contractAlerts.length > 0 && (
            <div className="border-t border-apple-gray-100 dark:border-apple-gray-700 pt-3">
              <p className="text-xs font-medium text-apple-gray-500 uppercase tracking-wider mb-2">Proximos a vencer</p>
              <div className="space-y-1">
                {contractAlerts.map((p, i) => (
                  <PlayerRow
                    key={i}
                    player={p}
                    metric="meses"
                    metricValue={p.monthsRemaining ?? 0}
                    onClick={() => navigateToPlayer(p)}
                  />
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Top Performers */}
        <Section
          title="Top Rendimiento"
          action={{ label: 'Ver ranking', onClick: () => navigate('/interno') }}
        >
          <div className="space-y-1">
            {topPerformers.map((p, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                  i === 1 ? 'bg-apple-gray-200 text-apple-gray-600 dark:bg-apple-gray-600 dark:text-apple-gray-300' :
                  i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
                  'bg-apple-gray-100 text-apple-gray-500 dark:bg-apple-gray-700 dark:text-apple-gray-400'
                }`}>
                  {i + 1}
                </div>
                <button
                  onClick={() => navigateToPlayer(p)}
                  className="flex-1 text-left hover:underline"
                >
                  <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.Jugador}</p>
                  <p className="text-xs text-apple-gray-500 truncate">{p.Equipo}</p>
                </button>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getScoreBgClass(p.ggScore ?? null)} ${getScoreColorClass(p.ggScore ?? null)}`}>
                  {p.ggScore?.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* League Analysis Section */}
      <div className="mt-8 mb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-apple-gray-800 dark:text-white">
              Análisis de Ligas y Oportunidades
            </h2>
            <p className="text-sm text-apple-gray-500">
              Evaluación de posiciones en el mercado y potencial de crecimiento
            </p>
          </div>
        </div>
        <LeagueAnalysis players={internal} />
      </div>

      {/* Bottom Row - Full Width Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Valuable */}
        <Section
          title="Mayor Valor de Mercado"
          action={{ label: 'Ver todos', onClick: () => navigate('/interno') }}
        >
          <div className="space-y-1">
            {mostValuable.map((p, i) => (
              <PlayerRow
                key={i}
                player={p}
                metric="valor"
                metricValue={p.marketValueFormatted}
                onClick={() => navigateToPlayer(p)}
              />
            ))}
          </div>
        </Section>

        {/* Young Talents */}
        <Section
          title="Jovenes Promesas"
          action={{ label: 'Ver todos', onClick: () => navigate('/interno') }}
        >
          {youngTalents.length > 0 ? (
            <div className="space-y-1">
              {youngTalents.map((p, i) => (
                <PlayerRow
                  key={i}
                  player={p}
                  onClick={() => navigateToPlayer(p)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-apple-gray-500 text-center py-8">
              No hay jovenes con score destacado
            </p>
          )}
        </Section>
      </div>

      {/* Undervalued Section */}
      {undervalued.length > 0 && (
        <div className="mt-6">
          <Section
            title="Oportunidades de Venta"
            action={{ label: 'Ver oportunidades', onClick: () => navigate('/oportunidades') }}
          >
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mb-4">
              Jugadores con alto rendimiento y valor de mercado bajo. Potencial de revalorizacion.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {undervalued.map((p, i) => (
                <button
                  key={i}
                  onClick={() => navigateToPlayer(p)}
                  className="flex items-center gap-3 p-4 bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-xl hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors text-left"
                >
                  {p.Imagen ? (
                    <img src={p.Imagen} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-sm font-bold text-apple-gray-500">
                      {p.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-apple-gray-800 dark:text-white text-sm truncate">{p.Jugador}</p>
                    <p className="text-xs text-apple-gray-500 truncate">{p.Equipo} · {p.ageNum} años</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getScoreBgClass(p.ggScore ?? null)} ${getScoreColorClass(p.ggScore ?? null)}`}>
                        {p.ggScore?.toFixed(1)}
                      </span>
                      <span className="text-xs text-apple-gray-500">{p.marketValueFormatted}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ─── RECRUITMENT RECOMMENDATIONS SECTION ─────────────────────────────────── */}
      {seguimientoStats.total > 0 && (
        <div className="mt-10 pt-8 border-t border-apple-gray-200 dark:border-apple-gray-700">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-apple-gray-800 dark:text-white flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                Recomendaciones de Fichaje
              </h2>
              <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1 ml-13">
                Oportunidades del mercado basadas en análisis de seguimiento
              </p>
            </div>
            <button
              onClick={() => navigate('/seguimiento')}
              className="px-4 py-2 bg-brand-green text-black text-sm font-semibold rounded-lg hover:bg-green-400 transition-colors"
            >
              Ver todos los seguimientos
            </button>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-4 border border-apple-gray-200 dark:border-apple-gray-700">
              <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">{seguimientoStats.total}</p>
              <p className="text-xs text-apple-gray-500">En seguimiento</p>
            </div>
            <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-4 border border-apple-gray-200 dark:border-apple-gray-700">
              <p className="text-2xl font-bold text-brand-green">{seguimientoStats.aboveDobleG}</p>
              <p className="text-xs text-apple-gray-500">Superan promedio Doble G</p>
            </div>
            <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-4 border border-apple-gray-200 dark:border-apple-gray-700">
              <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">{seguimientoStats.withScore}</p>
              <p className="text-xs text-apple-gray-500">Con datos completos</p>
            </div>
            <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-4 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{seguimientoStats.contractSoon}</p>
              <p className="text-xs text-apple-gray-500">Contratos &lt;12 meses</p>
            </div>
          </div>

          {/* Recommendations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Recommendations - Above Doble G Average */}
            <Section
              title="Superan a Doble G"
              action={{ label: 'Ver mas', onClick: () => navigate('/seguimiento') }}
            >
              {recommendedSignings.length > 0 ? (
                <div className="space-y-1">
                  {recommendedSignings.map((p, i) => (
                    <MonitoringRow
                      key={i}
                      player={p}
                      metric="vs Doble G"
                      metricValue={`+${(p.scoreDiff ?? 0).toFixed(1)}`}
                      onClick={() => navigateToMonitoringPlayer(p)}
                      highlight="green"
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-apple-gray-500 text-center py-6">
                  No hay jugadores que superen el promedio actual
                </p>
              )}
            </Section>

            {/* Best Value Opportunities */}
            <Section
              title="Mejor Relacion Calidad/Precio"
              action={{ label: 'Ver mas', onClick: () => navigate('/seguimiento') }}
            >
              {bestValueOpportunities.length > 0 ? (
                <div className="space-y-1">
                  {bestValueOpportunities.map((p, i) => (
                    <MonitoringRow
                      key={i}
                      player={p}
                      metric="oportunidad"
                      metricValue={(p.opportunityScore ?? 0).toFixed(1)}
                      onClick={() => navigateToMonitoringPlayer(p)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-apple-gray-500 text-center py-6">
                  No hay oportunidades destacadas
                </p>
              )}
            </Section>

            {/* Contract Opportunities */}
            <Section
              title="Contratos por Vencer"
              action={{ label: 'Ver mas', onClick: () => navigate('/seguimiento') }}
            >
              {contractOpportunities.length > 0 ? (
                <div className="space-y-1">
                  {contractOpportunities.map((p, i) => (
                    <MonitoringRow
                      key={i}
                      player={p}
                      metric="meses"
                      metricValue={p.monthsRemaining ?? 0}
                      onClick={() => navigateToMonitoringPlayer(p)}
                      highlight={(p.monthsRemaining ?? 12) <= 6 ? 'red' : 'amber'}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-apple-gray-500 text-center py-6">
                  No hay oportunidades de contrato
                </p>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  )
}
