import type { AppPos, GroupCode, OptaPlayer, RoleCode } from './data'

/** Posiciones con los mismos códigos y nombres que el resto de la app. */
export const POS_SHORT: Record<AppPos, string> = { ARQ: 'ARQ', LD: 'LD', CB: 'DFC', LI: 'LI', VC: 'VC', VI: 'VI', EXT: 'EXT', DEL: 'DEL' }
export const POS_LABEL: Record<AppPos, string> = {
  ARQ: 'Arquero', LD: 'Lateral derecho', CB: 'Defensor central', LI: 'Lateral izquierdo',
  VC: 'Volante central', VI: 'Volante interno', EXT: 'Extremo', DEL: 'Delantero',
}
export const POS_ORDER: AppPos[] = ['ARQ', 'LD', 'CB', 'LI', 'VC', 'VI', 'EXT', 'DEL']

export const ROLE_LABEL: Record<RoleCode, string> = {
  ARQ: 'Arquero', DC: 'Defensor central', LI: 'Lateral izquierdo', LD: 'Lateral derecho',
  MCD: 'Volante central', MC: 'Volante interno', VI: 'Volante por izquierda', VD: 'Volante por derecha',
  EI: 'Extremo izquierdo', ED: 'Extremo derecho', MCO: 'Enganche', DEL: 'Delantero centro',
}
export const ROLE_SHORT: Record<RoleCode, string> = {
  ARQ: 'ARQ', DC: 'DFC', LI: 'LI', LD: 'LD', MCD: 'MCD', MC: 'MC', VI: 'MI', VD: 'MD', EI: 'EI', ED: 'ED', MCO: 'MCO', DEL: 'DC',
}

export const GROUP_LABEL: Record<GroupCode, string> = {
  GK: 'Arqueros', CB: 'Defensores centrales', FB: 'Laterales', VC: 'Volantes centrales',
  VI: 'Volantes internos', EXT: 'Extremos', ST: 'Delanteros',
}
export const GROUP_ORDER: GroupCode[] = ['GK', 'CB', 'FB', 'VC', 'VI', 'EXT', 'ST']

export type Category = 'ataque' | 'creacion' | 'pase' | 'conduccion' | 'defensa' | 'valor' | 'arquero'
export const CATEGORY_LABEL: Record<Category, string> = {
  ataque: 'Ataque', creacion: 'Creación', pase: 'Pase', conduccion: 'Conducción y regate',
  defensa: 'Defensa', valor: 'Valor de posesión', arquero: 'Arquero',
}

export interface OptaMetric {
  key: string
  label: string
  /** Texto corto para la explicación al pasar el mouse. */
  help: string
  category: Category
  unit?: '%' | ''
  decimals: number
  lowerIsBetter?: boolean
  /** Cómo se nombra como punto fuerte cuando menos es mejor ("Cuida la pelota"). */
  goodLabel?: string
  /** Total de la temporada (sin dividir por 90). */
  total?: boolean
  /** Valor a mostrar; null = no aplica (ej. % sin intentos suficientes). */
  value: (p: OptaPlayer) => number | null
  /** Para percentiles: solo jugadores con este volumen mínimo (ej. remates para % de efectividad). */
  minVolume?: (p: OptaPlayer) => number
  minVolumeValue?: number
}

const st = (p: OptaPlayer, k: string) => p.stats[k] ?? 0
const per90 = (p: OptaPlayer, v: number) => (p.minutes > 0 ? (v / p.minutes) * 90 : 0)
const pct = (ok: number, total: number) => (total > 0 ? (ok / total) * 100 : null)

const m = (def: Omit<OptaMetric, 'decimals'> & { decimals?: number }): OptaMetric => ({ decimals: 2, ...def })

export const METRICS: OptaMetric[] = [
  // Ataque
  m({ key: 'goals', label: 'Goles', help: 'Goles cada 90 minutos (sin goles en contra).', category: 'ataque', value: p => per90(p, st(p, 'goals')) }),
  m({ key: 'npxg', label: 'xG sin penales', help: 'Goles esperados por la calidad de sus remates, sin contar penales, cada 90 minutos.', category: 'ataque', value: p => per90(p, p.xg.expectedGoalsNonpenalty ?? 0) }),
  m({ key: 'shots', label: 'Remates', help: 'Remates cada 90 minutos.', category: 'ataque', value: p => per90(p, st(p, 'totalScoringAtt')) }),
  m({ key: 'shotsOnTarget', label: 'Remates al arco', help: 'Remates que fueron al arco cada 90 minutos.', category: 'ataque', value: p => per90(p, st(p, 'ontargetScoringAtt')) }),
  m({ key: 'xgPerShot', label: 'xG por remate', help: 'Calidad promedio de cada remate: cuánto más alto, mejores posiciones de tiro.', category: 'ataque', decimals: 3,
    value: p => (st(p, 'totalScoringAtt') ? (p.xg.expectedGoals ?? 0) / st(p, 'totalScoringAtt') : null), minVolume: p => st(p, 'totalScoringAtt'), minVolumeValue: 10 }),
  m({ key: 'goalsMinusXg', label: 'Goles − xG', help: 'Goles convertidos menos los esperados en la temporada. Positivo: define mejor de lo que indican sus remates.', category: 'ataque', total: true,
    value: p => st(p, 'goals') - (p.xg.expectedGoals ?? 0), minVolume: p => st(p, 'totalScoringAtt'), minVolumeValue: 10 }),
  m({ key: 'touchesBox', label: 'Toques en el área rival', help: 'Toques dentro del área rival cada 90 minutos.', category: 'ataque', value: p => per90(p, st(p, 'touchesInOppBox')) }),
  // Creación
  m({ key: 'assists', label: 'Asistencias', help: 'Asistencias cada 90 minutos.', category: 'creacion', value: p => per90(p, st(p, 'goalAssist')) }),
  m({ key: 'xa', label: 'xA', help: 'Asistencias esperadas: la calidad de los remates que generan sus pases, cada 90 minutos.', category: 'creacion', value: p => per90(p, p.xg.expectedAssists ?? 0) }),
  m({ key: 'keyPasses', label: 'Pases que terminan en remate', help: 'Pases clave cada 90 minutos.', category: 'creacion', value: p => per90(p, st(p, 'totalAttAssist')) }),
  m({ key: 'bigChances', label: 'Chances claras creadas', help: 'Situaciones claras de gol generadas cada 90 minutos.', category: 'creacion', value: p => per90(p, st(p, 'bigChanceCreated')) }),
  m({ key: 'boxEntries', label: 'Pases al área', help: 'Pases completados que entran al área rival cada 90 minutos.', category: 'creacion', value: p => per90(p, p.ev.box) }),
  m({ key: 'crosses', label: 'Centros completados', help: 'Centros que llegan a un compañero cada 90 minutos (sin córners).', category: 'creacion', value: p => per90(p, st(p, 'accurateCrossNocorner')) }),
  m({ key: 'crossPct', label: '% de centros buenos', help: 'Centros que llegan a un compañero sobre el total (sin córners).', category: 'creacion', unit: '%', decimals: 0,
    value: p => pct(st(p, 'accurateCrossNocorner'), st(p, 'totalCrossNocorner')), minVolume: p => st(p, 'totalCrossNocorner'), minVolumeValue: 15 }),
  // Pase
  m({ key: 'passes', label: 'Pases', help: 'Pases intentados cada 90 minutos: cuánto participa del juego.', category: 'pase', decimals: 1, value: p => per90(p, st(p, 'totalPass')) }),
  m({ key: 'passPct', label: '% de pases buenos', help: 'Pases que llegan a un compañero sobre el total.', category: 'pase', unit: '%', decimals: 0,
    value: p => pct(st(p, 'accuratePass'), st(p, 'totalPass')), minVolume: p => st(p, 'totalPass'), minVolumeValue: 100 }),
  m({ key: 'progPasses', label: 'Pases progresivos', help: 'Pases que acercan mucho la pelota al arco rival (al menos un 25% de la distancia) cada 90 minutos.', category: 'pase', value: p => per90(p, p.ev.prog) }),
  m({ key: 'finalThirdPasses', label: 'Pases al último tercio', help: 'Pases completados que llegan al último tercio de la cancha cada 90 minutos.', category: 'pase', value: p => per90(p, st(p, 'successfulFinalThirdPasses')) }),
  m({ key: 'longPct', label: '% de pases largos buenos', help: 'Pases largos que llegan a un compañero sobre el total.', category: 'pase', unit: '%', decimals: 0,
    value: p => pct(st(p, 'accurateLongBalls'), st(p, 'totalLongBalls')), minVolume: p => st(p, 'totalLongBalls'), minVolumeValue: 20 }),
  m({ key: 'throughBalls', label: 'Pases filtrados', help: 'Pases entre líneas completados cada 90 minutos.', category: 'pase', value: p => per90(p, st(p, 'successfulPutThrough')) }),
  // Conducción
  m({ key: 'dribbles', label: 'Regates ganados', help: 'Mano a mano ganados cada 90 minutos.', category: 'conduccion', value: p => per90(p, st(p, 'wonContest')) }),
  m({ key: 'dribblePct', label: '% de regates ganados', help: 'Mano a mano ganados sobre los intentados.', category: 'conduccion', unit: '%', decimals: 0,
    value: p => pct(st(p, 'wonContest'), st(p, 'totalContest')), minVolume: p => st(p, 'totalContest'), minVolumeValue: 10 }),
  m({ key: 'progCarries', label: 'Conducciones progresivas', help: 'Conducciones con pelota que avanzan mucho hacia el arco rival cada 90 minutos.', category: 'conduccion', value: p => per90(p, st(p, 'progressiveCarries')) }),
  m({ key: 'fouled', label: 'Faltas recibidas', help: 'Faltas que le hacen cada 90 minutos.', category: 'conduccion', value: p => per90(p, st(p, 'wasFouled')) }),
  m({ key: 'possLost', label: 'Pérdidas', help: 'Veces que pierde la pelota cada 90 minutos. Menos es mejor.', category: 'conduccion', lowerIsBetter: true, goodLabel: 'Cuida la pelota (pocas pérdidas)', value: p => per90(p, st(p, 'possLostAll')) }),
  // Defensa
  m({ key: 'recoveries', label: 'Recuperaciones', help: 'Pelotas recuperadas cada 90 minutos.', category: 'defensa', value: p => per90(p, st(p, 'ballRecovery')) }),
  m({ key: 'tacklesWon', label: 'Quites', help: 'Entradas ganadas cada 90 minutos.', category: 'defensa', value: p => per90(p, st(p, 'wonTackle')) }),
  m({ key: 'interceptions', label: 'Intercepciones', help: 'Pases rivales cortados cada 90 minutos.', category: 'defensa', value: p => per90(p, st(p, 'interception')) }),
  m({ key: 'highRecoveries', label: 'Recuperaciones en campo rival', help: 'Pelotas ganadas en el último tercio cada 90 minutos: mide la presión alta.', category: 'defensa', value: p => per90(p, st(p, 'possWonAtt3rd')) }),
  m({ key: 'clearances', label: 'Despejes', help: 'Despejes cada 90 minutos.', category: 'defensa', value: p => per90(p, st(p, 'effectiveClearance')) }),
  m({ key: 'blocks', label: 'Bloqueos', help: 'Remates y centros bloqueados cada 90 minutos.', category: 'defensa', value: p => per90(p, st(p, 'outfielderBlock')) }),
  m({ key: 'aerialWon', label: 'Duelos aéreos ganados', help: 'Duelos aéreos ganados cada 90 minutos.', category: 'defensa', value: p => per90(p, st(p, 'aerialWon')) }),
  m({ key: 'aerialPct', label: '% de duelos aéreos ganados', help: 'Duelos aéreos ganados sobre los disputados.', category: 'defensa', unit: '%', decimals: 0,
    value: p => pct(st(p, 'aerialWon'), st(p, 'aerialWon') + st(p, 'aerialLost')), minVolume: p => st(p, 'aerialWon') + st(p, 'aerialLost'), minVolumeValue: 15 }),
  m({ key: 'duelPct', label: '% de duelos ganados', help: 'Duelos (por arriba y por abajo) ganados sobre los disputados.', category: 'defensa', unit: '%', decimals: 0,
    value: p => pct(st(p, 'duelWon'), st(p, 'duelWon') + st(p, 'duelLost')), minVolume: p => st(p, 'duelWon') + st(p, 'duelLost'), minVolumeValue: 30 }),
  m({ key: 'dribbledPast', label: 'Veces que lo pasan', help: 'Veces que un rival lo supera con un regate cada 90 minutos. Menos es mejor.', category: 'defensa', lowerIsBetter: true, goodLabel: 'Difícil de pasar (pocas veces lo superan)', value: p => per90(p, st(p, 'challengeLost')) }),
  m({ key: 'fouls', label: 'Faltas cometidas', help: 'Faltas cometidas cada 90 minutos. Menos es mejor.', category: 'defensa', lowerIsBetter: true, goodLabel: 'Comete pocas faltas', value: p => per90(p, st(p, 'fouls')) }),
  // Valor de posesión (modelo de Opta)
  m({ key: 'pv', label: 'Valor de posesión', help: 'Cuánto aumenta (o baja) la probabilidad de gol de su equipo con cada acción, sumado, cada 90 minutos. Modelo de Opta.', category: 'valor', decimals: 3,
    value: p => per90(p, p.pv.totalPossessionValue ?? 0) }),
  m({ key: 'pvPass', label: 'Valor con pases', help: 'Valor de posesión que suma con sus pases cada 90 minutos.', category: 'valor', decimals: 3, value: p => per90(p, p.pv.totalPlusPass ?? 0) }),
  m({ key: 'pvTakeOn', label: 'Valor con regates', help: 'Valor de posesión que suma con sus regates cada 90 minutos.', category: 'valor', decimals: 3, value: p => per90(p, p.pv.totalPlusTakeOns ?? 0) }),
  m({ key: 'pvRegain', label: 'Valor con recuperaciones', help: 'Valor de posesión que suma recuperando la pelota cada 90 minutos.', category: 'valor', decimals: 3, value: p => per90(p, p.pv.totalPlusRegains ?? 0) }),
  m({ key: 'pvLoss', label: 'Valor que resta perdiendo la pelota', help: 'Valor de posesión que le cuesta al equipo cada vez que pierde la pelota, cada 90 minutos. Menos negativo es mejor.', category: 'valor', decimals: 3,
    value: p => per90(p, p.pv.totalMinusLosingPossession ?? 0) }),
  // Arquero
  m({ key: 'saves', label: 'Atajadas', help: 'Atajadas cada 90 minutos.', category: 'arquero', value: p => per90(p, st(p, 'saves')) }),
  m({ key: 'savePct', label: '% de atajadas', help: 'Remates al arco atajados sobre los recibidos.', category: 'arquero', unit: '%', decimals: 0,
    value: p => pct(st(p, 'saves'), st(p, 'saves') + st(p, 'goalsConceded')), minVolume: p => st(p, 'saves') + st(p, 'goalsConceded'), minVolumeValue: 15 }),
  m({ key: 'goalsPrevented', label: 'Goles evitados', help: 'Goles que se esperaban por la calidad de los remates al arco que recibió, menos los que le hicieron. Positivo: ataja más de lo esperado.', category: 'arquero', total: true,
    value: p => (p.xg.expectedGoalsontargetConceded ?? 0) - st(p, 'goalsConceded'), minVolume: p => st(p, 'saves') + st(p, 'goalsConceded'), minVolumeValue: 15 }),
  m({ key: 'conceded', label: 'Goles recibidos', help: 'Goles recibidos cada 90 minutos. Menos es mejor.', category: 'arquero', lowerIsBetter: true, goodLabel: 'Recibe pocos goles', value: p => per90(p, st(p, 'goalsConceded')) }),
  m({ key: 'highClaims', label: 'Centros descolgados', help: 'Centros que corta saliendo por arriba cada 90 minutos.', category: 'arquero', value: p => per90(p, st(p, 'totalHighClaim')) }),
  m({ key: 'launchPct', label: '% de saques largos buenos', help: 'Saques largos que llegan a un compañero sobre el total.', category: 'arquero', unit: '%', decimals: 0,
    value: p => pct(st(p, 'accurateLaunches'), st(p, 'totalLaunches')), minVolume: p => st(p, 'totalLaunches'), minVolumeValue: 20 }),
  m({ key: 'gkPassPct', label: '% de pases buenos (arquero)', help: 'Pases del arquero que llegan a un compañero.', category: 'arquero', unit: '%', decimals: 0,
    value: p => pct(st(p, 'accuratePass'), st(p, 'totalPass')), minVolume: p => st(p, 'totalPass'), minVolumeValue: 100 }),
]

export const METRIC_BY_KEY = new Map(METRICS.map(x => [x.key, x]))
export const metric = (key: string) => METRIC_BY_KEY.get(key)!

/** Métricas del radar y del resumen según el puesto. */
export const GROUP_PROFILE: Record<GroupCode, string[]> = {
  GK: ['savePct', 'goalsPrevented', 'saves', 'highClaims', 'launchPct', 'gkPassPct', 'pvPass', 'conceded'],
  CB: ['aerialPct', 'aerialWon', 'interceptions', 'tacklesWon', 'clearances', 'blocks', 'dribbledPast', 'passPct', 'progPasses', 'longPct', 'pv'],
  FB: ['crosses', 'xa', 'progPasses', 'progCarries', 'dribbles', 'tacklesWon', 'interceptions', 'recoveries', 'dribbledPast', 'duelPct', 'pv'],
  VC: ['passes', 'passPct', 'progPasses', 'longPct', 'recoveries', 'tacklesWon', 'interceptions', 'duelPct', 'aerialPct', 'pvRegain', 'pv'],
  VI: ['progPasses', 'finalThirdPasses', 'keyPasses', 'xa', 'npxg', 'progCarries', 'dribbles', 'boxEntries', 'recoveries', 'highRecoveries', 'pv'],
  EXT: ['npxg', 'xa', 'keyPasses', 'dribbles', 'dribblePct', 'progCarries', 'crosses', 'boxEntries', 'touchesBox', 'highRecoveries', 'pv'],
  ST: ['goals', 'npxg', 'shots', 'xgPerShot', 'touchesBox', 'xa', 'aerialWon', 'dribbles', 'highRecoveries', 'goalsMinusXg', 'pv'],
}

/** Métricas que se muestran en la ficha, agrupadas por categoría, según el puesto. */
export function profileCategories(group: GroupCode): Array<{ category: Category; metrics: OptaMetric[] }> {
  const cats: Category[] = group === 'GK' ? ['arquero', 'pase', 'valor'] : ['ataque', 'creacion', 'pase', 'conduccion', 'defensa', 'valor']
  return cats.map(category => ({
    category,
    metrics: METRICS.filter(x => x.category === category && !(group === 'GK' && x.key === 'passPct') && !(group !== 'GK' && x.key === 'gkPassPct')),
  }))
}

export function fmt(v: number | null | undefined, mtr: Pick<OptaMetric, 'decimals' | 'unit'>): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const s = v.toLocaleString('es-AR', { minimumFractionDigits: mtr.decimals, maximumFractionDigits: mtr.decimals })
  return mtr.unit === '%' ? `${s}%` : s
}

// ─── Percentiles ────────────────────────────────────────────────────────────

export const DEFAULT_MIN_MINUTES = 450
/** Debajo de esto no se muestra percentil: con 1 o 2 partidos el promedio cada 90' no dice nada. */
export const MIN_MINUTES_FOR_PCT = 270

export interface PercentileIndex {
  /** Percentil 0-100 del jugador en la métrica, dentro de su grupo de puesto. */
  pct(p: OptaPlayer, key: string): number | null
  /** Promedio del grupo en la métrica. */
  avg(group: GroupCode, key: string): number | null
  /** Jugadores del grupo que entran en la comparación. */
  pool(group: GroupCode): OptaPlayer[]
  /**
   * Valor llevado a una escala 0-100 dentro del grupo (0 = el peor, 100 = el
   * percentil 95), para dibujar el radar "contra el promedio" con valores reales.
   * Si menos es mejor, se da vuelta.
   */
  norm(group: GroupCode, key: string, value: number | null): number | null
  /** Diferencia contra el promedio del grupo en % (positiva = mejor, ya contempla "menos es mejor"). */
  vsAvg(p: OptaPlayer, key: string): number | null
  minMinutes: number
}

export function buildPercentiles(players: OptaPlayer[], minMinutes = DEFAULT_MIN_MINUTES): PercentileIndex {
  const pools = new Map<GroupCode, OptaPlayer[]>()
  for (const p of players) {
    if (p.minutes < minMinutes) continue
    const list = pools.get(p.group) ?? []
    list.push(p)
    pools.set(p.group, list)
  }
  // Enganches son pocos: si no llegan a 15, se comparan con extremos y volantes por fuera.
  const poolFor = (g: GroupCode): OptaPlayer[] => pools.get(g) ?? []
  const sorted = new Map<string, number[]>()
  const valuesFor = (g: GroupCode, key: string): number[] => {
    const id = `${g}|${key}`
    if (!sorted.has(id)) {
      const mtr = METRIC_BY_KEY.get(key)
      const vals: number[] = []
      if (mtr) for (const p of poolFor(g)) {
        if (mtr.minVolume && mtr.minVolume(p) < (mtr.minVolumeValue ?? 0)) continue
        const v = mtr.value(p)
        if (v !== null && Number.isFinite(v)) vals.push(v)
      }
      sorted.set(id, vals.sort((a, b) => a - b))
    }
    return sorted.get(id)!
  }
  return {
    minMinutes,
    pool: poolFor,
    pct(p, key) {
      const mtr = METRIC_BY_KEY.get(key)
      if (!mtr || p.minutes < MIN_MINUTES_FOR_PCT) return null
      if (mtr.minVolume && mtr.minVolume(p) < (mtr.minVolumeValue ?? 0)) return null
      const v = mtr.value(p)
      const vals = valuesFor(p.group, key)
      if (v === null || vals.length < 5) return null
      // Percentil "medio": empates cuentan la mitad.
      let below = 0, equal = 0
      for (const x of vals) { if (x < v) below++; else if (x === v) equal++ }
      const raw = ((below + equal / 2) / vals.length) * 100
      return Math.round(mtr.lowerIsBetter ? 100 - raw : raw)
    },
    avg(g, key) {
      const vals = valuesFor(g, key)
      return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null
    },
    norm(g, key, value) {
      const mtr = METRIC_BY_KEY.get(key)
      const vals = valuesFor(g, key)
      if (!mtr || value === null || vals.length < 5) return null
      const lo = vals[Math.floor(vals.length * 0.05)], hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))]
      if (hi === lo) return 50
      const t = (value - lo) / (hi - lo)
      return Math.round(Math.max(0, Math.min(1, mtr.lowerIsBetter ? 1 - t : t)) * 100)
    },
    vsAvg(p, key) {
      const mtr = METRIC_BY_KEY.get(key)
      if (!mtr || p.minutes < MIN_MINUTES_FOR_PCT) return null
      if (mtr.minVolume && mtr.minVolume(p) < (mtr.minVolumeValue ?? 0)) return null
      const v = mtr.value(p)
      const pool = valuesFor(p.group, key)
      const a = pool.length ? pool.reduce((s, x) => s + x, 0) / pool.length : null
      if (v === null || a === null || Math.abs(a) < 1e-9) return null
      // Métricas que pueden ser negativas (goles − xG, goles evitados): diferencia sobre el valor absoluto.
      const d = ((v - a) / Math.abs(a)) * 100
      return Math.round(mtr.lowerIsBetter ? -d : d)
    },
  }
}

/** Nota general 0-100: promedio de percentiles del perfil de su puesto. */
export function profileScore(p: OptaPlayer, idx: PercentileIndex): number | null {
  const vals = GROUP_PROFILE[p.group].map(k => idx.pct(p, k)).filter((x): x is number => x !== null)
  return vals.length >= 4 ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : null
}

/** Jugadores parecidos: mismo grupo, distancia entre perfiles de percentiles. */
export function similarPlayers(p: OptaPlayer, all: OptaPlayer[], idx: PercentileIndex, n = 8): Array<{ player: OptaPlayer; similarity: number }> {
  const keys = GROUP_PROFILE[p.group]
  const me = keys.map(k => idx.pct(p, k))
  return idx.pool(p.group)
    .filter(o => o.id !== p.id)
    .map(o => {
      let sum = 0, n2 = 0
      keys.forEach((k, i) => {
        const a = me[i], b = idx.pct(o, k)
        if (a === null || b === null) return
        sum += (a - b) ** 2; n2++
      })
      if (n2 < 4) return null
      const dist = Math.sqrt(sum / n2) // 0..100
      return { player: o, similarity: Math.max(0, Math.round(100 - dist * 1.6)) }
    })
    .filter((x): x is { player: OptaPlayer; similarity: number } => x !== null)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, n)
}

/** Frases simples para "En pocas palabras": puntos fuertes y flojos dentro de su puesto. */
export function strengthsAndWeaknesses(p: OptaPlayer, idx: PercentileIndex) {
  const keys = [...new Set([...GROUP_PROFILE[p.group], ...METRICS.filter(x => x.category !== 'arquero' || p.group === 'GK').map(x => x.key)])]
  const scored = keys
    .filter(k => !(p.group !== 'GK' && metric(k).category === 'arquero') && !(p.group === 'GK' && !['arquero', 'valor'].includes(metric(k).category)))
    .map(k => ({ m: metric(k), pct: idx.pct(p, k) }))
    .filter((x): x is { m: OptaMetric; pct: number } => x.pct !== null)
  const strong = scored.filter(x => x.pct >= 80).sort((a, b) => b.pct - a.pct).slice(0, 4)
  const weak = scored.filter(x => x.pct <= 20 && GROUP_PROFILE[p.group].includes(x.m.key)).sort((a, b) => a.pct - b.pct).slice(0, 3)
  return { strong, weak }
}

export function age(dob: string | null): number | null {
  if (!dob) return null
  const d = new Date(dob), now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a--
  return a
}

/** Meses que le quedan de contrato (negativo si ya venció). */
export function monthsLeft(end: string | null): number | null {
  if (!end) return null
  const e = new Date(end), now = new Date()
  return (e.getFullYear() - now.getFullYear()) * 12 + (e.getMonth() - now.getMonth())
}

export const FOOT_LABEL: Record<string, string> = { left: 'Zurdo', right: 'Diestro', both: 'Ambidiestro' }
