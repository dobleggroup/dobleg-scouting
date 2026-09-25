// supabase/functions/_shared/mergeSeasonFragments.test.ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { mergeSeasonScoreFragments, type SeasonScoreRow } from './mergeSeasonFragments.ts';

function makeRow(overrides: Partial<SeasonScoreRow>): SeasonScoreRow {
  return {
    player_id: 1, season: 2026, position: 'EXT', league_id: 100,
    matches_played: 0, avg_rating: null,
    total_goals: 0, total_assists: 0,
    tackles_p90: null, interceptions_p90: null, blocks_p90: null,
    duels_won_pct: null, passes_accuracy: null, passes_key_p90: null,
    passes_total_p90: null, dribbles_success_p90: null, dribbles_pct: null,
    shots_on_p90: null, shots_pct: null, goals_p90: null, assists_p90: null,
    fouls_drawn_p90: null, saves_p90: null, goals_conceded_p90: null,
    penalty_saved_avg: null, clean_sheet_pct: null,
    updated_at: '2026-08-11T00:00:00.000Z',
    ...overrides,
  };
}

Deno.test('mergeSeasonScoreFragments: una sola fila por jugador+posicion no cambia', () => {
  const rows = [makeRow({ matches_played: 10, avg_rating: 6.5 })];
  const result = mergeSeasonScoreFragments(rows);
  assertEquals(result.length, 1);
  assertEquals(result[0].matches_played, 10);
  assertEquals(result[0].avg_rating, 6.5);
});

Deno.test('mergeSeasonScoreFragments: dos fragmentos de la misma posicion se funden en uno', () => {
  const rows = [
    makeRow({ league_id: 100, matches_played: 6, avg_rating: 6.1, total_goals: 2, total_assists: 1 }),
    makeRow({ league_id: 200, matches_played: 7, avg_rating: 5.4, total_goals: 3, total_assists: 0 }),
  ];
  const result = mergeSeasonScoreFragments(rows);
  assertEquals(result.length, 1);
  assertEquals(result[0].matches_played, 13);
  assertEquals(result[0].total_goals, 5);
  assertEquals(result[0].total_assists, 1);
  // (6*6.1 + 7*5.4) / 13 = (36.6 + 37.8) / 13 = 74.4 / 13 = 5.7230... -> 5.72
  assertEquals(result[0].avg_rating, 5.72);
});

Deno.test('mergeSeasonScoreFragments: distintas posiciones del mismo jugador no se mezclan', () => {
  const rows = [
    makeRow({ position: 'EXT', matches_played: 5, avg_rating: 7 }),
    makeRow({ position: 'VI', matches_played: 3, avg_rating: 6 }),
  ];
  const result = mergeSeasonScoreFragments(rows);
  assertEquals(result.length, 2);
});

Deno.test('mergeSeasonScoreFragments: jugadores distintos no se mezclan', () => {
  const rows = [
    makeRow({ player_id: 1, matches_played: 5, avg_rating: 7 }),
    makeRow({ player_id: 2, matches_played: 5, avg_rating: 4 }),
  ];
  const result = mergeSeasonScoreFragments(rows);
  assertEquals(result.length, 2);
});

Deno.test('mergeSeasonScoreFragments: campos null en un fragmento no rompen el promedio ponderado', () => {
  const rows = [
    makeRow({ league_id: 100, matches_played: 4, avg_rating: 6, passes_accuracy: 80 }),
    makeRow({ league_id: 200, matches_played: 2, avg_rating: 5, passes_accuracy: null }),
  ];
  const result = mergeSeasonScoreFragments(rows);
  assertEquals(result.length, 1);
  // El fragmento sin dato de passes_accuracy se excluye del promedio (no cuenta
  // como 0): queda el promedio ponderado solo sobre los fragmentos con dato,
  // que en este caso es un unico fragmento -> exactamente su valor, 80.
  assertEquals(result[0].passes_accuracy, 80);
});

Deno.test('mergeSeasonScoreFragments: campo null en TODOS los fragmentos queda null, no se convierte en 0', () => {
  const rows = [
    makeRow({ league_id: 100, matches_played: 4, avg_rating: 6, penalty_saved_avg: null }),
    makeRow({ league_id: 200, matches_played: 3, avg_rating: 5, penalty_saved_avg: null }),
  ];
  const result = mergeSeasonScoreFragments(rows);
  assertEquals(result.length, 1);
  assertEquals(result[0].penalty_saved_avg, null);
});

Deno.test('mergeSeasonScoreFragments: partidos en otro puesto se suman al puesto principal (caso Messi)', () => {
  const rows = [
    makeRow({ position: 'DEL', league_id: 253, matches_played: 12, total_goals: 11, avg_rating: 7.5 }),
    makeRow({ position: 'EXT', league_id: 253, matches_played: 10, total_goals: 9, avg_rating: 7.0 }),
  ];
  const primary = 'DEL';
  const result = mergeSeasonScoreFragments(rows.map(r => ({ ...r, position: primary })));
  assertEquals(result.length, 1);
  assertEquals(result[0].position, 'DEL');
  assertEquals(result[0].matches_played, 22);
  assertEquals(result[0].total_goals, 20);
});
