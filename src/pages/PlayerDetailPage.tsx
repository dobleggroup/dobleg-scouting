import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import ContractBadge from '@/components/ui/ContractBadge'
import PlayerRadarChart from '@/components/charts/PlayerRadarChart'
import EvolutionChart from '@/components/charts/EvolutionChart'
import MarketValueChart from '@/components/charts/MarketValueChart'
import GaugeScore from '@/components/charts/GaugeScore'
import GPSTab from '@/components/charts/GPSTab'
import ExportPDFModal, { type PDFTheme } from '@/components/ui/ExportPDFModal'
import { exportPlayerToPdfFull } from '@/utils/pdfExport'
import AddToReportButton from '@/components/pdf/AddToReportButton'
import { normalizeName } from '@/utils/scoring'
import { POSITION_MAP, DISPLAY_POSITION_MAP, DISPLAY_METRICS, RADAR_METRICS } from '@/constants/scoring'
import { fetchPlayerEvaluations, fetchEvaluationsByName, type ScoutEvaluation } from '@/services/scoutEvaluationService'
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
  const overridePosition = searchParams.get('pos')
  const { external, internal, monitoring, normalized, evolution, subjectiveMetrics, marketValueHistory, gpsData, loading, error } = useData()
  const [activeTab, setActiveTab] = useState('General')
  const [comparisonLeague, setComparisonLeague] = useState<string>('all')
  const [showExportModal, setShowExportModal] = useState(false)
  const [showPlayerSelector, setShowPlayerSelector] = useState(false)
  const [playerSearchQuery, setPlayerSearchQuery] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)
  const playerSelectorRef = useRef<HTMLDivElement>(null)

  // Get available players for selector based on source
  const availablePlayers = useMemo(() => {
    if (source === 'interno') {
      return internal.sort((a, b) => a.Jugador.localeCompare(b.Jugador))
    }
    if (source === 'seguimiento') {
      return monitoring.map(m => m.metricsPlayer).filter(Boolean).sort((a, b) => a!.Jugador.localeCompare(b!.Jugador)) as EnrichedPlayer[]
    }
    return external.sort((a, b) => a.Jugador.localeCompare(b.Jugador))
  }, [source, internal, external, monitoring])

  // Filter players by search query
  const filteredPlayers = useMemo(() => {
    if (!playerSearchQuery.trim()) return availablePlayers
    const query = playerSearchQuery.toLowerCase()
    return availablePlayers.filter(p =>
      p.Jugador.toLowerCase().includes(query) ||
      p.Equipo?.toLowerCase().includes(query) ||
      p['Posición específica']?.toLowerCase().includes(query)
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

  // Tab configuration with icons
  const tabsConfig = [
    { id: 'General', label: 'General', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', internal: false },
    { id: 'Radar', label: 'Radar', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', internal: false },
    { id: 'Valor', label: 'Valor', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', internal: true },
    { id: 'Evolución', label: 'Evolución', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', internal: true },
    { id: 'Físico', label: 'Físico', icon: 'M13 10V3L4 14h7v7l9-11h-7z', internal: true },
    { id: 'Métricas', label: 'Métricas', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', internal: false },
    { id: 'Salud', label: 'Salud', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', internal: true },
    { id: 'Antropometría', label: 'Antropo', icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3', internal: true },
    { id: 'Fisioterapia', label: 'Fisio', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', internal: true },
    { id: 'Nutrición', label: 'Nutrición', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', internal: true },
    { id: 'Neurociencia', label: 'Neuro', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z', internal: true },
    { id: 'Psicología', label: 'Psico', icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', internal: true },
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
                    <h1 className="text-xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
                      {player.Jugador}
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

          {/* Score Scout Timeline - self-contained, renders its own card if evaluations exist */}
          <ScoreScoutTimeline playerId={player.id || player.Jugador} playerName={player.Jugador} />

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
            <AddToReportButton
              type="player-card"
              title={`Ficha: ${player.Jugador}`}
              description={`${player.Equipo} - ${player['Posición'] || player['Posicion']} - ${player.ageNum} años`}
              captureId="player-detail-container"
              source={source === 'interno' ? 'Scout Interno' : 'Scout Externo'}
              variant="menu-item"
              players={[player.Jugador]}
            />
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
        <div className="lg:col-span-8">
          <div className="flex gap-4">
            {/* Vertical Tab Sidebar */}
            <div className="shrink-0 w-12 xl:w-auto">
              <div className="sticky top-4 bg-white dark:bg-apple-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark p-1.5 xl:p-2">
                <nav className="space-y-0.5">
                  {tabs.map((tab, index) => {
                    const isActive = activeTab === tab.id
                    // Add separator before "Salud" section (medical tabs)
                    const showSeparator = tab.id === 'Salud'

                    return (
                      <div key={tab.id}>
                        {showSeparator && (
                          <div className="my-2 mx-2 border-t border-apple-gray-100 dark:border-apple-gray-700" />
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
                          <span className="text-xs font-medium hidden xl:block whitespace-nowrap">{tab.label}</span>
                          {/* Tooltip for small screens */}
                          <span className="absolute left-full ml-2 px-2 py-1 bg-apple-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 xl:hidden whitespace-nowrap z-50 pointer-events-none">
                            {tab.id}
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </nav>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 card-apple p-6 min-w-0" id="player-tab-content">

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

            {/* FÍSICO / GPS TAB */}
            {activeTab === 'Físico' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-gps">
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

            {/* SALUD TAB */}
            {activeTab === 'Salud' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-salud">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Historial de Salud
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Lesiones, recuperaciones y estado físico general
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Body Map */}
                  <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-6">
                    <h4 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-4">
                      Mapa Corporal
                    </h4>
                    <div className="flex justify-center">
                      <svg viewBox="0 0 200 400" className="w-48 h-auto">
                        {/* Head */}
                        <ellipse cx="100" cy="30" rx="25" ry="28" className="fill-apple-gray-200 dark:fill-apple-gray-600 stroke-apple-gray-300 dark:stroke-apple-gray-500" strokeWidth="1" />
                        {/* Neck */}
                        <rect x="90" y="55" width="20" height="15" className="fill-apple-gray-200 dark:fill-apple-gray-600" />
                        {/* Torso */}
                        <path d="M60 70 Q50 100 55 160 L75 165 L75 175 L125 175 L125 165 L145 160 Q150 100 140 70 Z" className="fill-apple-gray-200 dark:fill-apple-gray-600 stroke-apple-gray-300 dark:stroke-apple-gray-500" strokeWidth="1" />
                        {/* Left Arm */}
                        <path d="M60 72 Q40 80 35 120 Q30 140 25 160 Q20 175 30 180 Q40 175 45 160 L55 120 Q58 90 60 72" className="fill-apple-gray-200 dark:fill-apple-gray-600 stroke-apple-gray-300 dark:stroke-apple-gray-500" strokeWidth="1" />
                        {/* Right Arm */}
                        <path d="M140 72 Q160 80 165 120 Q170 140 175 160 Q180 175 170 180 Q160 175 155 160 L145 120 Q142 90 140 72" className="fill-apple-gray-200 dark:fill-apple-gray-600 stroke-apple-gray-300 dark:stroke-apple-gray-500" strokeWidth="1" />
                        {/* Left Leg */}
                        <path d="M75 175 L70 250 Q65 280 60 320 Q55 350 55 370 Q55 385 70 385 Q80 385 80 370 L85 320 Q90 280 90 250 L95 175 Z" className="fill-apple-gray-200 dark:fill-apple-gray-600 stroke-apple-gray-300 dark:stroke-apple-gray-500" strokeWidth="1" />
                        {/* Right Leg */}
                        <path d="M125 175 L130 250 Q135 280 140 320 Q145 350 145 370 Q145 385 130 385 Q120 385 120 370 L115 320 Q110 280 110 250 L105 175 Z" className="fill-apple-gray-200 dark:fill-apple-gray-600 stroke-apple-gray-300 dark:stroke-apple-gray-500" strokeWidth="1" />
                      </svg>
                    </div>
                    <p className="text-center text-xs text-apple-gray-400 mt-4">
                      Sin lesiones registradas actualmente
                    </p>
                  </div>

                  {/* Injury History */}
                  <div>
                    <h4 className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-4">
                      Historial de Lesiones
                    </h4>
                    <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-6 text-center">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                        <svg className="w-6 h-6 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                        Sin datos de lesiones
                      </p>
                      <p className="text-xs text-apple-gray-400 mt-1">
                        Los datos se cargarán próximamente
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ANTROPOMETRÍA TAB */}
            {activeTab === 'Antropometría' && source === 'interno' && (
              <div className="animate-fade-in" id="tab-content-antropometria">
                <div className="mb-5">
                  <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
                    Datos Antropométricos
                  </h3>
                  <p className="text-xs text-apple-gray-400 mt-0.5">
                    Mediciones físicas y composición corporal
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-4 text-center">
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Altura</p>
                    <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">
                      {player.Altura || '—'} <span className="text-sm font-normal text-apple-gray-400">cm</span>
                    </p>
                  </div>
                  <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-4 text-center">
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">Peso</p>
                    <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">
                      — <span className="text-sm font-normal text-apple-gray-400">kg</span>
                    </p>
                  </div>
                  <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-4 text-center">
                    <p className="text-2xs text-apple-gray-500 uppercase tracking-wider mb-1">IMC</p>
                    <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">—</p>
                  </div>
                </div>

                <div className="bg-apple-gray-50/50 dark:bg-apple-gray-800/30 rounded-xl p-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center">
                    <svg className="w-6 h-6 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                    </svg>
                  </div>
                  <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                    Datos antropométricos completos próximamente
                  </p>
                  <p className="text-xs text-apple-gray-400 mt-1">
                    Composición corporal, envergadura, mediciones de segmentos
                  </p>
                </div>
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
            </div>
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
