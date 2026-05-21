// supabase/functions/_shared/scoring.test.ts

import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { calculateMatchScore, normalizeToScale, SCORING_WEIGHTS } from './scoring.ts';
import type { PlayerMatchRow } from './types.ts';

function makeRow(overrides: Partial<PlayerMatchRow>): PlayerMatchRow {
  return {
    player_id: 1, fixture_id: 1, team_id: 1,
    detected_position: 'DEL', formation: '4-3-3', grid_position: '4:2',
    minutes: 90, rating: 7.0, is_substitute: false,
    goals: 0, assists: 0, shots_total: 0, shots_on: 0,
    passes_total: 0, passes_key: 0, passes_accuracy: 0,
    tackles: 0, blocks: 0, interceptions: 0,
    duels_total: 0, duels_won: 0,
    dribbles_attempted: 0, dribbles_success: 0,
    fouls_drawn: 0, fouls_committed: 0,
    yellow_cards: 0, red_cards: 0,
    penalty_won: 0, penalty_scored: 0, penalty_missed: 0, penalty_saved: 0,
    saves: 0, goals_conceded: 0,
    match_score: null,
    ...overrides,
  };
}

Deno.test('SCORING_WEIGHTS: all positions sum to 100', () => {
  for (const [pos, weights] of Object.entries(SCORING_WEIGHTS)) {
    const total = weights.reduce((s, w) => s + w.weight, 0);
    assertEquals(total, 100, `${pos} weights sum to ${total}, expected 100`);
  }
});

Deno.test('SCORING_WEIGHTS: all 8 positions defined', () => {
  const positions = Object.keys(SCORING_WEIGHTS);
  assertEquals(positions.sort(), ['ARQ','CB','DEL','EXT','LD','LI','VC','VI']);
});

Deno.test('normalizeToScale: 0 -> 1.0, 100 -> 10.0, 50 -> 5.5', () => {
  assertAlmostEquals(normalizeToScale(0), 1.0, 0.01);
  assertAlmostEquals(normalizeToScale(100), 10.0, 0.01);
  assertAlmostEquals(normalizeToScale(50), 5.5, 0.01);
});

Deno.test('calculateMatchScore: DEL with 2 goals in 90 min scores high', () => {
  const delRow = makeRow({ detected_position: 'DEL', goals: 2, minutes: 90, shots_on: 3, shots_total: 5, rating: 8.5 });
  const peers = [
    makeRow({ goals: 0, minutes: 90, rating: 6.5 }),
    makeRow({ goals: 0, minutes: 90, rating: 6.0 }),
    makeRow({ goals: 1, minutes: 90, rating: 7.0 }),
  ];
  const score = calculateMatchScore(delRow, peers);
  // Should be well above average (>5.5) given 2 goals vs peers with 0-1
  assertEquals(score !== null, true);
  assertEquals(score! > 7.0, true);
});

Deno.test('calculateMatchScore: returns null if minutes < 10', () => {
  const row = makeRow({ minutes: 5 });
  const score = calculateMatchScore(row, []);
  assertEquals(score, null);
});

Deno.test('calculateMatchScore: ARQ with clean sheet and saves', () => {
  const arqRow = makeRow({
    detected_position: 'ARQ', goals_conceded: 0, saves: 5,
    minutes: 90, rating: 7.5, duels_total: 2, duels_won: 1,
  });
  const peers = [
    makeRow({ detected_position: 'ARQ', goals_conceded: 2, saves: 3, minutes: 90, rating: 6.0, duels_total: 3, duels_won: 1 }),
    makeRow({ detected_position: 'ARQ', goals_conceded: 1, saves: 4, minutes: 90, rating: 6.5, duels_total: 2, duels_won: 1 }),
  ];
  const score = calculateMatchScore(arqRow, peers);
  assertEquals(score !== null, true);
  assertEquals(score! > 6.0, true);
});
