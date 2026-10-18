import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Segmented } from '@/features/tablero/components/Panel'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { agencyKey } from '@/services/agencyPlayersService'
import { nameKeys } from '@/services/wyscoutEvolutionService'
import { useWyscoutMonthly } from '../useWyscoutMonthly'
import { METRIC_BY_KEY, POS_GROUP_LABEL, metricsFor } from '../metrics'
import { groupPeriods, monthLabel, type Grouping } from '../periods'
import { playerConclusions, playerGroup } from '../conclusions'
import { evolution, playerValues, WINDOW_LABEL } from '../analysis'
import ConclusionList from './ConclusionList'
import EvolutionChart from './EvolutionChart'
import AgencyBars from './AgencyBars'
import SeasonTable from './SeasonTable'
import MetricSelect from './MetricSelect'

/** Bloque de la pestaña: título claro + una línea de "para qué sirve". */
export function Section({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-6 first:pt-0 border-t first:border-t-0 border-apple-gray-100 dark:border-apple-gray-700/50">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-apple-gray-800 dark:text-white">{title}</h3>
          {subtitle && <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/**
 * Pestaña "Rendimiento" de la ficha (Scouting Interno). Junta los datos de
 * Wyscout por temporada con lo que ya tenía la pestaña (rating partido a
 * partido, métricas de Wyscout partido a partido e historial), que llegan
 * armados desde la ficha.
 */
export default function PlayerWyscoutTab({ playerName, ratingSection, perMatchSection, historySection }: {
  playerName: string
  ratingSection?: ReactNode
  perMatchSection?: ReactNode
  historySection?: ReactNode
}) {
  const { rows, byPlayer, photo, name } = useWyscoutMonthly()
  const key = useMemo(() => {
    const keys = new Set(nameKeys(playerName))
    const hit = AGENCY_PLAYERS.find(p => [...nameKeys(p.fullName), ...nameKeys(p.shortName)].some(k => keys.has(k)))
    return agencyKey(hit?.fullName ?? playerName)
  }, [playerName])
  const myRows = byPlayer.get(key) ?? []
  const group = playerGroup(myRows)
  const options = metricsFor(group)
  const [metricKey, setMetricKey] = useState<string | null>(null)
  const metric = METRIC_BY_KEY[metricKey ?? ''] ?? options[0]
  const [grouping, setGrouping] = useState<Grouping>('season')
  const [showPerMatch, setShowPerMatch] = useState(false)

  const conclusions = useMemo(() => (rows ? playerConclusions(myRows, rows) : []), [rows, myRows])
  const evo = useMemo(() => evolution(myRows, byPlayer, metric, grouping), [myRows, byPlayer, metric, grouping])
  const bars = useMemo(() => playerValues(byPlayer, metric, '12m', { group }).map(v => ({ ...v, name: name(v.key) })), [byPlayer, metric, group, name])
  const seasons = useMemo(() => groupPeriods(myRows, 'season'), [myRows])
  const groupMany = group ? POS_GROUP_LABEL[group].many : 'jugadores'

  const hasWyscout = rows !== null && myRows.length > 0
  const matches = myRows.reduce((s, r) => s + r.matches, 0)
  const minutes = myRows.reduce((s, r) => s + r.minutes, 0)

  return (
    <div className="space-y-6">
      {rows === null && <div className="h-24 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />}

      {hasWyscout && (
        <Section title="En pocas palabras" subtitle={`Lo más importante de sus números, comparado con él mismo y con los ${groupMany} de la agencia.`}>
          <div className="flex flex-wrap gap-2 text-2xs mb-3">
            {group && <span className="px-2.5 py-1 rounded-full bg-brand-green/10 text-brand-green font-semibold">Juega de {POS_GROUP_LABEL[group].one}</span>}
            <span className="px-2.5 py-1 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300">{matches} partidos con datos de Wyscout · {minutes.toLocaleString('es-AR')} minutos</span>
            <span className="px-2.5 py-1 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300">De {monthLabel(myRows[0].month)} a {monthLabel(myRows[myRows.length - 1].month)}</span>
          </div>
          <ConclusionList items={conclusions} />
        </Section>
      )}

      {ratingSection && <Section title="Rating partido a partido" subtitle="Nota de cada partido. La línea punteada es su promedio.">{ratingSection}</Section>}

      {rows !== null && !hasWyscout && (
        <div className="rounded-apple bg-apple-gray-50 dark:bg-apple-gray-700/30 px-4 py-3 text-sm text-apple-gray-600 dark:text-apple-gray-300">
          Todavía no hay datos de Wyscout de este jugador. Cuando se suban sus Excel en{' '}
          <Link to="/carga-wyscout" className="text-brand-green font-medium hover:underline">Carga de Wyscout</Link>, acá aparecen sus temporadas, su evolución y las conclusiones.
        </div>
      )}

      {hasWyscout && (
        <>
          <Section title="Temporada por temporada" subtitle="Sus números de cada temporada en lo que más importa para su posición.">
            <SeasonTable periods={seasons} metrics={options.slice(0, 8)} />
          </Section>

          <Section
            title="Cómo evolucionó"
            subtitle={metric.hint}
            actions={<>
              <MetricSelect label="Métrica" value={metric.key} metrics={options} onChange={setMetricKey} />
              <Segmented label="Agrupar por" value={grouping} onChange={setGrouping}
                options={[{ id: 'season', label: 'Temporada' }, { id: 'year', label: 'Año' }, { id: 'month', label: 'Mes' }]} />
            </>}
          >
            <EvolutionChart points={evo} metric={metric} />
            {perMatchSection && (
              <div className="mt-4">
                <button onClick={() => setShowPerMatch(v => !v)} aria-expanded={showPerMatch}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-green hover:underline">
                  {showPerMatch ? 'Ocultar' : 'Ver'} partido a partido (todas las columnas de Wyscout)
                  <svg className={`w-3 h-3 transition-transform ${showPerMatch ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {showPerMatch && <div className="mt-3 animate-fade-in">{perMatchSection}</div>}
              </div>
            )}
          </Section>

          <Section title={`Contra los ${groupMany} de la agencia`} subtitle={`${metric.label}${metric.unit === '%' ? '' : ' por partido'} · ${WINDOW_LABEL['12m'].toLowerCase()}. Cambiá la métrica arriba, en "Cómo evolucionó".`}>
            <AgencyBars values={bars} metric={metric} highlight={key} photo={photo} limit={8} />
          </Section>
        </>
      )}

      {historySection && <Section title="Últimos partidos" subtitle="Resultado, minutos, goles, asistencias y rating de cada partido.">{historySection}</Section>}

      {hasWyscout && (
        <p className="text-2xs text-apple-gray-400">
          Datos de Wyscout cargados en <Link to="/carga-wyscout" className="text-brand-green hover:underline">Carga de Wyscout</Link>.
          Para comparar con más jugadores, entrá a <Link to="/rendimiento-individual" className="text-brand-green hover:underline">Rendimiento individual</Link>.
        </p>
      )}
    </div>
  )
}
