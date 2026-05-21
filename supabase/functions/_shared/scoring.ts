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
    { metric: 'duels_won_pct', weight: 19, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'key_passes_p90', weight: 14, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 12, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'assists_p90', weight: 12, source: r => per90(r.assists, r.minutes) },
    { metric: 'tackles_p90', weight: 10, source: r => per90(r.tackles, r.minutes) },
    { metric: 'passes_accuracy', weight: 10, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'interceptions_p90', weight: 8, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'dribbles_success_pct', weight: 7, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
  ],
  LI: [
    { metric: 'duels_won_pct', weight: 19, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'key_passes_p90', weight: 14, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 12, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'assists_p90', weight: 12, source: r => per90(r.assists, r.minutes) },
    { metric: 'tackles_p90', weight: 10, source: r => per90(r.tackles, r.minutes) },
    { metric: 'passes_accuracy', weight: 10, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'interceptions_p90', weight: 8, source: r => per90(r.interceptions, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'dribbles_success_pct', weight: 7, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
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
    { metric: 'duels_won_pct', weight: 16, source: r => pct(r.duels_won, r.duels_total), isPercentage: true },
    { metric: 'key_passes_p90', weight: 14, source: r => per90(r.passes_key, r.minutes) },
    { metric: 'dribbles_success_p90', weight: 12, source: r => per90(r.dribbles_success, r.minutes) },
    { metric: 'assists_p90', weight: 10, source: r => per90(r.assists, r.minutes) },
    { metric: 'goals_p90', weight: 10, source: r => per90(r.goals, r.minutes) },
    { metric: 'passes_accuracy', weight: 10, source: r => r.passes_accuracy, isPercentage: true },
    { metric: 'shots_on_p90', weight: 8, source: r => per90(r.shots_on, r.minutes) },
    { metric: 'rating', weight: 8, source: r => r.rating ?? 0 },
    { metric: 'tackles_p90', weight: 6, source: r => per90(r.tackles, r.minutes) },
    { metric: 'dribbles_success_pct', weight: 6, source: r => pct(r.dribbles_success, r.dribbles_attempted), isPercentage: true },
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
