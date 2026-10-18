import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EmptyState from '@/components/ui/EmptyState'
import { PlayerPhoto } from '@/components/ui/PlayerPhoto'
import {
  loadCareers, loadHeatmaps, loadMatchLog, loadShots,
  type MatchLogRow, type OptaLeague, type OptaPlayer,
} from '@/features/opta/data'
import { useAgencyInOpta, useAsync, useOptaLeague, usePercentiles } from '@/features/opta/hooks'
import {
  CATEGORY_LABEL, FOOT_LABEL, fmt, GROUP_LABEL, GROUP_PROFILE, metric, MIN_MINUTES_FOR_PCT, monthsLeft, POS_LABEL, POS_SHORT, profileCategories, profileScore,
  similarPlayers, strengthsAndWeaknesses, type PercentileIndex,
} from '@/features/opta/metrics'
import PositionFieldMap from '@/components/ui/PositionFieldMap'
import type { Position } from '@/types/scoring'
import { Card, DgBadge, PctPill, Segmented, TeamDot, TeamName, Tile, fmtDate } from '@/features/opta/components/ui'
import { MatchBars, Radar, radarVsAverage, VsAverageRows } from '@/features/opta/components/charts'
import { Heatmap, PassMap, ShotMap } from '@/features/opta/components/pitch'
import PlayerPicker from '@/features/opta/components/PlayerPicker'

const TABS = [
  { id: 'general', label: 'General', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'metricas', label: 'Métricas', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { id: 'remates', label: 'Remates y xG', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'mapas', label: 'Mapas tácticos', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
  { id: 'partidos', label: 'Partido a partido', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'carrera', label: 'Carrera', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'similares', label: 'Similares', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
] as const
type TabId = typeof TABS[number]['id']

export default function OptaPlayerPage() {
  const { id = '' } = useParams()
  const { data: league, error, loading } = useOptaLeague()
  const idx = usePercentiles(league)
  const dg = useAgencyInOpta(league)
  const [tab, setTab] = useState<TabId>('general')
  const mobileTabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setTab('general'); window.scrollTo(0, 0) }, [id])
  useEffect(() => {
    mobileTabsRef.current?.querySelector<HTMLElement>(`[data-mtab="${tab}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [tab])

  if (loading) return <LoadingSpinner fullScreen message="Cargando ficha de Opta..." />
  if (error || !league || !idx) return <div className="max-w-screen-xl mx-auto px-4 py-8"><EmptyState title="Error" description={error ?? 'No se pudieron cargar los datos de Opta.'} icon="error" /></div>
  const player = league.playerById.get(id)
  if (!player) return <div className="max-w-screen-xl mx-auto px-4 py-8"><EmptyState title="Jugador no encontrado" description="Este jugador no tiene minutos en la Liga Profesional 2026 según Opta." icon="search" /></div>

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 pb-28 sm:pb-10 animate-fade-in">
      <nav className="flex items-center gap-2 text-sm text-apple-gray-500 dark:text-apple-gray-400 mb-5">
        <Link to="/opta" className="hover:text-brand-green transition-colors">Test Opta</Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-apple-gray-800 dark:text-white font-medium truncate">{player.name}</span>
      </nav>

      {/* Tabs mobile */}
      <div className="md:hidden sticky top-14 z-20 -mx-4 sm:-mx-6 mb-4 px-4 sm:px-6 py-2.5 bg-apple-gray-50/95 dark:bg-apple-gray-900/95 backdrop-blur-md border-b border-apple-gray-200/60 dark:border-apple-gray-800/60">
        <div ref={mobileTabsRef} className="flex gap-1.5 overflow-x-auto scroll-smooth [-webkit-overflow-scrolling:touch]">
          {TABS.map(t => (
            <button key={t.id} data-mtab={t.id} onClick={() => setTab(t.id)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${tab === t.id ? 'bg-brand-green text-white shadow-sm' : 'bg-white dark:bg-apple-gray-800 text-apple-gray-500 dark:text-apple-gray-400'}`}>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={t.icon} /></svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 lg:gap-6">
        <aside className="hidden md:block shrink-0 md:w-14 xl:w-52">
          <div className="md:sticky md:top-4">
            <nav className="bg-white dark:bg-apple-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark p-1.5 xl:p-2 flex flex-col gap-0.5">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`relative w-full flex items-center gap-2.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-left transition-all duration-200 group ${tab === t.id ? 'bg-brand-green text-white shadow-sm' : 'text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'}`}>
                  <svg className={`w-4 h-4 shrink-0 ${tab === t.id ? 'text-white' : 'text-apple-gray-400 group-hover:text-apple-gray-600 dark:group-hover:text-apple-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d={t.icon} /></svg>
                  <span className="text-xs font-medium hidden xl:inline whitespace-nowrap">{t.label}</span>
                  <span className="absolute left-full ml-2 px-2 py-1 bg-apple-gray-900 text-white text-xs rounded-md opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all xl:hidden whitespace-nowrap z-50 pointer-events-none">{t.label}</span>
                </button>
              ))}
            </nav>
            <div className="mt-3 bg-white dark:bg-apple-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark p-1.5 xl:p-2">
              <Link to={`/opta/comparar?ids=${player.id}`} className="w-full flex items-center gap-2.5 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50 hover:text-apple-gray-700 dark:hover:text-apple-gray-200 group" title="Comparar">
                <svg className="w-4 h-4 shrink-0 text-apple-gray-400 group-hover:text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                <span className="hidden xl:inline text-xs font-medium">Comparar</span>
              </Link>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 space-y-5">
          <PlayerHeader player={player} league={league} idx={idx} dg={dg.has(player.id)} />
          {tab === 'general' && <GeneralTab player={player} league={league} idx={idx} onTab={setTab} />}
          {tab === 'metricas' && <MetricsTab player={player} idx={idx} />}
          {tab === 'remates' && <ShotsTab player={player} league={league} idx={idx} />}
          {tab === 'mapas' && <MapsTab player={player} idx={idx} />}
          {tab === 'partidos' && <MatchesTab player={player} league={league} />}
          {tab === 'carrera' && <CareerTab player={player} />}
          {tab === 'similares' && <SimilarTab player={player} league={league} idx={idx} dg={dg} />}
        </main>
      </div>
    </div>
  )
}

// ─── Encabezado ─────────────────────────────────────────────────────────────

function PlayerHeader({ player: p, league, idx, dg }: { player: OptaPlayer; league: OptaLeague; idx: PercentileIndex; dg: boolean }) {
  const team = league.teamById.get(p.teamId ?? '')
  const score = profileScore(p, idx)
  const ml = monthsLeft(p.contractEnd)
  const otherPos = p.posMinutes.slice(1).filter(([, m]) => m >= 90)
  const facts: Array<[string, string]> = [
    ['Edad', p.age !== null ? `${p.age} años` : '—'],
    ['Nacionalidad', [p.nat, p.nat2].filter(Boolean).join(' / ') || '—'],
    ['Altura', p.height ? `${p.height} cm` : '—'],
    ['Pie', p.foot ? FOOT_LABEL[p.foot] ?? p.foot : '—'],
    ['Camiseta', p.shirt ? `#${p.shirt}` : '—'],
    ['En el club desde', p.joined ? fmtDate(p.joined) : '—'],
  ]
  return (
    <div className="card-apple p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <PlayerPhoto name={p.name} size="lg" rounded="2xl" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-apple-gray-800 dark:text-white tracking-tight">{p.name}</h1>
            {dg && <DgBadge />}
          </div>
          {p.fullName && p.fullName !== p.name && <p className="text-xs text-apple-gray-400">{p.fullName}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-apple-gray-600 dark:text-apple-gray-300">
            <TeamName team={team} short={false} />
            <span className="text-apple-gray-300 dark:text-apple-gray-600">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700 text-xs font-semibold text-apple-gray-600 dark:text-apple-gray-300">{POS_SHORT[p.pos]}</span>
              <span className="font-medium">{POS_LABEL[p.pos]}</span>
            </span>
            {otherPos.length > 0 && <span className="text-xs text-apple-gray-400">también {otherPos.map(([pos, m]) => `${POS_LABEL[pos].toLowerCase()} (${m}')`).join(', ')}</span>}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {facts.map(([k, v]) => (
              <div key={k}><div className="text-2xs uppercase tracking-wide text-apple-gray-400">{k}</div><div className="text-sm font-medium text-apple-gray-700 dark:text-apple-gray-200">{v}</div></div>
            ))}
            <div>
              <div className="text-2xs uppercase tracking-wide text-apple-gray-400">Contrato hasta</div>
              <div className={`text-sm font-semibold ${ml !== null && ml <= 6 ? 'text-orange-500' : ml !== null && ml <= 12 ? 'text-amber-500' : 'text-apple-gray-700 dark:text-apple-gray-200'}`}>
                {p.contractEnd ? fmtDate(p.contractEnd) : 'Sin dato'}{ml !== null && ml <= 12 && ml >= 0 ? ` · ${ml} meses` : ''}
              </div>
            </div>
          </div>
        </div>
        <div className="flex sm:flex-col items-center gap-2 sm:gap-1 sm:pl-4 sm:border-l border-apple-gray-100 dark:border-apple-gray-700">
          <div className="text-2xs uppercase tracking-wide text-apple-gray-400">Nota Opta</div>
          <PctPill pct={score} size="md" />
          <div className="text-2xs text-apple-gray-400 text-center max-w-[8rem]">vs {GROUP_LABEL[p.group].toLowerCase()} de la liga</div>
        </div>
      </div>
    </div>
  )
}

// ─── General ────────────────────────────────────────────────────────────────

function GeneralTab({ player: p, league, idx, onTab }: { player: OptaPlayer; league: OptaLeague; idx: PercentileIndex; onTab: (t: TabId) => void }) {
  const { strong, weak } = strengthsAndWeaknesses(p, idx)
  const axes = GROUP_PROFILE[p.group].map(metric)
  const st = (k: string) => p.stats[k] ?? 0
  const poolSize = idx.pool(p.group).length
  const maps = useAsync(loadHeatmaps, [])
  const lowMinutes = p.minutes < idx.minMinutes
  const [mode, setMode] = useState<'valor' | 'percentil'>('valor')
  const diffText = (key: string) => {
    const d = idx.vsAvg(p, key)
    return d === null ? '' : ` (${d > 0 ? '+' : ''}${d}% que el promedio)`
  }
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Partidos" value={st('appearances')} hint={`${st('gameStarted')} de titular · ${p.minutes}'`} />
        <Tile label="Goles / Asist." value={`${st('goals')} / ${st('goalAssist')}`} hint={`xG ${fmt(p.xg.expectedGoals ?? 0, { decimals: 1 })} · xA ${fmt(p.xg.expectedAssists ?? 0, { decimals: 1 })}`} />
        <Tile label="Pases progresivos" value={p.ev.prog} hint={`${fmt(metric('progPasses').value(p), { decimals: 2 })} cada 90'`} />
        <Tile label="Valor de posesión" value={fmt(p.pv.totalPossessionValue ?? 0, { decimals: 2 })} hint="Suma de lo que aportó a la chance de gol" />
      </div>

      {lowMinutes && (
        <div className="px-4 py-3 rounded-apple-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200">
          {p.minutes < MIN_MINUTES_FOR_PCT
            ? `Jugó ${p.minutes}': es muy poco para compararlo con la liga, así que no mostramos percentiles ni promedios. Los totales y mapas sí son reales.`
            : `Jugó ${p.minutes}' (menos de ${idx.minMinutes}'): la comparación se calcula igual pero con pocos minutos puede cambiar mucho.`}
        </div>
      )}

      <Card
        title={`Contra el promedio de ${GROUP_LABEL[p.group].toLowerCase()} de la Liga Profesional`}
        subtitle={`Lo clave de su posición, cada 90 minutos, contra el promedio de los ${poolSize} ${GROUP_LABEL[p.group].toLowerCase()} con al menos ${idx.minMinutes}'.`}
        action={<Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'valor', label: 'Valores reales' }, { value: 'percentil', label: 'Percentiles' }]} />}
      >
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
          <Radar axes={axes} size={440} series={radarVsAverage(axes, [p], idx, mode)} scaleLabel={mode === 'valor' ? 'del peor al mejor 5% del puesto' : 'percentil 0-100'} />
          <VsAverageRows player={p} metrics={axes} idx={idx} />
        </div>
      </Card>

      <Card title="En pocas palabras" subtitle="Lo que más lo diferencia del resto de su posición.">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1.5">Se destaca en</div>
            {strong.length ? (
              <ul className="space-y-1.5">
                {strong.map(s => (
                  <li key={s.m.key} className="text-sm text-apple-gray-700 dark:text-apple-gray-200 flex items-start gap-2">
                    <PctPill pct={s.pct} />
                    <span><b>{s.m.goodLabel ?? s.m.label}</b>: {fmt(s.m.value(p), s.m)}{s.m.total ? '' : ' cada 90 minutos'}{diffText(s.m.key)}. Está entre el {Math.max(1, 100 - s.pct)}% mejor de su posición.</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-apple-gray-400">No sobresale en ninguna métrica (ninguna por encima del percentil 80).</p>}
          </div>
          <div>
            <div className="text-xs font-semibold text-orange-500 mb-1.5">Para mejorar</div>
            {weak.length ? (
              <ul className="space-y-1.5">
                {weak.map(s => (
                  <li key={s.m.key} className="text-sm text-apple-gray-700 dark:text-apple-gray-200 flex items-start gap-2">
                    <PctPill pct={s.pct} />
                    <span><b>{s.m.label}</b>: {fmt(s.m.value(p), s.m)}{diffText(s.m.key)}. Por debajo de la mayoría de su posición.</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-apple-gray-400">No tiene puntos flojos marcados en lo importante de su posición.</p>}
          </div>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Posición" subtitle={p.posMinutes.length > 1 ? `Minutos por posición: ${p.posMinutes.map(([pos, m]) => `${POS_SHORT[pos]} ${m}'`).join(' · ')}` : `Jugó todos sus minutos de ${POS_LABEL[p.pos].toLowerCase()}.`}>
          <PositionFieldMap position={p.pos as Position} />
        </Card>
        <Card title="Dónde juega" subtitle="Mapa de calor de todas sus acciones con pelota (ataca hacia la derecha). El punto blanco es su posición promedio."
          action={<button onClick={() => onTab('mapas')} className="text-xs font-medium text-brand-green hover:underline">Ver mapas tácticos →</button>}>
          {maps.data?.[p.id]
            ? <Heatmap grid={maps.data[p.id].t} label={`Mapa de calor de ${p.name}`} avg={p.ev.avgX !== null ? { x: p.ev.avgX, y: p.ev.avgY ?? 50 } : null} />
            : <div className="h-48 rounded-apple bg-apple-gray-100 dark:bg-apple-gray-700/40 animate-pulse" />}
        </Card>
      </div>

      <TopRelated player={p} league={league} idx={idx} onTab={onTab} />
    </>
  )
}

function TopRelated({ player, league, idx, onTab }: { player: OptaPlayer; league: OptaLeague; idx: PercentileIndex; onTab: (t: TabId) => void }) {
  const sim = useMemo(() => similarPlayers(player, league.players, idx, 4), [player, league, idx])
  if (!sim.length) return null
  return (
    <Card title="Jugadores parecidos en la liga" subtitle="Misma posición y el perfil de percentiles más cercano."
      action={<button onClick={() => onTab('similares')} className="text-xs font-medium text-brand-green hover:underline">Ver más →</button>}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {sim.map(s => (
          <Link key={s.player.id} to={`/opta/jugador/${s.player.id}`} className="card-apple-hover p-3 flex items-center gap-3">
            <PlayerPhoto name={s.player.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-apple-gray-800 dark:text-white truncate">{s.player.name}</div>
              <div className="text-xs text-apple-gray-500 truncate">{league.teamById.get(s.player.teamId ?? '')?.short} · {POS_SHORT[s.player.pos]} · {s.player.age ?? '—'} años</div>
            </div>
            <span className="text-xs font-semibold text-apple-gray-500 tabular-nums">{s.similarity}%</span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

// ─── Métricas ───────────────────────────────────────────────────────────────

function MetricsTab({ player, idx }: { player: OptaPlayer; idx: PercentileIndex }) {
  const cats = profileCategories(player.group)
  return (
    <>
      <div className="card-apple px-4 py-3 text-sm text-apple-gray-600 dark:text-apple-gray-300 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span>Cada 90 minutos, contra <b>{GROUP_LABEL[player.group].toLowerCase()}</b> de la Liga Profesional.</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3.5 rounded bg-apple-gray-800 dark:bg-white" /> promedio del puesto</span>
        <span className="inline-flex items-center gap-1.5"><span className="text-emerald-500 font-semibold">+35%</span> mejor que el promedio</span>
        <span className="inline-flex items-center gap-1.5"><span className="text-orange-500 font-semibold">−20%</span> peor que el promedio</span>
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        {cats.map(c => (
          <Card key={c.category} title={CATEGORY_LABEL[c.category]}>
            <VsAverageRows player={player} metrics={c.metrics} idx={idx} />
          </Card>
        ))}
      </div>
    </>
  )
}

// ─── Remates ────────────────────────────────────────────────────────────────

function ShotsTab({ player: p, league, idx }: { player: OptaPlayer; league: OptaLeague; idx: PercentileIndex }) {
  const { data, loading } = useAsync(loadShots, [])
  const shots = data?.[p.id] ?? []
  const [filter, setFilter] = useState<'all' | 'foot' | 'head' | 'setpiece'>('all')
  const shown = shots.filter(s => filter === 'all' ? true : filter === 'head' ? s[6] === 'H' : filter === 'foot' ? s[6] === 'L' || s[6] === 'R' : ['SP', 'CK', 'FK', 'PEN'].includes(s[7]))
  const goals = shots.filter(s => s[3] === 'G').length
  const xg = shots.reduce((sum, s) => sum + s[2], 0)
  const onTarget = shots.filter(s => s[3] === 'G' || s[3] === 'S').length
  const diff = goals - xg
  const big = shots.filter(s => s[2] >= 0.3)
  const byBody = (['R', 'L', 'H'] as const).map(b => ({ b, n: shots.filter(s => s[6] === b).length, g: shots.filter(s => s[6] === b && s[3] === 'G').length }))
  if (loading) return <LoadingSpinner message="Cargando remates..." />
  if (!shots.length) return <EmptyState title="Sin remates" description="Opta no registra remates de este jugador en la temporada." icon="search" />
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Remates" value={shots.length} hint={`${onTarget} al arco (${Math.round((onTarget / shots.length) * 100)}%)`} />
        <Tile label="Goles" value={goals} hint={`de ${fmt(xg, { decimals: 1 })} esperados (xG)`} />
        <Tile label="xG por remate" value={fmt(xg / shots.length, { decimals: 2 })} hint={`percentil ${idx.pct(p, 'xgPerShot') ?? '—'} en su puesto`} />
        <Tile label="Chances claras" value={big.length} hint={`${big.filter(s => s[3] === 'G').length} convertidas (xG ≥ 0,30)`} />
      </div>
      <Card
        title="Mapa de remates"
        subtitle={Math.abs(diff) < 1
          ? `Hizo ${goals} goles con ${fmt(xg, { decimals: 1 })} de xG: convierte lo que se espera por sus chances.`
          : diff > 0
            ? `Hizo ${goals} goles con ${fmt(xg, { decimals: 1 })} de xG: ${fmt(diff, { decimals: 1 })} goles más de lo esperado. Define muy bien (o está en racha).`
            : `Hizo ${goals} goles con ${fmt(xg, { decimals: 1 })} de xG: ${fmt(-diff, { decimals: 1 })} goles menos de lo esperado. Llega pero no convierte; si el xG es alto, los goles suelen llegar.`}
        action={<Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todos' }, { value: 'foot', label: 'Con el pie' }, { value: 'head', label: 'De cabeza' }, { value: 'setpiece', label: 'Pelota parada' }]} />}
      >
        <div className="max-w-2xl mx-auto"><ShotMap shots={shown} league={league} playerTeamId={p.teamId} /></div>
      </Card>
      <Card title="Con qué remata">
        <div className="grid grid-cols-3 gap-3">
          {byBody.map(b => (
            <div key={b.b} className="text-center">
              <div className="text-2xs uppercase tracking-wide text-apple-gray-400">{b.b === 'R' ? 'Pie derecho' : b.b === 'L' ? 'Pie izquierdo' : 'Cabeza'}</div>
              <div className="text-xl font-bold text-apple-gray-800 dark:text-white tabular-nums">{b.n}</div>
              <div className="text-xs text-apple-gray-500">{b.g} {b.g === 1 ? 'gol' : 'goles'}</div>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

// ─── Mapas tácticos ─────────────────────────────────────────────────────────

function MapsTab({ player: p, idx }: { player: OptaPlayer; idx: PercentileIndex }) {
  const { data, loading } = useAsync(loadHeatmaps, [])
  const [heat, setHeat] = useState<'t' | 'd'>('t')
  const [pass, setPass] = useState<'pp' | 'kp' | 'cr'>(p.group === 'FB' || p.group === 'EXT' ? 'cr' : p.group === 'VI' || p.group === 'ST' ? 'kp' : 'pp')
  const maps = data?.[p.id]
  if (loading) return <LoadingSpinner message="Cargando mapas..." />
  if (!maps) return <EmptyState title="Sin mapas" description="No hay eventos con coordenadas para este jugador." icon="search" />
  // Altura de sus acciones defensivas contra el promedio del puesto.
  const pool = idx.pool(p.group).filter(o => o.ev.defX !== null)
  const avgDefX = pool.length ? pool.reduce((s, o) => s + (o.ev.defX ?? 0), 0) / pool.length : null
  const segs = maps[pass] ?? []
  const lines = segs.map(s => ({
    x: s[0] as number, y: s[1] as number, ex: s[2] as number, ey: s[3] as number,
    strong: pass === 'kp' ? s[4] === 1 : pass === 'cr' ? s[4] === 1 : false,
    faded: pass === 'cr' ? s[4] !== 1 : false,
  }))
  const crOk = pass === 'cr' ? segs.filter(s => s[4] === 1).length : 0
  const kpGoals = pass === 'kp' ? segs.filter(s => s[4] === 1).length : 0
  return (
    <>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Mapa de calor" subtitle={heat === 't' ? 'Todas sus acciones con pelota.' : 'Quites, intercepciones, recuperaciones, despejes y duelos aéreos ganados.'}
          action={<Segmented size="sm" value={heat} onChange={setHeat} options={[{ value: 't', label: 'Con pelota' }, { value: 'd', label: 'Defensivo' }]} />}>
          <Heatmap grid={maps[heat]} label={`Mapa de calor de ${p.name}`} avg={heat === 't' && p.ev.avgX !== null ? { x: p.ev.avgX, y: p.ev.avgY ?? 50 } : null} />
          {heat === 'd' && p.ev.defX !== null && avgDefX !== null && (
            <p className="text-sm text-apple-gray-600 dark:text-apple-gray-300 mt-3">
              Defiende en promedio a <b>{Math.round(p.ev.defX * 1.05)} m</b> de su arco; el promedio de {GROUP_LABEL[p.group].toLowerCase()} es {Math.round(avgDefX * 1.05)} m.{' '}
              {p.ev.defX - avgDefX > 4 ? 'Presiona más arriba que la mayoría.' : avgDefX - p.ev.defX > 4 ? 'Defiende más cerca de su arco que la mayoría.' : 'Similar al resto de su puesto.'}
            </p>
          )}
        </Card>
        <Card
          title="Mapa de pases"
          subtitle={pass === 'pp'
            ? `${segs.length} pases progresivos: los que acercan mucho la pelota al arco rival.`
            : pass === 'kp'
              ? `${segs.length} pases que terminaron en remate${kpGoals ? `, ${kpGoals} fueron asistencia de gol (en azul)` : ''}.`
              : `${segs.length} centros, ${crOk} llegaron a un compañero (en azul).`}
          action={<Segmented size="sm" value={pass} onChange={setPass} options={[{ value: 'pp', label: 'Progresivos' }, { value: 'kp', label: 'Pases clave' }, { value: 'cr', label: 'Centros' }]} />}
        >
          {lines.length
            ? <PassMap lines={lines} label={`Mapa de pases de ${p.name}`} legend={<span>Cada flecha es un pase, del punto de salida al destino. Ataca hacia la derecha.</span>} />
            : <p className="text-sm text-apple-gray-400 py-10 text-center">Sin pases de este tipo en la temporada.</p>}
        </Card>
      </div>
      <Card title="Lo que se puede leer acá">
        <ul className="text-sm text-apple-gray-600 dark:text-apple-gray-300 space-y-1.5 list-disc pl-5">
          <li>Su posición promedio en la cancha es <b>{p.ev.avgX !== null ? `${Math.round(p.ev.avgX * 1.05)} m` : '—'}</b> desde su arco, recostado {p.ev.avgY === null ? '—' : p.ev.avgY < 38 ? 'sobre la derecha' : p.ev.avgY > 62 ? 'sobre la izquierda' : 'por el centro'}.</li>
          <li>Pases que entran al último tercio: <b>{p.ev.f3}</b> · pases al área: <b>{p.ev.box}</b> · progresivos: <b>{p.ev.prog}</b> en la temporada.</li>
          <li>Con Opta cada acción viene con coordenadas: esto permite ver si un jugador encaja en el sistema de un equipo antes de verlo en video.</li>
        </ul>
      </Card>
    </>
  )
}

// ─── Partido a partido ──────────────────────────────────────────────────────

const LOG_METRICS: Array<{ key: string; label: string; value: (r: MatchLogRow) => number | null; fmt: (v: number) => string }> = [
  { key: 'pv', label: 'Valor de posesión', value: r => r.pv, fmt: v => v.toFixed(2) },
  { key: 'min', label: 'Minutos', value: r => r.min, fmt: v => `${Math.round(v)}'` },
  { key: 'xg', label: 'xG', value: r => r.xg, fmt: v => v.toFixed(2) },
  { key: 'xa', label: 'xA', value: r => r.xa, fmt: v => v.toFixed(2) },
  { key: 'touches', label: 'Toques', value: r => r.touches, fmt: v => String(Math.round(v)) },
  { key: 'prog', label: 'Pases progresivos', value: r => r.prog, fmt: v => String(Math.round(v)) },
  { key: 'rec', label: 'Recuperaciones', value: r => r.recoveries, fmt: v => String(Math.round(v)) },
]

function MatchesTab({ player: p, league }: { player: OptaPlayer; league: OptaLeague }) {
  const { data, loading } = useAsync(loadMatchLog, [])
  const navigate = useNavigate()
  const [mk, setMk] = useState('pv')
  if (loading) return <LoadingSpinner message="Cargando partidos..." />
  const log = data?.[p.id] ?? []
  if (!log.length) return <EmptyState title="Sin partidos" description="No hay partidos registrados." icon="search" />
  const lm = LOG_METRICS.find(m => m.key === mk)!
  const rowInfo = (r: MatchLogRow) => {
    const m = league.matchById.get(r.match)
    const home = m?.home === r.team
    const opp = league.teamById.get((home ? m?.away : m?.home) ?? '')
    const gf = home ? m?.hs : m?.as, ga = home ? m?.as : m?.hs
    const res = gf === null || gf === undefined || ga === null || ga === undefined ? null : gf > ga ? 'G' : gf < ga ? 'P' : 'E'
    return { m, opp, gf, ga, res, home }
  }
  return (
    <>
      <Card title="Cómo viene partido a partido" subtitle="Cada barra es un partido (el más viejo a la izquierda). Tocá una barra para abrir el partido."
        action={<select value={mk} onChange={e => setMk(e.target.value)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto" aria-label="Métrica">{LOG_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>}>
        <MatchBars
          data={log.map(r => { const i = rowInfo(r); return { key: r.match, label: `vs ${i.opp?.short ?? '—'}`, sub: `${fmtDate(i.m?.date)} · ${r.min}'`, value: lm.value(r), accent: r.goals + r.assists > 0 } })}
          format={lm.fmt}
          onSelect={k => navigate(`/opta/partido/${k}`)}
        />
        <p className="text-xs text-apple-gray-400 mt-1">Barras más oscuras: partidos con gol o asistencia.</p>
      </Card>
      <Card title="Todos sus partidos">
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-apple-gray-400 text-right">
                <th className="py-2 pl-4 sm:pl-5 pr-2 text-left font-medium">Fecha</th>
                <th className="py-2 px-2 text-left font-medium">Rival</th>
                <th className="py-2 px-2 font-medium">Res.</th>
                <th className="py-2 px-2 font-medium">Min</th>
                <th className="py-2 px-2 font-medium">G</th>
                <th className="py-2 px-2 font-medium">A</th>
                <th className="py-2 px-2 font-medium">xG</th>
                <th className="py-2 px-2 font-medium">xA</th>
                <th className="py-2 px-2 font-medium">Pases</th>
                <th className="py-2 pl-2 pr-4 sm:pr-5 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
              {[...log].reverse().map(r => {
                const i = rowInfo(r)
                return (
                  <tr key={r.match} className="text-right tabular-nums hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 cursor-pointer" onClick={() => navigate(`/opta/partido/${r.match}`)}>
                    <td className="py-2 pl-4 sm:pl-5 pr-2 text-left text-apple-gray-500 whitespace-nowrap">{fmtDate(i.m?.date)}</td>
                    <td className="py-2 px-2 text-left text-apple-gray-700 dark:text-apple-gray-200"><span className="text-apple-gray-400 text-xs mr-1">{i.home ? 'L' : 'V'}</span><TeamName team={i.opp} /></td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      {i.res && <span className={`inline-block w-5 text-center rounded text-2xs font-bold mr-1 ${i.res === 'G' ? 'bg-emerald-500/15 text-emerald-600' : i.res === 'P' ? 'bg-red-500/15 text-red-600' : 'bg-apple-gray-200 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300'}`}>{i.res}</span>}
                      <span className="text-apple-gray-600 dark:text-apple-gray-300">{i.gf ?? '—'}-{i.ga ?? '—'}</span>
                    </td>
                    <td className="py-2 px-2 text-apple-gray-600 dark:text-apple-gray-300">{r.min}{r.start ? '' : <span className="text-apple-gray-400 text-xs"> (s)</span>}</td>
                    <td className="py-2 px-2 font-semibold text-apple-gray-800 dark:text-white">{r.goals || ''}</td>
                    <td className="py-2 px-2 font-semibold text-apple-gray-800 dark:text-white">{r.assists || ''}</td>
                    <td className="py-2 px-2 text-apple-gray-600 dark:text-apple-gray-300">{r.xg ? r.xg.toFixed(2) : ''}</td>
                    <td className="py-2 px-2 text-apple-gray-600 dark:text-apple-gray-300">{r.xa ? r.xa.toFixed(2) : ''}</td>
                    <td className="py-2 px-2 text-apple-gray-500">{r.passOk}/{r.passes}</td>
                    <td className={`py-2 pl-2 pr-4 sm:pr-5 font-medium ${r.pv === null ? 'text-apple-gray-400' : r.pv >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{r.pv === null ? '—' : r.pv.toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

// ─── Carrera ────────────────────────────────────────────────────────────────

function CareerTab({ player }: { player: OptaPlayer }) {
  const { data, loading } = useAsync(loadCareers, [])
  if (loading) return <LoadingSpinner message="Cargando carrera..." />
  const career = (data?.[player.id] ?? []).filter(c => c.seasons.some(s => s[2] > 0) || !c.national)
  if (!career.length) return <EmptyState title="Sin carrera" description="Opta no tiene historial de clubes para este jugador." icon="search" />
  const sorted = [...career].sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))
  return (
    <Card title="Trayectoria" subtitle="Clubes y selecciones según Opta, con partidos, minutos y goles por competencia oficial.">
      <ol className="relative border-l-2 border-apple-gray-200 dark:border-apple-gray-700 ml-2 space-y-5">
        {sorted.map((c, i) => {
          const apps = c.seasons.reduce((s, x) => s + x[2], 0)
          const goals = c.seasons.reduce((s, x) => s + x[4], 0)
          return (
            <li key={i} className="pl-5 relative">
              <span className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full ${!c.to ? 'bg-brand-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'}`} />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold text-apple-gray-800 dark:text-white">{c.team}</span>
                {c.national && <span className="text-2xs px-1.5 rounded bg-sky-500/15 text-sky-600 dark:text-sky-400 font-semibold">Selección</span>}
                {c.loan && <span className="text-2xs px-1.5 rounded bg-amber-500/15 text-amber-600 font-semibold">Préstamo</span>}
                <span className="text-xs text-apple-gray-400">{c.from ? c.from.slice(0, 4) : '?'} – {c.to ? c.to.slice(0, 4) : 'hoy'}</span>
                <span className="text-xs text-apple-gray-500 ml-auto tabular-nums">{apps} PJ · {goals} goles</span>
              </div>
              {c.seasons.length > 0 && (
                <div className="mt-1.5 overflow-x-auto">
                  <table className="text-xs min-w-[380px] w-full">
                    <tbody>
                      {c.seasons.filter(s => s[2] > 0).map((s, j) => (
                        <tr key={j} className="text-apple-gray-500 dark:text-apple-gray-400">
                          <td className="py-0.5 pr-3 whitespace-nowrap">{s[0]}</td>
                          <td className="py-0.5 pr-3 truncate max-w-[14rem]">{s[1]}</td>
                          <td className="py-0.5 pr-3 text-right tabular-nums">{s[2]} PJ</td>
                          <td className="py-0.5 pr-3 text-right tabular-nums">{s[3]}'</td>
                          <td className="py-0.5 text-right tabular-nums">{s[4]} G · {s[5]} A</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ─── Similares ──────────────────────────────────────────────────────────────

function SimilarTab({ player, league, idx, dg }: { player: OptaPlayer; league: OptaLeague; idx: PercentileIndex; dg: Map<string, unknown> }) {
  const navigate = useNavigate()
  const sim = useMemo(() => similarPlayers(player, league.players, idx, 15), [player, league, idx])
  return (
    <Card
      title={`Los más parecidos a ${player.name}`}
      subtitle="Compara el perfil completo de percentiles del puesto. Sirve para buscar reemplazos o alternativas más baratas o más jóvenes."
      action={<PlayerPicker league={league} exclude={[player.id]} placeholder="Comparar con otro jugador…" onPick={o => navigate(`/opta/comparar?ids=${player.id},${o.id}`)} />}
    >
      <ul className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
        {sim.map(s => {
          const o = s.player
          return (
            <li key={o.id} className="py-2.5 flex items-center gap-3">
              <div className="w-12 shrink-0">
                <div className="h-1.5 rounded-full bg-apple-gray-100 dark:bg-apple-gray-700 overflow-hidden"><div className="h-full bg-brand-green" style={{ width: `${s.similarity}%` }} /></div>
                <div className="text-2xs text-apple-gray-400 tabular-nums mt-0.5">{s.similarity}% parecido</div>
              </div>
              <PlayerPhoto name={o.name} size="sm" />
              <Link to={`/opta/jugador/${o.id}`} className="flex-1 min-w-0">
                <div className="text-sm font-medium text-apple-gray-800 dark:text-white truncate flex items-center gap-1.5 hover:text-brand-green">{o.name}{dg.has(o.id) && <DgBadge />}</div>
                <div className="text-xs text-apple-gray-500 truncate flex items-center gap-1.5"><TeamDot team={league.teamById.get(o.teamId ?? '')} size={10} />{league.teamById.get(o.teamId ?? '')?.short} · {o.age ?? '—'} años · {o.minutes}'{o.contractEnd ? ` · contrato ${fmtDate(o.contractEnd)}` : ''}</div>
              </Link>
              <PctPill pct={profileScore(o, idx)} size="md" />
              <Link to={`/opta/comparar?ids=${player.id},${o.id}`} className="hidden sm:inline-flex btn-apple-secondary text-xs py-1.5 px-3">Comparar</Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
