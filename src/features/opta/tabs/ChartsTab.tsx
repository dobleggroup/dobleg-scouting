import { useMemo, useState } from 'react'
import type { AppPos, OptaLeague, OptaPlayer } from '../data'
import { metric, POS_LABEL, POS_SHORT, type PercentileIndex } from '../metrics'
import { Card } from '../components/ui'
import Scatter from '../components/Scatter'

/** Gráficos de dispersión ya armados para encontrar perfiles de un vistazo. */
const PRESETS: Array<{ id: string; title: string; why: string; positions: AppPos[]; x: string; y: string; best: string }> = [
  { id: 'ext-encaran', title: 'Extremos que encaran', why: 'Regates ganados contra conducciones que avanzan hacia el arco: los que desequilibran solos.', positions: ['EXT'], x: 'dribbles', y: 'progCarries', best: 'Encaran y avanzan' },
  { id: 'ext-generan', title: 'Extremos que generan peligro', why: 'Chances propias (xG sin penales) contra chances que le dan a los compañeros (xA).', positions: ['EXT'], x: 'npxg', y: 'xa', best: 'Hacen y dan goles' },
  { id: 'del-llegada', title: 'Delanteros: volumen y calidad de remate', why: 'Cuánto patea contra desde qué tan buena posición lo hace (xG por remate).', positions: ['DEL'], x: 'shots', y: 'xgPerShot', best: 'Patean mucho y de buena posición' },
  { id: 'del-definicion', title: 'Delanteros: chances contra goles', why: 'Si un punto está muy por encima de la tendencia, convierte más de lo que genera.', positions: ['DEL'], x: 'npxg', y: 'goals', best: 'Generan y convierten' },
  { id: 'dfc-duelos', title: 'Centrales que ganan duelos', why: 'Duelos aéreos ganados contra duelos totales ganados (en %).', positions: ['CB'], x: 'aerialPct', y: 'duelPct', best: 'Ganan arriba y abajo' },
  { id: 'dfc-progresan', title: 'Centrales que progresan en campo', why: 'Pases que acercan mucho la pelota al arco rival contra conducciones progresivas.', positions: ['CB'], x: 'progPasses', y: 'progCarries', best: 'Hacen avanzar al equipo' },
  { id: 'dfc-salida', title: 'Centrales que salen jugando', why: 'Pases progresivos contra precisión de pase: los que arriesgan sin perderla.', positions: ['CB'], x: 'progPasses', y: 'passPct', best: 'Progresan y no la pierden' },
  { id: 'lat-ofensivos', title: 'Laterales ofensivos', why: 'Asistencias esperadas contra conducciones progresivas.', positions: ['LD', 'LI'], x: 'xa', y: 'progCarries', best: 'Pasan al ataque y generan' },
  { id: 'lat-defensivos', title: 'Laterales que defienden', why: 'Recuperaciones contra porcentaje de duelos ganados.', positions: ['LD', 'LI'], x: 'recoveries', y: 'duelPct', best: 'Recuperan y ganan duelos' },
  { id: 'vc-equilibrio', title: 'Volantes centrales: recuperan y hacen jugar', why: 'Recuperaciones contra pases progresivos: el cinco completo.', positions: ['VC'], x: 'recoveries', y: 'progPasses', best: 'Recuperan y distribuyen' },
  { id: 'vi-creacion', title: 'Volantes internos: llegada y creación', why: 'Chances propias contra chances creadas para otros.', positions: ['VI'], x: 'npxg', y: 'xa', best: 'Llegan y crean' },
  { id: 'presion', title: 'Presión alta', why: 'Recuperaciones en el último tercio contra valor de posesión: presionan y además suman con la pelota.', positions: ['EXT', 'DEL', 'VI'], x: 'highRecoveries', y: 'pv', best: 'Presionan y suman' },
  { id: 'arq', title: 'Arqueros', why: 'Porcentaje de atajadas contra goles evitados (lo que ataja por encima de lo esperado).', positions: ['ARQ'], x: 'savePct', y: 'goalsPrevented', best: 'Atajan más de lo esperado' },
]

export default function ChartsTab({ league, idx, dg }: { league: OptaLeague; idx: PercentileIndex; dg: Map<string, unknown> }) {
  const [maxAge, setMaxAge] = useState(40)
  const [only, setOnly] = useState<string>('all')
  const shown = only === 'all' ? PRESETS : PRESETS.filter(p => p.id === only)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={only} onChange={e => setOnly(e.target.value)} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto" aria-label="Gráfico">
          <option value="all">Todos los gráficos</option>
          {PRESETS.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <select value={maxAge} onChange={e => setMaxAge(Number(e.target.value))} className="input-apple text-xs py-1.5 px-3 min-w-0 w-auto" aria-label="Edad">
          <option value={40}>Cualquier edad</option>
          <option value={21}>Sub-21</option>
          <option value={23}>Sub-23</option>
          <option value={26}>Hasta 26 años</option>
        </select>
        <span className="text-xs text-apple-gray-500 dark:text-apple-gray-400">
          Jugadores con al menos {idx.minMinutes}' en la posición. En verde, los de Doble G. Arriba a la derecha están los mejores en las dos cosas; tocá un punto para abrir la ficha.
        </span>
      </div>
      <div className={`grid gap-4 ${shown.length > 1 ? 'xl:grid-cols-2' : ''}`}>
        {shown.map(p => <PresetChart key={p.id} preset={p} league={league} idx={idx} dg={dg} maxAge={maxAge} big={shown.length === 1} />)}
      </div>
    </div>
  )
}

function PresetChart({ preset, league, idx, dg, maxAge, big }: {
  preset: typeof PRESETS[number]; league: OptaLeague; idx: PercentileIndex; dg: Map<string, unknown>; maxAge: number; big: boolean
}) {
  const mx = metric(preset.x), my = metric(preset.y)
  const points = useMemo(() => league.players
    .filter(p => p.minutes >= idx.minMinutes && preset.positions.includes(p.pos) && (p.age === null || p.age <= maxAge))
    .filter(p => !(mx.minVolume && mx.minVolume(p) < (mx.minVolumeValue ?? 0)) && !(my.minVolume && my.minVolume(p) < (my.minVolumeValue ?? 0)))
    .map(p => ({ p, x: mx.value(p), y: my.value(p) }))
    .filter((d): d is { p: OptaPlayer; x: number; y: number } => d.x !== null && d.y !== null)
    .map(({ p, x, y }) => ({ id: p.id, name: p.name, team: league.teamById.get(p.teamId ?? '')?.short ?? '', x, y, dg: dg.has(p.id) })),
  [league, idx, preset, maxAge, dg, mx, my])
  return (
    <Card title={preset.title} subtitle={`${preset.why} ${preset.positions.map(p => POS_LABEL[p]).join(' y ')} · ${points.length} jugadores.`}
      action={<span className="text-2xs font-semibold px-2 py-0.5 rounded-md bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300">{preset.positions.map(p => POS_SHORT[p]).join(' · ')}</span>}>
      <Scatter points={points} mx={mx} my={my} bestLabel={preset.best} height={big ? undefined : 340} labelTop={big ? 10 : 5} />
    </Card>
  )
}
