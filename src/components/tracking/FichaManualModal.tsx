import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { fetchEvaluationsByName } from '@/services/scoutEvaluationService'
import type { ScoutEvaluation } from '@/services/scoutEvaluationService'
import type { ScoutPlayer } from '@/types'
import LinkPlayerModal from './LinkPlayerModal'

const ADMIN_EMAIL = 'marcoscucho99@gmail.com'

const RECOMMENDATION_CONFIG = {
  fichar:            { label: 'Fichar',            color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  seguir_observando: { label: 'Seguir observando', color: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  descartar:         { label: 'Descartar',         color: 'text-red-500',                        bg: 'bg-red-500/10 border-red-500/20' },
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return dateStr }
}

function ScoreDot({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-apple-gray-400">—</span>
  const color = score >= 8 ? 'bg-brand-green' : score >= 6 ? 'bg-emerald-500' : score >= 4 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = score >= 8 ? 'text-brand-green' : score >= 6 ? 'text-emerald-500' : score >= 4 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
      <span className={`font-bold tabular-nums ${textColor}`}>{score.toFixed(1)}</span>
    </div>
  )
}

interface Props {
  player: ScoutPlayer
  onClose: () => void
  onLinked?: (updated: Pick<ScoutPlayer, 'id' | 'player_db_id' | 'player_db_source'>) => void
}

export default function FichaManualModal({ player, onClose, onLinked }: Props) {
  const { user } = useAuth()
  const isAdmin = user?.email === ADMIN_EMAIL

  const [evaluations, setEvaluations] = useState<ScoutEvaluation[]>([])
  const [loadingEvals, setLoadingEvals] = useState(true)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'evaluaciones'>('info')

  useEffect(() => {
    fetchEvaluationsByName(player.full_name).then(evals => {
      setEvaluations(evals)
      setLoadingEvals(false)
      if (evals.length > 0) setActiveTab('evaluaciones')
    })
  }, [player.full_name])

  const avgScore = evaluations.length > 0
    ? evaluations.reduce((acc, e) => acc + (e.technical_score ?? e.overall_score ?? 0), 0) / evaluations.length
    : null

  const initials = player.full_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  const infoItems: { label: string; value: string | number | null | undefined }[] = [
    { label: 'Club',         value: player.club },
    { label: 'Liga',         value: player.liga },
    { label: 'Posición',     value: player.posicion },
    { label: 'Rol',          value: player.rol },
    { label: 'Edad',         value: player.edad ? `${player.edad} años` : null },
    { label: 'F. Nac.',      value: player.fecha_nacimiento ? formatDate(player.fecha_nacimiento) : null },
    { label: 'Nac.',         value: player.nacionalidad },
    { label: 'Pie',          value: player.pie ? player.pie.charAt(0).toUpperCase() + player.pie.slice(1) : null },
    { label: 'Altura',       value: player.altura ? `${player.altura} cm` : null },
    { label: 'Agente',       value: player.agente },
    { label: 'Fuente',       value: player.fuente_deteccion },
  ].filter(i => i.value)

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">

          {/* ── Header ── */}
          <div className="px-5 pt-5 pb-4 border-b border-apple-gray-100 dark:border-apple-gray-700 flex-shrink-0">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-12 h-12 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-700 flex items-center justify-center flex-shrink-0 text-base font-bold text-apple-gray-500">
                {initials}
              </div>

              {/* Name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold text-apple-gray-900 dark:text-white truncate">
                    {player.full_name}
                  </h2>
                  {player.prioridad === 'alta' && (
                    <span className="px-1.5 py-0.5 rounded-md text-2xs font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">ALTA</span>
                  )}
                  {player.in_scouts_gg_list && (
                    <span className="px-1.5 py-0.5 rounded-md text-2xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">GG</span>
                  )}
                  {player.in_datos_list && (
                    <span className="px-1.5 py-0.5 rounded-md text-2xs font-medium bg-purple-500/10 text-purple-500 border border-purple-500/20">Datos</span>
                  )}
                </div>

                {/* Subtitle */}
                <p className="text-xs text-apple-gray-500 mt-0.5 truncate">
                  {[player.posicion, player.club, player.liga].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                </p>

                {/* DB status */}
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {player.player_db_id ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-brand-green/10 text-brand-green border border-brand-green/20">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Vinculado · {player.player_db_id}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400 border border-apple-gray-200 dark:border-apple-gray-600">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Sin ficha en base de datos
                    </span>
                  )}
                  {avgScore !== null && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold ${
                      avgScore >= 8 ? 'bg-brand-green/10 text-brand-green border border-brand-green/20' :
                      avgScore >= 6 ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                      'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                    }`}>
                      Score scouts: {avgScore.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-apple-gray-400 hover:text-apple-gray-600 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-3">
              {(['info', 'evaluaciones'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-brand-green text-white'
                      : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700'
                  }`}
                >
                  {tab === 'info' ? 'Información' : `Evaluaciones${evaluations.length > 0 ? ` (${evaluations.length})` : ''}`}
                </button>
              ))}
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-y-auto">

            {/* INFO TAB */}
            {activeTab === 'info' && (
              <div className="px-5 py-4 space-y-4">

                {/* Info grid */}
                {infoItems.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {infoItems.map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="text-sm text-apple-gray-800 dark:text-white font-medium">{value}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-apple-gray-400 text-center py-4">No hay datos de perfil registrados</p>
                )}

                {/* Comentario */}
                {player.comentario && (
                  <div className="p-3 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-xl">
                    <p className="text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider mb-1">Comentario</p>
                    <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200 leading-relaxed">{player.comentario}</p>
                  </div>
                )}

                {/* Links */}
                {(player.transfermarkt_url || player.video_url) && (
                  <div className="flex items-center gap-2">
                    {player.transfermarkt_url && (
                      <a
                        href={player.transfermarkt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Transfermarkt
                      </a>
                    )}
                    {player.video_url && (
                      <a
                        href={player.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Ver video
                      </a>
                    )}
                  </div>
                )}

                {/* Files */}
                {player.files && player.files.length > 0 && (
                  <div>
                    <p className="text-2xs font-semibold text-apple-gray-400 uppercase tracking-wider mb-2">Archivos</p>
                    <div className="space-y-1.5">
                      {player.files.map(f => (
                        <a
                          key={f.name}
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                        >
                          <svg className="w-4 h-4 text-apple-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-xs text-apple-gray-700 dark:text-apple-gray-200 truncate flex-1">{f.name}</span>
                          <span className="text-2xs text-apple-gray-400 flex-shrink-0">{f.uploaded_by_name}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {infoItems.length === 0 && !player.comentario && !player.transfermarkt_url && !player.video_url && (player.files?.length ?? 0) === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-apple-gray-400 mb-1">No hay información registrada</p>
                    <p className="text-xs text-apple-gray-400">
                      {isAdmin ? 'Vinculá este jugador a la base de datos para ver su ficha completa.' : 'Pedile al admin que vincule este jugador.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* EVALUACIONES TAB */}
            {activeTab === 'evaluaciones' && (
              <div className="px-5 py-4">
                {loadingEvals ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : evaluations.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-apple-gray-400">Sin evaluaciones registradas</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {evaluations.map(ev => {
                      const rec = ev.recommendation ? RECOMMENDATION_CONFIG[ev.recommendation] : null
                      const score = ev.technical_score ?? ev.overall_score
                      return (
                        <div key={ev.id} className="p-3 bg-apple-gray-50 dark:bg-apple-gray-800 rounded-xl space-y-2">
                          {/* Eval header */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-apple-gray-800 dark:text-white truncate">
                                {ev.scout_name}
                              </p>
                              <p className="text-2xs text-apple-gray-500">
                                {formatDate(ev.match_date)}
                                {ev.competition && ` · ${ev.competition}`}
                                {ev.rival && ` vs ${ev.rival}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {score !== null && <ScoreDot score={score} />}
                              {rec && (
                                <span className={`px-1.5 py-0.5 rounded-md text-2xs font-medium border ${rec.bg} ${rec.color}`}>
                                  {rec.label}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Sub-scores */}
                          {(ev.tactical_score || ev.physical_score || ev.mental_score || ev.potential_score) && (
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                { label: 'Táct.', val: ev.tactical_score },
                                { label: 'Fís.',  val: ev.physical_score },
                                { label: 'Ment.', val: ev.mental_score },
                                { label: 'Pot.',  val: ev.potential_score },
                              ].map(({ label, val }) => val !== null && val !== undefined ? (
                                <div key={label} className="text-center">
                                  <p className="text-2xs text-apple-gray-400">{label}</p>
                                  <p className="text-xs font-semibold text-apple-gray-700 dark:text-apple-gray-200">{val.toFixed(1)}</p>
                                </div>
                              ) : null)}
                            </div>
                          )}

                          {/* Notes */}
                          {ev.strengths && (
                            <div>
                              <p className="text-2xs font-semibold text-green-600 dark:text-green-400 mb-0.5">Fortalezas</p>
                              <p className="text-xs text-apple-gray-600 dark:text-apple-gray-300 leading-relaxed">{ev.strengths}</p>
                            </div>
                          )}
                          {ev.weaknesses && (
                            <div>
                              <p className="text-2xs font-semibold text-red-500 mb-0.5">Debilidades</p>
                              <p className="text-xs text-apple-gray-600 dark:text-apple-gray-300 leading-relaxed">{ev.weaknesses}</p>
                            </div>
                          )}
                          {ev.notes && (
                            <div>
                              <p className="text-2xs font-semibold text-apple-gray-400 mb-0.5">Notas</p>
                              <p className="text-xs text-apple-gray-600 dark:text-apple-gray-300 leading-relaxed">{ev.notes}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="px-5 py-3 border-t border-apple-gray-100 dark:border-apple-gray-700 flex-shrink-0 flex items-center justify-between">
            {isAdmin ? (
              <button
                onClick={() => setShowLinkModal(true)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  player.player_db_id
                    ? 'bg-brand-green/10 text-brand-green hover:bg-brand-green/20'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 border border-amber-500/20'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                {player.player_db_id ? 'Cambiar vínculo' : 'Vincular a base de datos'}
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* Nested LinkPlayerModal */}
      {showLinkModal && (
        <LinkPlayerModal
          player={player}
          onClose={() => setShowLinkModal(false)}
          onLinked={updated => {
            onLinked?.(updated)
            setShowLinkModal(false)
            // Close ficha modal if linked — will reopen as full ficha next click
            onClose()
          }}
        />
      )}
    </>
  )
}
