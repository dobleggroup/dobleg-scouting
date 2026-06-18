import { describe, it, expect } from 'vitest'
import {
  ageFromBirthDate,
  monthsToContractEnd,
  detectOpportunities,
} from './opportunities'
import type { PlayerWithScore } from '@/types/scoring'

// currentDate from memory: 2026-06-18
// "2006-01-01" → ~20 years old (≤21) ✓
// "1996-01-01" → ~30 years old (>21) ✗

function makePlayer(overrides: Partial<PlayerWithScore>): PlayerWithScore {
  return {
    id: 1,
    name: 'Test Player',
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
    ...overrides,
  } as unknown as PlayerWithScore
}

describe('ageFromBirthDate', () => {
  it('returns null for null input', () => {
    expect(ageFromBirthDate(null)).toBeNull()
  })

  it('calculates age correctly for a ~20-year-old', () => {
    const age = ageFromBirthDate('2006-01-01')
    expect(age).not.toBeNull()
    expect(age).toBeGreaterThanOrEqual(19)
    expect(age).toBeLessThanOrEqual(21)
  })

  it('calculates age correctly for a ~30-year-old', () => {
    const age = ageFromBirthDate('1996-01-01')
    expect(age).not.toBeNull()
    expect(age).toBeGreaterThanOrEqual(29)
    expect(age).toBeLessThanOrEqual(31)
  })
})

describe('monthsToContractEnd', () => {
  it('returns null for null input', () => {
    expect(monthsToContractEnd(null)).toBeNull()
  })

  it('returns a positive number for a future date', () => {
    const months = monthsToContractEnd('2027-06-01')
    expect(months).not.toBeNull()
    expect(months as number).toBeGreaterThan(0)
  })

  it('returns a negative or zero for a past date', () => {
    const months = monthsToContractEnd('2025-01-01')
    expect(months).not.toBeNull()
    expect(months as number).toBeLessThanOrEqual(0)
  })
})

describe('detectOpportunities', () => {
  describe('youngTalent', () => {
    it('includes a player ~18 years old with score 6.5', () => {
      const young = makePlayer({
        id: 1,
        name: 'Young Star',
        birth_date: '2008-01-01', // ~18 years
        primary_score: 6.5,
        market_value_eur: 500_000,
      })
      const { youngTalent } = detectOpportunities([young])
      expect(youngTalent.map(p => p.name)).toContain('Young Star')
    })

    it('excludes a player ~30 years old from youngTalent', () => {
      const veteran = makePlayer({
        id: 2,
        name: 'Old Veteran',
        birth_date: '1996-01-01', // ~30 years
        primary_score: 7.0,
        market_value_eur: 500_000,
      })
      const { youngTalent } = detectOpportunities([veteran])
      expect(youngTalent.map(p => p.name)).not.toContain('Old Veteran')
    })

    it('excludes a player with score below 6.0 even if young', () => {
      const youngLow = makePlayer({
        id: 3,
        name: 'Young Low',
        birth_date: '2006-01-01', // ~20 years
        primary_score: 5.5,
      })
      const { youngTalent } = detectOpportunities([youngLow])
      expect(youngTalent.map(p => p.name)).not.toContain('Young Low')
    })
  })

  describe('undervalued', () => {
    it('includes a player with score 6.8 and positive market value', () => {
      const undervalued = makePlayer({
        id: 4,
        name: 'Undervalued Gem',
        primary_score: 6.8,
        market_value_eur: 300_000,
        birth_date: '1998-01-01',
      })
      const result = detectOpportunities([undervalued])
      expect(result.undervalued.map(p => p.name)).toContain('Undervalued Gem')
    })

    it('excludes a player with score 5.0 from undervalued', () => {
      const low = makePlayer({
        id: 5,
        name: 'Low Score Player',
        primary_score: 5.0,
        market_value_eur: 300_000,
        birth_date: '1998-01-01',
      })
      const result = detectOpportunities([low])
      expect(result.undervalued.map(p => p.name)).not.toContain('Low Score Player')
    })

    it('excludes a player with score 6.8 but no market value', () => {
      const noValue = makePlayer({
        id: 6,
        name: 'No Value Player',
        primary_score: 6.8,
        market_value_eur: null,
        birth_date: '1998-01-01',
      })
      const result = detectOpportunities([noValue])
      expect(result.undervalued.map(p => p.name)).not.toContain('No Value Player')
    })
  })

  describe('expiringContract', () => {
    it('includes a player with contract ending in 6 months', () => {
      // ~6 months from 2026-06-18 → 2026-12-18
      const expiring = makePlayer({
        id: 7,
        name: 'Expiring Contract',
        contract_end_date: '2026-12-01',
        primary_score: 7.0,
      })
      const { expiringContract } = detectOpportunities([expiring])
      expect(expiringContract.map(p => p.name)).toContain('Expiring Contract')
    })

    it('excludes a player with contract ending in 2 years', () => {
      const longContract = makePlayer({
        id: 8,
        name: 'Long Contract',
        contract_end_date: '2028-06-01',
        primary_score: 7.0,
      })
      const { expiringContract } = detectOpportunities([longContract])
      expect(expiringContract.map(p => p.name)).not.toContain('Long Contract')
    })
  })

  describe('valueForMoney', () => {
    it('returns players with market value sorted by score/value ratio descending', () => {
      const highRatio = makePlayer({
        id: 9,
        name: 'High Ratio',
        primary_score: 8.0,
        market_value_eur: 200_000,
      })
      const lowRatio = makePlayer({
        id: 10,
        name: 'Low Ratio',
        primary_score: 6.0,
        market_value_eur: 5_000_000,
      })
      const { valueForMoney } = detectOpportunities([highRatio, lowRatio])
      // High ratio should come first
      expect(valueForMoney[0].name).toBe('High Ratio')
    })

    it('excludes players with no market value from valueForMoney', () => {
      const noValue = makePlayer({
        id: 11,
        name: 'No Value',
        primary_score: 9.0,
        market_value_eur: null,
      })
      const { valueForMoney } = detectOpportunities([noValue])
      expect(valueForMoney.map(p => p.name)).not.toContain('No Value')
    })
  })

  describe('edge cases', () => {
    it('returns empty arrays for empty input', () => {
      const { undervalued, youngTalent, expiringContract, valueForMoney } = detectOpportunities([])
      expect(undervalued).toHaveLength(0)
      expect(youngTalent).toHaveLength(0)
      expect(expiringContract).toHaveLength(0)
      expect(valueForMoney).toHaveLength(0)
    })

    it('excludes players with null primary_score from undervalued and youngTalent', () => {
      const noScore = makePlayer({
        id: 12,
        name: 'No Score',
        birth_date: '2006-01-01',
        market_value_eur: 100_000,
        primary_score: null,
      })
      const { undervalued, youngTalent } = detectOpportunities([noScore])
      expect(undervalued.map(p => p.name)).not.toContain('No Score')
      expect(youngTalent.map(p => p.name)).not.toContain('No Score')
    })
  })
})
