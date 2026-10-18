import { describe, expect, it } from 'vitest'
import type { TeamGame } from './teamData'
import { averageShape, keyTraits, lanes, readStyle } from './style'

const game = (id: string, teamId: string, us: Record<string, number>): TeamGame => ({
  match: { id, date: '2026-09-01', time: null, week: null, stage: 'Clausura', status: 'Played', home: teamId, away: 'x', hs: 0, as: 0, hxg: null, axg: null, venue: null },
  teamId, oppId: 'x', home: true, gf: 0, ga: 0, result: 'E', formation: null, us, them: {},
})

describe('style', () => {
  // 5 equipos: 'a' es el que más presiona (menos PPDA) y el que menos tiene la pelota.
  const pool = new Map(['a', 'b', 'c', 'd', 'e'].map((t, i) => [t, [game(`m${t}`, t, { ppda: 6 + i * 2, possessionPercentage: 40 + i * 5 })]]))

  it('ubica cada eje en su polo y cuenta el puesto desde ese polo', () => {
    const r = readStyle('a', pool)
    const presion = r.find(x => x.axis.key === 'presion')!
    expect(presion).toMatchObject({ pos: 100, verdict: 'Presiona enseguida', poleRank: 1 })
    const tenencia = r.find(x => x.axis.key === 'tenencia')!
    expect(tenencia).toMatchObject({ pos: 0, verdict: 'Le deja la pelota al rival', poleRank: 1 })
    expect(keyTraits(r).map(t => t.axis.key)).toEqual(expect.arrayContaining(['presion', 'tenencia']))
  })

  it('reparto por bandas en el último tercio', () => {
    expect(lanes([game('m', 'a', { ftL: 30, ftC: 20, ftR: 50 })])).toEqual({ left: 30, centre: 20, right: 50 })
  })

  it('posición media ponderada por minutos y orden por titularidades', () => {
    const games = [game('m1', 'riv', {}), game('m2', 'riv', {})]
    const lu = {
      m1: { riv: [['a', 1, 90, 1, 30, 40], ['b', 0, 30, 0, 70, 50]] as Array<[string, number, number, number, number | null, number | null]> },
      m2: { riv: [['a', 1, 90, 1, 40, 60], ['b', 2, 90, 1, 80, 50]] as Array<[string, number, number, number, number | null, number | null]> },
    }
    const s = averageShape(games, lu)
    expect(s[0]).toMatchObject({ id: 'a', x: 35, y: 50, starts: 2 })
    expect(s[1]).toMatchObject({ id: 'b', x: 77.5, starts: 1 })
  })
})
