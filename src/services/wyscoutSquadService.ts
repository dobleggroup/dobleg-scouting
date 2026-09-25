// src/services/wyscoutSquadService.ts
// Archivo de jugadores de Wyscout del Resumen del DT: el ultimo subido es el vigente.
import { supabase } from '@/lib/supabase'
import type { WyscoutSquadData } from '@/features/coaches/wyscoutSquad/wyscoutSquadTypes'

export interface SquadStatsRecord {
  id: number
  data: WyscoutSquadData
  source_file: string | null
  uploaded_at: string
}

export async function getLatestSquadStats(coachKey: string): Promise<SquadStatsRecord | null> {
  const { data, error } = await supabase
    .from('coach_wyscout_squad_stats')
    .select('id, data, source_file, uploaded_at')
    .eq('coach_key', coachKey)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error leyendo el archivo de Wyscout:', error)
    return null
  }
  return (data as unknown as SquadStatsRecord) ?? null
}

export async function saveSquadStats(
  coachKey: string,
  squad: WyscoutSquadData,
  fileName: string,
): Promise<{ success: true; record: SquadStatsRecord } | { success: false; error: string }> {
  const { data, error } = await supabase
    .from('coach_wyscout_squad_stats')
    .insert({ coach_key: coachKey, data: squad, source_file: fileName })
    .select('id, data, source_file, uploaded_at')
    .single()

  if (error || !data) {
    console.error('Error guardando el archivo de Wyscout:', error)
    return { success: false, error: 'No se pudo guardar. Probá de nuevo.' }
  }
  return { success: true, record: data as unknown as SquadStatsRecord }
}
