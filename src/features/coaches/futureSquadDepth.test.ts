import { describe, it, expect } from 'vitest'
import { MAX_PER_SLOT, addToSlot, entriesOf, moveUpInSlot, removeFromSlot, removePlayerEverywhere } from './futureSquadDepth'
import type { FutureSquadSlot, SlotEntry } from '@/services/futureSquadService'

const sq = (id: number, name = `P${id}`): SlotEntry => ({ source: 'squad', playerId: id, playerName: name, playerNumber: id, rating: null })
const cand = (id: string, rating = 7): SlotEntry => ({ source: 'candidate', playerId: id, playerName: `C${id}`, playerNumber: null, rating })
const empty = (slotKey: string): FutureSquadSlot => ({ slotKey, source: null, playerId: null, playerName: null, playerNumber: null, rating: null, alternates: [] })

describe('futureSquadDepth', () => {
  it('el primero que entra a un puesto vacío es el titular', () => {
    const slots = addToSlot([empty('ST'), empty('GK')], 'ST', sq(9))
    expect(slots[0]).toMatchObject({ source: 'squad', playerId: 9, alternates: [] })
  })

  it('los siguientes se suman como opciones en orden, sin reemplazar al titular', () => {
    let slots = addToSlot([empty('ST')], 'ST', sq(9))
    slots = addToSlot(slots, 'ST', cand('100'))
    slots = addToSlot(slots, 'ST', sq(11))
    expect(entriesOf(slots[0]).map(e => e.playerId)).toEqual([9, '100', 11])
  })

  it('no pasa del máximo de 6 por puesto', () => {
    let slots = [empty('ST')]
    for (let i = 1; i <= 8; i++) slots = addToSlot(slots, 'ST', sq(i))
    expect(entriesOf(slots[0])).toHaveLength(MAX_PER_SLOT)
    expect(entriesOf(slots[0]).map(e => e.playerId)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('un jugador no puede estar en dos puestos: se mueve', () => {
    let slots = addToSlot([empty('ST'), empty('LW')], 'ST', sq(9))
    slots = addToSlot(slots, 'ST', sq(7))
    slots = addToSlot(slots, 'LW', sq(9))
    expect(entriesOf(slots[0]).map(e => e.playerId)).toEqual([7])
    expect(entriesOf(slots[1]).map(e => e.playerId)).toEqual([9])
  })

  it('agregar al mismo puesto a alguien que ya está no lo duplica', () => {
    let slots = addToSlot([empty('ST')], 'ST', sq(9))
    slots = addToSlot(slots, 'ST', sq(9))
    expect(entriesOf(slots[0])).toHaveLength(1)
  })

  it('sacar al titular sube a la primera opción', () => {
    let slots = addToSlot([empty('ST')], 'ST', sq(9))
    slots = addToSlot(slots, 'ST', sq(7))
    slots = removeFromSlot(slots, 'ST', 0)
    expect(slots[0]).toMatchObject({ playerId: 7, alternates: [] })
    slots = removeFromSlot(slots, 'ST', 0)
    expect(slots[0]).toMatchObject({ source: null, playerId: null, alternates: [] })
  })

  it('subir una opción la intercambia con la de arriba (la 2 pasa a titular)', () => {
    let slots = addToSlot([empty('ST')], 'ST', sq(9))
    slots = addToSlot(slots, 'ST', sq(7))
    slots = addToSlot(slots, 'ST', sq(5))
    slots = moveUpInSlot(slots, 'ST', 2)
    expect(entriesOf(slots[0]).map(e => e.playerId)).toEqual([9, 5, 7])
    slots = moveUpInSlot(slots, 'ST', 1)
    expect(entriesOf(slots[0]).map(e => e.playerId)).toEqual([5, 9, 7])
  })

  it('removePlayerEverywhere saca a un jugador del plantel de la cancha (baja)', () => {
    let slots = addToSlot([empty('ST'), empty('LW')], 'ST', sq(9))
    slots = addToSlot(slots, 'LW', sq(7))
    slots = addToSlot(slots, 'LW', sq(11))
    slots = removePlayerEverywhere(slots, 'squad', 7)
    expect(entriesOf(slots[1]).map(e => e.playerId)).toEqual([11])
  })

  it('planes viejos sin alternates se leen como puesto de un solo jugador', () => {
    const legacy = { slotKey: 'ST', source: 'squad', playerId: 9, playerName: 'X', playerNumber: 9, rating: null } as FutureSquadSlot
    expect(entriesOf(legacy).map(e => e.playerId)).toEqual([9])
  })
})
