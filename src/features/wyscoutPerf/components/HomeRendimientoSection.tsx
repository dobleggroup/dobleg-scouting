import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAgencyPlayers, agencyKey } from '@/services/agencyPlayersService'
import { fetchUploads, isUploadWindow, uploadedThisMonth } from '@/services/wyscoutPerfService'
import { useWyscoutMonthly } from '../useWyscoutMonthly'
import { METRIC_BY_KEY } from '../metrics'
import { playerConclusions, playerTrend, type TrendResult } from '../conclusions'
import { playerValues, type Window } from '../analysis'
import ConclusionList from './ConclusionList'
import AgencyBars from './AgencyBars'
import TrendList from './TrendList'

const HOME_METRICS = ['regates_ok_90', 'duelos_pct', 'ult_tercio_ok_90', 'recup_rival_90', 'goles_asist_90', 'perdidas_propia_90']
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function Card({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  return (
    <section className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-semibold text-apple-gray-800 dark:text-white">{title}</h2>
        {to && <Link to={to} className="text-xs font-medium text-brand-green hover:text-emerald-600 transition-colors flex-shrink-0">Ver todo →</Link>}
      </div>
      {children}
    </section>
  )
}

/** Aviso de principio de mes: faltan cargar los Excel de Wyscout. */
function UploadReminder() {
  const [missing, setMissing] = useState<number | null>(null)
  const total = useMemo(() => getAgencyPlayers().length, [])
  useEffect(() => {
    if (!isUploadWindow()) return
    fetchUploads().then(u => {
      const done = uploadedThisMonth(u)
      setMissing(getAgencyPlayers().filter(p => !done.has(agencyKey(p.fullName))).length)
    }).catch(() => {})
  }, [])
  if (!missing) return null
  return (
    <Link to="/carga-wyscout" className="flex items-center gap-3 px-4 py-3 rounded-apple-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 hover:brightness-95 transition">
      <span className="text-lg leading-none">⏰</span>
      <span className="flex-1 text-sm text-amber-800 dark:text-amber-200">
        <span className="font-semibold">Faltan cargar los datos de Wyscout de {MONTHS[new Date().getMonth()]}</span> de {missing} de {total} jugadores.
      </span>
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Cargar →</span>
    </Link>
  )
}

/** Sección "Rendimiento individual" del Inicio: lo más destacado de los datos de Wyscout. */
export default function HomeRendimientoSection() {
  const { rows, byPlayer, photo, name } = useWyscoutMonthly()
  const navigate = useNavigate()
  const [metricKey, setMetricKey] = useState(HOME_METRICS[0])
  const [win, setWin] = useState<Window>('12m')
  const metric = METRIC_BY_KEY[metricKey]

  const highlights = useMemo(() => {
    if (!rows) return []
    return [...byPlayer.entries()]
      .flatMap(([k, rs]) => playerConclusions(rs, rows).slice(0, 1).map(c => ({ ...c, who: name(k), onClick: () => navigate(`/jugador/${encodeURIComponent(name(k))}?source=interno`) })))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [rows, byPlayer, name, navigate])
  const ranking = useMemo(() => playerValues(byPlayer, metric, win).map(v => ({ ...v, name: name(v.key) })), [byPlayer, metric, win, name])
  const trends = useMemo(() => [...byPlayer.values()].map(rs => playerTrend(rs)).filter((t): t is TrendResult => !!t)
    .map(t => ({ ...t, player_name: name(t.player_key) })), [byPlayer, name])

  if (rows === null) return <div className="h-40 rounded-apple-lg bg-apple-gray-100 dark:bg-apple-gray-800 animate-pulse" />

  if (rows.length === 0) {
    return (
      <>
        <UploadReminder />
        <Card title="Rendimiento individual">
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            Todavía no hay datos de Wyscout. Se cargan en <Link to="/carga-wyscout" className="text-brand-green hover:underline">Carga de Wyscout</Link>.
          </p>
        </Card>
      </>
    )
  }

  return (
    <>
      <UploadReminder />

      <Card title="Lo más destacado" to="/rendimiento-individual">
        <ConclusionList items={highlights} who />
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Ranking de la agencia" to="/rendimiento-individual">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {(['3m', '12m'] as Window[]).map(w => (
              <button key={w} onClick={() => setWin(w)}
                className={`px-3 py-1 rounded-lg text-2xs font-semibold transition-all ${win === w ? 'bg-apple-gray-900 text-white dark:bg-white dark:text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-500 dark:text-apple-gray-400'}`}>
                {w === '3m' ? 'Últimos 3 meses' : 'Último año'}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin mb-1 pb-1">
            {HOME_METRICS.map(k => (
              <button key={k} onClick={() => setMetricKey(k)}
                className={`px-3 py-1.5 rounded-full text-2xs font-semibold whitespace-nowrap transition-all ${metricKey === k ? 'bg-brand-green text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'}`}>
                {METRIC_BY_KEY[k].label}
              </button>
            ))}
          </div>
          <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3">{metric.hint}</p>
          <AgencyBars values={ranking} metric={metric} photo={photo} limit={8} />
        </Card>

        <Card title="En alza y en baja" to="/rendimiento-individual">
          <p className="text-2xs text-apple-gray-400 dark:text-apple-gray-500 mb-3">Últimos 6 meses contra el año anterior, en las métricas de su posición.</p>
          <TrendList trends={trends} photo={photo} limit={4} />
        </Card>
      </div>
    </>
  )
}
