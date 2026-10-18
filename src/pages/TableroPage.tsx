import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import { FILTER_POSITION_MAP } from '@/constants/scoring'
import { useData } from '@/context/DataContext'
import { normalizeName } from '@/utils/scoring'
import { fetchTableroDataset, type TableroDataset } from '@/features/tablero/tableroService'
import {
  toAppearances, currentTeams, countTeamMatches, computePulse, activityGrid, computeQuadrant, computeForm,
  DAY_MS, QUADRANT_MIN_RATED, QUADRANT_RATING, QUADRANT_SHARE, FORM_LENGTH,
  type QueryContext,
} from '@/features/tablero/tableroData'
import Panel, { PanelSkeleton, Segmented } from '@/features/tablero/components/Panel'
import PulseStrip from '@/features/tablero/components/PulseStrip'
import ChartBuilder from '@/features/tablero/components/ChartBuilder'
import QuadrantChart from '@/features/tablero/components/QuadrantChart'
import ActivityCalendar from '@/features/tablero/components/ActivityCalendar'
import FormList from '@/features/tablero/components/FormList'
import GpsLoadPanel, { compareLastGps } from '@/features/tablero/components/GpsLoadPanel'
import CoverageStrip from '@/features/tablero/components/CoverageStrip'
import HeadlinesPanel from '@/features/tablero/components/HeadlinesPanel'
import { weeklyHeadlines, BEST_RATING, RETURN_DAYS, STREAK_MIN } from '@/features/tablero/tableroHeadlines'
import SeasonRace from '@/features/tablero/components/SeasonRace'
import WyscoutAnalysis from '@/features/wyscoutPerf/components/WyscoutAnalysis'
import ImpactChart from '@/features/tablero/components/ImpactChart'
import ValueChart, { VALUE_GAP } from '@/features/tablero/components/ValueChart'
import { coverageGaps, teamImpact, valueVsRating, IMPACT_MIN_MATCHES, IMPACT_MIN_MINUTES } from '@/features/tablero/tableroInsights'

const REFRESH_MS = 5 * 60 * 1000

const POSITION_GROUPS: Record<string, string> = {
  'Arquero': 'Arquero',
  'Defensor Central': 'Defensor Central',
  'Lateral Derecho': 'Lateral', 'Lateral Izquierdo': 'Lateral', 'Lateral': 'Lateral',
  'Volante Central': 'Volante Central',
  'Volante Interno': 'Volante Interno',
  'Extremo Derecho': 'Extremo', 'Extremo Izquierdo': 'Extremo', 'Extremo': 'Extremo',
  'Delantero': 'Delantero',
}
const POSITION_ORDER = ['Arquero', 'Defensor Central', 'Lateral', 'Volante Central', 'Volante Interno', 'Extremo', 'Delantero']

type QuadrantRange = '90d' | '6m' | '1y'
const QUADRANT_DAYS: Record<QuadrantRange, number> = { '90d': 91, '6m': 182, '1y': 365 }

function agoLabel(ms: number): string {
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'recién'
  if (min === 1) return 'hace 1 minuto'
  if (min < 60) return `hace ${min} minutos`
  return `hace ${Math.floor(min / 60)} h`
}

export default function TableroPage() {
  const { internal, gpsEntries, agencyPlayers } = useData()
  const [view, setView] = useState<'wyscout' | 'vivo'>(() => (new URLSearchParams(window.location.search).get('vista') === 'vivo' ? 'vivo' : 'wyscout'))
  const [data, setData] = useState<TableroDataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const [quadrantRange, setQuadrantRange] = useState<QuadrantRange>('6m')
  const fetchedAtRef = useRef(0)

  // El roster vigente vive en AGENCY_PLAYERS (se actualiza al cargar la agencia);
  // `agencyPlayers` del contexto sólo sirve de señal para recalcular.
  const roster = useMemo(
    () => AGENCY_PLAYERS.map(p => ({ fullName: p.fullName, shortName: p.shortName, apiTeamId: p.apiTeamId, team: p.team, isReserve: p.isReserve })),
    [agencyPlayers], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Sólo vale la respuesta del último pedido: el roster cambia cuando llegan las
  // altas de la plataforma y la carga anterior (sin ellas) podía llegar después
  // y pisar la nueva (caso real: Ciccioli aparecía "sin datos").
  const requestRef = useRef(0)
  const load = useCallback(async (force = false) => {
    const request = ++requestRef.current
    setRefreshing(true)
    try {
      const next = await fetchTableroDataset(roster, force)
      if (request !== requestRef.current) return
      fetchedAtRef.current = next.fetchedAt
      setData(next)
      setError(null)
    } catch (e) {
      if (request === requestRef.current) setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos')
    } finally {
      if (request === requestRef.current) setRefreshing(false)
    }
  }, [roster])

  // Los datos en vivo sólo se piden con esa vista abierta (la base es chica: plan gratuito).
  useEffect(() => { if (view === 'vivo') load() }, [load, view])

  // Se actualiza solo mientras la pestaña está a la vista; al volver a ella,
  // si los datos quedaron viejos, se piden de nuevo en el momento.
  useEffect(() => {
    if (view !== 'vivo') return
    const tick = () => setClock(Date.now())
    const clockId = window.setInterval(tick, 30_000)
    const refreshId = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      tick()
      if (fetchedAtRef.current && Date.now() - fetchedAtRef.current > REFRESH_MS) load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(clockId)
      window.clearInterval(refreshId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, view])

  const now = data?.fetchedAt ?? 0
  const { apps, teamAlias } = useMemo(() => {
    const alias = new Map<number, number>()
    return { apps: data ? toAppearances(data.rows, roster, { owners: data.owners, teamTwins: data.teamTwins, teamAliasOut: alias }) : [], teamAlias: alias }
  }, [data, roster])

  const positionByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of internal) {
      const g = POSITION_GROUPS[FILTER_POSITION_MAP[p['Posición']] ?? '']
      if (g) m.set(normalizeName(p.Jugador), g)
    }
    for (const a of AGENCY_PLAYERS) {
      if (m.has(normalizeName(a.fullName)) || !a.position) continue
      const g = POSITION_GROUPS[FILTER_POSITION_MAP[a.position] ?? '']
      if (g) m.set(normalizeName(a.fullName), g)
    }
    return m
  }, [internal, agencyPlayers]) // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: QueryContext = useMemo(() => ({
    positionOf: name => positionByName.get(normalizeName(name)) ?? '',
    leagueName: id => (id != null ? data?.leagueNames.get(id) : undefined) ?? 'Otra competencia',
    teamName: id => data?.teamNames.get(id) ?? 'Club sin nombre',
  }), [positionByName, data])
  const rivalName = useCallback((id: number | null) => (id != null ? data?.teamNames.get(id) : undefined) ?? 'rival', [data])

  const positions = useMemo(() => {
    const present = new Set(apps.map(a => ctx.positionOf(a.fullName)))
    return POSITION_ORDER.filter(p => present.has(p))
  }, [apps, ctx])

  const pulse = useMemo(() => (data ? computePulse(apps, now) : null), [apps, now, data])
  const grid = useMemo(() => (data ? activityGrid(apps, now, 26) : null), [apps, now, data])
  const form = useMemo(() => computeForm(apps), [apps])
  const quadrant = useMemo(() => {
    if (!data) return null
    const from = now - QUADRANT_DAYS[quadrantRange] * DAY_MS
    const teamMatches = countTeamMatches(data.teamFixtures, teamAlias, from)
    return computeQuadrant(apps, roster, currentTeams(apps, roster), teamMatches, from, now + DAY_MS)
  }, [data, apps, teamAlias, roster, now, quadrantRange])
  const gps = useMemo(() => compareLastGps(gpsEntries), [gpsEntries])
  const coverage = useMemo(
    () => (data ? coverageGaps(roster, apps, data.teamFixtures, teamAlias, now, id => data.teamNames.get(id) ?? 'su club') : null),
    [data, roster, apps, teamAlias, now],
  )
  const headlines = useMemo(
    () => (data ? weeklyHeadlines(apps, data.teamFixtures, teamAlias, currentTeams(apps, roster), now) : null),
    [data, apps, teamAlias, roster, now],
  )
  const impact = useMemo(
    () => (data ? teamImpact(apps, currentTeams(apps, roster), data.teamFixtures, teamAlias, now - 365 * DAY_MS) : null),
    [data, apps, roster, teamAlias, now],
  )
  // Rating de los últimos 6 meses (mínimo 3 partidos con puntaje) contra el
  // valor de mercado vigente de la ficha.
  const value = useMemo(() => {
    if (!data) return null
    const marketByName = new Map(internal.map(p => [normalizeName(p.Jugador), p.marketValueRaw ?? 0]))
    const from = now - 182 * DAY_MS
    const ratings = new Map<string, number[]>()
    for (const a of apps) {
      if (a.minutes <= 0 || a.rating == null || new Date(a.date).getTime() < from) continue
      const list = ratings.get(a.fullName) ?? []
      list.push(a.rating)
      ratings.set(a.fullName, list)
    }
    const rows = [...ratings]
      .filter(([, rs]) => rs.length >= QUADRANT_MIN_RATED)
      .map(([fullName, rs]) => ({
        fullName,
        value: marketByName.get(normalizeName(fullName)) ?? 0,
        rating: rs.reduce((x, r) => x + r, 0) / rs.length,
        matches: rs.length,
      }))
      .filter(r => r.value > 0)
    return rows.length >= 4 ? valueVsRating(rows) : null
  }, [data, apps, internal, now])

  const loading = data === null

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5 animate-fade-in">
      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-apple-gray-900 dark:text-white">Rendimiento individual</h1>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-0.5">
            {view === 'wyscout'
              ? 'Cómo rinde cada jugador de Doble G temporada a temporada, con los datos de Wyscout.'
              : 'Cómo vienen los jugadores de Doble G, partido a partido. Preguntale a los datos lo que necesites.'}
          </p>
        </div>
        {view === 'vivo' && <div className="flex items-center gap-3 self-start sm:self-auto">
          <span className="inline-flex items-center gap-2 text-2xs text-apple-gray-500 dark:text-apple-gray-400">
            <span className="relative flex w-2 h-2">
              {!error && !loading && <span className="absolute inline-flex w-full h-full rounded-full bg-brand-green opacity-60 animate-ping" />}
              <span className={`relative inline-flex w-2 h-2 rounded-full ${error ? 'bg-red-500' : loading ? 'bg-apple-gray-300 dark:bg-apple-gray-600' : 'bg-brand-green'}`} />
            </span>
            {loading ? 'Cargando datos…' : `Actualizado ${agoLabel(Math.max(0, clock - now))} · se actualiza solo`}
          </span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 transition-colors disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>}
      </div>

      <Segmented
        label="Vista"
        value={view}
        onChange={setView}
        options={[{ id: 'wyscout', label: 'Wyscout · por temporada' }, { id: 'vivo', label: 'Semana en vivo' }]}
      />

      {view === 'wyscout' ? <WyscoutAnalysis /> : <>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-apple-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-sm text-red-700 dark:text-red-300">
          <span className="flex-1">
            {data ? 'No se pudieron actualizar los datos; se muestran los de la última carga.' : 'No se pudieron cargar los datos del tablero.'}
          </span>
          <button onClick={() => load(true)} className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline">Reintentar</button>
        </div>
      )}

      {/* ── Pulso de la semana ───────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2.5">
          <h2 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-200">Pulso de la semana</h2>
          <span className="text-2xs text-apple-gray-400 dark:text-apple-gray-500">Últimos 7 días · barras: últimas 12 semanas</span>
        </div>
        {pulse ? <PulseStrip pulse={pulse} /> : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <PanelSkeleton key={i} height="h-36" />)}
          </div>
        )}
      </div>

      {/* ── Titulares de la semana ───────────────────────────── */}
      <Panel
        title="Titulares de la semana"
        subtitle="Lo más importante de los últimos 7 días, en una línea cada uno."
        source={
          <p>
            Se arman solos con los partidos de la semana: quién hizo goles o asistencias, quién lleva {STREAK_MIN} partidos o más seguidos aportando,
            la mejor actuación (rating {BEST_RATING.toFixed(1).replace('.', ',')} o más), quién volvió a jugar después de {RETURN_DAYS} días o más,
            y quién venía de titular (60' o más en sus últimos 3 partidos) y esta semana no jugó aunque su club sí.
          </p>
        }
      >
        {headlines === null ? <PanelSkeleton height="h-28" /> : <HeadlinesPanel headlines={headlines} rival={rivalName} />}
      </Panel>

      {coverage && <CoverageStrip gaps={coverage.gaps} withData={coverage.withData} total={roster.length} teamName={id => data?.teamNames.get(id) ?? 'su club'} />}

      {/* ── Armá tu gráfico ──────────────────────────────────── */}
      <Panel
        title="Armá tu gráfico"
        subtitle="Elegí una pregunta o cambiá las palabras en verde: el gráfico se arma solo."
      >
        {loading ? <PanelSkeleton height="h-80" /> : (
          <ChartBuilder apps={apps} ctx={ctx} now={now} positions={positions} />
        )}
      </Panel>

      {/* ── Carrera de la temporada ──────────────────────────── */}
      <Panel
        title="Carrera de la temporada"
        subtitle="Semana a semana, quién va sumando más en los últimos 12 meses. Dale play."
        source={
          <p>
            Cada cuadro es una semana: suma lo que hizo cada jugador desde hace un año hasta esa fecha, con el club que sea.
            Se muestran los 10 primeros de cada momento. Podés mover la barra para ir a una semana puntual o tocar un nombre para ver su ficha.
          </p>
        }
      >
        {loading ? <PanelSkeleton height="h-[420px]" /> : <SeasonRace apps={apps} now={now} />}
      </Panel>

      {/* ── Cuadrante ────────────────────────────────────────── */}
      <Panel
        title="¿Quién juega y quién rinde?"
        subtitle="Cada punto es un jugador: a la derecha los que más juegan, arriba los de mejor rating."
        actions={
          <Segmented
            label="Período del cuadrante"
            value={quadrantRange}
            onChange={setQuadrantRange}
            options={[{ id: '90d', label: '3 meses' }, { id: '6m', label: '6 meses' }, { id: '1y', label: 'Año' }]}
          />
        }
        source={
          <>
            <p>
              <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">Minutos jugados:</span> los minutos que sumó con su club actual (el de su último partido), sobre los minutos que jugó ese club en el período
              (partidos × 90). La línea del medio está en {Math.round(QUADRANT_SHARE * 100)}%.
            </p>
            <p className="mt-1.5">
              <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">Rating:</span> el promedio de sus partidos con puntaje. La línea del medio está en {QUADRANT_RATING.toFixed(1)}.
              Para aparecer necesita al menos {QUADRANT_MIN_RATED} partidos con puntaje
              {quadrant && quadrant.withoutData.length > 0 && ` (en este período quedan afuera ${quadrant.withoutData.length}: ${quadrant.withoutData.join(', ')})`}.
            </p>
            <p className="mt-1.5">Sólo cuentan las competencias que tenemos cargadas; un partido de copa sin estadísticas no suma ni resta.</p>
          </>
        }
      >
        {quadrant ? (
          quadrant.points.length === 0
            ? <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-10">Todavía no hay partidos suficientes en este período.</p>
            : <QuadrantChart points={quadrant.points} teamName={id => ctx.teamName(id)} />
        ) : <PanelSkeleton height="h-80" />}
      </Panel>

      {/* ── Peso en el equipo y valor ────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel
          title="¿Cuánto pesa en su equipo?"
          subtitle="Puntos por partido de su club con él en cancha y sin él, en el último año."
          source={
            <>
              <p>
                <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">Con él:</span> partidos en los que jugó {IMPACT_MIN_MINUTES} minutos o más.{' '}
                <span className="font-semibold text-apple-gray-700 dark:text-apple-gray-300">Sin él:</span> partidos de su club en los que no jugó (los ratos cortos no entran).
                Ganar vale 3 puntos y empatar 1.
              </p>
              <p className="mt-1.5">
                Sólo cuenta su club actual y desde que llegó. Hacen falta al menos {IMPACT_MIN_MATCHES} partidos de cada lado.
                Pocos partidos pueden cambiar mucho el número: sirve como señal, no como prueba.
              </p>
            </>
          }
        >
          {impact === null ? <PanelSkeleton height="h-72" /> : impact.length === 0
            ? <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-10">Todavía no hay partidos suficientes para comparar.</p>
            : <ImpactChart items={impact} teamName={id => ctx.teamName(id)} />}
        </Panel>

        <Panel
          title="Rendimiento vs. valor de mercado"
          subtitle="Arriba de la línea, los que rinden más de lo que hoy vale su pase."
          source={
            <p>
              Rating promedio de los últimos 6 meses (mínimo {QUADRANT_MIN_RATED} partidos con puntaje) contra el valor de mercado de su ficha (Transfermarkt).
              La línea es el rating que se espera, en promedio, para cada valor dentro de nuestros propios jugadores.
              En verde, los que están {VALUE_GAP.toFixed(2).replace('.', ',')} puntos o más por encima. Los jugadores sin valor de mercado cargado no aparecen.
            </p>
          }
        >
          {loading ? <PanelSkeleton height="h-72" /> : value
            ? <ValueChart points={value.points} slope={value.slope} intercept={value.intercept} />
            : <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 text-center py-10">Faltan valores de mercado para armar el gráfico.</p>}
        </Panel>
      </div>

      {/* ── Forma reciente ───────────────────────────────────── */}
      <Panel
        title="Forma reciente"
        subtitle="El rating de sus últimos partidos: quién viene levantando y quién viene bajando."
        source={
          <p>
            Para cada jugador tomamos sus últimos {FORM_LENGTH} partidos con puntaje. Comparamos el promedio de los 3 más recientes con el de los anteriores:
            si subió o bajó al menos 0,2 puntos aparece acá. Los 3 más recientes se ven más fuertes. Pasá el mouse por un partido para ver rival y minutos.
          </p>
        }
      >
        {loading ? <PanelSkeleton height="h-64" /> : <FormList strips={form} teamName={rivalName} />}
      </Panel>

      {/* ── Calendario de actividad ──────────────────────────── */}
      <Panel
        title="Calendario de actividad"
        subtitle="Cada cuadradito es un día de los últimos 6 meses: más verde, más jugadores Doble G en cancha."
        source={
          <p>
            Cuenta a los jugadores que sumaron al menos un minuto ese día (hora argentina), con el club que sea. Estar en el banco sin entrar no cuenta.
            Tocá un día para ver quién jugó, contra quién y con qué rating.
          </p>
        }
      >
        {grid ? <ActivityCalendar grid={grid} teamName={rivalName} /> : <PanelSkeleton height="h-40" />}
      </Panel>

      {/* ── Físico (GPS) ─────────────────────────────────────── */}
      {gps.length > 0 && (
        <Panel
          title="Último partido con GPS"
          subtitle="Cada jugador contra su propio promedio: así se ve si viene cargado o por debajo de lo habitual."
          source={
            <p>
              Sale de los informes GPS cargados en "Carga de GPS". Comparamos el último partido de cada jugador con el promedio de sus partidos anteriores
              (sólo jugadores con al menos 2 cargas). Una diferencia menor a 5% se muestra como "en su nivel". No es contra otros jugadores: cada uno con sí mismo.
            </p>
          }
        >
          <GpsLoadPanel comparisons={gps} />
        </Panel>
      )}
      </>}
    </div>
  )
}
