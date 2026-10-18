import { describe, expect, it } from 'vitest'
import type { OptaPlayer } from '@/features/opta/data'
import { agencyAdvice, matchTransfermarkt, verdictOf, type TmRow, type Valuation } from './value'

const player = (o: Partial<OptaPlayer>): OptaPlayer => ({
  id: 'p1', name: 'Santiago Salle', fullName: 'Santiago Salle', matchName: 'S. Salle', dob: '2004-06-14', minutes: 1000,
  group: 'CB', pos: 'CB', age: 22, teamId: 't', ...o,
} as OptaPlayer)
const row = (o: Partial<TmRow>): TmRow => ({
  id: 1, name: 'x', birth_date: null, market_value_eur: null, contract_end_date: null, agent: null, canonical_id: null, photo: null, transfermarkt_url: null, ...o,
})

describe('matchTransfermarkt', () => {
  it('cruza por fecha de nacimiento y apellido, y se queda con la fila canónica', () => {
    const rows = [
      row({ id: 10, name: 'G. Mainero', birth_date: '1995-03-23', canonical_id: 11, market_value_eur: 1 }),
      row({ id: 11, name: 'Guido Mainero', birth_date: '1995-03-23', canonical_id: 11, market_value_eur: 2_000_000, contract_end_date: '2027-12-31' }),
    ]
    const m = matchTransfermarkt([player({ id: 'a', name: 'Guido Mainero', fullName: 'Guido Mainero', matchName: null, dob: '1995-03-23' })], rows)
    expect(m.get('a')).toMatchObject({ dbId: 11, value: 2_000_000, contractEnd: '2027-12-31' })
  })
  it('si la fecha difiere por unos días, cruza por nombre completo y año', () => {
    const rows = [row({ id: 5, name: 'Santiago Salle', birth_date: '2004-06-04', canonical_id: 5, market_value_eur: 1_200_000 })]
    expect(matchTransfermarkt([player({})], rows).get('p1')?.value).toBe(1_200_000)
  })
  it('no cruza un homónimo nacido en otra época', () => {
    const rows = [row({ id: 5, name: 'Santiago Salle', birth_date: '1990-01-01', market_value_eur: 1 })]
    expect(matchTransfermarkt([player({})], rows).size).toBe(0)
  })
})

describe('verdictOf', () => {
  it('barato o caro: casi todos los parecidos valen más (o menos) y la diferencia es grande', () => {
    expect(verdictOf(0.3, 70, 1)).toBe('muyBarato')
    expect(verdictOf(0.6, 70, 0.8)).toBe('barato')
    expect(verdictOf(1, 70, 0.5)).toBe('justo')
    expect(verdictOf(1.6, 70, 0.2)).toBe('caro')
    expect(verdictOf(3, 70, 0)).toBe('muyCaro')
  })
  it('diferencia chica no alcanza aunque todos valgan más', () => {
    expect(verdictOf(0.9, 70, 1)).toBe('justo')
  })
  it('un jugador que rinde poco no es barato aunque valga poco', () => {
    expect(verdictOf(0.2, 30, 1)).toBe('justo')
  })
})

describe('agencyAdvice', () => {
  const base = { p: player({ minutes: 2000, age: 26 }), score: 70, verdict: 'barato', ratio: 0.5, fair: 2_000_000, value: 1_000_000, missing: null, flags: [], comps: new Array(15), worthMore: 13, monthsLeft: 2, contractEnd: '2026-12-31' } as unknown as Valuation
  it('barato y contrato que termina: argumento y urgencia', () => {
    const a = agencyAdvice(base, x => `${x / 1e6}M`).map(x => x.text)
    expect(a[0]).toContain('2M')
    expect(a.some(t => t.includes('diciembre de 2026'))).toBe(true)
  })
  it('pocos minutos: lo dice y no inventa veredicto', () => {
    const a = agencyAdvice({ ...base, missing: 'minutos', score: null, verdict: null, p: player({ minutes: 300 }) }, String)
    expect(a[0].text).toContain("300'")
  })
})
