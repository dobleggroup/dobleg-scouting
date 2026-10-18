import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { OptaLeague, OptaTeam } from '../data'
import type { OptaMetric } from '../metrics'
import { Card, Segmented, TeamDot, TeamName } from '../components/ui'
import Scatter from '../components/Scatter'

/** Métrica colectiva: por partido salvo que se indique. */
interface TeamMetric {
  key: string
  label: string
  help: string
  cat: TeamCat
  value: (t: OptaTeam) => number
  lowerIsBetter?: boolean
  decimals: number
  unit?: '%'
}
type TeamCat = 'ataque' | 'defensa' | 'posesion' | 'presion' | 'pelota-parada' | 'mentalidad' | 'disciplina'
const CAT_LABEL: Record<TeamCat, string> = {
  ataque: 'Ataque', defensa: 'Defensa', posesion: 'Posesión y juego', presion: 'Presión y duelos',
  'pelota-parada': 'Pelota parada', mentalidad: 'Resultados y carácter', disciplina: 'Disciplina',
}

const g = (t: OptaTeam) => Math.max(1, t.games)
const pg = (k: string) => (t: OptaTeam) => (t.stats[k] ?? 0) / g(t)
const ratio = (a: string, b: string) => (t: OptaTeam) => ((t.stats[a] ?? 0) / Math.max(1, t.stats[b] ?? 0)) * 100

export const TEAM_METRICS: TeamMetric[] = [
  { key: 'goals', label: 'Goles', help: 'Goles a favor por partido.', cat: 'ataque', value: pg('goals'), decimals: 2 },
  { key: 'xg', label: 'xG', help: 'Goles esperados por la calidad de sus chances, por partido.', cat: 'ataque', value: t => t.xgFor / g(t), decimals: 2 },
  { key: 'shots', label: 'Remates', help: 'Remates por partido.', cat: 'ataque', value: pg('totalScoringAtt'), decimals: 1 },
  { key: 'shotsOn', label: 'Remates al arco', help: 'Remates al arco por partido.', cat: 'ataque', value: pg('ontargetScoringAtt'), decimals: 1 },
  { key: 'bigCh', label: 'Chances claras', help: 'Situaciones claras de gol creadas por partido.', cat: 'ataque', value: pg('bigChanceCreated'), decimals: 2 },
  { key: 'boxTouch', label: 'Toques en el área rival', help: 'Por partido.', cat: 'ataque', value: pg('touchesInOppBox'), decimals: 1 },
  { key: 'conv', label: '% de conversión', help: 'Goles sobre remates.', cat: 'ataque', value: ratio('goals', 'totalScoringAtt'), decimals: 1, unit: '%' },
  { key: 'fast', label: 'Contraataques', help: 'Remates de contraataque por partido.', cat: 'ataque', value: pg('shotFastbreak'), decimals: 2 },

  { key: 'conceded', label: 'Goles recibidos', help: 'Por partido. Menos es mejor.', cat: 'defensa', value: pg('goalsConceded'), lowerIsBetter: true, decimals: 2 },
  { key: 'xga', label: 'xG en contra', help: 'Goles esperados que le generan los rivales, por partido. Menos es mejor.', cat: 'defensa', value: t => t.xgAgainst / g(t), lowerIsBetter: true, decimals: 2 },
  { key: 'shotsAg', label: 'Remates en contra', help: 'Remates que recibe por partido. Menos es mejor.', cat: 'defensa', value: t => ((t.stats.attemptsConcededIbox ?? 0) + (t.stats.attemptsConcededObox ?? 0)) / g(t), lowerIsBetter: true, decimals: 1 },
  { key: 'clean', label: 'Vallas invictas', help: 'Partidos sin recibir goles (total).', cat: 'defensa', value: t => t.stats.cleanSheet ?? 0, decimals: 0 },
  { key: 'errors', label: 'Errores que terminan en gol', help: 'Total de la temporada. Menos es mejor.', cat: 'defensa', value: t => t.stats.errorLeadToGoal ?? 0, lowerIsBetter: true, decimals: 0 },
  { key: 'blocks', label: 'Remates bloqueados', help: 'Por partido.', cat: 'defensa', value: pg('outfielderBlock'), decimals: 1 },

  { key: 'poss', label: 'Posesión', help: 'Tenencia promedio.', cat: 'posesion', value: pg('possessionPercentage'), decimals: 1, unit: '%' },
  { key: 'passes', label: 'Pases', help: 'Pases por partido.', cat: 'posesion', value: pg('totalPass'), decimals: 0 },
  { key: 'passPct', label: '% de pases buenos', help: 'Precisión de pase.', cat: 'posesion', value: ratio('accuratePass', 'totalPass'), decimals: 1, unit: '%' },
  { key: 'f3', label: 'Pases al último tercio', help: 'Completados por partido.', cat: 'posesion', value: pg('successfulFinalThirdPasses'), decimals: 1 },
  { key: 'boxEntries', label: 'Llegadas al área', help: 'Entradas al área rival por partido.', cat: 'posesion', value: pg('penAreaEntries'), decimals: 1 },
  { key: 'long', label: '% de pelotas largas', help: 'Qué parte de sus pases son largos: más alto = juego más directo.', cat: 'posesion', value: ratio('totalLongBalls', 'totalPass'), decimals: 1, unit: '%' },
  { key: 'crosses', label: 'Centros', help: 'Centros por partido (sin córners).', cat: 'posesion', value: pg('totalCrossNocorner'), decimals: 1 },
  { key: 'progCarries', label: 'Conducciones progresivas', help: 'Por partido.', cat: 'posesion', value: pg('progressiveCarries'), decimals: 1 },

  { key: 'ppda', label: 'PPDA', help: 'Pases que deja dar al rival antes de una acción defensiva. Menos = presiona más.', cat: 'presion', value: pg('ppda'), lowerIsBetter: true, decimals: 1 },
  { key: 'high', label: 'Recuperaciones arriba', help: 'Pelotas ganadas en el último tercio por partido.', cat: 'presion', value: pg('possWonAtt3rd'), decimals: 1 },
  { key: 'recov', label: 'Recuperaciones', help: 'Por partido.', cat: 'presion', value: pg('ballRecovery'), decimals: 1 },
  { key: 'duels', label: '% de duelos ganados', help: 'Duelos ganados sobre disputados.', cat: 'presion', value: t => ((t.stats.duelWon ?? 0) / Math.max(1, (t.stats.duelWon ?? 0) + (t.stats.duelLost ?? 0))) * 100, decimals: 1, unit: '%' },
  { key: 'aerial', label: '% de duelos aéreos', help: 'Duelos aéreos ganados sobre disputados.', cat: 'presion', value: t => ((t.stats.aerialWon ?? 0) / Math.max(1, (t.stats.aerialWon ?? 0) + (t.stats.aerialLost ?? 0))) * 100, decimals: 1, unit: '%' },

  { key: 'corners', label: 'Córners a favor', help: 'Por partido.', cat: 'pelota-parada', value: pg('wonCorners'), decimals: 1 },
  { key: 'spShots', label: 'Remates de pelota parada', help: 'Por partido.', cat: 'pelota-parada', value: pg('attSetpiece'), decimals: 2 },
  { key: 'headGoals', label: 'Goles de cabeza', help: 'Total de la temporada.', cat: 'pelota-parada', value: t => t.stats.attHdGoal ?? 0, decimals: 0 },
  { key: 'pens', label: 'Penales a favor', help: 'Total de la temporada.', cat: 'pelota-parada', value: t => t.stats.penaltyWon ?? 0, decimals: 0 },

  { key: 'ptsUp', label: 'Puntos rescatados', help: 'Puntos ganados en partidos que iba perdiendo (total).', cat: 'mentalidad', value: t => t.stats.ptsGainedLosingPos ?? 0, decimals: 0 },
  { key: 'ptsDown', label: 'Puntos perdidos ganando', help: 'Puntos que dejó escapar en partidos que iba ganando (total). Menos es mejor.', cat: 'mentalidad', value: t => t.stats.ptsDroppedWinningPos ?? 0, lowerIsBetter: true, decimals: 0 },
  { key: 'subs', label: 'Goles de suplentes', help: 'Goles de jugadores que entraron desde el banco (total).', cat: 'mentalidad', value: t => t.stats.subsGoals ?? 0, decimals: 0 },
  { key: 'firstHalf', label: '% de goles en el 1er tiempo', help: 'Qué parte de sus goles hace antes del entretiempo.', cat: 'mentalidad', value: ratio('firstHalfGoals', 'goals'), decimals: 0, unit: '%' },

  { key: 'fouls', label: 'Faltas', help: 'Faltas cometidas por partido. Menos es mejor.', cat: 'disciplina', value: pg('fkFoulLost'), lowerIsBetter: true, decimals: 1 },
  { key: 'yellow', label: 'Amarillas', help: 'Total de la temporada. Menos es mejor.', cat: 'disciplina', value: t => t.stats.totalYellowCard ?? 0, lowerIsBetter: true, decimals: 0 },
  { key: 'red', label: 'Rojas', help: 'Total de la temporada. Menos es mejor.', cat: 'disciplina', value: t => t.stats.totalRedCard ?? 0, lowerIsBetter: true, decimals: 0 },
]
const TM = new Map(TEAM_METRICS.map(m => [m.key, m]))
/** Títulos de "los mejores" cuando menos es mejor. */
const BEST_TITLE: Record<string, string> = {
  xga: 'Menos xG en contra', ppda: 'Más presión (menor PPDA)', ptsDown: 'Menos puntos perdidos ganando',
  conceded: 'Menos goles recibidos', fouls: 'Menos faltas',
}

const fmtV = (v: number, m: TeamMetric) => `${v.toLocaleString('es-AR', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })}${m.unit ?? ''}`

/** Para reusar el gráfico de dispersión de jugadores con métricas de equipo. */
const asScatterMetric = (m: TeamMetric): OptaMetric => ({ key: m.key, label: m.label, help: m.help, category: 'ataque', decimals: m.decimals, unit: m.unit, lowerIsBetter: m.lowerIsBetter, value: () => null })

const TEAM_CHARTS: Array<{ title: string; why: string; x: string; y: string; best: string }> = [
  { title: 'Generan y conceden', why: 'xG a favor contra xG en contra por partido (el eje de defensa está dado vuelta: arriba = conceden poco).', x: 'xg', y: 'xga', best: 'Dominan los partidos' },
  { title: 'Cómo juega cada equipo', why: 'Posesión contra presión (PPDA dado vuelta: arriba = presionan más).', x: 'poss', y: 'ppda', best: 'Tienen la pelota y presionan' },
  { title: 'Directos o elaborados', why: '% de pelotas largas contra pases por partido.', x: 'passes', y: 'long', best: 'Mucho pase y también juego largo' },
  { title: 'Eficacia', why: 'Remates por partido contra % de conversión.', x: 'shots', y: 'conv', best: 'Patean mucho y convierten' },
]

export default function TeamsTab({ league }: { league: OptaLeague }) {
  const navigate = useNavigate()
  const teams = useMemo(() => league.teams.filter(t => t.games > 0), [league])
  const [cat, setCat] = useState<TeamCat>('ataque')
  const cols = TEAM_METRICS.filter(m => m.cat === cat)
  const [sortKey, setSortKey] = useState<string>('xg')
  const sortM = TM.get(sortKey) ?? cols[0]
  const effectiveSort = cols.some(c => c.key === sortM.key) ? sortM : cols[0]

  const rankOf = useMemo(() => {
    const out = new Map<string, Map<string, number>>()
    for (const m of TEAM_METRICS) {
      const sorted = [...teams].sort((a, b) => (m.lowerIsBetter ? m.value(a) - m.value(b) : m.value(b) - m.value(a)))
      out.set(m.key, new Map(sorted.map((t, i) => [t.id, i + 1])))
    }
    return out
  }, [teams])
  const rows = [...teams].sort((a, b) => (rankOf.get(effectiveSort.key)!.get(a.id)! - rankOf.get(effectiveSort.key)!.get(b.id)!))
  const n = teams.length
  const rankTone = (r: number) => r <= Math.ceil(n * 0.2) ? 'text-emerald-500 font-bold' : r > n - Math.ceil(n * 0.2) ? 'text-red-500' : 'text-apple-gray-400'

  return (
    <div className="space-y-5">
      <Card
        title="Rankings de equipos"
        subtitle="Los 30 equipos de la Liga Profesional en cada rubro (por partido salvo los totales). El número chico es su puesto: verde = top 6, rojo = últimos 6. Tocá una columna para ordenar."
        action={<Segmented size="sm" value={cat} onChange={c => { setCat(c); setSortKey(TEAM_METRICS.find(m => m.cat === c)!.key) }} options={(Object.keys(CAT_LABEL) as TeamCat[]).map(c => ({ value: c, label: CAT_LABEL[c] }))} />}
      >
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-apple-gray-400">
                <th className="py-2 pl-4 sm:pl-5 pr-2 text-left font-medium w-8">#</th>
                <th className="py-2 pr-2 text-left font-medium">Equipo</th>
                {cols.map(c => (
                  <th key={c.key} className="py-2 px-2 text-right font-medium" title={c.help}>
                    <button onClick={() => setSortKey(c.key)} className={`uppercase tracking-wide leading-tight max-w-[7rem] ${effectiveSort.key === c.key ? 'text-apple-gray-800 dark:text-white' : 'hover:text-apple-gray-600 dark:hover:text-apple-gray-200'}`}>
                      {c.label}{effectiveSort.key === c.key ? ' ↓' : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-apple-gray-100 dark:divide-apple-gray-700/50">
              {rows.map((t, i) => (
                <tr key={t.id} className="hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/30 cursor-pointer" onClick={() => navigate(`/opta/equipo/${t.id}`)}>
                  <td className="py-2 pl-4 sm:pl-5 pr-2 text-apple-gray-400 tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-2 text-apple-gray-800 dark:text-white"><TeamName team={t} /></td>
                  {cols.map(c => {
                    const r = rankOf.get(c.key)!.get(t.id)!
                    return (
                      <td key={c.key} className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                        <span className={effectiveSort.key === c.key ? 'font-semibold text-apple-gray-800 dark:text-white' : 'text-apple-gray-600 dark:text-apple-gray-300'}>{fmtV(c.value(t), c)}</span>
                        <span className={`ml-1.5 text-2xs ${rankTone(r)}`}>{r}º</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Los mejores de cada rubro" subtitle="Top 5 de la liga.">
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-5">
          {['xg', 'xga', 'poss', 'ppda', 'high', 'boxEntries', 'fast', 'spShots', 'aerial', 'ptsUp', 'ptsDown', 'subs'].map(k => {
            const m = TM.get(k)!
            const top = [...teams].sort((a, b) => rankOf.get(k)!.get(a.id)! - rankOf.get(k)!.get(b.id)!).slice(0, 5)
            return (
              <div key={k}>
                <div className="text-xs font-semibold text-apple-gray-500 dark:text-apple-gray-400 mb-1.5" title={m.help}>
                  {BEST_TITLE[k] ?? m.label}
                </div>
                <ol className="space-y-1">
                  {top.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm cursor-pointer" onClick={() => navigate(`/opta/equipo/${t.id}`)}>
                      <span className="w-4 text-2xs text-apple-gray-400 tabular-nums">{i + 1}</span>
                      <TeamDot team={t} size={10} />
                      <span className="flex-1 truncate text-apple-gray-700 dark:text-apple-gray-200 hover:text-brand-green">{t.short}</span>
                      <span className="tabular-nums font-semibold text-apple-gray-800 dark:text-white">{fmtV(m.value(t), m)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="grid xl:grid-cols-2 gap-4">
        {TEAM_CHARTS.map(c => {
          const mx = TM.get(c.x)!, my = TM.get(c.y)!
          return (
            <Card key={c.title} title={c.title} subtitle={c.why}>
              <Scatter
                points={teams.map(t => ({ id: t.id, name: t.short, team: t.name, x: mx.value(t), y: my.value(t) }))}
                mx={asScatterMetric(mx)} my={asScatterMetric(my)}
                bestLabel={c.best} height={340} labelTop={30}
                onSelect={id => navigate(`/opta/equipo/${id}`)}
                legend={<p className="text-xs text-apple-gray-500 dark:text-apple-gray-400 mt-1">Las líneas punteadas son el promedio de la liga. Tocá un equipo para ver su ficha.</p>}
              />
            </Card>
          )
        })}
      </div>

      <Card title="Fichas de equipo" subtitle="Estilo, plantel con notas y contratos, remates a favor y en contra, resultados.">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {[...teams].sort((a, b) => a.short.localeCompare(b.short, 'es')).map(t => (
            <button key={t.id} onClick={() => navigate(`/opta/equipo/${t.id}`)} className="flex items-center gap-2 px-3 py-2 rounded-apple text-left text-sm text-apple-gray-700 dark:text-apple-gray-200 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/50">
              <TeamDot team={t} size={16} />
              <span className="flex-1 truncate">{t.name}</span>
              {t.formation && <span className="text-2xs text-apple-gray-400">{t.formation.split('').join('-')}</span>}
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
