// src/services/futureSquadService.ts
import { supabase } from '@/lib/supabase'

export type SlotPlayerSource = 'squad' | 'candidate'

export interface FutureSquadSlot {
  slotKey: string                    // clave de FORMATIONS[formationType].positions, ej. 'LB'
  source: SlotPlayerSource | null    // null = slot vacio
  playerId: number | string | null   // number = id de API-Football (squad), string = id de scoring (candidate)
  playerName: string | null
  playerNumber: number | null        // solo aplica a source === 'squad'
  rating: number | null              // solo aplica a source === 'candidate'
  /** Opciones 2 a 6 del puesto, en orden (el titular son los campos de arriba). Opcional
   *  para seguir leyendo planes guardados antes de que existiera. Ver futureSquadDepth. */
  alternates?: SlotEntry[]
}

/** Un jugador dentro de un puesto (titular u opción). */
export interface SlotEntry {
  source: SlotPlayerSource
  playerId: number | string
  playerName: string
  playerNumber: number | null
  rating: number | null
}

export interface FutureSquadBaja {
  id: string          // uuid generado en el cliente
  playerId: number     // id de API-Football
  playerName: string
  reason: string        // texto libre, puede quedar vacio
}

export interface FutureSquadPlan {
  coach_key: string
  formation_type: string
  slots: FutureSquadSlot[]
  bajas: FutureSquadBaja[]
  updated_at: string
}

// Normaliza los slots que vienen de la DB: los planes guardados antes del rename
// Score GG -> Rating todavia tienen el campo como `ggScore` dentro de la columna
// jsonb `slots`. Los planes nuevos usan `rating`. Compat de lectura para que los
// planes ya guardados sigan mostrando su numero en vez de romper con
// `undefined.toFixed` en FutureSquadPitch.
function normalizeSlots(raw: unknown): FutureSquadSlot[] {
  if (!Array.isArray(raw)) return []
  return raw.map((s: Record<string, unknown>) => ({
    slotKey: s.slotKey as string,
    source: (s.source ?? null) as SlotPlayerSource | null,
    playerId: (s.playerId ?? null) as number | string | null,
    playerName: (s.playerName ?? null) as string | null,
    playerNumber: (s.playerNumber ?? null) as number | null,
    rating: (s.rating ?? s.ggScore ?? null) as number | null,
    alternates: Array.isArray(s.alternates) ? (s.alternates as SlotEntry[]) : [],
  }))
}

export async function getFutureSquad(coachKey: string): Promise<FutureSquadPlan | null> {
  const { data, error } = await supabase
    .from('coach_future_squads')
    .select('*')
    .eq('coach_key', coachKey)
    .maybeSingle()

  if (error) {
    console.error('Error cargando plantel a futuro:', error)
    throw new Error(`Error cargando plantel a futuro: ${error.message}`)
  }
  if (!data) return null
  const row = data as unknown as FutureSquadPlan
  return { ...row, slots: normalizeSlots(row.slots) }
}

export async function saveFutureSquad(
  coachKey: string,
  formationType: string,
  slots: FutureSquadSlot[],
  bajas: FutureSquadBaja[],
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('coach_future_squads')
    .upsert(
      { coach_key: coachKey, formation_type: formationType, slots, bajas, updated_at: new Date().toISOString() },
      { onConflict: 'coach_key' },
    )

  if (error) {
    console.error('Error guardando plantel a futuro:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}
