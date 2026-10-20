import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Panel, { PanelSkeleton, Segmented } from '@/features/tablero/components/Panel'
import { useMatchMinutes, useWyscoutMonthly } from '../useWyscoutMonthly'
import { METRIC_BY_KEY, METRICS, POS_GROUP_LABEL, lowerFirst, metricsFor, type PosGroup } from '../metrics'
import { groupPeriods, type Grouping } from '../periods'
import { playerConclusions, playerGroup } from '../conclusions'
import { WINDOW_LABEL, evolution, playerValues, startsIn, windowTotals, type Window } from '../analysis'
import { playerSnapshot, type Status } from '../overview'
import { diagnoseAll, isConcern, isHot, type Diagnosis } from '../diagnosis'
import { DiagnosisPanel, MomentList } from './DiagnosisViews'
import ConclusionList from './ConclusionList'
import EvolutionChart from './EvolutionChart'
import AgencyBars from './AgencyBars'
import ScatterChart from './ScatterChart'
import SeasonTable from './SeasonTable'
import MetricSelect from './MetricSelect'
import PlayerPicker from './PlayerPicker'
import CompareView, { SERIES } from './CompareView'
import { PlayerCards, StatusTiles, type OverviewPlayer } from './AgencyOverview'
import { CLASS_FILTER_OPTS, ClassBadge, classRank, matchesClass, useClassOf, type ClassFilter } from './classes'

export const DEFAULT_SCATTER: Record<PosGroup, [string, string]> = {
  ARQ: ['pases_pct', 'largos_pct'],
  DEF: ['duelos_def_pct', 'adelante_ok_90'],
  LAT: ['centros_ok_90', 'duelos_def_pct'],
  VC: ['adelante_ok_90', 'duelos_def_pct'],
  MED: ['adelante_ok_90', 'pases_clave_90'],
  EXT: ['regates_ok_90', 'xa_90'],
  DEL: ['xg_90', 'goles_90'],
}

const GROUPING_OPTS: { id: Grouping; label: string }[] = [
  { id: 'season', label: 'Temporada' }, { id: 'year', label: 'Año' }, { id: 'month', label: 'Mes' },
]
const WINDOW_OPTS: { id: Window; label: string }[] = [
  { id: '3m', label: '3 meses' }, { id: '12m', label: '12 meses' }, { id: 'all', label: 'Carrera' },
]

/** Mejorando / bajando / parejo sale del diagnóstico (en cuántas métricas), no de un promedio. */
function withDiagStatus<T extends { status: Status }>(snap: T, d: Diagnosis | undefined): T {
  if (snap.status === 'juegaPoco' || snap.status === 'sinPartidos') return snap
  const status: Status = !d?.form ? 'sinHistoria' : d.form.state === 'up' ? 'mejorando' : d.form.state === 'down' ? 'bajando' : 'parejo'
  return { ...snap, status }
}

const SOURCE = (
  <p>
    Sale de los Excel "Player stats" de Wyscout que se suben en{' '}
    <Link to="/carga-wyscout" className="text-brand-green hover:underline">Carga de Wyscout</Link>.
    "Por partido" quiere decir cada 90 minutos jugados, así se puede comparar a un titular con uno que entra del banco.
    Solo se cuentan jugadores con 450 minutos o más en el período (270 en los últimos 3 meses).
  </p>
)

/** Sección Wyscout de Rendimiento individual: panorama de la agencia, detalle de un jugador o comparación de varios. */
export default function WyscoutAnalysis() {
  const { rows, byPlayer, error, photo, name } = useWyscoutMonthly()
  const classOf = useClassOf()
  const [selected, setSelected] = useState<string[]>([])
  const [metricKey, setMetricKey] = useState('regates_ok_90')
  const [grouping, setGrouping] = useState<Grouping>('season')
  const [win, setWin] = useState<Window>('12m')
  const [onlyGroup, setOnlyGroup] = useState(true)
  const [scatterKeys, setScatterKeys] = useState<[string, string] | null>(null)
  const [classFilter, setClassFilter] = useState<ClassFilter>('all')
  const [status, setStatus] = useState<Status | null>(null)
  const matchMinutes = useMatchMinutes()
  const diags = useMemo(() => diagnoseAll(byPlayer, matchMinutes), [byPlayer, matchMinutes])

  const cls = (k: string) => classOf(name(k))
  const players = useMemo(() => [...byPlayer.entries()]
    .map(([key, rs]) => ({ key, name: name(key), group: playerGroup(rs), cls: classOf(name(key)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es')), [byPlayer, name, classOf])
  // Vista de agencia: sólo los jugadores de la clase elegida.
  const scoped = useMemo(() => {
    const keep = new Set(players.filter(p => matchesClass(p.cls, classFilter)).map(p => p.key))
    return new Map([...byPlayer].filter(([k]) => keep.has(k)))
  }, [byPlayer, players, classFilter])

  const single = selected.length === 1 ? selected[0] : ''
  const comparing = selected.length >= 2
  const myRows = single ? byPlayer.get(single) ?? [] : []
  const group = single ? playerGroup(myRows) : null
  const metricOptions = metricsFor(group)
  const metric = METRIC_BY_KEY[metricKey] ?? metricOptions[0]
  const firstGroup = comparing ? playerGroup(byPlayer.get(selected[0]) ?? []) : null
  const [sx, sy] = scatterKeys ?? DEFAULT_SCATTER[group ?? firstGroup ?? 'EXT']
  const mx = METRIC_BY_KEY[sx], my = METRIC_BY_KEY[sy]
  const colorOf = (k: string) => (comparing ? SERIES[selected.indexOf(k)] : undefined)
  const badge = (k: string) => <ClassBadge c={cls(k)} size="xs" />

  const pick = (keys: string[]) => {
    setSelected(keys)
    setScatterKeys(null)
    if (keys.length === 1) {
      const g = playerGroup(byPlayer.get(keys[0]) ?? [])
      if (!metricsFor(g).some(m => m.key === metricKey)) setMetricKey(metricsFor(g)[0].key)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const overview = useMemo<OverviewPlayer[]>(() => [...scoped.entries()]
    .map(([k, rs]) => ({
      ...withDiagStatus(playerSnapshot(rs, byPlayer), diags.get(k)), name: name(k), cls: classOf(name(k)),
      starts3m: matchMinutes.has(k) ? startsIn(matchMinutes.get(k), '3m').starts : null,
      diag: diags.get(k) ?? null,
    })), [scoped, byPlayer, name, classOf, matchMinutes, diags])

  const mine = useMemo(() => (rows && single ? playerConclusions(myRows, rows) : []), [rows, single, myRows])
  // Primero la clase (A antes que B…), después el más claro.
  const moments = useMemo(() => {
    const list = [...diags.values()].filter(d => scoped.has(d.key))
    const item = (d: Diagnosis) => ({ d, name: name(d.key), lead: <ClassBadge c={classOf(name(d.key))} size="xs" /> })
    const byClass = (a: Diagnosis, b: Diagnosis) => classRank(classOf(name(a.key))) - classRank(classOf(name(b.key)))
    return {
      hot: list.filter(isHot).sort((a, b) => byClass(a, b) || b.score - a.score).map(item),
      concern: list.filter(isConcern).sort((a, b) => byClass(a, b) || a.score - b.score).map(item),
    }
  }, [diags, scoped, name, classOf])

  const evo = useMemo(() => (single ? evolution(myRows, byPlayer, metric, grouping) : []), [single, myRows, byPlayer, metric, grouping])
  const pool = single || comparing ? byPlayer : scoped
  const bars = useMemo(() => playerValues(pool, metric, win, { group: onlyGroup && group ? group : null })
    .map(v => ({ ...v, name: name(v.key) })), [pool, metric, win, onlyGroup, group, name])
  const scatter = useMemo(() => {
    const scope = onlyGroup && group ? group : null
    return [...pool.entries()].flatMap(([key, rs]) => {
      if (scope && playerGroup(rs) !== scope) return []
      const t = windowTotals(rs, win)
      if (t.minutes < (win === '3m' ? 270 : 450)) return []
      const x = mx.compute(t), y = my.compute(t)
      return x === null || y === null ? [] : [{ key, name: name(key), x, y, minutes: t.minutes }]
    })
  }, [pool, win, onlyGroup, group, mx, my, name])
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

  const scopeText = onlyGroup && group ? `${POS_GROUP_LABEL[group].many} de la agencia`
    : !selected.length && classFilter !== 'all' ? (CLASS_FILTER_OPTS.find(o => o.id === classFilter)?.label.toLowerCase() ?? '')
    : 'toda la agencia'
  const toggleGroup = group && (
    <Segmented label="Con quién comparar" value={onlyGroup ? 'g' : 'all'} onChange={v => setOnlyGroup(v === 'g')}
      options={[{ id: 'g', label: `Sólo ${POS_GROUP_LABEL[group].many}` }, { id: 'all', label: 'Todos' }]} />
  )
  const cards = overview.filter(p => !status || p.status === status)

  const rankingAndScatter = (
    <div className="grid lg:grid-cols-2 gap-5">
      <Panel
        title={`Ranking: ${lowerFirst(metric.label)}`}
        subtitle={`${WINDOW_LABEL[win]} · ${scopeText}`}
        actions={<>
          {!single && <MetricSelect label="Métrica" value={metric.key} metrics={METRICS} onChange={setMetricKey} />}
          <Segmented label="Período" value={win} options={WINDOW_OPTS} onChange={setWin} />
        </>}
        source={SOURCE}
      >
        {toggleGroup && <div className="mb-3">{toggleGroup}</div>}
        <AgencyBars values={bars} metric={metric} highlight={selected} photo={photo} badge={badge} colorOf={colorOf} />
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
        <ScatterChart points={scatter} mx={mx} my={my} highlight={selected} colorOf={colorOf} />
      </Panel>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PlayerPicker players={players} selected={selected} onChange={pick} photo={photo} />
        {!selected.length && <Segmented label="Clase" value={classFilter} options={CLASS_FILTER_OPTS} onChange={v => { setClassFilter(v); setStatus(null) }} />}
      </div>

      {!selected.length && (<>
        <StatusTiles players={overview} active={status} onPick={setStatus} photo={photo} />

        <div className="grid lg:grid-cols-2 gap-5">
          <Panel title={`En su mejor momento · ${moments.hot.length}`} subtitle="Juegan, y mejoraron en la mayoría de las métricas de su puesto o rinden mejor que los de su posición. Primero los de clase A." source={SOURCE}>
            <MomentList items={moments.hot} photo={photo} onOpen={k => pick([k])} empty="Nadie con estos filtros." />
          </Panel>
          <Panel title={`Preocupan · ${moments.concern.length}`} subtitle="Perdieron el puesto, casi no juegan, o bajaron en la mayoría de las métricas de su puesto. Primero los de clase A." source={SOURCE}>
            <MomentList items={moments.concern} photo={photo} onOpen={k => pick([k])} empty="Nadie preocupante con estos filtros." />
          </Panel>
        </div>

        <Panel
          title={status ? `Jugador por jugador · ${cards.length} con este filtro` : 'Jugador por jugador'}
          subtitle="Las barras son los minutos de cada mes del último año. Tocá una tarjeta para ver el detalle del jugador."
          actions={status ? <button onClick={() => setStatus(null)} className="text-xs font-medium text-brand-green hover:underline">Ver todos</button> : undefined}
          source={SOURCE}
        >
          <PlayerCards players={cards} photo={photo} onOpen={k => pick([k])} />
        </Panel>

        {rankingAndScatter}

      </>)}

      {comparing && (<>
        <CompareView
          players={selected.map(k => ({ key: k, name: name(k), cls: cls(k), rows: byPlayer.get(k) ?? [] }))}
          allRows={rows}
          matchMinutes={matchMinutes}
          photo={photo}
          source={SOURCE}
        />
        {rankingAndScatter}
      </>)}

      {single && (<>
        {diags.get(single) && (
          <Panel
            title={`Diagnóstico de ${name(single)}`}
            subtitle={`${cls(single) ? `Clase ${cls(single)}` : 'Sin calificar'}${group ? ` · ${POS_GROUP_LABEL[group].one}` : ''}. Comparado con los de su puesto en la agencia y con él mismo el año anterior.`}
            source={SOURCE}
          >
            <DiagnosisPanel d={diags.get(single)!} />
          </Panel>
        )}

        <Panel
          title={`Más datos de ${name(single)}`}
          subtitle={`${cls(single) ? `Clase ${cls(single)}. ` : 'Sin calificar. '}${group ? `Juega de ${POS_GROUP_LABEL[group].one}. ` : ''}Comparado con él mismo y con los ${group ? POS_GROUP_LABEL[group].many : 'jugadores'} de la agencia.`}
          source={SOURCE}
        >
          <ConclusionList items={mine} />
        </Panel>

        <Panel
          title="Cómo evolucionó"
          subtitle={metric.hint}
          actions={<>
            <MetricSelect label="Métrica" value={metric.key} metrics={metricOptions} onChange={setMetricKey} />
            <Segmented label="Agrupar por" value={grouping} options={GROUPING_OPTS} onChange={setGrouping} />
          </>}
          source={SOURCE}
        >
          <EvolutionChart points={evo} metric={metric} />
        </Panel>

        {rankingAndScatter}

        {seasons.length > 0 && (
          <Panel title="Temporada por temporada" subtitle="Las métricas que más importan para su posición." source={SOURCE}>
            <SeasonTable periods={seasons} metrics={metricOptions.filter(m => m.headline).concat(metricOptions.filter(m => !m.headline)).slice(0, 8)} />
          </Panel>
        )}
      </>)}
    </div>
  )
}
