import { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import ContractBadge from '@/components/ui/ContractBadge'
import PlayerRadarChart from '@/components/charts/PlayerRadarChart'
import EvolutionChart from '@/components/charts/EvolutionChart'
import MarketValueChart from '@/components/charts/MarketValueChart'
import GaugeScore from '@/components/charts/GaugeScore'
import PositionBar from '@/components/ui/PositionBar'
import ScoreEvolutionChart from '@/components/charts/ScoreEvolutionChart'
import { usePlayerDetail, usePlayerMatchHistory, usePositionAverages, usePositionMetricAverages, useLeagues, useScoreLookup } from '@/hooks/usePlayerStats'
import type { Position } from '@/types/scoring'
import { displayPosition as formatPosition } from '@/types/scoring'
import MetricsRadarChart from '@/components/charts/MetricsRadarChart'
import MetricsBarComparison from '@/components/charts/MetricsBarComparison'
import PositionFieldMap from '@/components/ui/PositionFieldMap'
import GPSTab from '@/components/charts/GPSTab'
import ExportPDFModal, { type PDFTheme } from '@/components/ui/ExportPDFModal'
import { exportPlayerToPdfFull } from '@/utils/pdfExport'
import AddToReportButton from '@/components/pdf/AddToReportButton'
import { normalizeName } from '@/utils/scoring'
import { fuzzyMatch } from '@/lib/search'
import { POSITION_MAP, DISPLAY_POSITION_MAP, DISPLAY_METRICS, RADAR_METRICS, METRIC_ABBREVIATIONS } from '@/constants/scoring'
import { fetchPlayerEvaluations, fetchEvaluationsByName, type ScoutEvaluation } from '@/services/scoutEvaluationService'
import { useApiFootballPlayerId, usePlayerInjuries, usePlayerTransfers } from '@/hooks/usePlayerApiData'
import TrackingWidget from '@/components/tracking/TrackingWidget'
import DobleGWidget from '@/components/agency/DobleGWidget'
import ManualFixturesEditor from '@/components/agency/ManualFixturesEditor'
import BodyMapSVG from '@/components/health/BodyMapSVG'
import ScoutsGGBadge from '@/components/ui/ScoutsGGBadge'
import VideosTab from '@/components/videos/VideosTab'
import type { EnrichedPlayer, SubjectiveMetric } from '@/types'

const SupabasePlayerDetailLazy = lazy(() => import('@/components/players/SupabasePlayerDetail'))

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

// ─── SCORE SCOUT TIMELINE ─────────────────────────────────────────────────────

interface ScoreScoutTimelineProps {
  playerId: string | undefined
  playerName: string
}

function ScoreScoutTimeline({ playerId, playerName }: ScoreScoutTimelineProps) {
  const [evaluations, setEvaluations] = useState<ScoutEvaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    async function loadEvaluations() {
      setLoading(true)
      const allEvals: ScoutEvaluation[] = []
      const seenIds = new Set<string>()

      // Fetch by player ID if provided and not empty
      if (playerId && playerId.trim() !== '') {
        const byId = await fetchPlayerEvaluations(playerId)
        byId.forEach(e => {
          if (!seenIds.has(e.id)) {
            seenIds.add(e.id)
            allEvals.push(e)
          }
        })
      }

      // Also fetch by name (catches evaluations linked by name or not yet linked)
      if (playerName) {
        const byName = await fetchEvaluationsByName(playerName)
        byName.forEach(e => {
          if (!seenIds.has(e.id)) {
            seenIds.add(e.id)
            allEvals.push(e)
          }
        })

        // Also try fetching where player_id equals the player name
        // (this handles the case where external players use name as ID)
        const byNameAsId = await fetchPlayerEvaluations(playerName)
        byNameAsId.forEach(e => {
          if (!seenIds.has(e.id)) {
            seenIds.add(e.id)
            allEvals.push(e)
          }
        })
      }

      // Sort by match date
      allEvals.sort((a, b) => new Date(b.match_date).getTime() - new Date(a.match_date).getTime())

      setEvaluations(allEvals)
      setLoading(false)
    }
    loadEvaluations()
  }, [playerId, playerName])

  if (loading) {
    return (
      <div className="card-apple p-5 animate-pulse space-y-3">
        <div className="h-4 bg-apple-gray-200 dark:bg-apple-gray-700 rounded w-1/3" />
        <div className="h-20 bg-apple-gray-100 dark:bg-apple-gray-800 rounded-xl" />
      </div>
    )
  }

  if (evaluations.length === 0) {
    return null // Don't show section if no evaluations
  }

  // Calculate average score
  const scores = evaluations
    .map(e => e.technical_score) // Using technical_score as the match performance score
    .filter((s): s is number => s !== null)
  const avgScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-brand-green'
    if (score >= 6) return 'text-emerald-500'
    if (score >= 4) return 'text-amber-500'
    return 'text-red-500'
  }

  const getScoreBg = (score: number) => {
    if (score >= 8) return 'bg-brand-green/10 border-brand-green/30'
    if (score >= 6) return 'bg-emerald-500/10 border-emerald-500/30'
    if (score >= 4) return 'bg-amber-500/10 border-amber-500/30'
    return 'bg-red-500/10 border-red-500/30'
  }

  const getRecommendationBadge = (rec: string | null) => {
    switch (rec) {
      case 'fichar':
        return { label: 'Fichar', color: 'bg-brand-green/10 text-brand-green border-brand-green/30' }
      case 'seguir_observando':
        return { label: 'Seguir observando', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30' }
      case 'descartar':
        return { label: 'Descartar', color: 'bg-red-500/10 text-red-500 border-red-500/30' }
      default:
        return null
    }
  }

  const displayEvaluations = expanded ? evaluations : evaluations.slice(0, 3)

  return (
    <div className="card-apple p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
          Score Scout
        </h3>
        {avgScore !== null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-apple-gray-500">Promedio:</span>
            <span className={`text-lg font-bold ${getScoreColor(avgScore)}`}>
              {avgScore.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Average score bar */}
      {avgScore !== null && (
        <div className="relative h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              avgScore >= 8 ? 'bg-brand-green' :
              avgScore >= 6 ? 'bg-emerald-500' :
              avgScore >= 4 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: `${avgScore * 10}%` }}
          />
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-0 bottom-0 w-px bg-apple-gray-200 dark:bg-apple-gray-700" />

        <div className="space-y-3">
          {displayEvaluations.map((evaluation, idx) => {
            const score = evaluation.technical_score
            const recBadge = getRecommendationBadge(evaluation.recommendation)
            const date = new Date(evaluation.match_date)

            return (
              <div key={evaluation.id} className="relative pl-10">
                {/* Timeline dot */}
                <div className={`absolute left-2 top-3 w-4 h-4 rounded-full border-2 ${
                  score ? getScoreBg(score) : 'bg-apple-gray-100 border-apple-gray-300'
                } flex items-center justify-center`}>
                  {score && (
                    <div className={`w-2 h-2 rounded-full ${
                      score >= 8 ? 'bg-brand-green' :
                      score >= 6 ? 'bg-emerald-500' :
                      score >= 4 ? 'bg-amber-500' : 'bg-red-500'
                    }`} />
                  )}
                </div>

                {/* Evaluation card */}
                <div className={`p-3 rounded-xl border transition-all ${
                  score ? getScoreBg(score) : 'bg-apple-gray-50 dark:bg-apple-gray-800/50 border-apple-gray-200 dark:border-apple-gray-700'
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {score && (
                          <span className={`text-lg font-bold ${getScoreColor(score)}`}>
                            {score}
                          </span>
                        )}
                        <span className="text-xs text-apple-gray-500">
                          {date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        {recBadge && (
                          <span className={`text-2xs font-medium px-2 py-0.5 rounded-full border ${recBadge.color}`}>
                            {recBadge.label}
                          </span>
                        )}
                      </div>
                      {(evaluation.competition || evaluation.rival) && (
                        <p className="text-xs text-apple-gray-500 mt-1">
                          {evaluation.competition && <span>{evaluation.competition}</span>}
                          {evaluation.competition && evaluation.rival && <span> vs </span>}
                          {evaluation.rival && <span>{evaluation.rival}</span>}
                        </p>
                      )}
                    </div>
                  </div>

                  {evaluation.notes && (
                    <p className="text-sm text-apple-gray-600 dark:text-apple-gray-400 leading-relaxed">
                      {evaluation.notes}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-2 text-2xs text-apple-gray-400">
                    <span>{evaluation.scout_name}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Show more/less */}
      {evaluations.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-sm text-brand-green hover:text-brand-green/80 font-medium py-2 transition-colors"
        >
          {expanded ? 'Ver menos' : `Ver ${evaluations.length - 3} evaluaciones más`}
        </button>
      )}

      <p className="text-2xs text-apple-gray-400 text-center">
        {evaluations.length} evaluacion{evaluations.length !== 1 ? 'es' : ''} de scouts
      </p>
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
  const navigate = useNavigate()
  const source = (searchParams.get('source') ?? 'externo') as 'externo' | 'interno' | 'seguimiento'
  const apiIdParam = searchParams.get('apiId')
  const overridePosition = searchParams.get('pos')
  const { external, internal, monitoring, normalized, evolution, subjectiveMetrics, marketValueHistory, gpsData, agencyPlayers, loading, error } = useData()
  const [activeTab, setActiveTab] = useState('General')
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [comparisonLeague, setComparisonLeague] = useState<string>('all')
  const [customRadarMetrics, setCustomRadarMetrics] = useState<string[]>([])
  const [showMetricSelector, setShowMetricSelector] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showPlayerSelector, setShowPlayerSelector] = useState(false)
  const [playerSearchQuery, setPlayerSearchQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const playerSelectorRef = useRef<HTMLDivElement>(null)
  const mobileTabsRef = useRef<HTMLDivElement>(null)

  // Centrar la píldora del tab activo en el scroller horizontal de mobile
  // (solo mueve el contenedor, no la página).
  useEffect(() => {
    const c = mobileTabsRef.current
    if (!c) return
    const btn = c.querySelector<HTMLElement>(`[data-mtab="${CSS.escape(activeTab)}"]`)
    if (!btn) return
    const target = btn.offsetLeft - (c.clientWidth - btn.clientWidth) / 2
    c.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [activeTab])

  // Get available players for selector based on source
  const availablePlayers = useMemo(() => {
    if (source === 'interno') {
      return internal.sort((a, b) => a.Jugador.localeCompare(b.Jugador))
    }
    return external.sort((a, b) => a.Jugador.localeCompare(b.Jugador))
  }, [source, internal, external])

  // Filter players by search query
  const filteredPlayers = useMemo(() => {
    if (!playerSearchQuery.trim()) return availablePlayers
    return availablePlayers.filter(p =>
      fuzzyMatch(playerSearchQuery, p.Jugador) ||
      fuzzyMatch(playerSearchQuery, p.Equipo || '') ||
      fuzzyMatch(playerSearchQuery, p['Posición específica'] || '')
    )
  }, [availablePlayers, playerSearchQuery])

  // Close selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (playerSelectorRef.current && !playerSelectorRef.current.contains(event.target as Node)) {
        setShowPlayerSelector(false)
        setPlayerSearchQuery('')
      }
    }
    if (showPlayerSelector) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPlayerSelector])

  // Navigate to a different player
  const handlePlayerSelect = (selectedPlayer: EnrichedPlayer) => {
    const playerId = selectedPlayer.id || encodeURIComponent(selectedPlayer.Jugador)
    navigate(`/jugador/${playerId}?source=${source}`)
    setShowPlayerSelector(false)
    setPlayerSearchQuery('')
  }

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

  // Jugador Doble G sin equipo resoluble → ofrecer carga manual de próximos partidos
  const dgEntry = useMemo(
    () => agencyPlayers.find(a => normalizeName(a.fullName) === normalizeName(player?.Jugador ?? '')),
    [agencyPlayers, player]
  )
  const needsManualFixtures = !!player && !!dgEntry && !dgEntry.apiTeamId

  const { lookup: scoreLookup, ready: scoreLookupReady } = useScoreLookup()
  const { metricAverages } = usePositionMetricAverages()
  const leagues = useLeagues()

  const apiPlayerId = useMemo(() => {
    if (apiIdParam) return parseInt(apiIdParam)
    if (typeof player?.apiFootballId === 'number') return player.apiFootballId
    if (source === 'interno' && player && scoreLookupReady) {
      const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      // Try short name first (e.g. "Luca Orellano")
      const shortKey = normalize(player.Jugador)
      const entry = scoreLookup.get(shortKey)
      if (entry) return entry.player_id
      // Try "Nombre completo" field (e.g. "Juan Paradela")
      const fullName = (player['Nombre completo'] as string) ?? ''
      if (fullName) {
        const fullKey = normalize(fullName)
        const fullEntry = scoreLookup.get(fullKey)
        if (fullEntry) return fullEntry.player_id
      }
      // Fuzzy: abbreviated "J. Ginzo" → match "Juan Martin Ginzo" by initial + last name + team's league
      const parts = player.Jugador.split(/[.\s]+/).filter(Boolean)
      if (parts.length >= 2) {
        const initial = normalize(parts[0])[0]
        const lastName = normalize(parts[parts.length - 1])
        for (const [key, val] of scoreLookup) {
          const keyParts = key.split(' ')
          if (keyParts[keyParts.length - 1] === lastName && key[0] === initial) return val.player_id
        }
      }
    }
    return null
  }, [apiIdParam, player, source, scoreLookup, scoreLookupReady]) as number | null

  const { data: supabaseDetail } = usePlayerDetail(apiPlayerId)
  const { matches: supabaseMatches } = usePlayerMatchHistory(
    apiPlayerId,
    selectedPosition ?? supabaseDetail?.player?.primary_position ?? undefined
  )
  const { averages: positionAverages } = usePositionAverages()
  const { apiPlayerId: resolvedApiId } = useApiFootballPlayerId(
    source === 'interno' ? player?.Jugador ?? null : null,
    apiPlayerId,
  )
  const effectiveApiId = apiPlayerId ?? resolvedApiId
  const { injuries: playerInjuries, loading: injuriesLoading } = usePlayerInjuries(effectiveApiId)
  const { transfers: playerTransfers, loading: transfersLoading } = usePlayerTransfers(effectiveApiId)

  const supabaseAvgScore = useMemo(() => {
    if (!supabaseDetail) return null
    const pos = selectedPosition ?? supabaseDetail.player.primary_position
    const score = supabaseDetail.allSeasonScores.find(s => s.position === pos)
    return score?.avg_score ?? null
  }, [supabaseDetail, selectedPosition])

  const supabasePosAverage = useMemo(() => {
    if (!supabaseDetail || !positionAverages.length) return null
    const pos = selectedPosition ?? supabaseDetail.player.primary_position
    const leagueId = supabaseDetail.player.team?.league_id
    if (!pos || !leagueId) return null
    const avg = positionAverages.find(a => a.position === pos && a.league_id === leagueId)
    return avg?.avg_score ?? null
  }, [supabaseDetail, selectedPosition, positionAverages])

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

  // Filter GPS data for the current player
  const playerGpsData = useMemo(() => {
    if (!player || source !== 'interno') return []
    const playerNameNorm = normalizeName(player.Jugador)
    return gpsData.filter(entry => {
      const entryNameNorm = normalizeName(entry.Jugador)
      // Match by exact name or partial name (handle abbreviated names)
      if (entryNameNorm === playerNameNorm) return true
      // Try matching by last name if one is abbreviated
      const playerParts = playerNameNorm.split(' ')
      const entryParts = entryNameNorm.split(' ')
      const playerLast = playerParts[playerParts.length - 1]
      const entryLast = entryParts[entryParts.length - 1]
      if (playerLast === entryLast && playerParts.length > 0 && entryParts.length > 0) {
        // Check if first initial matches
        const playerInit = playerParts[0]?.[0] ?? ''
        const entryInit = entryParts[0]?.[0] ?? ''
        return playerInit === entryInit
      }
      return false
    })
  }, [player, source, gpsData])

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

  // Ligas con promedios cargados
  const LEAGUES_WITH_AVERAGES = [
    'Argentina', '2° Argentina', 'B Metro',
    'Ecuador', 'Paraguay', 'Chile', '2° Chile',
    'Uruguay', 'Brasil', 'Liga MX',
    'Colombia', '2° Colombia'
  ]

  const availableLeagues = useMemo(() => {
    const allPlayers = [...external, ...internal]
    const leagueSet = new Set<string>()
    for (const p of allPlayers) {
      if (p.Liga && LEAGUES_WITH_AVERAGES.some(l =>
        l.toLowerCase() === p.Liga?.toLowerCase() ||
        p.Liga?.toLowerCase().includes(l.toLowerCase())
      )) {
        leagueSet.add(p.Liga)
      }
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

  // Tab configuration with icons
  const tabsConfig = [
    { id: 'General', label: 'General', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', internal: false },
    { id: 'Métricas', label: 'Métricas', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', internal: false },
    { id: 'Valor', label: 'Valor', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', internal: true },
    { id: 'Rendimiento evolutivo', label: 'Rendimiento', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', internal: true },
    { id: 'Físico', label: 'Físico', icon: 'M13 10V3L4 14h7v7l9-11h-7z', internal: true },
    { id: 'Salud', label: 'Salud', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', internal: true },
    { id: 'Fisioterapia', label: 'Fisioterapia', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', internal: true },
    { id: 'Nutrición', label: 'Nutrición', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', internal: true },
    { id: 'Neurociencia', label: 'Neurociencia', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', internal: true },
    { id: 'Psicología', label: 'Psicología', icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', internal: true },
    { id: 'Coaching', label: 'Coaching', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', internal: true },
    { id: 'Videos', label: 'Videos', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z', internal: true },
  ]

  // Filter tabs based on source
  const tabs = source === 'interno'
    ? tabsConfig
    : tabsConfig.filter(t => !t.internal)

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
  const handleExportPdf = async (sections: string[], theme: PDFTheme) => {
    if (!player) return

    await exportPlayerToPdfFull({
      player,
      source,
      sections,
      theme,
      positionAverageScore,
      subjectiveGroups,
      marketValueHistory: playerMarketValueHistory,
      metricPercentiles,
      radarData: computeRadarData,
    })
  }

  if (loading) return <LoadingSpinner fullScreen message="Cargando ficha del jugador..." />
  if (error) return <EmptyState title="Error" description={error} icon="error" />
  if (apiIdParam && source === 'externo') {
    return (
      <Suspense fallback={<LoadingSpinner fullScreen message="Cargando ficha del jugador..." />}>
        <SupabasePlayerDetailLazy />
      </Suspense>
    )
  }
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
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 animate-fade-in" id="player-detail-container" ref={contentRef}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400 mb-5">
        <Link
          to={source === 'interno' ? '/interno' : source === 'seguimiento' ? '/seguimiento-datos' : '/'}
          className="hover:text-brand-green transition-colors"
        >
          {source === 'interno' ? 'Scout Interno' : source === 'seguimiento' ? 'Seguimiento' : 'Scout Externo'}
        </Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-apple-gray-800 dark:text-white font-medium">{player.Jugador}</span>
      </nav>

      {/* Navegación de tabs — mobile (píldoras, sticky bajo el navbar) */}
      <div className="md:hidden sticky top-14 z-20 -mx-4 sm:-mx-6 mb-4 px-4 sm:px-6 py-2.5 bg-apple-gray-50/95 dark:bg-apple-gray-900/95 backdrop-blur-md border-b border-apple-gray-200/60 dark:border-apple-gray-800/60">
        <div
          ref={mobileTabsRef}
          className="flex gap-1.5 overflow-x-auto scroll-smooth scrollbar-thin [-webkit-overflow-scrolling:touch]"
        >
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                data-mtab={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-brand-green text-white shadow-sm'
                    : 'bg-white dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
                }`}
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                </svg>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main content layout: rail izquierdo + columna derecha */}
      <div className="flex flex-col md:flex-row gap-4 lg:gap-6">
        {/* RAIL - navegación de tabs (full-height). En mobile se reemplaza por la
            barra de píldoras sticky de arriba + el bloque de acciones del pie. */}
        <aside className="hidden md:block shrink-0 md:w-14 xl:w-52 md:order-first">
          <div className="md:sticky md:top-4 flex flex-col gap-3">
            <nav className="bg-white dark:bg-apple-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark p-1.5 xl:p-2 flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible">
              {tabs.map((tab, index) => {
                const isActive = activeTab === tab.id
                const showSeparator = tab.id === 'Salud'

                return (
                  <div key={tab.id} className="flex-shrink-0">
                    {showSeparator && (
                      <div className="hidden md:block my-2 mx-2 border-t border-apple-gray-100 dark:border-apple-gray-700" />
                    )}
                    <button
                      data-tab={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative w-full flex items-center gap-2.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-left transition-all duration-200 group ${
                        isActive
                          ? 'bg-brand-green text-white shadow-sm'
                          : 'text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
                      }`}
                    >
                      <svg
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-white' : 'text-apple-gray-400 group-hover:text-apple-gray-600 dark:group-hover:text-apple-gray-300'
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                      </svg>
                      <span className="text-xs font-medium hidden xl:inline whitespace-nowrap">{tab.label}</span>
                      <span className="text-2xs font-medium md:hidden whitespace-nowrap">{tab.label}</span>
                      {/* Tooltip for medium screens without labels */}
                      <span className="absolute left-full ml-2 px-2 py-1 bg-apple-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 xl:hidden hidden md:block whitespace-nowrap z-50 pointer-events-none">
                        {tab.label}
                      </span>
                    </button>
                  </div>
                )
              })}
            </nav>
            {/* Acciones al pie del rail */}
            <div className="bg-white dark:bg-apple-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark p-1.5 xl:p-2 flex md:flex-col gap-1 mt-auto overflow-x-auto">
              {player.Transfermkt && (
                <a
                  href={player.Transfermkt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative w-full flex items-center gap-2.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-left transition-all duration-200 group text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 hover:text-apple-gray-700 dark:hover:text-apple-gray-200"
                >
                  <svg className="w-4 h-4 shrink-0 transition-colors text-apple-gray-400 group-hover:text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span className="hidden xl:inline text-xs font-medium whitespace-nowrap">Transfermarkt</span>
                  <span className="text-2xs font-medium md:hidden whitespace-nowrap">Transfermarkt</span>
                  <span className="absolute left-full ml-2 px-2 py-1 bg-apple-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 xl:hidden hidden md:block whitespace-nowrap z-50 pointer-events-none">
                    Transfermarkt
                  </span>
                </a>
              )}
              {monitoringPlayer?.WyscoutVideo && (
                <a
                  href={monitoringPlayer.WyscoutVideo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative w-full flex items-center gap-2.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-left transition-all duration-200 group text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 hover:text-apple-gray-700 dark:hover:text-apple-gray-200"
                >
                  <svg className="w-4 h-4 shrink-0 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="hidden xl:inline text-xs font-medium whitespace-nowrap">Video Wyscout</span>
                  <span className="text-2xs font-medium md:hidden whitespace-nowrap">Video Wyscout</span>
                  <span className="absolute left-full ml-2 px-2 py-1 bg-apple-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 xl:hidden hidden md:block whitespace-nowrap z-50 pointer-events-none">
                    Video Wyscout
                  </span>
                </a>
              )}
              <AddToReportButton
                type="player-card"
                title={`Ficha: ${player.Jugador}`}
                description={`${player.Equipo} - ${player['Posición'] || player['Posicion']} - ${player.ageNum} años`}
                captureId="player-detail-container"
                source={source === 'interno' ? 'Scout Interno' : 'Scout Externo'}
                variant="rail"
                players={[player.Jugador]}
              />
              <button
                onClick={() => setShowExportModal(true)}
                className="relative w-full flex items-center gap-2.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-left transition-all duration-200 group text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 hover:text-apple-gray-700 dark:hover:text-apple-gray-200"
              >
                <svg className="w-4 h-4 shrink-0 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden xl:inline text-xs font-medium whitespace-nowrap">Exportar PDF</span>
                <span className="text-2xs font-medium md:hidden whitespace-nowrap">Exportar PDF</span>
                <span className="absolute left-full ml-2 px-2 py-1 bg-apple-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 xl:hidden hidden md:block whitespace-nowrap z-50 pointer-events-none">
                  Exportar PDF
                </span>
              </button>
              <button
                onClick={() => setShowComments(true)}
                className="relative w-full flex items-center gap-2.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-left transition-all duration-200 group text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 hover:text-apple-gray-700 dark:hover:text-apple-gray-200"
                aria-label="Comentarios"
              >
                <svg className="w-4 h-4 shrink-0 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="hidden xl:inline text-xs font-medium whitespace-nowrap">Comentarios</span>
                <span className="text-2xs font-medium md:hidden whitespace-nowrap">Comentarios</span>
                <span className="absolute left-full ml-2 px-2 py-1 bg-apple-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 xl:hidden hidden md:block whitespace-nowrap z-50 pointer-events-none">Comentarios</span>
              </button>
              <div className="hidden xl:block w-full pt-1 mt-1 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <DobleGWidget player={player} apiPlayerId={apiIdParam ? Number(apiIdParam) : null} />
                {source !== 'interno' && (
                  <TrackingWidget
                    playerName={player.Jugador}
                    playerDbId={player.id || null}
                    playerClub={player.Equipo || undefined}
                    playerPosition={player['Posición'] || undefined}
                  />
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* COLUMNA DERECHA */}
        <div className="flex-1 min-w-0 space-y-4 lg:space-y-6 order-first md:order-last">
          {/* HERO: perfil + Score GG */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 lg:gap-6 items-start">
          <div className="space-y-4 lg:space-y-6">
          <div className="card-apple" id="player-header-card">
            {/* Header with gradient, pattern and logo */}
            <div className="relative h-28 overflow-hidden rounded-t-apple-xl">
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
                <div className="relative" ref={playerSelectorRef}>
                  <button
                    onClick={() => setShowPlayerSelector(!showPlayerSelector)}
                    className="group flex items-center gap-1.5 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 -ml-2 px-2 py-1 rounded-lg transition-colors"
                  >
                    <h1 className="text-xl font-bold text-apple-gray-800 dark:text-white tracking-tight flex items-center gap-2">
                      {player.Jugador}
                      <ScoutsGGBadge playerName={player.Jugador} variant="pill" />
                    </h1>
                    <svg
                      className={`w-4 h-4 text-apple-gray-400 group-hover:text-apple-gray-600 dark:group-hover:text-apple-gray-300 transition-transform ${showPlayerSelector ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
                    {player.Equipo || '—'}
                  </p>

                  {/* Player Selector Dropdown */}
                  {showPlayerSelector && (
                    <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-apple-gray-800 rounded-xl shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 z-50 overflow-hidden">
                      {/* Search input */}
                      <div className="p-2 border-b border-apple-gray-100 dark:border-apple-gray-700">
                        <div className="relative">
                          <svg
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <input
                            type="text"
                            placeholder="Buscar jugador..."
                            value={playerSearchQuery}
                            onChange={(e) => setPlayerSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-700 border-none rounded-lg focus:ring-2 focus:ring-brand-green/50 text-apple-gray-800 dark:text-white placeholder-apple-gray-400"
                            autoFocus
                          />
                        </div>
                      </div>

                      {/* Player list */}
                      <div className="max-h-64 overflow-y-auto">
                        {filteredPlayers.length === 0 ? (
                          <p className="p-4 text-sm text-apple-gray-500 text-center">
                            No se encontraron jugadores
                          </p>
                        ) : (
                          filteredPlayers.map((p) => {
                            const isCurrentPlayer = p.Jugador === player.Jugador
                            return (
                              <button
                                key={p.id || p.Jugador}
                                onClick={() => !isCurrentPlayer && handlePlayerSelect(p)}
                                disabled={isCurrentPlayer}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                                  isCurrentPlayer
                                    ? 'bg-brand-green/10 cursor-default'
                                    : 'hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50'
                                }`}
                              >
                                {/* Mini avatar */}
                                {p.Imagen ? (
                                  <img
                                    src={p.Imagen}
                                    alt=""
                                    className="w-8 h-8 rounded-lg object-cover bg-apple-gray-100 dark:bg-apple-gray-700"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                                    <span className="text-xs font-medium text-apple-gray-500">
                                      {p.Jugador.split(' ').map(w => w[0]).slice(0, 2).join('')}
                                    </span>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium truncate ${
                                    isCurrentPlayer ? 'text-brand-green' : 'text-apple-gray-800 dark:text-white'
                                  }`}>
                                    {p.Jugador}
                                  </p>
                                  <p className="text-xs text-apple-gray-500 truncate">
                                    {p.Equipo || '—'} · {p['Posición específica'] || p.Posición || '—'}
                                  </p>
                                </div>
                                {isCurrentPlayer && (
                                  <svg className="w-4 h-4 text-brand-green shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>

                      {/* Footer with count */}
                      <div className="px-3 py-2 border-t border-apple-gray-100 dark:border-apple-gray-700 bg-apple-gray-50/50 dark:bg-apple-gray-800/50">
                        <p className="text-xs text-apple-gray-400">
                          {filteredPlayers.length} de {availablePlayers.length} jugadores
                        </p>
                      </div>
                    </div>
                  )}
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
          {supabaseDetail?.player?.position_distribution && Object.keys(supabaseDetail.player.position_distribution).length > 0 && (
            <div className="card-apple p-4">
              <PositionBar
                distribution={supabaseDetail.player.position_distribution}
                selectedPosition={selectedPosition ?? supabaseDetail.player.primary_position}
                onSelectPosition={setSelectedPosition}
              />
            </div>
          )}
          </div>{/* end left column wrapper */}

          {/* Score — uses Supabase when available, falls back to GG */}
          <div className="card-apple p-6" id="player-score-card">
            <div className="text-center mb-4">
              <h2 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                Score GG
              </h2>
              {supabaseDetail?.player?.primary_position && supabaseAvgScore != null && (
                <p className="text-2xs text-apple-gray-400 mt-1">
                  {formatPosition(supabaseDetail.player.primary_position)} · {supabaseDetail.allSeasonScores.find(s => s.position === (selectedPosition ?? supabaseDetail.player.primary_position))?.matches_played ?? 0} partidos
                </p>
              )}
            </div>
            <GaugeScore
              score={supabaseAvgScore ?? player.ggScore}
              size="lg"
              scale={supabaseAvgScore != null ? '10' : '100'}
              comparisonScore={supabaseAvgScore != null ? supabasePosAverage : positionAverageScore}
              comparisonLabel={`Promedio ${formatPosition(supabaseDetail?.player?.primary_position) || posKey || 'posición'}`}
            />
            {(() => {
              const activePos = selectedPosition ?? supabaseDetail?.player?.primary_position
              const activeSeasonScore = supabaseDetail?.allSeasonScores?.find(s => s.position === activePos)
              if (!supabaseDetail || !activeSeasonScore) return null
              const scores = (supabaseDetail.allSeasonScores ?? [])
                .filter(s => s.avg_score != null)
                .sort((a, b) => b.matches_played - a.matches_played)
              return (
                <div className="mt-4 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700 space-y-3">
                  <h3 className="text-2xs font-semibold text-apple-gray-400 dark:text-apple-gray-500 uppercase tracking-wider">Sobre el Score GG</h3>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-sm font-bold text-apple-gray-800 dark:text-white">{activeSeasonScore.avg_rating != null ? activeSeasonScore.avg_rating.toFixed(2) : '—'}</p>
                      <p className="text-2xs text-apple-gray-400">Rating</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-apple-gray-800 dark:text-white">{activeSeasonScore.matches_played}</p>
                      <p className="text-2xs text-apple-gray-400">PJ</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-apple-gray-800 dark:text-white">{activeSeasonScore.total_goals}</p>
                      <p className="text-2xs text-apple-gray-400">Goles</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-apple-gray-800 dark:text-white">{activeSeasonScore.total_assists}</p>
                      <p className="text-2xs text-apple-gray-400">Asist</p>
                    </div>
                  </div>
                  {activeSeasonScore.percentile != null && (
                    <p className="text-2xs text-center text-apple-gray-500 dark:text-apple-gray-400">
                      Top {Math.round(100 - activeSeasonScore.percentile)}% en su posición
                    </p>
                  )}
                  {scores.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-2xs font-medium text-apple-gray-400 uppercase tracking-wider">Score por posición</p>
                      {scores.map(s => (
                        <div key={s.position} className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg ${s.position === activePos ? 'bg-brand-green/10 dark:bg-brand-green/15' : 'bg-apple-gray-50 dark:bg-apple-gray-800/50'}`}>
                          <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">{s.position}</span>
                          <span className="text-apple-gray-500 dark:text-apple-gray-400">{s.avg_score != null ? s.avg_score.toFixed(1) : '—'} · {s.matches_played} PJ</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
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
          </div>{/* end hero grid */}

          <div className="flex-1 card-apple p-6 min-w-0" id="player-tab-content">

            {/* GENERAL TAB */}
            {activeTab === 'General' && (
              <div className="space-y-6 animate-fade-in" id="tab-content-general">
                <ScoreScoutTimeline playerId={player.id || player.Jugador} playerName={player.Jugador} />
                {/* Key info cards — use Supabase match stats when available */}
                {(() => {
                  const activeSeasonScore = supabaseDetail?.allSeasonScores.find(s => s.position === (selectedPosition ?? supabaseDetail?.player?.primary_position))
                  const totalGoals = activeSeasonScore?.total_goals ?? null
                  const totalAssists = activeSeasonScore?.total_assists ?? null
                  const matchesPlayed = activeSeasonScore?.matches_played ?? null

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-apple-gray-800/50 dark:to-apple-gray-800 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700">
                        <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Partidos</p>
                        <p className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums">
                          {matchesPlayed ?? player['Partidos jugados'] ?? '—'}
                        </p>
                        {matchesPlayed != null && <p className="text-2xs text-apple-gray-400 mt-0.5">temporada actual</p>}
                      </div>
                      <div className="bg-gradient-to-br from-apple-gray-50 to-white dark:from-apple-gray-800/50 dark:to-apple-gray-800 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700">
                        {totalGoals != null ? (
                          <>
                            <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Goles / Asist</p>
                            <p className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums">
                              {totalGoals} / {totalAssists ?? 0}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Minutos</p>
                            <p className="text-2xl font-bold text-apple-gray-800 dark:text-white tabular-nums">
                              {player.minutesPlayed?.toLocaleString() || '—'}
                            </p>
                          </>
                        )}
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
                  )
                })()}

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
                          {supabaseAvgScore != null ? (
                            <> Su Score GG de <span className="font-bold text-brand-green">{supabaseAvgScore.toFixed(1)}</span>/10
                            {supabasePosAverage && supabaseAvgScore > supabasePosAverage ? (
                              <> está <span className="text-emerald-600 font-medium">por encima</span> del promedio de su posición ({supabasePosAverage.toFixed(1)})</>
                            ) : supabasePosAverage && supabaseAvgScore < supabasePosAverage ? (
                              <> está por debajo del promedio de su posición ({supabasePosAverage.toFixed(1)})</>
                            ) : null}.
                            {supabaseMatches.length > 0 && (
                              <> Basado en <span className="font-medium">{supabaseMatches.length} partidos</span> analizados.</>
                            )}
                            </>
                          ) : player.ggScore !== null ? (
                            <> Su Score GG de <span className="font-bold text-brand-green">{player.ggScore.toFixed(1)}</span>
                            {positionAverageScore && player.ggScore > positionAverageScore ? (
                              <> está <span className="text-emerald-600 font-medium">por encima</span> del promedio de su posición</>
                            ) : positionAverageScore && player.ggScore < positionAverageScore ? (
                              <> está por debajo del promedio de su posición</>
                            ) : null}.
                            </>
                          ) : null}
                          {player.contractStatus === 'critical' && (
                            <> <span className="text-orange-500 font-medium">Contrato por vencer pronto.</span></>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Posición en el campo */}
                <div>
                  <h3 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
                    Posición en el Campo
                  </h3>
                  {(() => {
                    // Determinar si es lado derecho o izquierdo basándose en la posición específica
                    const posLower = rawPosition.toLowerCase()
                    const isRightSide = posLower.includes('rb') || posLower.includes('rcb') || posLower.includes('rw') || posLower.includes('rwf') || posLower.includes('rmf') || posLower.includes('derecho') || posLower.includes('right')
                    const isLeftSide = posLower.includes('lb') || posLower.includes('lcb') || posLower.includes('lw') || posLower.includes('lwf') || posLower.includes('lmf') || posLower.includes('izquierdo') || posLower.includes('left')
                    // Si no se especifica lado, mostrar ambos para posiciones de banda
                    const showBothSides = !isRightSide && !isLeftSide

                    return (
                      <div className="bg-apple-gray-100 dark:bg-apple-gray-800/50 rounded-xl p-5 flex justify-center">
                        <svg viewBox="0 0 380 260" className="w-full max-w-md h-auto">
                          <defs>
                            <linearGradient id="zoneGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#22C55E" stopOpacity="0.25"/>
                              <stop offset="100%" stopColor="#22C55E" stopOpacity="0.08"/>
                            </linearGradient>
                          </defs>

                          {/* Campo - fondo */}
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

                          {/* === ZONAS POR POSICIÓN === */}

                          {/* Defensor Central */}
                          {posKey === 'Defensor Central' && (
                            <rect x="55" y="70" width="70" height="120" rx="16" fill="url(#zoneGradient)"/>
                          )}

                          {/* Lateral - solo el lado correspondiente */}
                          {posKey === 'Lateral' && (
                            <>
                              {(showBothSides || isLeftSide) && (
                                <rect x="40" y="18" width="110" height="55" rx="14" fill="url(#zoneGradient)"/>
                              )}
                              {(showBothSides || isRightSide) && (
                                <rect x="40" y="187" width="110" height="55" rx="14" fill="url(#zoneGradient)"/>
                              )}
                            </>
                          )}

                          {/* Volante central */}
                          {posKey === 'Volante central' && (
                            <rect x="95" y="65" width="105" height="130" rx="18" fill="url(#zoneGradient)"/>
                          )}

                          {/* Volante interno - zona más amplia hacia adelante */}
                          {posKey === 'Volante interno' && (
                            <rect x="155" y="55" width="115" height="150" rx="20" fill="url(#zoneGradient)"/>
                          )}

                          {/* Extremo - solo el lado correspondiente */}
                          {posKey === 'Extremo' && (
                            <>
                              {(showBothSides || isLeftSide) && (
                                <rect x="220" y="18" width="120" height="60" rx="14" fill="url(#zoneGradient)"/>
                              )}
                              {(showBothSides || isRightSide) && (
                                <rect x="220" y="182" width="120" height="60" rx="14" fill="url(#zoneGradient)"/>
                              )}
                            </>
                          )}

                          {/* Delantero */}
                          {posKey === 'Delantero' && (
                            <rect x="265" y="60" width="85" height="140" rx="18" fill="url(#zoneGradient)"/>
                          )}
                        </svg>
                      </div>
                    )
                  })()}
                  <p className="text-center text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">{displayPosition}</p>
                </div>

                {/* Score Evolution Chart - prominent when Supabase data available */}
                {supabaseMatches.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-3">
                      Evolución del Score
                    </h3>

                    {/* Season stats bar */}
                    {(() => {
                      const activeSeasonScore = supabaseDetail?.allSeasonScores.find(s => s.position === (selectedPosition ?? supabaseDetail?.player?.primary_position))
                      if (!activeSeasonScore) return null
                      return (
                        <div className="flex flex-wrap gap-4 mb-4 p-3 bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl">
                          <div className="text-center">
                            <p className="text-lg font-bold text-brand-green">{activeSeasonScore.avg_score?.toFixed(1)}</p>
                            <p className="text-2xs text-apple-gray-400">Score</p>
                          </div>
                          {activeSeasonScore.avg_rating && (
                            <div className="text-center">
                              <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{activeSeasonScore.avg_rating.toFixed(1)}</p>
                              <p className="text-2xs text-apple-gray-400">Rating</p>
                            </div>
                          )}
                          <div className="text-center">
                            <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{activeSeasonScore.matches_played}</p>
                            <p className="text-2xs text-apple-gray-400">Partidos</p>
                          </div>
                          {activeSeasonScore.total_goals != null && (
                            <div className="text-center">
                              <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{activeSeasonScore.total_goals}</p>
                              <p className="text-2xs text-apple-gray-400">Goles</p>
                            </div>
                          )}
                          {activeSeasonScore.total_assists != null && (
                            <div className="text-center">
                              <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{activeSeasonScore.total_assists}</p>
                              <p className="text-2xs text-apple-gray-400">Asistencias</p>
                            </div>
                          )}
                          {activeSeasonScore.percentile != null && (
                            <div className="text-center">
                              <p className="text-lg font-bold text-emerald-500">Top {(100 - activeSeasonScore.percentile).toFixed(0)}%</p>
                              <p className="text-2xs text-apple-gray-400">Percentil</p>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    <ScoreEvolutionChart
                      matches={supabaseMatches}
                      avgScore={supabaseAvgScore}
                    />
                  </div>
                )}

                {/* Preview de secciones - Solo para jugadores internos */}
                {source === 'interno' && (
                  <div className="mt-8">
                    <h3 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                      Vista Rápida
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Preview Métricas */}
                      <button
                        onClick={() => setActiveTab('Métricas')}
                        className="group bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700 hover:border-brand-green dark:hover:border-brand-green transition-all hover:shadow-lg text-left"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Métricas</span>
                          <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        {supabaseMatches.length > 0 ? (
                          <div className="space-y-2">
                            {(() => {
                              const avgRating = supabaseMatches.reduce((s, m) => s + (m.rating ?? 0), 0) / supabaseMatches.filter(m => m.rating).length
                              const avgPass = supabaseMatches.reduce((s, m) => s + ((m as any).passes_accuracy ?? 0), 0) / supabaseMatches.filter(m => (m as any).passes_accuracy).length
                              return (
                                <>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-apple-gray-500 dark:text-apple-gray-400">Rating</span>
                                    <span className="font-semibold text-apple-gray-800 dark:text-white tabular-nums">{isNaN(avgRating) ? '—' : avgRating.toFixed(1)}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-apple-gray-500 dark:text-apple-gray-400">Score</span>
                                    <span className="font-semibold text-brand-green tabular-nums">{supabaseAvgScore?.toFixed(1) ?? '—'}</span>
                                  </div>
                                  <div className="flex justify-between text-sm">
                                    <span className="text-apple-gray-500 dark:text-apple-gray-400">Pases %</span>
                                    <span className="font-semibold text-apple-gray-800 dark:text-white tabular-nums">{isNaN(avgPass) ? '—' : avgPass.toFixed(0) + '%'}</span>
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        ) : (
                        <div className="space-y-2">
                          {(DISPLAY_METRICS[posKey] ?? DISPLAY_METRICS['_default']).slice(2, 5).map((metric: string) => {
                            const val = player[metric]
                            const num = typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(',', '.'))
                            return (
                              <div key={metric} className="flex justify-between text-sm">
                                <span className="text-apple-gray-500 dark:text-apple-gray-400 truncate mr-2">{METRIC_ABBREVIATIONS[metric] || metric.replace('/90', '').substring(0, 18)}</span>
                                <span className="font-semibold text-apple-gray-800 dark:text-white tabular-nums">
                                  {isNaN(num) ? '—' : num.toFixed(metric.includes('%') ? 0 : 2)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        )}
                        <p className="text-2xs text-brand-green mt-3 group-hover:underline">Ver radar completo →</p>
                      </button>

                      {/* Preview Valor de Mercado */}
                      <button
                        onClick={() => setActiveTab('Valor')}
                        className="group bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700 hover:border-brand-green dark:hover:border-brand-green transition-all hover:shadow-lg text-left"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Valor</span>
                          <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <div className="text-center py-2">
                          <p className="text-3xl font-bold text-brand-green">{player.marketValueFormatted || '—'}</p>
                          <p className="text-xs text-apple-gray-400 mt-1">Valor de mercado actual</p>
                          {playerMarketValueHistory.length > 1 && (
                            <p className="text-xs text-apple-gray-500 mt-2">
                              {playerMarketValueHistory.length} registros históricos
                            </p>
                          )}
                        </div>
                        <p className="text-2xs text-brand-green mt-2 group-hover:underline">Ver evolución →</p>
                      </button>

                      {/* Preview Físico/GPS */}
                      <button
                        onClick={() => setActiveTab('Físico')}
                        className="group bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700 hover:border-brand-green dark:hover:border-brand-green transition-all hover:shadow-lg text-left"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Físico / GPS</span>
                          <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        {playerGpsData.length > 0 ? (() => {
                          const lastGps = playerGpsData[playerGpsData.length - 1]
                          const fechaStr = lastGps?.Fecha instanceof Date
                            ? lastGps.Fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                            : '—'
                          return (
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-apple-gray-500 dark:text-apple-gray-400">Último partido</span>
                                <span className="font-medium text-apple-gray-800 dark:text-white">{fechaStr}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-apple-gray-500 dark:text-apple-gray-400">Distancia</span>
                                <span className="font-semibold text-apple-gray-800 dark:text-white tabular-nums">
                                  {lastGps?.Distancia?.toLocaleString() || '—'} m
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-apple-gray-500 dark:text-apple-gray-400">Vel. máxima</span>
                                <span className="font-semibold text-apple-gray-800 dark:text-white tabular-nums">
                                  {lastGps?.VelMax?.toFixed(1) || '—'} km/h
                                </span>
                              </div>
                            </div>
                          )
                        })() : (
                          <div className="text-center py-3">
                            <p className="text-sm text-apple-gray-400">Sin datos GPS</p>
                          </div>
                        )}
                        <p className="text-2xs text-brand-green mt-3 group-hover:underline">Ver métricas físicas →</p>
                      </button>

                      {/* Preview Evolución */}
                      <button
                        onClick={() => setActiveTab('Rendimiento evolutivo')}
                        className="group bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700 hover:border-brand-green dark:hover:border-brand-green transition-all hover:shadow-lg text-left"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Rendimiento</span>
                          <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <div className="text-center py-2">
                          {supabaseAvgScore != null ? (
                            <>
                              <p className="text-3xl font-bold text-brand-green">{supabaseAvgScore.toFixed(1)}<span className="text-lg text-apple-gray-400">/10</span></p>
                              <p className="text-xs text-apple-gray-400 mt-1">Score · {supabaseMatches.length} partidos</p>
                              {supabasePosAverage && (
                                <p className={`text-xs mt-2 font-medium ${supabaseAvgScore >= supabasePosAverage ? 'text-emerald-500' : 'text-orange-500'}`}>
                                  {supabaseAvgScore >= supabasePosAverage ? '↑' : '↓'} {Math.abs(supabaseAvgScore - supabasePosAverage).toFixed(1)} vs promedio
                                </p>
                              )}
                            </>
                          ) : player.ggScore !== null ? (
                            <>
                              <p className="text-3xl font-bold text-apple-gray-800 dark:text-white">{player.ggScore.toFixed(1)}</p>
                              <p className="text-xs text-apple-gray-400 mt-1">Score GG actual</p>
                              {positionAverageScore && (
                                <p className={`text-xs mt-2 font-medium ${player.ggScore >= positionAverageScore ? 'text-emerald-500' : 'text-orange-500'}`}>
                                  {player.ggScore >= positionAverageScore ? '↑' : '↓'} {Math.abs(player.ggScore - positionAverageScore).toFixed(1)} vs promedio
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-apple-gray-400">Sin datos de evolución</p>
                          )}
                        </div>
                        <p className="text-2xs text-brand-green mt-2 group-hover:underline">Ver evolución por partido →</p>
                      </button>

                      {/* Preview Salud */}
                      <button
                        onClick={() => setActiveTab('Salud')}
                        className="group bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700 hover:border-brand-green dark:hover:border-brand-green transition-all hover:shadow-lg text-left"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Salud</span>
                          <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <div className="text-center py-2">
                          <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-sm font-medium text-green-600 dark:text-green-400">Sin lesiones activas</p>
                        </div>
                        <p className="text-2xs text-brand-green mt-2 group-hover:underline">Ver historial de salud →</p>
                      </button>

                      {/* Preview Coaching */}
                      <button
                        onClick={() => setActiveTab('Coaching')}
                        className="group bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 border border-apple-gray-100 dark:border-apple-gray-700 hover:border-brand-green dark:hover:border-brand-green transition-all hover:shadow-lg text-left"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">Coaching</span>
                          <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                        <div className="text-center py-2">
                          <div className="flex justify-center gap-4 mb-2">
                            <div>
                              <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">0</p>
                              <p className="text-2xs text-apple-gray-400">Sesiones</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">0</p>
                              <p className="text-2xs text-apple-gray-400">Objetivos</p>
                            </div>
                          </div>
                        </div>
                        <p className="text-2xs text-brand-green mt-2 group-hover:underline">Ver plan de desarrollo →</p>
                      </button>
                    </div>
                  </div>
                )}
                <div className="xl:hidden card-apple p-4 space-y-2">
                  <DobleGWidget player={player} apiPlayerId={apiIdParam ? Number(apiIdParam) : null} />
                  {source !== 'interno' && (
                    <TrackingWidget
                      playerName={player.Jugador}
                      playerDbId={player.id || null}
                      playerClub={player.Equipo || undefined}
                      playerPosition={player['Posición'] || undefined}
                    />
                  )}
                </div>
              </div>
            )}

            {/* FÍSICO / GPS TAB */}
            {activeTab === 'Físico' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-gps">
                {needsManualFixtures && <ManualFixturesEditor playerName={player.Jugador} />}
                <GPSTab
                  gpsEntries={playerGpsData}
                  playerName={player.Jugador}
                />
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

                {/* Transfer history from API-Football */}
                {playerTransfers.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-1">
                      Historial de Traspasos
                    </h3>
                    <p className="text-xs text-apple-gray-400 mb-4">
                      Movimientos registrados en API-Football
                    </p>
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-px bg-apple-gray-200 dark:bg-apple-gray-700" />
                      <div className="space-y-3">
                        {playerTransfers
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((transfer, idx) => {
                            const date = new Date(transfer.date)
                            const typeLabel = transfer.type === 'Loan' ? 'Préstamo'
                              : transfer.type === 'N/A' ? 'Transferencia'
                              : transfer.type === 'Free' ? 'Libre'
                              : transfer.type
                            return (
                              <div key={idx} className="relative pl-10">
                                <div className="absolute left-2 top-3 w-4 h-4 rounded-full border-2 bg-brand-green/10 border-brand-green/30 flex items-center justify-center">
                                  <div className="w-2 h-2 rounded-full bg-brand-green" />
                                </div>
                                <div className="p-4 rounded-xl border border-apple-gray-100 dark:border-apple-gray-700/50 bg-apple-gray-50/50 dark:bg-apple-gray-800/30">
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <span className="text-xs text-apple-gray-500">
                                      {date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                    <span className="text-2xs font-medium px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green border border-brand-green/20">
                                      {typeLabel}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {transfer.teams.out.logo && (
                                        <img src={transfer.teams.out.logo} alt="" className="w-5 h-5 object-contain" />
                                      )}
                                      <span className="text-apple-gray-500 truncate">{transfer.teams.out.name}</span>
                                    </div>
                                    <svg className="w-4 h-4 text-apple-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {transfer.teams.in.logo && (
                                        <img src={transfer.teams.in.logo} alt="" className="w-5 h-5 object-contain" />
                                      )}
                                      <span className="font-medium text-apple-gray-800 dark:text-white truncate">{transfer.teams.in.name}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  </div>
                )}
                {transfersLoading && (
                  <div className="mt-6 flex items-center justify-center py-4">
                    <div className="animate-spin w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full" />
                    <span className="ml-2 text-xs text-apple-gray-400">Cargando traspasos...</span>
                  </div>
                )}
              </div>
            )}

            {/* EVOLUCIÓN TAB */}
            {activeTab === 'Rendimiento evolutivo' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-evolution">
                {supabaseMatches.length > 0 ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-1">
                        Evolución del Score
                      </h3>
                      <p className="text-xs text-apple-gray-400 mb-4">
                        Score por partido · La línea punteada indica el promedio
                      </p>
                      <ScoreEvolutionChart
                        matches={supabaseMatches}
                        avgScore={supabaseAvgScore}
                      />
                    </div>

                    {/* Match history table */}
                    <div>
                      <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-3">
                        Historial de Partidos
                      </h3>
                      <div className="overflow-x-auto rounded-xl border border-apple-gray-100 dark:border-apple-gray-700">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-apple-gray-50 dark:bg-apple-gray-800/50">
                              <th className="text-left px-3 py-2 text-2xs font-semibold text-apple-gray-500 uppercase">Fecha</th>
                              <th className="text-left px-3 py-2 text-2xs font-semibold text-apple-gray-500 uppercase">Rival</th>
                              <th className="text-center px-3 py-2 text-2xs font-semibold text-apple-gray-500 uppercase">Resultado</th>
                              <th className="text-center px-3 py-2 text-2xs font-semibold text-apple-gray-500 uppercase">Min</th>
                              <th className="text-center px-3 py-2 text-2xs font-semibold text-apple-gray-500 uppercase">Goles</th>
                              <th className="text-center px-3 py-2 text-2xs font-semibold text-apple-gray-500 uppercase">Asist</th>
                              <th className="text-center px-3 py-2 text-2xs font-semibold text-apple-gray-500 uppercase">Rating</th>
                              <th className="text-center px-3 py-2 text-2xs font-semibold text-apple-gray-500 uppercase">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...supabaseMatches].reverse().slice(0, 20).map((match) => {
                              const fixture = (match as any).fixture
                              const date = fixture?.date ? new Date(fixture.date) : null
                              const isHome = match.team_id === fixture?.home_team_id
                              const rivalName = isHome ? fixture?.away_team?.name : fixture?.home_team?.name
                              const scoreHome = fixture?.score_home
                              const scoreAway = fixture?.score_away
                              const result = scoreHome != null && scoreAway != null ? `${scoreHome}-${scoreAway}` : '—'
                              const scoreColor = match.match_score != null
                                ? match.match_score >= 8 ? 'text-brand-green' : match.match_score >= 6 ? 'text-emerald-500' : match.match_score >= 4.5 ? 'text-amber-500' : 'text-red-500'
                                : ''
                              return (
                                <tr key={match.fixture_id} className="border-t border-apple-gray-50 dark:border-apple-gray-800/50 hover:bg-apple-gray-50/50 dark:hover:bg-apple-gray-800/30">
                                  <td className="px-3 py-2 text-apple-gray-500 tabular-nums">
                                    {date ? date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—'}
                                  </td>
                                  <td className="px-3 py-2 font-medium text-apple-gray-800 dark:text-white truncate max-w-[140px]">
                                    {rivalName ?? '—'}
                                  </td>
                                  <td className="px-3 py-2 text-center font-semibold text-apple-gray-700 dark:text-apple-gray-300 tabular-nums">{result}</td>
                                  <td className="px-3 py-2 text-center text-apple-gray-500 tabular-nums">{match.minutes ?? '—'}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{match.goals || '—'}</td>
                                  <td className="px-3 py-2 text-center tabular-nums">{match.assists || '—'}</td>
                                  <td className="px-3 py-2 text-center text-apple-gray-600 dark:text-apple-gray-400 tabular-nums">{match.rating?.toFixed(1) ?? '—'}</td>
                                  <td className={`px-3 py-2 text-center font-bold tabular-nums ${scoreColor}`}>
                                    {match.match_score?.toFixed(1) ?? '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {supabaseMatches.length > 20 && (
                        <p className="text-xs text-apple-gray-400 mt-2 text-center">
                          Mostrando últimos 20 de {supabaseMatches.length} partidos
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-1">
                      Rendimiento por partido
                    </h3>
                    <p className="text-xs text-apple-gray-400 mb-5">
                      La línea punteada indica el promedio del jugador
                    </p>
                    {playerJugadorSK ? (
                      <EvolutionChart evolution={evolution} playerSK={playerJugadorSK} />
                    ) : (
                      <EmptyState
                        title="Sin datos de evolución"
                        description="No se encontraron datos de evolución para este jugador."
                        icon="search"
                      />
                    )}
                  </>
                )}
              </div>
            )}

            {/* MÉTRICAS TAB - Radar + Métricas detalladas */}
            {activeTab === 'Métricas' && (
              <div className="animate-fade-in" id="tab-content-metrics">
                {/* ─── Supabase-powered advanced metrics (shown first when available) ─── */}
                {supabaseDetail && supabaseMatches.length > 0 && (
                  <div className="space-y-6 mb-8">
                    {/* Score evolution */}
                    <div className="bg-apple-gray-50/30 dark:bg-apple-gray-800/20 rounded-2xl p-5">
                      <ScoreEvolutionChart
                        matches={supabaseMatches}
                        avgScore={supabaseAvgScore}
                      />
                    </div>

                    {/* Radar chart vs league average */}
                    {(selectedPosition ?? supabaseDetail.player.primary_position) && (
                      <div className="bg-apple-gray-50/30 dark:bg-apple-gray-800/20 rounded-2xl p-5">
                        <MetricsRadarChart
                          matches={supabaseMatches}
                          position={(selectedPosition ?? supabaseDetail.player.primary_position) as Position}
                          metricAverages={metricAverages}
                          playerLeagueId={supabaseDetail.player.team?.league_id ?? 0}
                          leagues={leagues}
                        />
                      </div>
                    )}

                    {/* Bar comparison with analysis */}
                    {(selectedPosition ?? supabaseDetail.player.primary_position) && (
                      <div className="bg-apple-gray-50/30 dark:bg-apple-gray-800/20 rounded-2xl p-5">
                        <MetricsBarComparison
                          matches={supabaseMatches}
                          position={(selectedPosition ?? supabaseDetail.player.primary_position) as Position}
                          metricAverages={metricAverages}
                          playerLeagueId={supabaseDetail.player.team?.league_id ?? 0}
                          leagues={leagues}
                        />
                      </div>
                    )}

                    {/* Position field map */}
                    {(selectedPosition ?? supabaseDetail.player.primary_position) && (
                      <div className="bg-apple-gray-50/30 dark:bg-apple-gray-800/20 rounded-2xl p-5">
                        <h3 className="text-sm font-semibold text-apple-gray-800 dark:text-white mb-3">
                          Posición en el campo
                        </h3>
                        <PositionFieldMap position={(selectedPosition ?? supabaseDetail.player.primary_position) as Position} />
                      </div>
                    )}
                  </div>
                )}

                {/* Old Google Sheets metrics — hidden when Supabase data available */}
                {!(supabaseDetail && supabaseMatches.length > 0) && (
                <>
                {/* Header con controles */}
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                      Métricas — {displayPosition}
                    </h3>
                    <p className="text-xs text-apple-gray-400 mt-0.5">
                      Radar: vs {comparisonLeague === 'all' ? 'promedio general' : `promedio de ${comparisonLeague}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
                      Comparar radar vs:
                    </label>
                    <select
                      value={comparisonLeague}
                      onChange={e => setComparisonLeague(e.target.value)}
                      className="input-apple text-sm py-1.5 px-3 min-w-[140px]"
                    >
                      <option value="all">Todas las ligas</option>
                      {availableLeagues.map(league => (
                        <option key={league} value={league}>{league}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Selector de métricas del radar */}
                <div className="mb-3 flex items-center gap-2">
                  <button
                    onClick={() => setShowMetricSelector(!showMetricSelector)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      showMetricSelector
                        ? 'bg-brand-green/10 border-brand-green text-brand-green'
                        : 'bg-apple-gray-50 dark:bg-apple-gray-800 border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-400 hover:border-brand-green'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    Personalizar métricas
                  </button>
                  {customRadarMetrics.length > 0 && (
                    <button
                      onClick={() => setCustomRadarMetrics([])}
                      className="text-2xs text-apple-gray-400 hover:text-red-500 transition-colors"
                    >
                      Restablecer ({customRadarMetrics.length} seleccionadas)
                    </button>
                  )}
                </div>

                {/* Panel de selección de métricas */}
                {showMetricSelector && (
                  <div className="mb-4 p-4 bg-apple-gray-50/80 dark:bg-apple-gray-800/50 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">
                        Seleccioná las métricas para el radar (máx. 12)
                      </p>
                      <span className="text-2xs text-apple-gray-400">
                        {customRadarMetrics.length > 0 ? customRadarMetrics.length : (RADAR_METRICS[posKey] ?? []).length} métricas
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
                      {(RADAR_METRICS[posKey] ?? RADAR_METRICS['Defensor Central'] ?? []).map((metric: string) => {
                        const isSelected = customRadarMetrics.length === 0 || customRadarMetrics.includes(metric)
                        const isDefault = customRadarMetrics.length === 0
                        return (
                          <label
                            key={metric}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all text-xs ${
                              isSelected
                                ? 'bg-brand-green/10 border border-brand-green/30'
                                : 'bg-white dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 opacity-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isDefault) {
                                  // Primera selección: seleccionar solo esta métrica
                                  setCustomRadarMetrics([metric])
                                } else if (isSelected) {
                                  // Deseleccionar
                                  const newMetrics = customRadarMetrics.filter(m => m !== metric)
                                  setCustomRadarMetrics(newMetrics)
                                } else if (customRadarMetrics.length < 12) {
                                  // Seleccionar
                                  setCustomRadarMetrics([...customRadarMetrics, metric])
                                }
                              }}
                              className="w-3.5 h-3.5 rounded border-apple-gray-300 text-brand-green focus:ring-brand-green"
                            />
                            <span className={`text-2xs ${isSelected ? 'text-apple-gray-700 dark:text-apple-gray-200' : 'text-apple-gray-500'}`}>
                              {metric}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-2xs text-apple-gray-400">
                      Tip: Las métricas con "%" son porcentajes, las que terminan en "/90" son por cada 90 minutos jugados
                    </p>
                  </div>
                )}

                {/* Gráfico Radar */}
                <div className="bg-apple-gray-50/30 dark:bg-apple-gray-800/20 rounded-2xl p-4 mb-6">
                  {!posKey ? (
                    <EmptyState title="Posición no reconocida" description="No se puede generar el radar para esta posición." />
                  ) : (
                    <PlayerRadarChart
                      player={player}
                      allNormalized={normalized}
                      allPlayers={[...external, ...internal]}
                      comparisonLeague={comparisonLeague}
                      overridePosition={rawPosition}
                      customMetrics={customRadarMetrics.length > 0 ? customRadarMetrics : undefined}
                    />
                  )}
                </div>

                {/* Métricas Detalladas */}
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                      Detalle de Métricas
                    </h4>
                    <p className="text-2xs text-apple-gray-400 mt-0.5">
                      Percentiles vs jugadores de {posKey || 'su posición'} con +300 min (todas las ligas)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                  {displayMetrics.map((metric) => {
                    const isBasicStat = metric === 'Partidos jugados' || metric === 'Minutos jugados'
                    const percentile = metricPercentiles[metric]

                    if (isBasicStat) {
                      const val = player[metric]
                      const num = typeof val === 'number' ? val : parseFloat(String(val ?? '').replace(',', '.'))
                      return (
                        <div key={metric} className="flex justify-between items-center py-3 border-b border-apple-gray-100 dark:border-apple-gray-800/50">
                          <span className="text-sm text-apple-gray-600 dark:text-apple-gray-300">{metric}</span>
                          <span className="text-sm font-bold text-apple-gray-800 dark:text-white tabular-nums bg-apple-gray-100 dark:bg-apple-gray-700 px-3 py-1 rounded-lg">
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
                </>
                )}
              </div>
            )}

            {/* SALUD TAB */}
            {activeTab === 'Salud' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-salud">
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Historial de Salud
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Lesiones, recuperaciones y estado físico general
                  </p>
                </div>

                {injuriesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full" />
                    <span className="ml-3 text-sm text-apple-gray-500">Cargando historial médico...</span>
                  </div>
                ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Professional Body Map */}
                  <div className="bg-gradient-to-b from-apple-gray-50 to-white dark:from-apple-gray-800/50 dark:to-apple-gray-900/30 rounded-2xl p-6 border border-apple-gray-100 dark:border-apple-gray-700/50">
                    <h4 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full animate-pulse ${playerInjuries.some(i => !i.end || new Date(i.end) > new Date()) ? 'bg-red-500' : 'bg-green-500'}`}></span>
                      Mapa Corporal
                    </h4>
                    <div className="py-2">
                      <BodyMapSVG
                        injuries={playerInjuries
                          .filter(i => !i.end || new Date(i.end) > new Date())
                          .map(i => {
                            const reason = i.type.toLowerCase()
                            const zone = reason.includes('knee') ? 'knee_right' :
                              reason.includes('hamstring') || reason.includes('thigh') ? 'thigh_right' :
                              reason.includes('ankle') ? 'ankle_right' :
                              reason.includes('calf') ? 'calf_right' :
                              reason.includes('groin') || reason.includes('adductor') ? 'hip_right' :
                              reason.includes('shoulder') ? 'shoulder_right' :
                              reason.includes('back') || reason.includes('lumbar') ? 'lower_back' :
                              reason.includes('head') || reason.includes('concussion') ? 'head' :
                              reason.includes('foot') ? 'foot_right' :
                              reason.includes('hip') ? 'hip_right' :
                              reason.includes('muscle') ? 'thigh_right' :
                              'torso_front'
                            return { zone, severity: 'moderada' as const, label: i.type }
                          })}
                        interactive={false}
                        className="w-full"
                      />
                    </div>

                    {/* Status badge */}
                    <div className="flex justify-center mt-4">
                      {playerInjuries.some(i => !i.end || new Date(i.end) > new Date()) ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                          Lesión activa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                          Sin lesiones activas
                        </span>
                      )}
                    </div>

                    {/* Legend */}
                    <div className="mt-5 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700/50">
                      <p className="text-2xs text-apple-gray-400 uppercase tracking-wider mb-2">Leyenda de severidad</p>
                      <div className="flex justify-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
                          <span className="text-2xs text-apple-gray-500">Leve</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                          <span className="text-2xs text-apple-gray-500">Moderada</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                          <span className="text-2xs text-apple-gray-500">Grave</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Injury History */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Historial de Lesiones
                    </h4>

                    {playerInjuries.length === 0 ? (
                      <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-6 text-center border border-dashed border-apple-gray-200 dark:border-apple-gray-700">
                        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/30 dark:to-green-900/20 flex items-center justify-center">
                          <svg className="w-7 h-7 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-green-600 dark:text-green-400">
                          Sin historial de lesiones
                        </p>
                        <p className="text-xs text-apple-gray-400 mt-1.5 max-w-xs mx-auto">
                          {apiPlayerId ? 'No se encontraron lesiones registradas para este jugador' : 'Vinculá el jugador con API-Football para ver su historial médico'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {playerInjuries
                          .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
                          .map((injury, idx) => {
                            const startDate = new Date(injury.start)
                            const endDate = injury.end ? new Date(injury.end) : null
                            const isActive = !endDate || endDate > new Date()
                            const daysOut = endDate
                              ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                              : Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))

                            return (
                              <div
                                key={idx}
                                className={`p-4 rounded-xl border transition-all ${
                                  isActive
                                    ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30'
                                    : 'bg-apple-gray-50/50 dark:bg-apple-gray-800/30 border-apple-gray-100 dark:border-apple-gray-700/50'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      {isActive && (
                                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                      )}
                                      <span className={`text-sm font-semibold ${isActive ? 'text-red-600 dark:text-red-400' : 'text-apple-gray-800 dark:text-white'}`}>
                                        {injury.type}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-apple-gray-500">
                                      <span>
                                        {startDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        {endDate && (
                                          <> — {endDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className={`text-lg font-bold tabular-nums ${isActive ? 'text-red-500' : 'text-apple-gray-700 dark:text-apple-gray-300'}`}>
                                      {daysOut}
                                    </p>
                                    <p className="text-2xs text-apple-gray-400">días</p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}

                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 text-center border border-apple-gray-100 dark:border-apple-gray-700/50">
                        <p className={`text-2xl font-bold ${playerInjuries.length === 0 ? 'text-green-600 dark:text-green-400' : 'text-orange-500'}`}>
                          {playerInjuries.filter(i => {
                            const y = new Date(i.start).getFullYear()
                            return y === new Date().getFullYear()
                          }).length}
                        </p>
                        <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mt-1">Lesiones este año</p>
                      </div>
                      <div className="bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 text-center border border-apple-gray-100 dark:border-apple-gray-700/50">
                        <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">
                          {playerInjuries.reduce((total, i) => {
                            const start = new Date(i.start)
                            const end = i.end ? new Date(i.end) : new Date()
                            return total + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
                          }, 0)}
                        </p>
                        <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mt-1">Días perdidos total</p>
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}

            {/* FISIOTERAPIA TAB */}
            {activeTab === 'Fisioterapia' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-fisioterapia">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Fisioterapia
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Tratamientos, sesiones y seguimiento de recuperación
                  </p>
                </div>

                <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-8 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                    <svg className="w-7 h-7 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                    Sin sesiones de fisioterapia registradas
                  </p>
                  <p className="text-xs text-apple-gray-400 mt-1">
                    Los datos de tratamientos y recuperación se cargarán próximamente
                  </p>
                </div>
              </div>
            )}

            {/* NUTRICIÓN TAB */}
            {activeTab === 'Nutrición' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-nutricion">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Nutrición
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Plan alimenticio, seguimiento y recomendaciones
                  </p>
                </div>

                <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-8 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                    <svg className="w-7 h-7 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                    Sin datos nutricionales registrados
                  </p>
                  <p className="text-xs text-apple-gray-400 mt-1">
                    Planes de alimentación y seguimiento próximamente
                  </p>
                </div>
              </div>
            )}

            {/* NEUROCIENCIA TAB */}
            {activeTab === 'Neurociencia' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-neurociencia">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Neurociencia
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Evaluaciones cognitivas y entrenamiento mental
                  </p>
                </div>

                <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-8 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                    <svg className="w-7 h-7 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                    Sin evaluaciones neurocognitivas
                  </p>
                  <p className="text-xs text-apple-gray-400 mt-1">
                    Tests de reacción, toma de decisiones y concentración próximamente
                  </p>
                </div>
              </div>
            )}

            {/* PSICOLOGÍA TAB */}
            {activeTab === 'Psicología' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-psicologia">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Psicología
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Evaluaciones psicológicas y bienestar emocional
                  </p>
                </div>

                <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-8 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                    <svg className="w-7 h-7 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                    Sin evaluaciones psicológicas registradas
                  </p>
                  <p className="text-xs text-apple-gray-400 mt-1">
                    Seguimiento emocional y bienestar mental próximamente
                  </p>
                </div>
              </div>
            )}

            {/* COACHING TAB */}
            {activeTab === 'Coaching' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-coaching">
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Coaching
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Desarrollo técnico-táctico y plan de crecimiento individual
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Objetivos */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border border-blue-100 dark:border-blue-800/30">
                    <h4 className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Objetivos Actuales
                    </h4>
                    <div className="bg-white/60 dark:bg-apple-gray-800/40 rounded-xl p-5 text-center">
                      <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                        Sin objetivos definidos
                      </p>
                      <p className="text-xs text-apple-gray-400 mt-1">
                        Los objetivos de desarrollo se cargarán próximamente
                      </p>
                    </div>
                  </div>

                  {/* Plan de desarrollo */}
                  <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-800/30">
                    <h4 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Plan de Desarrollo
                    </h4>
                    <div className="bg-white/60 dark:bg-apple-gray-800/40 rounded-xl p-5 text-center">
                      <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                        Sin plan de desarrollo activo
                      </p>
                      <p className="text-xs text-apple-gray-400 mt-1">
                        El plan individualizado se cargará próximamente
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sessions and feedback */}
                <div className="mt-6">
                  <h4 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Historial de Sesiones
                  </h4>
                  <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-6 text-center border border-dashed border-apple-gray-200 dark:border-apple-gray-700">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-apple-gray-100 to-apple-gray-50 dark:from-apple-gray-700 dark:to-apple-gray-800 flex items-center justify-center">
                      <svg className="w-7 h-7 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-300">
                      Sin sesiones de coaching registradas
                    </p>
                    <p className="text-xs text-apple-gray-400 mt-1.5 max-w-sm mx-auto">
                      Las sesiones individuales de coaching y feedback técnico-táctico aparecerán aquí
                    </p>
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-3 mt-6">
                  <div className="bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 text-center border border-apple-gray-100 dark:border-apple-gray-700/50">
                    <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">0</p>
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mt-1">Sesiones</p>
                  </div>
                  <div className="bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 text-center border border-apple-gray-100 dark:border-apple-gray-700/50">
                    <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">0</p>
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mt-1">Objetivos cumplidos</p>
                  </div>
                  <div className="bg-white dark:bg-apple-gray-800/50 rounded-xl p-4 text-center border border-apple-gray-100 dark:border-apple-gray-700/50">
                    <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">—</p>
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mt-1">Progreso</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'Videos' && source === 'interno' && (
              <VideosTab player={player} />
            )}
          </div>

        </div>{/* end right column */}
      </div>{/* end outer flex */}

      {/* Acciones + widgets — mobile (reemplazan al pie del rail de desktop) */}
      <div className="md:hidden mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 active:scale-[0.98] transition-transform"
          >
            <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar PDF
          </button>
          <button
            onClick={() => setShowComments(true)}
            className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 active:scale-[0.98] transition-transform"
          >
            <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Comentarios
          </button>
          {player.Transfermkt && (
            <a
              href={player.Transfermkt}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 active:scale-[0.98] transition-transform"
            >
              <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Transfermarkt
            </a>
          )}
          {monitoringPlayer?.WyscoutVideo && (
            <a
              href={monitoringPlayer.WyscoutVideo}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-medium bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 active:scale-[0.98] transition-transform"
            >
              <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Video Wyscout
            </a>
          )}
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

      {/* Comments slide-over */}
      {showComments && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowComments(false)} />
          <div className="relative w-full max-w-md h-full bg-white dark:bg-apple-gray-900 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-apple-gray-100 dark:border-apple-gray-700">
              <h3 className="font-semibold text-apple-gray-800 dark:text-white">Comentarios</h3>
              <button onClick={() => setShowComments(false)} className="p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" aria-label="Cerrar">
                <svg className="w-5 h-5 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5">
              <PlayerComments player={player} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
