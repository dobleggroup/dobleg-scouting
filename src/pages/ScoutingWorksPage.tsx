import { useState, useMemo } from 'react'
import { SCOUTING_PROJECTS, getNationalityFlag, getPositionColor, type ScoutingProject, type ScoutedPlayer } from '@/data/scoutingProjects'

// Project Card Component
function ProjectCard({ project, onClick }: { project: ScoutingProject; onClick: () => void }) {
  const statusColors = {
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'in-progress': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    upcoming: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  }

  const statusLabels = {
    completed: 'Completado',
    'in-progress': 'En Progreso',
    upcoming: 'Próximamente'
  }

  return (
    <button
      onClick={onClick}
      disabled={project.status === 'upcoming'}
      className={`group relative w-full text-left bg-white dark:bg-apple-gray-800 rounded-2xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden transition-all duration-300 ${
        project.status === 'upcoming'
          ? 'opacity-60 cursor-not-allowed'
          : 'hover:shadow-xl hover:border-brand-green dark:hover:border-brand-green hover:-translate-y-1'
      }`}
    >
      {/* Header gradient */}
      <div className="h-32 bg-gradient-to-br from-brand-green via-emerald-500 to-teal-600 relative">
        <div className="absolute inset-0 bg-black/10" />
        <div className="absolute bottom-4 left-5">
          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusColors[project.status]}`}>
            {statusLabels[project.status]}
          </span>
        </div>
        <div className="absolute top-4 right-4 text-white/80 text-sm font-medium">
          {project.year}
        </div>
        {/* Trophy icon for completed */}
        {project.status === 'completed' && (
          <div className="absolute top-4 left-4">
            <svg className="w-8 h-8 text-white/90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C13.1 2 14 2.9 14 4H19C20.1 4 21 4.9 21 6V8C21 10.2 19.2 12 17 12C16.5 13.7 15.1 15 13.4 15.5L15 20H17V22H7V20H9L10.6 15.5C8.9 15 7.5 13.7 7 12C4.8 12 3 10.2 3 8V6C3 4.9 3.9 4 5 4H10C10 2.9 10.9 2 12 2M5 6V8C5 9.1 5.9 10 7 10V6H5M17 10C18.1 10 19 9.1 19 8V6H17V10Z"/>
            </svg>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white group-hover:text-brand-green transition-colors">
              {project.title}
            </h3>
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
              {project.subtitle}
            </p>
          </div>
          <span className="px-2 py-0.5 text-xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 rounded">
            {project.category}
          </span>
        </div>

        <p className="text-sm text-apple-gray-600 dark:text-apple-gray-400 mb-4 line-clamp-2">
          {project.description}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-apple-gray-600 dark:text-apple-gray-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>{project.totalPlayers} jugadores</span>
          </div>
          {project.highlightedPlayers > 0 && (
            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              <span>{project.highlightedPlayers} destacados</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700">
          <div className="flex items-center gap-1.5 text-xs text-apple-gray-500 dark:text-apple-gray-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {project.location}
          </div>
          <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
            {project.dateRange}
          </div>
        </div>
      </div>

      {/* Arrow indicator for clickable cards */}
      {project.status !== 'upcoming' && (
        <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-5 h-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      )}
    </button>
  )
}

// Player Row Component
function PlayerRow({ player, index }: { player: ScoutedPlayer; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`border-b border-apple-gray-100 dark:border-apple-gray-700/50 last:border-b-0 ${
      player.destacado ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800/50 transition-colors text-left"
      >
        {/* Rank / Highlight indicator */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
          player.destacado
            ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm'
            : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300'
        }`}>
          {player.destacado ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
          ) : (
            index + 1
          )}
        </div>

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-apple-gray-800 dark:text-white truncate">
              {player.Jugador}
            </span>
            <span className="text-lg" title={player.Nacionalidad}>
              {getNationalityFlag(player.Nacionalidad)}
            </span>
          </div>
          <div className="text-xs text-apple-gray-500 dark:text-apple-gray-400 truncate">
            {player.Club} · {player.Edad} años
          </div>
        </div>

        {/* Position badge */}
        <div className="hidden sm:flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-medium text-white rounded ${getPositionColor(player.Posicion)}`}>
            {player.Posicion}
          </span>
        </div>

        {/* TM Link */}
        {player.FichaTecnica && (
          <a
            href={player.FichaTecnica}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 text-apple-gray-400 hover:text-brand-green transition-colors"
            title="Ver en Transfermarkt"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

        {/* Expand icon */}
        <svg className={`w-4 h-4 text-apple-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-1">
          <div className="ml-11 p-3 bg-apple-gray-50 dark:bg-apple-gray-800/50 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 uppercase tracking-wider">
                Rol:
              </span>
              <span className="text-sm text-apple-gray-700 dark:text-apple-gray-300">
                {player.Rol}
              </span>
            </div>
            <p className="text-sm text-apple-gray-600 dark:text-apple-gray-400 leading-relaxed">
              {player.Comentario}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// Project Detail View
function ProjectDetail({ project, onBack }: { project: ScoutingProject; onBack: () => void }) {
  const [filter, setFilter] = useState<'all' | 'highlighted'>('all')
  const [positionFilter, setPositionFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Get unique positions
  const positions = useMemo(() => {
    const posSet = new Set(project.players.map(p => p.Posicion))
    return Array.from(posSet).sort()
  }, [project.players])

  // Get unique nationalities for stats
  const nationalityStats = useMemo(() => {
    const stats: Record<string, number> = {}
    project.players.forEach(p => {
      stats[p.Nacionalidad] = (stats[p.Nacionalidad] || 0) + 1
    })
    return Object.entries(stats).sort((a, b) => b[1] - a[1])
  }, [project.players])

  // Filtered players
  const filteredPlayers = useMemo(() => {
    return project.players.filter(p => {
      if (filter === 'highlighted' && !p.destacado) return false
      if (positionFilter !== 'all' && p.Posicion !== positionFilter) return false
      if (searchTerm && !p.Jugador.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })
  }, [project.players, filter, positionFilter, searchTerm])

  return (
    <div>
      {/* Back button & Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400 hover:text-brand-green dark:hover:text-brand-green transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver a Proyectos
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white">
                {project.title}
              </h1>
              <span className="px-2 py-0.5 text-xs font-medium bg-brand-green/10 text-brand-green rounded">
                {project.subtitle}
              </span>
            </div>
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
              {project.location} · {project.dateRange}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-4 border border-apple-gray-200 dark:border-apple-gray-700">
          <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">{project.totalPlayers}</p>
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Jugadores Evaluados</p>
        </div>
        <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-4 border border-apple-gray-200 dark:border-apple-gray-700">
          <p className="text-2xl font-bold text-emerald-500">{project.highlightedPlayers}</p>
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Destacados</p>
        </div>
        <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-4 border border-apple-gray-200 dark:border-apple-gray-700">
          <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">{positions.length}</p>
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Posiciones</p>
        </div>
        <div className="bg-white dark:bg-apple-gray-800 rounded-xl p-4 border border-apple-gray-200 dark:border-apple-gray-700">
          <p className="text-2xl font-bold text-apple-gray-800 dark:text-white">{nationalityStats.length}</p>
          <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">Nacionalidades</p>
        </div>
      </div>

      {/* Nationalities breakdown */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 mb-6">
        <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300 mb-3">
          Distribución por Nacionalidad
        </h3>
        <div className="flex flex-wrap gap-2">
          {nationalityStats.map(([nat, count]) => (
            <div
              key={nat}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-apple-gray-50 dark:bg-apple-gray-700/50 rounded-lg"
            >
              <span className="text-base">{getNationalityFlag(nat)}</span>
              <span className="text-sm text-apple-gray-600 dark:text-apple-gray-300">{nat}</span>
              <span className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 bg-apple-gray-200 dark:bg-apple-gray-600 px-1.5 rounded">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-apple-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar jugador..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green/50 text-apple-gray-800 dark:text-white"
            />
          </div>

          {/* Highlight filter */}
          <div className="flex gap-1 p-1 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-lg">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filter === 'all'
                  ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white shadow-sm'
                  : 'text-apple-gray-600 dark:text-apple-gray-400'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter('highlighted')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                filter === 'highlighted'
                  ? 'bg-white dark:bg-apple-gray-600 text-apple-gray-800 dark:text-white shadow-sm'
                  : 'text-apple-gray-600 dark:text-apple-gray-400'
              }`}
            >
              <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
              </svg>
              Destacados
            </button>
          </div>

          {/* Position filter */}
          <select
            value={positionFilter}
            onChange={e => setPositionFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-apple-gray-50 dark:bg-apple-gray-700 border border-apple-gray-200 dark:border-apple-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-green/50 text-apple-gray-800 dark:text-white"
          >
            <option value="all">Todas las posiciones</option>
            {positions.map(pos => (
              <option key={pos} value={pos}>{pos}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Players List */}
      <div className="bg-white dark:bg-apple-gray-800 rounded-xl border border-apple-gray-200 dark:border-apple-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800/50">
          <h3 className="font-semibold text-apple-gray-800 dark:text-white">
            Jugadores ({filteredPlayers.length})
          </h3>
        </div>

        {filteredPlayers.length === 0 ? (
          <div className="p-8 text-center text-apple-gray-500 dark:text-apple-gray-400">
            No se encontraron jugadores con los filtros seleccionados.
          </div>
        ) : (
          <div className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
            {filteredPlayers.map((player, index) => (
              <PlayerRow key={player.Jugador} player={player} index={index} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Main Page Component
export default function ScoutingWorksPage() {
  const [selectedProject, setSelectedProject] = useState<ScoutingProject | null>(null)

  if (selectedProject) {
    return (
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
        <ProjectDetail project={selectedProject} onBack={() => setSelectedProject(null)} />
      </div>
    )
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">
          Trabajos de Scouting
        </h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          Proyectos de scouting y evaluación de talentos en competiciones juveniles
        </p>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SCOUTING_PROJECTS.map(project => (
          <ProjectCard
            key={project.id}
            project={project}
            onClick={() => setSelectedProject(project)}
          />
        ))}
      </div>

      {/* Empty state for future projects */}
      {SCOUTING_PROJECTS.length < 3 && (
        <div className="mt-6 p-8 border-2 border-dashed border-apple-gray-200 dark:border-apple-gray-700 rounded-2xl text-center">
          <svg className="w-12 h-12 mx-auto text-apple-gray-300 dark:text-apple-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            Más proyectos de scouting próximamente
          </p>
        </div>
      )}
    </div>
  )
}
