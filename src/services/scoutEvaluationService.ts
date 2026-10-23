import { supabase } from '@/lib/supabase'
import { playerNamesMatch, extractNameParts } from '@/utils/nameUtils'

export type PlayerSource = 'interno' | 'externo' | 'seguimiento'

export interface ScoutEvaluation {
  id: string
  player_id: string | null
  player_name: string
  team: string | null
  position: string | null
  role: string | null
  match_date: string
  competition: string | null
  rival: string | null

  technical_score: number | null  // Used as single match performance score
  tactical_score: number | null
  physical_score: number | null
  mental_score: number | null
  potential_score: number | null
  overall_score: number | null

  strengths: string | null
  weaknesses: string | null
  notes: string | null
  recommendation: 'fichar' | 'seguir_observando' | 'descartar' | null

  // Un comentario por valoración (reportes nuevos; los viejos usan `notes`)
  match_comment?: string | null
  tactical_comment?: string | null
  mental_comment?: string | null
  physical_comment?: string | null

  scout_id: string
  scout_name: string
  created_at: string
}

export interface NewEvaluation {
  player_id?: string
  player_name: string
  team?: string
  position?: string
  role?: string
  match_date: string
  competition?: string
  rival?: string
  technical_score?: number  // Used as the single match performance score
  tactical_score?: number
  physical_score?: number
  mental_score?: number
  potential_score?: number
  strengths?: string
  weaknesses?: string
  notes?: string
  recommendation?: 'fichar' | 'seguir_observando' | 'descartar'
  match_comment?: string
  tactical_comment?: string
  mental_comment?: string
  physical_comment?: string
}

const COMMENT_FIELDS = [
  { key: 'match_comment', label: 'Partido' },
  { key: 'tactical_comment', label: 'Táctica' },
  { key: 'mental_comment', label: 'Mental' },
  { key: 'physical_comment', label: 'Físico' },
] as const

/** Los comentarios de un reporte, con su título, listos para mostrar. */
export function evaluationComments(ev: ScoutEvaluation): { label: string; text: string }[] {
  const comments: { label: string; text: string }[] = COMMENT_FIELDS
    .map(({ key, label }) => ({ label, text: ev[key]?.trim() ?? '' }))
    .filter(c => c.text)
  if (ev.notes?.trim()) comments.push({ label: 'Notas', text: ev.notes.trim() })
  return comments
}

// Create a new evaluation
export async function createEvaluation(
  evaluation: NewEvaluation,
  scoutId: string,
  scoutName: string
): Promise<ScoutEvaluation | null> {
  const insert = (row: NewEvaluation) => supabase
    .from('scout_evaluations')
    .insert({
      ...row,
      scout_id: scoutId,
      scout_name: scoutName,
    })
    .select()
    .single()

  let { data, error } = await insert(evaluation)

  // Si la base todavía no tiene las columnas de comentarios, se guardan juntos
  // en `notes` (con su título) para no perder lo que escribió el scout.
  if (error?.code === 'PGRST204') {
    const fallback: NewEvaluation = { ...evaluation }
    const lines: string[] = []
    for (const { key, label } of COMMENT_FIELDS) {
      if (fallback[key]) lines.push(`${label}: ${fallback[key]}`)
      delete fallback[key]
    }
    if (lines.length) fallback.notes = [fallback.notes, ...lines].filter(Boolean).join('\n')
    ;({ data, error } = await insert(fallback))
  }

  if (error) {
    console.error('Error creating evaluation:', error)
    return null
  }

  return data
}

// Fetch all evaluations for a player
export async function fetchPlayerEvaluations(playerId: string): Promise<ScoutEvaluation[]> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .eq('player_id', playerId)
    .order('match_date', { ascending: false })

  if (error) {
    console.error('Error fetching evaluations:', error)
    return []
  }

  return data || []
}

// Fetch evaluations by player name (for players not in database yet)
export async function fetchEvaluationsByName(playerName: string): Promise<ScoutEvaluation[]> {
  // Filtrar server-side por substring del apellido (acota la consulta) y recién ahí
  // exigir match exacto de identidad (inicial + apellido) client-side con
  // playerNamesMatch — un `ilike('%nombre%')` libre mezclaba evaluaciones de
  // jugadores distintos cuyo nombre contuviera al otro como substring.
  const { surname } = extractNameParts(playerName)
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .ilike('player_name', `%${surname}%`)
    .order('match_date', { ascending: false })

  if (error) {
    console.error('Error fetching evaluations:', error)
    return []
  }

  return (data || []).filter(e => playerNamesMatch(e.player_name, playerName))
}

// Fetch recent evaluations (for dashboard)
export async function fetchRecentEvaluations(limit = 10): Promise<ScoutEvaluation[]> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching recent evaluations:', error)
    return []
  }

  return data || []
}

/**
 * Todas las evaluaciones sin vincular a un jugador, sin recortar. La página de
 * admin (EvaluationsAdminPage) filtraba esto en memoria sobre fetchRecentEvaluations(100)
 * — en cuanto la tabla superara 100 filas, cualquier evaluación vieja sin vincular
 * dejaba de ser visible/accionable para siempre, sin ningún aviso en la UI.
 */
export async function fetchUnmatchedEvaluations(): Promise<ScoutEvaluation[]> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .is('player_id', null)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching unmatched evaluations:', error)
    return []
  }

  return data || []
}

// Fetch evaluations by scout
export async function fetchScoutEvaluations(scoutId: string): Promise<ScoutEvaluation[]> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('*')
    .eq('scout_id', scoutId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching scout evaluations:', error)
    return []
  }

  return data || []
}

// Get average scout score for a player
export async function getPlayerScoutScore(playerId: string): Promise<number | null> {
  const evaluations = await fetchPlayerEvaluations(playerId)

  if (evaluations.length === 0) return null

  // `overall_score` sale de un promedio en la base que divide siempre por 5
  // sub-scores fijos tratando los que faltan como 0 (el form de evaluación sólo
  // pide técnico/táctico/mental hoy, nunca físico/potencial) — queda sistemáticamente
  // deflactado. `technical_score` es el que sí carga el scout siempre; se prioriza
  // igual que ya hacen FichaManualModal.tsx y scoutPlayersService.ts.
  const scores = evaluations
    .map(e => e.technical_score ?? e.overall_score)
    .filter((s): s is number => s !== null)

  if (scores.length === 0) return null

  return scores.reduce((a, b) => a + b, 0) / scores.length
}

// Get all player scout scores (for batch processing)
export async function fetchAllScoutScores(): Promise<Record<string, { avgScore: number; count: number }>> {
  const { data, error } = await supabase
    .from('scout_evaluations')
    .select('player_id, technical_score, overall_score')
    .not('player_id', 'is', null)

  if (error) {
    console.error('Error fetching scout scores:', error)
    return {}
  }

  const scoreMap: Record<string, { scores: number[]; count: number }> = {}

  for (const record of data || []) {
    const score = record.technical_score ?? record.overall_score
    if (!record.player_id || score === null) continue

    if (!scoreMap[record.player_id]) {
      scoreMap[record.player_id] = { scores: [], count: 0 }
    }
    scoreMap[record.player_id].scores.push(score)
    scoreMap[record.player_id].count++
  }

  const result: Record<string, { avgScore: number; count: number }> = {}
  for (const [playerId, data] of Object.entries(scoreMap)) {
    const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length
    result[playerId] = { avgScore: Math.round(avg * 10) / 10, count: data.count }
  }

  return result
}

// Update an evaluation
export async function updateEvaluation(
  id: string,
  updates: Partial<NewEvaluation>
): Promise<boolean> {
  console.log('[updateEvaluation] Updating evaluation:', { id, updates })

  const { data, error, count } = await supabase
    .from('scout_evaluations')
    .update(updates)
    .eq('id', id)
    .select()

  if (error) {
    console.error('[updateEvaluation] Error:', error)
    return false
  }

  if (!data || data.length === 0) {
    console.warn('[updateEvaluation] No rows updated - RLS may be blocking the update')
    return false
  }

  console.log('[updateEvaluation] Success:', data)
  return true
}

// Delete an evaluation
export async function deleteEvaluation(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('scout_evaluations')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting evaluation:', error)
    return false
  }

  return true
}
