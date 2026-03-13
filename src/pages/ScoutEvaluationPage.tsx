import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useData } from '@/context/DataContext'
import { createEvaluation, fetchRecentEvaluations, type ScoutEvaluation, type PlayerSource } from '@/services/scoutEvaluationService'
import { setPlayerStatus, fetchAllStatuses } from '@/services/monitoringService'
import { smartSearch } from '@/lib/search'

// Position options
const POSITIONS = [
  'Arquero',
  'Lateral derecho',
  'Defensor central',
  'Lateral izquierdo',
  'Volante central',
  'Volante interno',
  'Extremo',
  'Delantero',
]

// Role options
const ROLES = [
  'Arquero',
  'Lateral ofensivo',
  'Lateral defensivo',
  'Lateral completo',
  'Volante central posicional',
  'Volante central defensivo',
  'Volante interno mixto',
  'Volante interno ofensivo (Enganche)',
  'Extremo desequilibrante',
  'Extremo finalizador',
  'Mediapunta / Segunda punta',
  'Delantero de area',
  'Delantero completo / movil',
]

// Score selector component - big and touch-friendly
function ScoreSelector({
  value,
  onChange,
}: {
  value: number | undefined
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400">
          Rendimiento en el partido
        </span>
        {value && (
          <span className={`text-2xl font-bold ${
            value >= 8 ? 'text-brand-green' :
            value >= 6 ? 'text-emerald-500' :
            value >= 4 ? 'text-amber-500' : 'text-red-500'
          }`}>
            {value}
          </span>
        )}
      </div>

      <div className="grid grid-cols-10 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-11 w-full rounded-lg text-sm font-bold transition-all duration-200 ${
              value === n
                ? n >= 8
                  ? 'bg-brand-green text-white shadow-md shadow-brand-green/30 scale-105'
                  : n >= 6
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 scale-105'
                  : n >= 4
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-105'
                  : 'bg-red-500 text-white shadow-md shadow-red-500/30 scale-105'
                : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-600 active:scale-95'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs text-apple-gray-400">
        <span>Muy malo</span>
        <span>Excelente</span>
      </div>
    </div>
  )
}

// Custom select component
function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-2">
        {label} {required && <span className="text-brand-green">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 transition-all appearance-none cursor-pointer"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          backgroundSize: '20px',
        }}
      >
        <option value="">{placeholder || 'Seleccionar...'}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

// Text input component
function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-2">
        {label} {required && <span className="text-brand-green">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 transition-all"
      />
    </div>
  )
}

export default function ScoutEvaluationPage() {
  const { user, userDisplayName } = useAuth()
  const { external, internal } = useData()

  // Form state
  const [scoutName, setScoutName] = useState(userDisplayName || '')
  const [playerName, setPlayerName] = useState('')
  const [playerSearch, setPlayerSearch] = useState('')
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false)
  const [team, setTeam] = useState('')
  const [position, setPosition] = useState('')
  const [role, setRole] = useState('')
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0])
  const [competition, setCompetition] = useState('')
  const [rival, setRival] = useState('')
  const [score, setScore] = useState<number>()
  const [notes, setNotes] = useState('')
  const [recommendation, setRecommendation] = useState<'fichar' | 'seguir_observando' | 'descartar' | ''>('')
  const [playerSource, setPlayerSource] = useState<PlayerSource | null>(null)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [addedToMonitoring, setAddedToMonitoring] = useState(false)

  // Recent evaluations for sidebar
  const [recentEvaluations, setRecentEvaluations] = useState<ScoutEvaluation[]>([])

  // Monitoring statuses to check if player is in seguimiento
  const [monitoringStatuses, setMonitoringStatuses] = useState<Record<string, { status: string }>>({})

  useEffect(() => {
    fetchRecentEvaluations(5).then(setRecentEvaluations)
  }, [success])

  // Load monitoring statuses
  useEffect(() => {
    fetchAllStatuses().then(statuses => {
      const statusMap: Record<string, { status: string }> = {}
      Object.entries(statuses).forEach(([id, record]) => {
        statusMap[id] = { status: record.status }
      })
      setMonitoringStatuses(statusMap)
    })
  }, [])

  // Update scout name when user changes
  useEffect(() => {
    if (userDisplayName) {
      setScoutName(userDisplayName)
    }
  }, [userDisplayName])

  // Available scouts (for now just current user)
  const availableScouts = useMemo(() => {
    if (!userDisplayName) return []
    return [{ id: user?.id || '', name: userDisplayName }]
  }, [user, userDisplayName])

  // Internal player IDs for quick lookup
  const internalPlayerIds = useMemo(() => {
    return new Set(internal.map(p => p.Jugador))
  }, [internal])

  // Combined player list for autocomplete with source info
  const allPlayers = useMemo(() => {
    const players: Array<{ name: string; team: string; position: string; source: PlayerSource; id: string }> = []

    // Internal players first
    internal.forEach(p => {
      players.push({
        name: p.Jugador,
        team: p.Equipo || '',
        position: String(p['Posicion'] || ''),
        source: 'interno',
        id: p.Jugador,
      })
    })

    // External players
    external.forEach(p => {
      if (!players.find(x => x.name === p.Jugador)) {
        // Check if in seguimiento
        const isInMonitoring = monitoringStatuses[p.Jugador]?.status === 'seguimiento'
        players.push({
          name: p.Jugador,
          team: p.Equipo || '',
          position: String(p['Posicion'] || ''),
          source: isInMonitoring ? 'seguimiento' : 'externo',
          id: p.Jugador,
        })
      }
    })

    return players
  }, [external, internal, monitoringStatuses])

  // Filtered players for autocomplete - using smart search
  const filteredPlayers = useMemo(() => {
    return smartSearch(
      allPlayers,
      playerSearch,
      p => `${p.name} ${p.team}`,
      8
    )
  }, [playerSearch, allPlayers])

  const handleSelectPlayer = (player: typeof allPlayers[0]) => {
    setPlayerName(player.name)
    setTeam(player.team)
    setPlayerSource(player.source)
    setSelectedPlayerId(player.id)
    setPlayerSearch('')
    setShowPlayerDropdown(false)
  }

  // Handle manual player name entry (not from autocomplete)
  const handleManualPlayerName = (name: string) => {
    setPlayerName(name)
    // Try to detect source from name
    if (internalPlayerIds.has(name)) {
      setPlayerSource('interno')
    } else {
      const isInMonitoring = monitoringStatuses[name]?.status === 'seguimiento'
      setPlayerSource(isInMonitoring ? 'seguimiento' : 'externo')
    }
    setSelectedPlayerId(name)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !score) return

    setError('')
    setSubmitting(true)
    setAddedToMonitoring(false)

    // Determine if we should auto-add to monitoring
    const shouldAutoAddToMonitoring = playerSource === 'externo' && !!selectedPlayerId

    const result = await createEvaluation(
      {
        player_id: selectedPlayerId || undefined, // Link to player if selected
        player_name: playerName,
        team: team || undefined,
        position: position || undefined,
        role: role || undefined,
        match_date: matchDate,
        competition: competition || undefined,
        rival: rival || undefined,
        technical_score: score, // Single match performance score
        notes: notes || undefined,
        recommendation: recommendation || undefined,
        source: playerSource || undefined,
        auto_added_to_monitoring: shouldAutoAddToMonitoring,
      },
      user.id,
      scoutName
    )

    // Auto-add to seguimiento if external player
    if (result && shouldAutoAddToMonitoring && selectedPlayerId) {
      await setPlayerStatus(
        selectedPlayerId,
        'en_seguimiento',
        user.id,
        scoutName,
        `Auto-agregado al crear reporte scout`
      )
      setAddedToMonitoring(true)
      // Refresh monitoring statuses
      const statuses = await fetchAllStatuses()
      const statusMap: Record<string, { status: string }> = {}
      Object.entries(statuses).forEach(([id, record]) => {
        statusMap[id] = { status: record.status }
      })
      setMonitoringStatuses(statusMap)
    }

    setSubmitting(false)

    if (result) {
      setSuccess(true)
      // Reset form
      setPlayerName('')
      setTeam('')
      setPosition('')
      setRole('')
      setCompetition('')
      setRival('')
      setScore(undefined)
      setNotes('')
      setRecommendation('')
      setPlayerSource(null)
      setSelectedPlayerId(null)

      setTimeout(() => {
        setSuccess(false)
        setAddedToMonitoring(false)
      }, 5000)
    } else {
      setError('Error al guardar. Intenta de nuevo.')
    }
  }

  const isFormValid = playerName && matchDate && score && scoutName

  return (
    <div className="min-h-screen bg-apple-gray-50 dark:bg-apple-gray-900">
      {/* Header - Fixed on mobile */}
      <div className="sticky top-14 z-30 bg-white/80 dark:bg-apple-gray-900/80 backdrop-blur-xl border-b border-apple-gray-200/50 dark:border-apple-gray-800/50">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-green to-emerald-600 flex items-center justify-center shadow-lg shadow-brand-green/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">
                Reporte
              </h1>
              <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
                Evaluación post-partido
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="bg-gradient-to-r from-brand-green/5 to-emerald-500/5 rounded-2xl p-4 border border-brand-green/20">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-green/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-sm text-apple-gray-600 dark:text-apple-gray-400">
              <p className="font-medium text-apple-gray-800 dark:text-white mb-1">¿Cómo funciona?</p>
              <p>Registrá tu evaluación después de ver un partido. Tus reportes se suman al historial del jugador y ayudan al equipo a tomar mejores decisiones de fichaje.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Scout selector */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
            <Select
              label="Scout"
              value={scoutName}
              onChange={setScoutName}
              options={availableScouts.map(s => s.name)}
              placeholder="Selecciona scout..."
              required
            />
          </div>

          {/* Player info */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700 space-y-4">
            <h2 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
              Jugador
            </h2>

            {/* Player search/input */}
            <div className="relative">
              <label className="block text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-2">
                Nombre <span className="text-brand-green">*</span>
              </label>
              <input
                type="text"
                value={playerName || playerSearch}
                onChange={e => {
                  const val = e.target.value
                  setPlayerName(val)
                  setPlayerSearch(val)
                  setShowPlayerDropdown(val.length >= 2)
                }}
                onFocus={() => setShowPlayerDropdown(playerSearch.length >= 2)}
                placeholder="Nombre del jugador..."
                required
                className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 transition-all"
              />

              {/* Autocomplete dropdown */}
              {showPlayerDropdown && filteredPlayers.length > 0 && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowPlayerDropdown(false)}
                  />
                  <div className="absolute z-20 mt-2 w-full bg-white dark:bg-apple-gray-800 rounded-xl shadow-xl border border-apple-gray-200 dark:border-apple-gray-700 py-2 max-h-60 overflow-auto">
                    {filteredPlayers.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectPlayer(p)}
                        className="w-full px-4 py-3 text-left hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-apple-gray-900 dark:text-white">{p.name}</div>
                          <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${
                            p.source === 'interno'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : p.source === 'seguimiento'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                              : 'bg-apple-gray-100 text-apple-gray-600 dark:bg-apple-gray-700 dark:text-apple-gray-400'
                          }`}>
                            {p.source === 'interno' ? 'Interno' : p.source === 'seguimiento' ? 'Seguimiento' : 'Externo'}
                          </span>
                        </div>
                        <div className="text-xs text-apple-gray-500">{p.team}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Source indicator */}
              {playerSource && playerName && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium ${
                    playerSource === 'interno'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : playerSource === 'seguimiento'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>
                    {playerSource === 'interno' ? (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Jugador del plantel interno
                      </>
                    ) : playerSource === 'seguimiento' ? (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        En seguimiento
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" /></svg>
                        Jugador externo (se agregara a seguimiento)
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>

            <Input
              label="Equipo"
              value={team}
              onChange={setTeam}
              placeholder="Equipo del jugador"
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Posición"
                value={position}
                onChange={setPosition}
                options={POSITIONS}
                placeholder="Seleccionar..."
              />
              <Select
                label="Rol"
                value={role}
                onChange={setRole}
                options={ROLES}
                placeholder="Seleccionar..."
              />
            </div>
          </div>

          {/* Match info */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700 space-y-4">
            <h2 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
              Partido
            </h2>

            <Input
              label="Fecha"
              type="date"
              value={matchDate}
              onChange={setMatchDate}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Rival"
                value={rival}
                onChange={setRival}
                placeholder="Rival"
              />
              <Input
                label="Competencia"
                value={competition}
                onChange={setCompetition}
                placeholder="Competencia"
              />
            </div>
          </div>

          {/* Score */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
            <h2 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-4">
              Puntuación <span className="text-brand-green">*</span>
            </h2>
            <ScoreSelector value={score} onChange={setScore} />
          </div>

          {/* Observations */}
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700 space-y-4">
            <h2 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
              Observaciones
            </h2>

            <div>
              <label className="block text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-2">
                Notas del partido
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Fortalezas, debilidades, momentos destacados..."
                className="w-full px-4 py-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/20 transition-all resize-none"
              />
            </div>

            {/* Recommendation */}
            <div>
              <label className="block text-sm font-medium text-apple-gray-600 dark:text-apple-gray-400 mb-3">
                Recomendación
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'fichar', label: 'Fichar', color: 'brand-green', icon: 'M5 13l4 4L19 7' },
                  { value: 'seguir_observando', label: 'Seguir', color: 'amber-500', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
                  { value: 'descartar', label: 'Descartar', color: 'red-500', icon: 'M6 18L18 6M6 6l12 12' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRecommendation(recommendation === opt.value ? '' : opt.value as typeof recommendation)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      recommendation === opt.value
                        ? opt.color === 'brand-green'
                          ? 'border-brand-green bg-brand-green/10 text-brand-green'
                          : opt.color === 'amber-500'
                          ? 'border-amber-500 bg-amber-500/10 text-amber-500'
                          : 'border-red-500 bg-red-500/10 text-red-500'
                        : 'border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400 hover:border-apple-gray-300 dark:hover:border-apple-gray-600'
                    }`}
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} />
                    </svg>
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="p-4 rounded-xl bg-brand-green/10 border border-brand-green/30">
              <div className="flex items-center justify-center gap-2 text-brand-green">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Evaluación guardada</span>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Fixed submit button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-apple-gray-900/80 backdrop-blur-xl border-t border-apple-gray-200/50 dark:border-apple-gray-800/50 z-30">
        <div className="max-w-2xl mx-auto">
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting || !isFormValid}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-brand-green to-emerald-600 hover:from-emerald-600 hover:to-brand-green text-white font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-green/25 active:scale-[0.98]"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-3">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Guardando...
              </span>
            ) : (
              'Guardar Evaluación'
            )}
          </button>
        </div>
      </div>

      {/* Recent evaluations - Desktop sidebar (read-only) */}
      {recentEvaluations.length > 0 && (
        <div className="hidden xl:block fixed right-6 top-32 w-72">
          <div className="bg-white dark:bg-apple-gray-800 rounded-2xl p-5 shadow-sm border border-apple-gray-100 dark:border-apple-gray-700">
            <h3 className="text-sm font-semibold text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider mb-4">
              Ultimas evaluaciones
            </h3>
            <div className="space-y-3">
              {recentEvaluations.slice(0, 5).map(ev => (
                <div
                  key={ev.id}
                  className="p-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-700/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-apple-gray-900 dark:text-white text-sm truncate">
                        {ev.player_name}
                      </div>
                      <div className="text-xs text-apple-gray-500 truncate">
                        {ev.team} - {new Date(ev.match_date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                      </div>
                    </div>
                    {ev.technical_score && (
                      <div className={`text-lg font-bold ml-2 ${
                        ev.technical_score >= 8 ? 'text-brand-green' :
                        ev.technical_score >= 6 ? 'text-emerald-500' :
                        ev.technical_score >= 4 ? 'text-amber-500' : 'text-red-500'
                      }`}>
                        {ev.technical_score}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
