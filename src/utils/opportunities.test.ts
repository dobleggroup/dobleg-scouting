import { describe, it, expect } from 'vitest'
import { marketTagsFor } from './opportunities'
import type { RecentFormPlayer } from '@/types/scoring'

function mk(over: Partial<RecentFormPlayer>): RecentFormPlayer {
  return {
    id: 1, name: 'X', photo: null, team: null, league_name: null, primary_position: 'EXT',
    birth_date: '2002-01-01', market_value_eur: null, contract_end_date: null,
    primary_score: 6, recent_avg: 7.5, recent_matches: 4, recent_scores: [7, 8, 7, 8],
    on_the_rise: true, window_used: 'window', ...over,
  }
}

describe('marketTagsFor', () => {
  const opts = { cheapMaxValue: 2_000_000, contractMaxMonths: 12 }
  it('marca precio bajo', () => {
    expect(marketTagsFor(mk({ market_value_eur: 1_000_000 }), opts)).toContain('cheap')
  })
  it('marca fin de contrato', () => {
    const soon = new Date(); soon.setMonth(soon.getMonth() + 6)
    expect(marketTagsFor(mk({ contract_end_date: soon.toISOString().slice(0, 10) }), opts)).toContain('contract')
  })
  it('sin condición => vacío', () => {
    expect(marketTagsFor(mk({ market_value_eur: 50_000_000 }), opts)).toEqual([])
  })
})
