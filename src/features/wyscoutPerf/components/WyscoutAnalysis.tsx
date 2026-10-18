import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Panel, { PanelSkeleton, Segmented } from '@/features/tablero/components/Panel'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import { normalizeName } from '@/utils/scoring'
import { useWyscoutMonthly } from '../useWyscoutMonthly'
import { METRIC_BY_KEY, METRICS, POS_GROUP_LABEL, metricsFor, type PosGroup } from '../metrics'
import { groupPeriods, type Grouping } from '../periods'
import { playerConclusions, playerGroup, playerTrend, type TrendResult } from '../conclusions'
import { WINDOW_LABEL, evolution, playerValues, windowTotals, type Window } from '../analysis'
import ConclusionList from './ConclusionList'
import EvolutionChart from './EvolutionChart'
import AgencyBars from './AgencyBars'
import ScatterChart from './ScatterChart'
import TrendList from './TrendList'
import SeasonTable from './SeasonTable'
import MetricSelect from './MetricSelect'

export const DEFAULT_SCATTER: Record<PosGroup, [string, string]> = {
  ARQ: ['pases_pct', 'largos_pct'],
  DEF: ['duelos_def_pct', 'adelante_ok_90'],
  LAT: ['centros_ok_90', 'duelos_def_pct'],
  MED: ['ult_tercio_ok_90', 'recup_90'],
  EXT: ['regates_ok_90', 'pases_area_ok_90'],
  DEL: ['xg_90', 'goles_90'],
}

const GROUPING_OPTS: { id: Grouping; label: string }[] = [
  { id: 'season', label: 'Temporada' }, { id: 'year', label: 'Año' }, { id: 'month', label: 'Mes' },
]
const WINDOW_OPTS: { id: Window; label: string }[] = [
  { id: '3m', label: '3 meses' }, { id: '12m', label: '12 meses' }, { id: 'all', label: 'Carrera' },
]

const SOURCE = (
  <p>
    Sale de los Excel "Player stats" de Wyscout que se suben en{' '}
    <Link to="/carga-wyscout" className="text-brand-green hover:underline">Carga de Wyscout</Link>.
    "Por partido" quiere decir cada 90 minutos jugados, así se puede comparar a un titular con uno que entra del banco.
    Solo se cuentan jugadores con 450 minutos o más en el período (270 en los últimos 3 meses).
  </p>
)

/** Sección Wyscout de Rendimiento individual: conclusiones, evolución, comparación con la agencia. */
export default function WyscoutAnalysis() {
  const { rows, byPlayer, error, photo, name } = useWyscoutMonthly()
  const [selected, setSelected] = useState<string>('')
  const [metricKey, setMetricKey] = useState('regates_ok_90')
  const [grouping, setGrouping] = useState<Grouping>('season')
  const [win, setWin] = useState<Window>('12m')
  const [onlyGroup, setOnlyGroup] = useState(true)
  const [scatterKeys, setScatterKeys] = useState<[string, string] | null>(null)
  const [search, setSearch] = useState('')

  const players = useMemo(() => [...byPlayer.entries()]
    .map(([key, rs]) => ({ key, name: name(key), group: playerGroup(rs), minutes: rs.reduce((s, r) => s + r.minutes, 0) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es')), [byPlayer, name])

  const myRows = selected ? byPlayer.get(selected) ?? [] : []
  const group = selected ? playerGroup(myRows) : null
  const metricOptions = metricsFor(group)
  const metric = METRIC_BY_KEY[metricKey] ?? metricOptions[0]
  const [sx, sy] = scatterKeys ?? DEFAULT_SCATTER[group ?? 'EXT']
  const mx = METRIC_BY_KEY[sx], my = METRIC_BY_KEY[sy]

  const conclusions = useMemo(() => {
    if (!rows) return []
    if (selected) return playerConclusions(myRows, rows)
    // Vista agencia: lo más fuerte de cada jugador, mezclado.
    return [...byPlayer.entries()]
      .flatMap(([k, rs]) => playerConclusions(rs, rows).slice(0, 2).map(c => ({ ...c, who: name(k), onClick: () => setSelected(k) })))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
  }, [rows, selected, myRows, byPlayer, name])

  const evo = useMemo(() => (selected ? evolution(myRows, byPlayer, metric, grouping) : []), [selected, myRows, byPlayer, metric, grouping])
  const bars = useMemo(() => playerValues(byPlayer, metric, win, { group: onlyGroup && group ? group : null })
    .map(v => ({ ...v, name: name(v.key) })), [byPlayer, metric, win, onlyGroup, group, name])
  const scatter = useMemo(() => {
    const scope = onlyGroup && group ? group : null
    return [...byPlayer.entries()].flatMap(([key, rs]) => {
      if (scope && playerGroup(rs) !== scope) return []
      const t = windowTotals(rs, win)
      if (t.minutes < (win === '3m' ? 270 : 450)) return []
      const x = mx.compute(t), y = my.compute(t)
      return x === null || y === null ? [] : [{ key, name: name(key), x, y, minutes: t.minutes }]
    })
  }, [byPlayer, win, onlyGroup, group, mx, my, name])
  const trends = useMemo(() => [...byPlayer.values()].map(rs => playerTrend(rs)).filter((t): t is TrendResult => !!t)
    .map(t => ({ ...t, player_name: name(t.player_key) })), [byPlayer, name])
  const seasons = useMemo(() => groupPeriods(myRows, 'season'), [myRows])

  if (rows === null) return <div className="space-y-4">{[0, 1, 2].map(i => <PanelSkeleton key={i} height="h-48" />)}</div>

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-apple-gray-800 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-8 text-center">
        <p className="text-sm font-medium text-apple-gray-800 dark:text-white">Todavía no hay datos de Wyscout cargados.</p>
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">{error ? `Error: ${error}` : 'Subí los Excel "Player stats" de cada jugador para ver sus gráficos y conclusiones.'}</p>
        <Link to="/carga-wyscout" className="inline-block mt-4 px-4 py-2 rounded-apple text-sm font-semibold text-white bg-brand-green">Ir a Carga de Wyscout</Link>
      </div>
    )
  }

  const scopeText = onlyGroup && group ? `${POS_GROUP_LABEL[group].many} de la agencia` : 'toda la agencia'
  const toggleGroup = group && (
    <Segmented label="Con quién comparar" value={onlyGroup ? 'g' : 'all'} onChange={v => setOnlyGroup(v === 'g')}
      options={[{ id: 'g', label: `Sólo ${POS_GROUP_LABEL[group].many}` }, { id: 'all', label: 'Todos' }]} />
  )

  return (
    <div className="space-y-5">
      {/* Selector de jugador */}
      <div className="space-y-2">
        <p className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
          Elegí un jugador para ver su detalle, o mirá toda la agencia. "Por partido" quiere decir cada 90 minutos jugados.
          Tocá cualquier nombre en las listas para abrir su ficha.
        </p>
        {players.length > 10 && (
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar jugador…"
            aria-label="Buscar jugador"
            className="w-full sm:w-72 px-3 py-2 rounded-apple text-sm bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-800 dark:text-white placeholder:text-apple-gray-400 focus:ring-2 focus:ring-brand-green focus:outline-none"
          />
        )}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setSelected('')}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!selected ? 'bg-apple-gray-900 text-white dark:bg-white dark:text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-600 dark:text-apple-gray-300'}`}>
          Toda la agencia
        </button>
        {players.filter(p => !search || normalizeName(p.name).includes(normalizeName(search)) || p.key === selected).map(p => (
          <button key={p.key} onClick={() => { setSelected(p.key); setScatterKeys(null); if (!metricsFor(p.group).some(m => m.key === metricKey)) setMetricKey(metricsFor(p.group)[0].key) }}
            className={`inline-flex items-center gap-1.5 pl-0.5 pr-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${selected === p.key ? 'bg-brand-green text-white' : 'bg-apple-gray-100 dark:bg-apple-gray-700/60 text-apple-gray-700 dark:text-apple-gray-200 hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700'}`}>
            <PlayerPhoto src={photo(p.key)} name={p.name} size="xs" rounded="full" />
            {p.name}
          </button>
        ))}
      </div>
      </div>

      <Panel
        title={selected ? `Lo que dicen los datos de ${name(selected)}` : 'Lo más destacado de la agencia'}
        subtitle={selected
          ? `${group ? `Juega de ${POS_GROUP_LABEL[group].one}. ` : ''}Comparado con él mismo y con los ${group ? POS_GROUP_LABEL[group].many : 'jugadores'} de la agencia.`
          : 'Las conclusiones más fuertes de cada jugador. Tocá una para ver al jugador.'}
        source={SOURCE}
      >
        <ConclusionList items={conclusions} who={!selected} />
      </Panel>

      {selected && (
        <Panel
          title="Cómo evolucionó"
          subtitle={`${metric.hint}`}
          actions={<>
            <MetricSelect label="Métrica" value={metric.key} metrics={metricOptions} onChange={setMetricKey} />
            <Segmented label="Agrupar por" value={grouping} options={GROUPING_OPTS} onChange={setGrouping} />
          </>}
          source={SOURCE}
        >
          <EvolutionChart points={evo} metric={metric} />
        </Panel>
      )}

      <div className="grid lg:grid-cols-2 gap-5">
        <Panel
          title={`Ranking: ${metric.label.toLowerCase()}`}
          subtitle={`${WINDOW_LABEL[win]} · ${scopeText}`}
          actions={<>
            {!selected && <MetricSelect label="Métrica" value={metric.key} metrics={METRICS} onChange={setMetricKey} />}
            <Segmented label="Período" value={win} options={WINDOW_OPTS} onChange={setWin} />
          </>}
          source={SOURCE}
        >
          {toggleGroup && <div className="mb-3">{toggleGroup}</div>}
          <AgencyBars values={bars} metric={metric} highlight={selected || null} photo={photo} />
        </Panel>

        <Panel
          title="Comparar dos cosas a la vez"
          subtitle={`Cada punto es un jugador (${WINDOW_LABEL[win].toLowerCase()}). Arriba a la derecha, los que son buenos en las dos.`}
          actions={<>
            <MetricSelect label="Eje horizontal" value={sx} metrics={METRICS} onChange={k => setScatterKeys([k, sy])} />
            <MetricSelect label="Eje vertical" value={sy} metrics={METRICS} onChange={k => setScatterKeys([sx, k])} />
          </>}
          source={SOURCE}
        >
          <ScatterChart points={scatter} mx={mx} my={my} highlight={selected || null} />
        </Panel>
      </div>

      {selected && seasons.length > 0 && (
        <Panel title="Temporada por temporada" subtitle="Las métricas que más importan para su posición." source={SOURCE}>
          <SeasonTable periods={seasons} metrics={metricOptions.filter(m => m.headline).concat(metricOptions.filter(m => !m.headline)).slice(0, 8)} />
        </Panel>
      )}

      <Panel
        title="En alza y en baja"
        subtitle="Últimos 6 meses contra los 12 anteriores, en las métricas de su posición. El % es el promedio de cuánto mejoró o empeoró."
        source={SOURCE}
      >
        <TrendList trends={trends} photo={photo} />
      </Panel>
    </div>
  )
}
