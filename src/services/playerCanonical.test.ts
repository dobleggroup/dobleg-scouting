import { describe, it, expect, vi, beforeEach } from 'vitest'

// players simulada: dos gemelos de Alan Sosa (misma persona) + un jugador sin gemelo.
const PLAYERS = [
  { id: 405692, canonical_id: 21467315 },    // API-Football, club viejo (Gimnasia)
  { id: 21467315, canonical_id: 21467315 },  // Sofascore, fila oficial (Aldosivi)
  { id: 777, canonical_id: 777 },            // sin gemelo
  { id: 20000999, canonical_id: 20000999 },  // solo Sofascore, sin gemelo de API-Football
]

function query() {
  let rows = [...PLAYERS]
  const b = {
    select: () => b,
    eq: (col: 'id' | 'canonical_id', v: number) => { rows = rows.filter(r => r[col] === v); return b },
    lt: (col: 'id', v: number) => { rows = rows.filter(r => r[col] < v); return b },
    limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
  }
  return b
}
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => query() } }))

import { resolvePreferredPlayerId, resolveApiFootballTwinId, __resetPlayerIdCaches } from './playerStatsService'

beforeEach(() => __resetPlayerIdCaches())

describe('resolvePreferredPlayerId (fila oficial)', () => {
  it('cualquier gemelo resuelve a la fila oficial', async () => {
    expect(await resolvePreferredPlayerId(405692)).toBe(21467315)
    expect(await resolvePreferredPlayerId(21467315)).toBe(21467315)
  })
  it('sin gemelo se queda como está', async () => {
    expect(await resolvePreferredPlayerId(777)).toBe(777)
  })
  it('id desconocido se queda como está', async () => {
    expect(await resolvePreferredPlayerId(123456)).toBe(123456)
  })
})

describe('resolveApiFootballTwinId (traspasos/lesiones)', () => {
  it('fila oficial de Sofascore -> su gemelo de API-Football', async () => {
    expect(await resolveApiFootballTwinId(21467315)).toBe(405692)
  })
  it('un id de API-Football es el mismo', async () => {
    expect(await resolveApiFootballTwinId(405692)).toBe(405692)
  })
  it('solo Sofascore, sin gemelo -> null', async () => {
    expect(await resolveApiFootballTwinId(20000999)).toBeNull()
  })
})
