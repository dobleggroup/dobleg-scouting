// src/features/coaches/futureSquadDepth.ts
// Plantel futuro con profundidad: cada puesto tiene un titular (los campos planos del slot,
// para seguir leyendo planes viejos) y hasta 5 opciones más en `alternates`, en orden.
import type { FutureSquadSlot, SlotEntry, SlotPlayerSource } from '@/services/futureSquadService'

export const MAX_PER_SLOT = 6

/** Titular + opciones, en orden. Vacío si el puesto no tiene a nadie. */
export function entriesOf(slot: FutureSquadSlot): SlotEntry[] {
  const starter: SlotEntry[] = slot.source !== null && slot.playerId !== null
    ? [{ source: slot.source, playerId: slot.playerId, playerName: slot.playerName ?? '', playerNumber: slot.playerNumber, rating: slot.rating }]
    : []
  return [...starter, ...(slot.alternates ?? [])]
}

function withEntries(slotKey: string, entries: SlotEntry[]): FutureSquadSlot {
  const [starter, ...alternates] = entries
  if (!starter) return { slotKey, source: null, playerId: null, playerName: null, playerNumber: null, rating: null, alternates: [] }
  return {
    slotKey,
    source: starter.source,
    playerId: starter.playerId,
    playerName: starter.playerName,
    playerNumber: starter.playerNumber,
    rating: starter.rating,
    alternates: alternates.slice(0, MAX_PER_SLOT - 1),
  }
}

const same = (a: { source: SlotPlayerSource; playerId: number | string }, source: SlotPlayerSource, playerId: number | string) =>
  a.source === source && String(a.playerId) === String(playerId)

/** Saca a un jugador de cualquier puesto donde esté (en cualquier orden). */
export function removePlayerEverywhere(slots: FutureSquadSlot[], source: SlotPlayerSource, playerId: number | string): FutureSquadSlot[] {
  return slots.map(s => {
    const entries = entriesOf(s)
    const kept = entries.filter(e => !same(e, source, playerId))
    return kept.length === entries.length ? s : withEntries(s.slotKey, kept)
  })
}

/** Suma al jugador al final del puesto (titular si estaba vacío). Si estaba en otro puesto se
 *  mueve; si ya está en este, no se duplica; si el puesto está lleno, no hace nada. */
export function addToSlot(slots: FutureSquadSlot[], slotKey: string, entry: SlotEntry): FutureSquadSlot[] {
  const target = slots.find(s => s.slotKey === slotKey)
  if (!target) return slots
  const current = entriesOf(target)
  if (current.some(e => same(e, entry.source, entry.playerId))) return slots
  if (current.length >= MAX_PER_SLOT) return slots
  const cleared = removePlayerEverywhere(slots, entry.source, entry.playerId)
  return cleared.map(s => (s.slotKey === slotKey ? withEntries(slotKey, [...entriesOf(s), entry]) : s))
}

export function removeFromSlot(slots: FutureSquadSlot[], slotKey: string, index: number): FutureSquadSlot[] {
  return slots.map(s => (s.slotKey === slotKey ? withEntries(slotKey, entriesOf(s).filter((_, i) => i !== index)) : s))
}

/** Intercambia la opción `index` con la de arriba (index 1 -> pasa a titular). */
export function moveUpInSlot(slots: FutureSquadSlot[], slotKey: string, index: number): FutureSquadSlot[] {
  if (index <= 0) return slots
  return slots.map(s => {
    if (s.slotKey !== slotKey) return s
    const entries = [...entriesOf(s)]
    if (index >= entries.length) return s
    ;[entries[index - 1], entries[index]] = [entries[index], entries[index - 1]]
    return withEntries(slotKey, entries)
  })
}
