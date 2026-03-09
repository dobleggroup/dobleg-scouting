import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import ContractBadge from '@/components/ui/ContractBadge'
import PlayerRadarChart from '@/components/charts/PlayerRadarChart'
import EvolutionChart from '@/components/charts/EvolutionChart'
import MarketValueChart from '@/components/charts/MarketValueChart'
import GaugeScore from '@/components/charts/GaugeScore'
import ExportPDFModal from '@/components/ui/ExportPDFModal'
import { exportPlayerToPdfFull } from '@/utils/pdfExport'
import { normalizeName } from '@/utils/scoring'
import { POSITION_MAP, DISPLAY_POSITION_MAP, DISPLAY_METRICS, RADAR_METRICS } from '@/constants/scoring'
import type { EnrichedPlayer, SubjectiveMetric } from '@/types'

// ─── PLAYER COMMENTS SYSTEM ───────────────────────────────────────────────────

interface PlayerComment {
  id: string
  playerKey: string
  sentiment: 'positive' | 'neutral' | 'negative'
  text: string
  author: string
  createdAt: string
}

function getCommentsKey(): string {
  return 'player_comments_v1'
}

function loadComments(): PlayerComment[] {
  try {
    return JSON.parse(localStorage.getItem(getCommentsKey()) || '[]')
  } catch {
    return []
  }
}

function saveComments(comments: PlayerComment[]): void {
  localStorage.setItem(getCommentsKey(), JSON.stringify(comments))
}

function getPlayerKey(player: EnrichedPlayer): string {
  return `${normalizeName(player.Jugador)}|${normalizeName(player.Equipo)}`
}

interface CommentsProps {
  player: EnrichedPlayer
}

function PlayerComments({ player }: CommentsProps) {
  const [comments, setComments] = useState<PlayerComment[]>([])
  const [newComment, setNewComment] = useState('')
  const [newAuthor, setNewAuthor] = useState(() => {
    try { return localStorage.getItem('comment_author') || '' } catch { return '' }
  })
  const [newSentiment, setNewSentiment] = useState<'positive' | 'neutral' | 'negative'>('neutral')
  const [isAdding, setIsAdding] = useState(false)

  const playerKey = getPlayerKey(player)

  useEffect(() => {
    const all = loadComments()
    setComments(all.filter(c => c.playerKey === playerKey))
  }, [playerKey])

  const handleAddComment = useCallback(() => {
    if (!newComment.trim() || !newAuthor.trim()) return

    const comment: PlayerComment = {
      id: Date.now().toString(),
      playerKey,
      sentiment: newSentiment,
      text: newComment.trim(),
      author: newAuthor.trim(),
      createdAt: new Date().toISOString(),
    }

    const all = loadComments()
    const updated = [...all, comment]
    saveComments(updated)
    setComments(updated.filter(c => c.playerKey === playerKey))

    localStorage.setItem('comment_author', newAuthor.trim())
    setNewComment('')
    setNewSentiment('neutral')
    setIsAdding(false)
  }, [newComment, newAuthor, newSentiment, playerKey])

  const handleDeleteComment = useCallback((id: string) => {
    const all = loadComments()
    const updated = all.filter(c => c.id !== id)
    saveComments(updated)
    setComments(updated.filter(c => c.playerKey === playerKey))
  }, [playerKey])

  const sentimentConfig = {
    positive: { icon: '👍', label: 'Positivo', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400' },
    neutral: { icon: '➖', label: 'Neutral', bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-600 dark:text-amber-400' },
    negative: { icon: '👎', label: 'Negativo', bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-600 dark:text-red-400' },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
          Comentarios ({comments.length})
        </h3>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="btn-apple-secondary text-sm px-3 py-1.5"
          >
            + Agregar
          </button>
        )}
      </div>

      {isAdding && (
        <div className="p-4 bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700">
          <div className="mb-3">
            <label className="block text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 mb-2">
              Valoración
            </label>
            <div className="flex gap-2">
              {(['positive', 'neutral', 'negative'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setNewSentiment(s)}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all text-sm font-medium ${
                    newSentiment === s
                      ? `${sentimentConfig[s].bg} ${sentimentConfig[s].border} ${sentimentConfig[s].text}`
                      : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-500'
                  }`}
                >
                  <span className="mr-1.5">{sentimentConfig[s].icon}</span>
                  {sentimentConfig[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Escribe tu observación..."
              className="input-apple w-full h-20 resize-none"
            />
          </div>

          <div className="mb-4">
            <input
              type="text"
              value={newAuthor}
              onChange={e => setNewAuthor(e.target.value)}
              placeholder="Tu nombre..."
              className="input-apple w-full"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setIsAdding(false); setNewComment(''); setNewSentiment('neutral') }}
              className="btn-apple-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddComment}
              disabled={!newComment.trim() || !newAuthor.trim()}
              className="btn-apple-primary flex-1 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {comments.length === 0 && !isAdding ? (
        <div className="text-center py-6 text-apple-gray-400">
          <p className="text-sm">Sin comentarios</p>
        </div>
      ) : (
        <div className="space-y-2">
          {comments
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map(comment => {
              const config = sentimentConfig[comment.sentiment]
              const date = new Date(comment.createdAt)
              return (
                <div
                  key={comment.id}
                  className={`p-3 rounded-xl border ${config.bg} ${config.border}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-xs font-semibold ${config.text}`}>
                      {config.icon} {config.label}
                    </span>
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="text-apple-gray-400 hover:text-red-500 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-apple-gray-700 dark:text-apple-gray-300 leading-relaxed mb-2">
                    {comment.text}
                  </p>
                  <div className="flex items-center justify-between text-2xs text-apple-gray-500">
                    <span className="font-medium">{comment.author}</span>
                    <span>{date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

// ─── SUBJECTIVE METRICS GROUPS ────────────────────────────────────────────────

function getSubjectiveGroups(metrics: SubjectiveMetric[], jsk: string) {
  const playerMetrics = metrics.filter(m => String(m.JugadorSK) === String(jsk))
  if (playerMetrics.length === 0) return []

  const grouped = new Map<string, number[]>()
  for (const m of playerMetrics) {
    const tipo = m['Tipo Atributo']
    const num = parseInt(m.numero, 10)
    if (!tipo || isNaN(num) || num < 1) continue
    if (!grouped.has(tipo)) grouped.set(tipo, [])
    grouped.get(tipo)!.push(num)
  }

  return [...grouped.entries()].map(([tipo, nums]) => {
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length
    return {
      tipo,
      averageScore: Math.round(avg * 20),
    }
  }).slice(0, 4)
}

// ─── POSITION DISPLAY ─────────────────────────────────────────────────────────

function getDisplayPosition(rawPosition: string | undefined): string {
  if (!rawPosition) return '—'
  const trimmed = rawPosition.trim()

  const separator = trimmed.includes(',') ? ',' : trimmed.includes('/') ? '/' : null
  if (separator) {
    const positions = trimmed.split(separator).map(p => p.trim())
    const displayPositions = positions
      .map(p => DISPLAY_POSITION_MAP[p] || p)
      .filter((v, i, arr) => arr.indexOf(v) === i)
    return displayPositions.join(' / ')
  }

  return DISPLAY_POSITION_MAP[trimmed] || trimmed
}

// ─── INFO COMPONENTS ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value || value === '-' || value === '') return null
  return (
    <div className="flex justify-between py-2 border-b border-apple-gray-100 dark:border-apple-gray-800/50 last:border-0">
      <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">{label}</span>
      <span className="text-sm font-medium text-apple-gray-800 dark:text-white text-right ml-4">{value}</span>
    </div>
  )
}

interface MetricWithPercentileProps {
  label: string
  value?: string | number | null
  percentile?: number | null
}

function MetricRowWithPercentile({ label, value, percentile }: MetricWithPercentileProps) {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  const displayVal = isNaN(num) ? (value || '—') : (num % 1 === 0 ? num.toFixed(0) : num.toFixed(2))

  const getQualityInfo = (p: number | null | undefined) => {
    if (p === null || p === undefined) return { label: '', color: 'bg-apple-gray-300', textColor: 'text-apple-gray-800 dark:text-white' }
    if (p >= 80) return { label: 'Elite', color: 'bg-emerald-500', textColor: 'text-emerald-500' }
    if (p >= 60) return { label: 'Bueno', color: 'bg-yellow-500', textColor: 'text-yellow-600 dark:text-yellow-400' }
    if (p >= 40) return { label: 'Promedio', color: 'bg-amber-500', textColor: 'text-amber-500' }
    if (p >= 20) return { label: 'Bajo', color: 'bg-orange-500', textColor: 'text-orange-500' }
    return { label: 'Crítico', color: 'bg-red-500', textColor: 'text-red-500' }
  }

  const quality = getQualityInfo(percentile)

  return (
    <div className="py-3 border-b border-apple-gray-100 dark:border-apple-gray-800/50 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${quality.textColor}`}>
            {displayVal}
          </span>
          {percentile !== null && percentile !== undefined && (
            <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded ${quality.color}/15 ${quality.textColor}`}>
              {quality.label}
            </span>
          )}
        </div>
      </div>
      {percentile !== null && percentile !== undefined && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${quality.color}`}
              style={{ width: `${Math.min(100, Math.max(0, percentile))}%` }}
            />
          </div>
          <span className="text-2xs text-apple-gray-400 tabular-nums w-12 text-right">
            Top {100 - Math.round(percentile)}%
          </span>
        </div>
      )}
    </div>
  )
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const source = (searchParams.get('source') ?? 'externo') as 'externo' | 'interno' | 'seguimiento'
  const overridePosition = searchParams.get('pos')
  const { external, internal, monitoring, normalized, evolution, subjectiveMetrics, marketValueHistory, loading, error } = useData()
  const [activeTab, setActiveTab] = useState('General')
  const [comparisonLeague, setComparisonLeague] = useState<string>('all')
  const [showExportModal, setShowExportModal] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const player: EnrichedPlayer | null = useMemo(() => {
    if (!id) return null
    const decodedId = decodeURIComponent(id)

    if (source === 'interno') {
      return internal.find(p => String(p.id) === decodedId || normalizeName(p.Jugador) === normalizeName(decodedId)) ?? null
    }

    if (source === 'seguimiento') {
      const monPlayer = monitoring.find(p =>
        normalizeName(p.Jugador) === normalizeName(decodedId) ||
        normalizeName(p['Nombre jugador']) === normalizeName(decodedId)
      )
      return monPlayer?.metricsPlayer ?? null
    }

    return external.find(p => normalizeName(p.Jugador) === normalizeName(decodedId)) ?? null
  }, [id, source, external, internal, monitoring])

  const monitoringPlayer = useMemo(() => {
    if (source !== 'seguimiento' || !id) return null
    const decodedId = decodeURIComponent(id)
    return monitoring.find(p =>
      normalizeName(p.Jugador) === normalizeName(decodedId) ||
      normalizeName(p['Nombre jugador']) === normalizeName(decodedId)
    ) ?? null
  }, [id, source, monitoring])

  const rawPosition = useMemo(() => {
    if (overridePosition) return overridePosition
    if (!player) return ''
    const posEsp = player['Posición específica']?.trim()
    if (posEsp) return posEsp
    return player['Posición']?.trim() || ''
  }, [overridePosition, player])

  const posKey = useMemo(() => {
    const rawPos = rawPosition.trim()
    if (POSITION_MAP[rawPos]) return POSITION_MAP[rawPos]
    const separator = rawPos.includes(',') ? ',' : rawPos.includes('/') ? '/' : null
    if (separator) {
      for (const pos of rawPos.split(separator).map(p => p.trim())) {
        if (POSITION_MAP[pos]) return POSITION_MAP[pos]
      }
    }
    return ''
  }, [rawPosition])

  const displayPosition = getDisplayPosition(rawPosition)

  const subjectiveGroups = useMemo(() => {
    if (!player || source !== 'interno') return []
    const jsk = (player as EnrichedPlayer & { jugadorSK?: string }).jugadorSK ?? ''
    if (!jsk) return []
    return getSubjectiveGroups(subjectiveMetrics, jsk)
  }, [player, source, subjectiveMetrics])

  const playerJugadorSK = useMemo(() => {
    if (!player || source !== 'interno') return ''
    return (player as EnrichedPlayer & { jugadorSK?: string }).jugadorSK ?? ''
  }, [player, source])

  // Calculate average score for same position (for comparison)
  const positionAverageScore = useMemo(() => {
    if (!player || !posKey) return null
    const allPlayers = [...external, ...internal]
    const samePosPlayers = allPlayers.filter(p => {
      const pPosKey = POSITION_MAP[p['Posición']?.trim() ?? ''] ?? ''
      return pPosKey === posKey && p.ggScore !== null && p.minutesPlayed >= 300
    })
    if (samePosPlayers.length < 5) return null
    const sum = samePosPlayers.reduce((s, p) => s + (p.ggScore ?? 0), 0)
    return sum / samePosPlayers.length
  }, [player, posKey, external, internal])

  // Calculate percentiles for metrics
  const metricPercentiles = useMemo(() => {
    if (!player || !posKey) return {}

    const allPlayers = [...external, ...internal]
    const samePosList = allPlayers.filter(p => {
      const pPosKey = POSITION_MAP[p['Posición']?.trim() ?? ''] ?? ''
      return pPosKey === posKey && p.minutesPlayed >= 300
    })

    if (samePosList.length < 5) return {}

    const percentiles: Record<string, number> = {}
    const displayMetricsList = DISPLAY_METRICS[posKey] ?? DISPLAY_METRICS['_default']

    for (const metric of displayMetricsList) {
      if (metric === 'Partidos jugados' || metric === 'Minutos jugados') continue

      const playerVal = player[metric]
      const playerNum = typeof playerVal === 'number' ? playerVal : parseFloat(String(playerVal ?? '').replace(',', '.'))

      if (isNaN(playerNum)) continue

      const values = samePosList
        .map(p => {
          const v = p[metric]
          return typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
        })
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b)

      if (values.length < 5) continue

      const countBelow = values.filter(v => v < playerNum).length
      percentiles[metric] = (countBelow / values.length) * 100
    }

    return percentiles
  }, [player, posKey, external, internal])

  const availableLeagues = useMemo(() => {
    const allPlayers = [...external, ...internal]
    const leagueSet = new Set<string>()
    for (const p of allPlayers) {
      if (p.Liga) leagueSet.add(p.Liga)
    }
    return [...leagueSet].sort()
  }, [external, internal])

  useEffect(() => {
    if (player) {
      const playerLeague = player.Liga
      if (playerLeague && availableLeagues.includes(playerLeague)) {
        setComparisonLeague(playerLeague)
      } else {
        setComparisonLeague('all')
      }
    }
  }, [player?.Jugador, player?.Liga, availableLeagues])

  const playerMarketValueHistory = useMemo(() => {
    if (!player || source !== 'interno') return []
    const playerNameNorm = normalizeName(player.Jugador)
    return marketValueHistory.filter(entry => {
      const entryNameNorm = normalizeName(entry.Jugador)
      return entryNameNorm === playerNameNorm
    })
  }, [player, source, marketValueHistory])

  // Define tabs based on source
  const tabs = source === 'interno'
    ? ['General', 'Radar', 'Valor', 'Evolución', 'Métricas']
    : ['General', 'Radar', 'Métricas']

  // Compute radar data for PDF export
  const computeRadarData = useMemo(() => {
    if (!player || !posKey) return []

    const radarMetrics = RADAR_METRICS[posKey] ?? RADAR_METRICS['_default'] ?? []
    const allPlayers = [...external, ...internal]

    // Get player's normalized values
    const normPlayer = normalized.find(n => normalizeName(n.Jugador) === normalizeName(player.Jugador))

    // Calculate position averages
    const posPlayers = normalized.filter(p => {
      const pPos = p['Posición']?.trim() ?? ''
      const pPosKey = POSITION_MAP[pPos] ?? ''
      return pPosKey === posKey
    })

    if (posPlayers.length === 0) return []

    const result: { metric: string; value: number; average: number }[] = []

    for (const metric of radarMetrics) {
      // Player value
      let playerVal = 50
      if (normPlayer) {
        const v = normPlayer[metric]
        playerVal = typeof v === 'number' ? v * 100 : 50
      }

      // Average value
      const avgSum = posPlayers.reduce((s, p) => {
        const v = p[metric]
        return s + (typeof v === 'number' ? v : 0)
      }, 0)
      const avgVal = (avgSum / posPlayers.length) * 100

      result.push({ metric, value: playerVal, average: avgVal })
    }

    return result
  }, [player, posKey, normalized, external, internal])

  // PDF Export handler
  const handleExportPdf = async (sections: string[]) => {
    if (!player) return

    await exportPlayerToPdfFull({
      player,
      source,
      sections,
      positionAverageScore,
      subjectiveGroups,
      marketValueHistory: playerMarketValueHistory,
      metricPercentiles,
      radarData: computeRadarData,
    })
  }

  if (loading) return <LoadingSpinner fullScreen message="Cargando ficha del jugador..." />
  if (error) return <EmptyState title="Error" description={error} icon="error" />
  if (!player) return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <EmptyState title="Jugador no encontrado" description="No se encontró el jugador solicitado." icon="search" />
    </div>
  )

  const displayMetrics = DISPLAY_METRICS[posKey] ?? DISPLAY_METRICS['_default']
  const contractColor =
    player.contractStatus === 'critical' ? 'text-orange-500'
    : player.contractStatus === 'warning' ? 'text-amber-500'
    : 'text-apple-gray-700 dark:text-apple-gray-300'

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 animate-fade-in" id="player-detail-content" ref={contentRef}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400 mb-5">
        <Link
          to={source === 'interno' ? '/interno' : source === 'seguimiento' ? '/seguimiento' : '/'}
          className="hover:text-brand-green transition-colors"
        >
          {source === 'interno' ? 'Scout Interno' : source === 'seguimiento' ? 'Seguimiento' : 'Scout Externo'}
        </Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-apple-gray-800 dark:text-white font-medium">{player.Jugador}</span>
      </nav>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left sidebar - Player info & Score */}
        <div className="lg:col-span-4 space-y-5">
          {/* Player card */}
          <div className="card-apple overflow-hidden" id="player-header-card">
            {/* Header with gradient, pattern and logo */}
            <div className="relative h-28 overflow-hidden">
              {/* Base gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-brand-green/25 via-emerald-500/15 to-apple-gray-100/50 dark:to-apple-gray-800/50" />
              {/* Radial glow */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(34,197,94,0.2),transparent_60%)]" />
              {/* Subtle pattern */}
              <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{
                backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
                backgroundSize: '12px 12px'
              }} />
              {/* Logo watermark - centered in header */}
              <div className="absolute inset-0 flex items-center justify-center">
                <img
                  src="/logo-light.png"
                  alt=""
                  className="w-28 h-28 object-contain opacity-50 dark:hidden"
                />
                <img
                  src="/logo-dark.png"
                  alt=""
                  className="w-28 h-28 object-contain opacity-60 hidden dark:block"
                />
              </div>
            </div>

            {/* Avatar positioned over header */}
            <div className="relative px-5 -mt-14">
              {player.Imagen ? (
                <div className="relative w-[104px] h-[104px]">
                  {/* Background for transparent images */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white to-apple-gray-100 dark:from-apple-gray-700 dark:to-apple-gray-800 shadow-lg border-4 border-white dark:border-apple-gray-800" />
                  {/* Player image */}
                  <img
                    src={player.Imagen}
                    alt={player.Jugador}
                    className="relative w-full h-full rounded-2xl object-cover border-4 border-white dark:border-apple-gray-800"
                    style={{
                      backgroundColor: 'transparent',
                      mixBlendMode: 'normal'
                    }}
                  />
                </div>
              ) : (
                <div className="w-[104px] h-[104px] bg-gradient-to-br from-apple-gray-100 to-apple-gray-200 dark:from-apple-gray-700 dark:to-apple-gray-800 rounded-2xl flex items-center justify-center shadow-lg border-4 border-white dark:border-apple-gray-800">
                  <span className="text-2xl font-bold text-apple-gray-400 dark:text-apple-gray-500">
                    {player.Jugador.split(' ').map(w => w[0]).slice(0, 2).join('')}
                  </span>
                </div>
              )}
            </div>

            {/* Player info */}
            <div className="p-5 pt-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h1 className="text-xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
                    {player.Jugador}
                  </h1>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                    {player.Equipo || '—'}
                  </p>
                </div>
                <ContractBadge status={player.contractStatus} monthsRemaining={player.monthsRemaining} />
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <span className="inline-flex px-2.5 py-1 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-lg text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">
                  {displayPosition}
                </span>
                {player.Liga && (
                  <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
                    {player.Liga}
                  </span>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700/50">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{player.Edad}</p>
                    <p className="text-2xs text-apple-gray-500">años</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{player.Altura || '—'}</p>
                    <p className="text-2xs text-apple-gray-500">cm</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-apple-gray-800 dark:text-white">
                      {player.Pie?.toLowerCase() === 'derecho' || player.Pie?.toLowerCase() === 'right' ? 'Diestro' :
                       player.Pie?.toLowerCase() === 'izquierdo' || player.Pie?.toLowerCase() === 'left' ? 'Zurdo' :
                       player.Pie?.toLowerCase() === 'ambos' || player.Pie?.toLowerCase() === 'both' ? 'Ambos' :
                       player.Pie || '—'}
                    </p>
                    <p className="text-2xs text-apple-gray-500">pie</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Score GG - THE HERO */}
          <div className="card-apple p-6" id="player-score-card">
            <div className="text-center mb-4">
              <h2 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                Score GG
              </h2>
            </div>
            <GaugeScore
              score={player.ggScore}
              size="lg"
              comparisonScore={positionAverageScore}
              comparisonLabel={`Promedio ${posKey || 'posición'}`}
            />
            {subjectiveGroups.length > 0 && (
              <div className="mt-6 pt-5 border-t border-apple-gray-100 dark:border-apple-gray-700/50">
                <h3 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-4 text-center">
                  Evaluación Scout
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {subjectiveGroups.map(group => {
                    const score = group.averageScore
                    const color = score >= 70 ? '#22C55E' : score >= 50 ? '#EAB308' : score >= 30 ? '#F97316' : '#EF4444'
                    const circumference = 2 * Math.PI * 28
                    const progress = (score / 100) * circumference

                    return (
                      <div
                        key={group.tipo}
                        className="flex flex-col items-center"
                      >
                        {/* Circular progress */}
                        <div className="relative w-20 h-20">
                          <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                            {/* Background circle */}
                            <circle
                              cx="32"
                              cy="32"
                              r="28"
                              fill="none"
                              className="stroke-apple-gray-200 dark:stroke-apple-gray-700"
                              strokeWidth="6"
                            />
                            {/* Progress circle */}
                            <circle
                              cx="32"
                              cy="32"
                              r="28"
                              fill="none"
                              stroke={color}
                              strokeWidth="6"
                              strokeLinecap="round"
                              strokeDasharray={`${progress} ${circumference}`}
                              style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
                            />
                          </svg>
                          {/* Score in center */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span
                              className="text-lg font-bold tabular-nums"
                              style={{ color }}
                            >
                              {score}
                            </span>
                          </div>
                        </div>
                        {/* Label */}
                        <p className="text-2xs text-apple-gray-600 dark:text-apple-gray-400 font-medium mt-2 text-center capitalize">
                          {group.tipo}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Quick links & actions */}
          <div className="card-apple p-4 space-y-2">
            {player.Transfermkt && (
              <a
                href={player.Transfermkt}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800/50 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors group"
              >
                <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300">Transfermarkt</span>
                <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
            {monitoringPlayer?.WyscoutVideo && (
              <a
                href={monitoringPlayer.WyscoutVideo}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors group"
              >
                <span className="text-sm text-red-600 dark:text-red-400">Video Wyscout</span>
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </a>
            )}
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-brand-green/10 hover:bg-brand-green/20 transition-colors"
            >
              <span className="text-sm text-brand-green font-medium">
                Exportar PDF
              </span>
              <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>

          {/* Comments - on sidebar */}
          <div className="card-apple p-5">
            <PlayerComments player={player} />
          </div>
        </div>

        {/* Main content area */}
        <div className="lg:col-span-8 space-y-5">
          {/* Tabs */}
          <div className="flex gap-1 bg-apple-gray-100/50 dark:bg-apple-gray-800/50 rounded-xl p-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab}
                data-tab={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-apple whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white shadow-apple dark:shadow-apple-dark'
                    : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="card-apple p-6" id="player-tab-content">

            {/* GENERAL TAB */}
            {activeTab === 'General' && (
              <div className="space-y-6 animate-fade-in" id="tab-content-general">
                {/* Key info cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-apple-gray-800/50 dark:to-apple-gray-800 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700">
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Partidos</p>
                    <p className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums">
                      {player['Partidos jugados'] || '—'}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-apple-gray-800/50 dark:to-apple-gray-800 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700">
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Minutos</p>
                    <p className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums">
                      {player.minutesPlayed?.toLocaleString() || '—'}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-apple-gray-800/50 dark:to-apple-gray-800 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700">
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Valor</p>
                    <p className="text-2xl font-bold text-brand-green tabular-nums">
                      {player.marketValueFormatted || '—'}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-apple-gray-800/50 dark:to-apple-gray-800 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700">
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Contrato</p>
                    <p className={`text-2xl font-bold tabular-nums ${contractColor}`}>
                      {player['Vencimiento contrato']?.slice(-4) || '—'}
                    </p>
                  </div>
                </div>

                {/* Personal info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
                      Información Personal
                    </h3>
                    <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-4">
                      <InfoRow label="Edad" value={player.Edad ? `${player.Edad} años` : null} />
                      <InfoRow label="Nacionalidad" value={player['País de nacimiento']} />
                      <InfoRow label="Altura" value={player.Altura ? `${player.Altura} cm` : null} />
                      <InfoRow label="Pie dominante" value={
                        player.Pie?.toLowerCase() === 'derecho' || player.Pie?.toLowerCase() === 'right' ? 'Diestro' :
                        player.Pie?.toLowerCase() === 'izquierdo' || player.Pie?.toLowerCase() === 'left' ? 'Zurdo' :
                        player.Pie?.toLowerCase() === 'ambos' || player.Pie?.toLowerCase() === 'both' ? 'Ambos' :
                        player.Pie
                      } />
                      <InfoRow label="Posición específica" value={getDisplayPosition(player['Posición específica'])} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
                      Contrato
                    </h3>
                    <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-4">
                      <div className="flex justify-between py-2 border-b border-apple-gray-100 dark:border-apple-gray-700/50">
                        <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Vencimiento</span>
                        <span className={`text-sm font-medium ${contractColor}`}>
                          {player['Vencimiento contrato'] || '—'}
                          {player.monthsRemaining !== null && (
                            <span className="ml-1.5 text-xs font-normal text-apple-gray-400">
                              ({player.monthsRemaining}m)
                            </span>
                          )}
                        </span>
                      </div>
                      <InfoRow label="Valor de mercado" value={player.marketValueFormatted} />
                      {player.Representante && <InfoRow label="Representante" value={player.Representante} />}
                    </div>
                  </div>
                </div>

                {/* What makes this player stand out */}
                <div>
                  <h3 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
                    Resumen Rápido
                  </h3>
                  <div className="bg-gradient-to-br from-brand-green/5 to-emerald-500/5 dark:from-brand-green/10 dark:to-emerald-500/10 rounded-xl p-5 border border-brand-green/10">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-apple-gray-700 dark:text-apple-gray-300 leading-relaxed">
                          <span className="font-semibold text-apple-gray-800 dark:text-white">{player.Jugador}</span>
                          {' '}es un <span className="font-medium">{displayPosition}</span>
                          {' '}de <span className="font-medium">{player.Edad} años</span>
                          {player.Liga && <> que juega en <span className="font-medium">{player.Liga}</span></>}.
                          {player.ggScore !== null && (
                            <> Su Score GG de <span className="font-bold text-brand-green">{player.ggScore.toFixed(1)}</span>
                            {positionAverageScore && player.ggScore > positionAverageScore ? (
                              <> está <span className="text-emerald-600 font-medium">por encima</span> del promedio de su posición</>
                            ) : positionAverageScore && player.ggScore < positionAverageScore ? (
                              <> está por debajo del promedio de su posición</>
                            ) : null}.
                            </>
                          )}
                          {player.contractStatus === 'critical' && (
                            <> <span className="text-orange-500 font-medium">Contrato por vencer pronto.</span></>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* RADAR TAB */}
            {activeTab === 'Radar' && (
              <div className="animate-fade-in" id="tab-content-radar">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                      Radar — {displayPosition}
                    </h3>
                    <p className="text-xs text-apple-gray-400 mt-0.5">
                      Comparando vs {comparisonLeague === 'all' ? 'promedio general' : `promedio de ${comparisonLeague}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
                      Comparar vs:
                    </label>
                    <select
                      value={comparisonLeague}
                      onChange={e => setComparisonLeague(e.target.value)}
                      className="input-apple text-sm py-1.5 px-3 min-w-[160px]"
                    >
                      <option value="all">Todas las ligas</option>
                      {availableLeagues.map(league => (
                        <option key={league} value={league}>{league}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {!posKey ? (
                  <EmptyState title="Posición no reconocida" description="No se puede generar el radar para esta posición." />
                ) : (
                  <PlayerRadarChart
                    player={player}
                    allNormalized={normalized}
                    allPlayers={[...external, ...internal]}
                    comparisonLeague={comparisonLeague}
                    overridePosition={rawPosition}
                  />
                )}

                <div className="mt-4 p-4 bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-lg">
                  <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 leading-relaxed">
                    El gráfico muestra las métricas normalizadas del jugador (0-100) comparadas contra el promedio
                    de jugadores de la misma posición ({posKey})
                    {comparisonLeague !== 'all' ? ` en ${comparisonLeague}` : ' en toda la base de datos'}.
                  </p>
                </div>
              </div>
            )}

            {/* VALOR DE MERCADO TAB */}
            {activeTab === 'Valor' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-valor">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                      Evolución del Valor de Mercado
                    </h3>
                    <p className="text-xs text-apple-gray-400 mt-0.5">
                      Historial según Transfermarkt
                    </p>
                  </div>
                </div>
                <MarketValueChart data={playerMarketValueHistory} playerName={player.Jugador} />
              </div>
            )}

            {/* EVOLUCIÓN TAB */}
            {activeTab === 'Evolución' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-evolution">
                <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-5">
                  Evolución por partido
                </h3>
                {playerJugadorSK ? (
                  <EvolutionChart evolution={evolution} playerSK={playerJugadorSK} />
                ) : (
                  <EmptyState
                    title="Sin datos de evolución"
                    description="No se encontraron datos de evolución para este jugador."
                    icon="search"
                  />
                )}
              </div>
            )}

            {/* MÉTRICAS TAB */}
            {activeTab === 'Métricas' && (
              <div className="animate-fade-in" id="tab-content-metrics">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Métricas Detalladas — {posKey || 'General'}
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Comparado vs jugadores de su posición con +300 minutos
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  {displayMetrics.map((metric, idx) => {
                    const isBasicStat = metric === 'Partidos jugados' || metric === 'Minutos jugados'
                    const percentile = metricPercentiles[metric]

                    if (isBasicStat) {
                      const val = player[metric]
                      const num = typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(',', '.'))
                      return (
                        <div key={metric} className="flex justify-between py-3 border-b border-apple-gray-100 dark:border-apple-gray-800/50">
                          <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">{metric}</span>
                          <span className="text-sm font-semibold text-apple-gray-800 dark:text-white tabular-nums">
                            {isNaN(num) ? '—' : num.toFixed(0)}
                          </span>
                        </div>
                      )
                    }

                    return (
                      <MetricRowWithPercentile
                        key={metric}
                        label={metric}
                        value={player[metric]}
                        percentile={percentile}
                      />
                    )
                  })}
                </div>

                {!posKey && (
                  <p className="mt-4 text-xs text-apple-gray-400">
                    Posición no reconocida para mostrar métricas específicas.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export PDF Modal */}
      <ExportPDFModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExportPdf}
        player={player}
        source={source}
        availableEvolutionCharts={[]}
        selectedEvolutionCharts={[]}
      />
    </div>
  )
}
