import { describe, it, expect } from 'vitest'
import { computeSimilarity } from './similarity'
import type { PlayerSeasonScore, PlayerWithScore } from '@/types/scoring'

// Minimal fixture builder — only the fields needed by the DEL metric keys:
// goals_p90, shots_on_p90, assists_p90, shots_pct, passes_key_p90,
// duels_won_pct, avg_rating, dribbles_success_p90, fouls_drawn_p90
function makeScore(overrides: Partial<PlayerSeasonScore>): PlayerSeasonScore {
  return {
    player_id: 1,
    season: 2026,
    position: 'DEL',
    league_id: 1,
    matches_played: 20,
    avg_score: null,
    avg_rating: null,
    total_goals: 0,
    total_assists: 0,
    percentile: null,
    global_percentile: null,
    tackles_p90: null,
    interceptions_p90: null,
    blocks_p90: null,
    duels_won_pct: null,
    passes_accuracy: null,
    passes_key_p90: null,
    passes_total_p90: null,
    dribbles_success_p90: null,
    dribbles_pct: null,
    shots_on_p90: null,
    shots_pct: null,
    goals_p90: null,
    assists_p90: null,
    fouls_drawn_p90: null,
    saves_p90: null,
    goals_conceded_p90: null,
    penalty_saved_avg: null,
    clean_sheet_pct: null,
    ...overrides,
  } as unknown as PlayerSeasonScore
}

function makePlayer(id: number, name: string): PlayerWithScore {
  return {
    id,
    name,
    photo: null,
    birth_date: null,
    nationality: null,
    preferred_foot: null,
    height_cm: null,
    current_team_id: null,
    primary_position: 'DEL',
    position_distribution: {},
    market_value_eur: null,
    contract_end_date: null,
    agent: null,
    transfermarkt_url: null,
    transfermarkt_id: null,
    season_scores: [],
    primary_score: null,
    primary_percentile: null,
  } as unknown as PlayerWithScore
}

describe('computeSimilarity', () => {
  const baseScore = makeScore({
    goals_p90: 0.5,
    shots_on_p90: 2.0,
    assists_p90: 0.3,
    shots_pct: 40,
    passes_key_p90: 1.5,
    duels_won_pct: 55,
    avg_rating: 7.0,
    dribbles_success_p90: 1.0,
    fouls_drawn_p90: 2.0,
  })

  // Identical to base — should be distance ≈ 0 (closest)
  const identicalScore = makeScore({
    goals_p90: 0.5,
    shots_on_p90: 2.0,
    assists_p90: 0.3,
    shots_pct: 40,
    passes_key_p90: 1.5,
    duels_won_pct: 55,
    avg_rating: 7.0,
    dribbles_success_p90: 1.0,
    fouls_drawn_p90: 2.0,
  })

  // Very different — should be the most distant
  const distantScore = makeScore({
    goals_p90: 0.0,
    shots_on_p90: 0.1,
    assists_p90: 0.0,
    shots_pct: 5,
    passes_key_p90: 0.1,
    duels_won_pct: 10,
    avg_rating: 4.0,
    dribbles_success_p90: 0.1,
    fouls_drawn_p90: 0.2,
  })

  // Moderately different
  const middleScore = makeScore({
    goals_p90: 0.3,
    shots_on_p90: 1.2,
    assists_p90: 0.2,
    shots_pct: 25,
    passes_key_p90: 0.9,
    duels_won_pct: 35,
    avg_rating: 6.0,
    dribbles_success_p90: 0.6,
    fouls_drawn_p90: 1.2,
  })

  const identicalPlayer = makePlayer(2, 'Identical')
  const distantPlayer = makePlayer(3, 'Distant')
  const middlePlayer = makePlayer(4, 'Middle')

  it('identical player gets distance ~0 and appears first', () => {
    const others = [
      { player: identicalPlayer, score: identicalScore },
      { player: distantPlayer, score: distantScore },
      { player: middlePlayer, score: middleScore },
    ]
    const results = computeSimilarity(baseScore, others, 'DEL')

    expect(results.length).toBe(3)
    // The identical player should be first (smallest distance)
    expect(results[0].player.name).toBe('Identical')
    // Its distance should be ~0
    expect(results[0].distance).toBeCloseTo(0, 5)
  })

  it('most different player ends up last', () => {
    const others = [
      { player: identicalPlayer, score: identicalScore },
      { player: distantPlayer, score: distantScore },
      { player: middlePlayer, score: middleScore },
    ]
    const results = computeSimilarity(baseScore, others, 'DEL')

    // Distant player should be last (highest distance)
    expect(results[results.length - 1].player.name).toBe('Distant')
  })

  it('returns empty array when others is empty', () => {
    const results = computeSimilarity(baseScore, [], 'DEL')
    expect(results).toHaveLength(0)
  })
})
