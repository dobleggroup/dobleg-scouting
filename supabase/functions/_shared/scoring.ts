// supabase/functions/_shared/scoring.ts

import type { Position, PlayerMatchRow, ScoringWeight } from './types.ts';

const MIN_MINUTES = 10;

function per90(value: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return (value / minutes) * 90;
}

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return (num / den) * 100;
}

export const SCORING_WEIGHTS: Record<Position, ScoringWeight[]> = {
  ARQ: [
    { metric: 'saves_p90', weight: 35, source: r => per90(r.saves, r.minutes) },
    { metric: 'goals_conceded_p90', weight: 25, source: r => per90(r.goals_conceded, r.minutes), inverse: true },
    { metric: 'rating', weight: 20, source: r => r.rating ?? 0 },
    { metric: 'penalty_saved', weight: 10, source: r => r.penalty_saved },
    { metric: 'clean_sheet', weight: 10, source: r => r.goals_conceded === 0 ? 100 : 0, isPercentage: true },
  ],
  CB: [
    { metric: 'duels_won_pct', weight: 28, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'tackles_p90', weight: 15, source: r => per90(r.tackles, r.minutes) },
    { metric: 'interceptions_p90', weight: 15, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'blocks_p90', weight: 12, source: r => per90(r.blocks, r.minutes) },
    { metric: 'passes_accuracy', weight: 12, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'rating', weight: 10, source: r => r.rating ?? 0 },
    { metric: 'passes_total_p90', weight: 8, source: r => per90(r.passes_total, r.minutes) },
  ],
  LD: [
    { metric: 'key_passes_p90', weight: 15, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'duels_won_pct', weight: 15, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'assists_p90', weight: 13, source: r => per90(r.assists, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 13, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'tackles_p90', weight: 10, source: r => per90(r.tackles, r.minutes) },
    { metric: 'passes_accuracy', weight: 10, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'dribbles_success_pct', weight: 8, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
    { metric: 'interceptions_p90', weight: 8, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
  ],
  LI: [
    { metric: 'key_passes_p90', weight: 15, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'duels_won_pct', weight: 15, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'assists_p90', weight: 13, source: r => per90(r.assists, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 13, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'tackles_p90', weight: 10, source: r => per90(r.tackles, r.minutes) },
    { metric: 'passes_accuracy', weight: 10, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'dribbles_success_pct', weight: 8, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
    { metric: 'interceptions_p90', weight: 8, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
  ],
  VC: [
    { metric: 'tackles_p90', weight: 19, source: r => per90(r.tackles, r.minutes) },
    { metric: 'duels_won_pct', weight: 16, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'interceptions_p90', weight: 14, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'passes_accuracy', weight: 14, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'passes_total_p90', weight: 10, source: r => per90(r.passes_total, r.minutes) },
    { metric: 'blocks_p90', weight: 8, source: r => per90(r.blocks, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'key_passes_p90', weight: 6, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'passes_accuracy_extra', weight: 5, source: r => r.passes_accuracy, isPercentage: true },
  ],
  VI: [
    { metric: 'key_passes_p90', weight: 15, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'assists_p90', weight: 13, source: r => per90(r.assists, r.minutes) },
    { metric: 'goals_p90', weight: 12, source: r => per90(r.goals, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 12, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'duels_won_pct', weight: 12, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'passes_accuracy', weight: 11, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'shots_on_p90', weight: 8, source: r => per90(r.shots_on, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'dribbles_success_pct', weight: 5, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
    { metric: 'tackles_p90', weight: 4, source: r => per90(r.tackles, r.minutes) },
  ],
  EXT: [
    { metric: 'dribbles_success_p90', weight: 17, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'goals_p90', weight: 15, source: r => per90(r.goals, r.minutes) },
    { metric: 'assists_p90', weight: 14, source: r => per90(r.assists, r.minutes) },
    { metric: 'key_passes_p90', weight: 12, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'shots_on_p90', weight: 10, source: r => per90(r.shots_on, r.minutes) },
    { metric: 'duels_won_pct', weight: 10, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'dribbles_success_pct', weight: 8, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'fouls_drawn_p90', weight: 6, source: r => per90(r.fouls_drawn, r.minutes) },
  ],
  DEL: [
    { metric: 'goals_p90', weight: 30, source: r => per90(r.goals, r.minutes) },
    { metric: 'shots_on_p90', weight: 12, source: r => per90(r.shots_on, r.minutes) },
    { metric: 'assists_p90', weight: 10, source: r => per90(r.assists, r.minutes) },
    { metric: 'shots_on_pct', weight: 8, source: r => pct(r.shots_on, r.shots_total), isPercentage: true },
    { metric: 'key_passes_p90', weight: 8, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'duels_won_pct', weight: 8, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'dribbles_success_p90', weight: 6, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'penalty_scored', weight: 5, source: r => r.penalty_scored },
    { metric: 'fouls_drawn_p90', weight: 5, source: r => per90(r.fouls_drawn, r.minutes) },
  ],
};

function rankNormalize(value: number, sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n <= 1) return 50;

  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  const below = lo;

  lo = 0;
  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  const belowOrEqual = lo;
  const equal = belowOrEqual - below;

  const rank = below + (equal - 1) / 2;
  return Math.min(100, Math.max(0, (rank / (n - 1)) * 100));
}

export function normalizeToScale(raw: number): number {
  return Math.round((1 + (raw * 9) / 100) * 10) / 10;
}

export function calculateMatchScore(
  row: PlayerMatchRow,
  peers: PlayerMatchRow[],
): number | null {
  if (row.minutes < MIN_MINUTES) return null;

  const position = row.detected_position;
  if (!position || !(position in SCORING_WEIGHTS)) return null;

  const weights = SCORING_WEIGHTS[position];
  const allRows = [row, ...peers.filter(p =>
    p.detected_position === position && p.minutes >= MIN_MINUTES
  )];

  if (allRows.length <= 1) {
    // Not enough peers to rank — use rating as proxy
    const rating = row.rating ?? 5.0;
    return Math.round(Math.min(10, Math.max(1, rating)) * 10) / 10;
  }

  let scoreRaw = 0;

  for (const w of weights) {
    const values = allRows.map(r => w.source(r));
    if (w.inverse) {
      for (let i = 0; i < values.length; i++) values[i] = -values[i];
    }
    const sorted = [...values].sort((a, b) => a - b);
    const playerValue = w.inverse ? -w.source(row) : w.source(row);
    const normalized = rankNormalize(playerValue, sorted);
    scoreRaw += normalized * (w.weight / 100);
  }

  return normalizeToScale(scoreRaw);
}

// ─── Score por temporada (ranking contra el pool de la misma posición) ──────
//
// El match_score de arriba rankea contra los 2-4 jugadores del MISMO partido, lo
// que aplasta todo al ~50 (≈6/10) y castiga a puestos con pocos representantes
// por partido (ej. laterales). Este cálculo, en cambio, toma las métricas /90
// AGREGADAS de la temporada y rankea al jugador contra TODO el pool de su puesto
// en su liga → refleja "qué tan bueno es en su puesto" y usa todo el rango.

/** Métrica de SCORING_WEIGHTS → campo agregado de player_season_scores. '' = sin equivalente (se omite). */
const METRIC_TO_SEASON_FIELD: Record<string, string> = {
  saves_p90: 'saves_p90',
  goals_conceded_p90: 'goals_conceded_p90',
  rating: 'avg_rating',
  penalty_saved: 'penalty_saved_avg',
  clean_sheet: 'clean_sheet_pct',
  duels_won_pct: 'duels_won_pct',
  tackles_p90: 'tackles_p90',
  interceptions_p90: 'interceptions_p90',
  blocks_p90: 'blocks_p90',
  passes_accuracy: 'passes_accuracy',
  passes_accuracy_extra: 'passes_accuracy',
  passes_total_p90: 'passes_total_p90',
  key_passes_p90: 'passes_key_p90',
  dribbles_success_p90: 'dribbles_success_p90',
  dribbles_success_pct: 'dribbles_pct',
  assists_p90: 'assists_p90',
  goals_p90: 'goals_p90',
  shots_on_p90: 'shots_on_p90',
  shots_on_pct: 'shots_pct',
  fouls_drawn_p90: 'fouls_drawn_p90',
  penalty_scored: '', // sin campo agregado equivalente
}

export type SeasonAggRow = Record<string, number | null | undefined>

/**
 * Rankea las métricas agregadas de `playerRow` contra `pool` (jugadores de la
 * misma posición en la liga/temporada) usando los pesos de la posición, y
 * devuelve el score 1.0-10.0. Normaliza por el peso realmente usado, así las
 * métricas sin dato (para el jugador o el pool) no rompen la escala.
 */
export function calculateSeasonScore(
  playerRow: SeasonAggRow,
  pool: SeasonAggRow[],
  position: Position,
): number | null {
  const weights = SCORING_WEIGHTS[position]
  if (!weights) return null

  let scoreRaw = 0
  let usedWeight = 0

  for (const w of weights) {
    const field = METRIC_TO_SEASON_FIELD[w.metric]
    if (!field) continue
    const pv = playerRow[field]
    if (pv === null || pv === undefined) continue

    let vals = pool
      .map(r => r[field])
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
    if (vals.length <= 1) continue
    if (w.inverse) vals = vals.map(v => -v)

    const sorted = vals.slice().sort((a, b) => a - b)
    const playerValue = w.inverse ? -(pv as number) : (pv as number)
    const normalized = rankNormalize(playerValue, sorted)
    scoreRaw += normalized * w.weight
    usedWeight += w.weight
  }

  if (usedWeight === 0) return null
  return normalizeToScale(scoreRaw / usedWeight)
}

/**
 * Versión por lote y eficiente: precalcula UNA vez el array ordenado de cada
 * métrica del pool (no por jugador), y luego rankea a cada jugador por búsqueda
 * binaria. Evita el O(n²) de reordenar el pool en cada llamada (que agotaba el
 * CPU del worker con miles de jugadores por posición). Devuelve un score por
 * cada fila de `rowsToScore`, en el mismo orden.
 */
export function calculateSeasonScores(
  rowsToScore: SeasonAggRow[],
  pool: SeasonAggRow[],
  position: Position,
): (number | null)[] {
  const weights = SCORING_WEIGHTS[position]
  if (!weights) return rowsToScore.map(() => null)

  // Campo → { inverse } (dedup: métricas distintas pueden apuntar al mismo campo).
  const fieldInverse = new Map<string, boolean>()
  for (const w of weights) {
    const field = METRIC_TO_SEASON_FIELD[w.metric]
    if (field && !fieldInverse.has(field)) fieldInverse.set(field, !!w.inverse)
  }
  // Array ordenado por campo, precalculado una sola vez.
  const sortedByField = new Map<string, number[]>()
  for (const [field, inverse] of fieldInverse) {
    let vals = pool
      .map(r => r[field])
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
    if (inverse) vals = vals.map(v => -v)
    vals.sort((a, b) => a - b)
    sortedByField.set(field, vals)
  }

  return rowsToScore.map(row => {
    let scoreRaw = 0
    let usedWeight = 0
    for (const w of weights) {
      const field = METRIC_TO_SEASON_FIELD[w.metric]
      if (!field) continue
      const pv = row[field]
      if (pv === null || pv === undefined) continue
      const sorted = sortedByField.get(field)
      if (!sorted || sorted.length <= 1) continue
      const inverse = fieldInverse.get(field)!
      const playerValue = inverse ? -(pv as number) : (pv as number)
      scoreRaw += rankNormalize(playerValue, sorted) * w.weight
      usedWeight += w.weight
    }
    if (usedWeight === 0) return null
    return normalizeToScale(scoreRaw / usedWeight)
  })
}
