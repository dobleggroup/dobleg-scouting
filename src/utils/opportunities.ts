import type { PlayerWithScore } from '@/types/scoring'

export function ageFromBirthDate(birth_date: string | null): number | null {
  if (!birth_date) return null
  const b = new Date(birth_date)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

export function monthsToContractEnd(date: string | null): number | null {
  if (!date) return null
  const end = new Date(date)
  const now = new Date()
  return (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
}

export function detectOpportunities(players: PlayerWithScore[]) {
  const withScore = players.filter(p => p.primary_score != null)

  const undervalued = withScore
    .filter(p => (p.primary_score as number) >= 6.5 && (p.market_value_eur ?? 0) > 0)
    .sort((a, b) => (a.market_value_eur ?? 0) - (b.market_value_eur ?? 0))

  const youngTalent = withScore.filter(p => {
    const age = ageFromBirthDate(p.birth_date)
    return age != null && age <= 21 && (p.primary_score as number) >= 6.0
  })

  const expiringContract = players.filter(p => {
    const m = monthsToContractEnd(p.contract_end_date)
    return m != null && m >= 0 && m <= 12
  })

  const valueForMoney = withScore
    .filter(p => (p.market_value_eur ?? 0) > 0)
    .map(p => ({ p, ratio: (p.primary_score as number) / ((p.market_value_eur as number) / 1_000_000) }))
    .sort((a, b) => b.ratio - a.ratio)
    .map(x => x.p)

  return { undervalued, youngTalent, expiringContract, valueForMoney }
}
