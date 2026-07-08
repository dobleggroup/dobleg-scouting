import { normalizeHeader, compactShort } from './metricRegistry'
import type { MetricDef } from './types'

// Tope de métricas derivadas generadas por archivo, para no explotar el registro
// con matches degenerados en hojas con muchas columnas.
const MAX_DERIVED = 40

// Palabras que se "pelan" de un header de porcentaje para quedarnos con el sustantivo
// que comparten con la métrica de volumen /90 (ej: "Precisión pases progresivos, %" -> "pases progresivos").
const QUALIFIER_WORDS = new Set([
  'precision', 'precisos', 'precisas', 'completados', 'completadas',
  'realizados', 'realizadas', 'exitosos', 'exitosas', 'acertados', 'acertadas',
  'acierto', 'con', 'exito', 'ganados', 'ganadas',
])

// Stopwords que no cuentan como "content word" al validar que dos stems comparten algo real.
const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'en', 'por', 'y', 'a', 'los', 'las'])

function headerOf(d: MetricDef): string {
  return d.sourceHeader ?? d.label
}

function isPer90(d: MetricDef): boolean {
  if (d.unit === '/90') return true
  const words = normalizeHeader(headerOf(d)).split(' ').filter(Boolean)
  return words.length > 0 && words[words.length - 1] === '90'
}

function isPercent(d: MetricDef): boolean {
  if (d.unit === '%') return true
  return headerOf(d).includes('%')
}

function volumeStem(d: MetricDef): string[] {
  const words = normalizeHeader(headerOf(d)).split(' ').filter(Boolean)
  if (words.length > 0 && words[words.length - 1] === '90') return words.slice(0, -1)
  return words
}

function percentStem(d: MetricDef): string[] {
  return normalizeHeader(headerOf(d))
    .split(' ')
    .filter(Boolean)
    .filter(w => !QUALIFIER_WORDS.has(w))
}

function isSubsetOf(small: string[], big: string[]): boolean {
  if (small.length === 0) return false
  const set = new Set(big)
  return small.every(w => set.has(w))
}

function hasSharedContentWord(small: string[], big: string[]): boolean {
  const set = new Set(big)
  return small.some(w => w.length >= 4 && !STOPWORDS.has(w) && set.has(w))
}

// Puntúa qué tan bien matchean dos stems (null = no matchea). Preferimos matches exactos
// (mismo set de palabras) sobre subset matches, y entre subsets el de menor diferencia de tamaño
// (más específico), para evitar que "Duelos/90" le robe el match a "Duelos defensivos/90"
// cuando ambos son subset de "Duelos defensivos ganados, %".
function matchScore(vWords: string[], pWords: string[]): number | null {
  const [small, big] = vWords.length <= pWords.length ? [vWords, pWords] : [pWords, vWords]
  if (!isSubsetOf(small, big) || !hasSharedContentWord(small, big)) return null
  const diff = big.length - small.length
  const exact = diff === 0
  return (exact ? 1000 : 0) + small.length * 10 - diff
}

function alreadyCompleted(label: string): boolean {
  return /completad|exitos|precis/.test(normalizeHeader(label))
}

// Quita un "/90" (o " 90") final de un label, ej "Pases progresivos /90" -> "Pases progresivos".
function stripP90Label(label: string): string {
  return label.replace(/\s*\/?\s*90\s*$/i, '').trim()
}

interface DerivedOp {
  def: MetricDef
  a: string
  b: string
  op: 'mulpct' | 'sub'
}

// A) "<X> completados /90": para cada métrica de volumen /90, busca la métrica % que
// mejor matchea su sustantivo (misma raíz de palabras) y crea volumen * pct/100.
function buildCompletedOps(baseDefs: MetricDef[]): DerivedOp[] {
  const volumes = baseDefs.filter(isPer90)
  const percents = baseDefs.filter(isPercent)
  const ops: DerivedOp[] = []

  for (const v of volumes) {
    if (alreadyCompleted(v.label)) continue
    const vWords = volumeStem(v)
    if (vWords.length === 0) continue

    let best: { p: MetricDef; score: number } | null = null
    for (const p of percents) {
      if (p.key === v.key) continue
      const pWords = percentStem(p)
      if (pWords.length === 0) continue
      const score = matchScore(vWords, pWords)
      if (score == null) continue
      if (!best || score > best.score) best = { p, score }
    }
    if (!best) continue

    const key = `derived_completed_${v.key}`
    const label = `${stripP90Label(v.label)} completados /90`
    const short = compactShort(`${stripP90Label(v.short || v.label)} Compl`)
    ops.push({
      def: { key, label, short, unit: '/90', higherIsBetter: true, derived: true },
      a: v.key,
      b: best.p.key,
      op: 'mulpct',
    })
  }
  return ops
}

function isGoalsHeader(norm: string): boolean {
  return /(^|\s)(gol|goles|goal|goals)(\s|$)/.test(norm) && !/esperad|expected|recibid|conced/.test(norm)
}
function isXgHeader(norm: string): boolean {
  return /\bxg\b/.test(norm) || (/(gol|goal)/.test(norm) && /esperad|expected/.test(norm))
}
function isAssistsHeader(norm: string): boolean {
  return /(asistencia|assist)/.test(norm) && !/esperad|expected/.test(norm)
}
function isXaHeader(norm: string): boolean {
  return /\bxa\b/.test(norm) || (/(asistencia|assist)/.test(norm) && /esperad|expected/.test(norm))
}

// Prefiere el def "sustantivo puro" (unit === '') entre los candidatos que matchean el header,
// para no agarrar por accidente una variante % o /90 del mismo concepto.
function findBest(defs: MetricDef[], test: (norm: string) => boolean): MetricDef | undefined {
  const candidates = defs.filter(d => !d.derived && test(normalizeHeader(headerOf(d))))
  if (candidates.length === 0) return undefined
  const exact = candidates.filter(d => d.unit === '')
  return exact[0] ?? candidates[0]
}

// B) Diffs real-vs-esperado: Goles − xG, Asistencias − xA. Match por header normalizado,
// no por key fija, para que funcione aunque hayan entrado como métricas crudas.
function buildDiffOps(baseDefs: MetricDef[]): DerivedOp[] {
  const ops: DerivedOp[] = []

  const goals = findBest(baseDefs, isGoalsHeader)
  const xg = findBest(baseDefs, isXgHeader)
  if (goals && xg && goals.key !== xg.key) {
    ops.push({
      def: { key: 'goals_minus_xg', label: 'Goles − xG', short: 'G−xG', unit: '', higherIsBetter: true, diverging: true, derived: true },
      a: goals.key,
      b: xg.key,
      op: 'sub',
    })
  }

  const assists = findBest(baseDefs, isAssistsHeader)
  const xa = findBest(baseDefs, isXaHeader)
  if (assists && xa && assists.key !== xa.key) {
    ops.push({
      def: { key: 'assists_minus_xa', label: 'Asistencias − xA', short: 'A−xA', unit: '', higherIsBetter: true, diverging: true, derived: true },
      a: assists.key,
      b: xa.key,
      op: 'sub',
    })
  }

  return ops
}

export function applyDerived(
  baseDefs: MetricDef[],
  matrix: Record<string, (number | null)[]>,
): { defs: MetricDef[]; matrix: Record<string, (number | null)[]> } {
  const defs = [...baseDefs]
  const outMatrix: Record<string, (number | null)[]> = { ...matrix }
  const columns = Object.values(matrix)
  const rowCount = columns.length ? Math.max(...columns.map(c => c.length)) : 0
  const present = new Set(baseDefs.map(d => d.key))

  const ops = [...buildCompletedOps(baseDefs), ...buildDiffOps(baseDefs)].slice(0, MAX_DERIVED)

  for (const rule of ops) {
    if (!present.has(rule.a) || !present.has(rule.b)) continue
    if (!(rule.a in matrix) || !(rule.b in matrix)) continue
    const col: (number | null)[] = []
    for (let i = 0; i < rowCount; i++) {
      const av = matrix[rule.a][i]
      const bv = matrix[rule.b][i]
      if (av == null || Number.isNaN(av) || bv == null || Number.isNaN(bv)) {
        col.push(null)
        continue
      }
      col.push(rule.op === 'mulpct' ? av * (bv / 100) : av - bv)
    }
    outMatrix[rule.def.key] = col
    defs.push(rule.def)
  }

  return { defs, matrix: outMatrix }
}
