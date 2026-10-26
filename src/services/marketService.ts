import { supabase } from '@/lib/supabase'
import { dedupeTeamsByName } from './playerStatsService'
import { DISPLAY_POSITION_MAP } from '@/constants/scoring'
import { notifyAccounts } from './notificationsService'
import type { TeamMember, ClubNeed, ClubContact, Negotiation, MarketNote, MarketTeamSearchResult, NeedStatus, NegotiationStatus, NeedCandidate, CandidateStatus } from '@/types/market'

/**
 * "Ofrecer un jugador a un club" y "el club busca esa posición" son la misma
 * situación real vista desde dos lados — antes eran datos totalmente
 * independientes. Estos mapeos deciden cómo un cambio de estado en un lado se
 * refleja en el otro cuando están vinculados (`negotiation.need_id` /
 * `candidate.negotiation_id`). Ver [[market_negotiation_need_link]].
 */
const NEGOTIATION_TO_CANDIDATE_STATUS: Record<NegotiationStatus, CandidateStatus> = {
  ofrecido: 'propuesto',
  pausado: 'en_negociacion',
  en_negociacion: 'en_negociacion',
  avanzado: 'en_negociacion',
  cerrado_exito: 'fichado',
  cerrado_caido: 'descartado',
}

const CANDIDATE_TO_NEGOTIATION_STATUS: Record<CandidateStatus, NegotiationStatus> = {
  propuesto: 'ofrecido',
  en_negociacion: 'en_negociacion',
  descartado: 'cerrado_caido',
  fichado: 'cerrado_exito',
}

function normalizePosition(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Etiqueta canónica en español para una posición, a partir de un código interno
 * (ARQ, VI, CB...) o de cualquier variante ya en español — mismo catálogo que
 * usa el resto de la plataforma, para que el enganche con `market_club_needs`
 * sea consistente en vez de depender de texto libre escrito a mano. */
export function canonicalPositionLabel(rawPosition: string | null | undefined): string | null {
  if (!rawPosition) return null
  return DISPLAY_POSITION_MAP[rawPosition] ?? rawPosition
}

/** Catálogo fijo para el selector de posición en Mercado — mismo criterio que
 * `players.primary_position` (ARQ/LD/CB/LI/VC/VI/EXT/DEL), en español. */
export const MARKET_POSITION_OPTIONS = [
  'Arquero', 'Lateral derecho', 'Defensor central', 'Lateral izquierdo',
  'Volante central', 'Volante interno', 'Extremo', 'Delantero',
] as const

/**
 * Busca (o crea) la búsqueda de club para `team_id` + `position_label`, mete
 * al jugador de la negociación como candidato ahí, y deja el vínculo en
 * ambos sentidos (`negotiation.need_id` / `candidate.negotiation_id`).
 *
 * Se llama una sola vez, al crear la negociación — si no hay club destino o
 * no se pudo determinar la posición del jugador, no hace nada (no tiene
 * sentido "buscar" sin esos dos datos).
 */
async function linkOrCreateNeedForNegotiation(negotiation: Negotiation): Promise<number | null> {
  if (!negotiation.team_id || !negotiation.position_label) return null

  const targetNorm = normalizePosition(negotiation.position_label)

  const { data: openNeeds, error: fetchErr } = await supabase
    .from('market_club_needs')
    .select('*')
    .eq('team_id', negotiation.team_id)
    .eq('status', 'abierto')
    .is('hidden_at', null)
  if (fetchErr) { console.error('linkOrCreateNeedForNegotiation fetch error:', fetchErr); return null }

  let need = (openNeeds ?? []).find(n => normalizePosition(n.position_label) === targetNorm) ?? null

  if (!need) {
    const { data: created, error: createErr } = await supabase
      .from('market_club_needs')
      .insert({
        team_id: negotiation.team_id,
        team_name: negotiation.team_name,
        team_logo: negotiation.team_logo,
        position_label: negotiation.position_label,
        assigned_to_id: negotiation.assigned_to_id,
        assigned_to_name: negotiation.assigned_to_name,
        next_followup_date: null,
        created_by_id: negotiation.created_by_id,
        created_by_name: negotiation.created_by_name,
      })
      .select()
      .single()
    if (createErr) { console.error('linkOrCreateNeedForNegotiation create error:', createErr); return null }
    need = created
  }
  if (!need) return null

  const { error: candidateErr } = await supabase.from('market_need_candidates').insert({
    need_id: need.id,
    player_name: negotiation.player_name,
    player_api_id: negotiation.player_api_id,
    player_source: negotiation.player_source,
    status: NEGOTIATION_TO_CANDIDATE_STATUS[negotiation.status],
    negotiation_id: negotiation.id,
    added_by_id: negotiation.created_by_id,
    added_by_name: negotiation.created_by_name,
  })
  if (candidateErr) { console.error('linkOrCreateNeedForNegotiation candidate error:', candidateErr); return null }

  const { error: linkErr } = await supabase.from('market_negotiations').update({ need_id: need.id }).eq('id', negotiation.id)
  if (linkErr) { console.error('linkOrCreateNeedForNegotiation link-back error:', linkErr); return null }
  return need.id
}

/**
 * Vincular una negociación/candidato a un jugador real de la API sólo lo
 * pueden hacer estas dos personas — el resto de la agencia carga el nombre
 * tal como se lo dijeron (con errores de tipeo incluidos) y uno de estos dos
 * lo corrige después. Ver [[mercado_modelo_de_negocio]] en memoria.
 */
export const MARKET_LINK_ADMIN_EMAILS = ['marcoscucho99@gmail.com', 'matiassebastianroberti@gmail.com']

export function isMarketLinkAdmin(email: string | null | undefined): boolean {
  return !!email && MARKET_LINK_ADMIN_EMAILS.includes(email.toLowerCase())
}

/** Todas las cuentas de una persona del equipo (la principal y las otras). */
export function memberAccounts(member: Pick<TeamMember, 'user_id' | 'alt_user_ids'> | null | undefined): string[] {
  if (!member) return []
  return [member.user_id, ...(member.alt_user_ids ?? [])].filter((id): id is string => !!id)
}

/** La persona del equipo que está usando la app: por cualquiera de sus cuentas o, si no, por nombre. */
export function findMe(members: TeamMember[], userId: string | null | undefined, displayName?: string | null): TeamMember | undefined {
  return (userId ? members.find(m => memberAccounts(m).includes(userId)) : undefined)
    ?? (displayName ? members.find(m => m.name.toLowerCase() === displayName.toLowerCase()) : undefined)
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('market_team_members')
    .select('id, name, active, user_id, alt_user_ids')
    .eq('active', true)
    .order('name')
  if (error) throw error
  return data ?? []
}

/**
 * Mismo club puede estar 2 veces en `teams` (fila de API-Football y de
 * Sofascore, ver `dedupeTeamsByName`) — sin deduplicar, un buscador de club
 * libre por nombre (no acotado a una liga) los muestra como si fueran dos
 * clubes distintos (ej. "CA Talleres" y "Talleres Cordoba" para el mismo
 * Talleres de Córdoba). Se pide de más (limit*3) porque deduplicar reduce
 * la cantidad de resultados reales por debajo del límite pedido.
 */
export async function searchMarketTeams(query: string): Promise<MarketTeamSearchResult[]> {
  if (!query.trim()) return []
  const limit = 20
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, logo, league_id, league:leagues(country)')
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(limit * 3)
  if (error) throw error
  const rows = (data ?? []).map((row: any) => ({
    ...row,
    country: row.league?.country ?? null,
  }))
  return dedupeTeamsByName(rows).slice(0, limit)
}

export async function fetchClubNeeds(): Promise<ClubNeed[]> {
  const { data, error } = await supabase
    .from('market_club_needs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchNegotiations(): Promise<Negotiation[]> {
  const { data, error } = await supabase
    .from('market_negotiations')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export interface CreateClubNeedInput {
  team_id: number | null
  team_name: string
  team_logo: string | null
  position_label: string
  assigned_to_id: number | null
  assigned_to_name: string | null
  next_followup_date: string | null
}

/**
 * Aviso en la campanita a la persona a la que le asignan algo en Mercado (a
 * todas sus cuentas), salvo que se lo asigne uno mismo. Si falla el aviso, la
 * asignación igual queda hecha.
 */
async function notifyMarketAssignee(memberId: number | null | undefined, actingUserId: string | null, message: string, link: string) {
  if (memberId == null) return
  try {
    const { data } = await supabase.from('market_team_members').select('user_id, alt_user_ids').eq('id', memberId).single()
    await notifyAccounts(memberAccounts(data as Pick<TeamMember, 'user_id' | 'alt_user_ids'> | null), 'mercado_asignacion', message, link, actingUserId)
  } catch (e) {
    console.error('notifyMarketAssignee error:', e)
  }
}

export async function createClubNeed(input: CreateClubNeedInput, createdById: string | null, createdByName: string): Promise<ClubNeed | null> {
  const { data, error } = await supabase
    .from('market_club_needs')
    .insert({ ...input, created_by_id: createdById, created_by_name: createdByName })
    .select()
    .single()
  if (error) { console.error('createClubNeed error:', error); return null }
  await notifyMarketAssignee(data.assigned_to_id, createdById,
    `${createdByName} te asignó la búsqueda de ${data.team_name}${data.position_label ? ` (${data.position_label})` : ''}`,
    `/mercado?highlight=need-${data.id}`)
  return data
}

export interface CreateNegotiationInput {
  team_id: number | null
  team_name: string | null
  team_logo: string | null
  current_team_id: number | null
  current_team_name: string | null
  current_team_logo: string | null
  player_name: string
  player_api_id: number | null
  player_source: 'interno' | 'externo' | null
  position_label: string | null
  belongs_to_agency: boolean | null
  agent_name: string | null
  target_club_contacts: ClubContact[]
  current_club_contacts: ClubContact[]
  status: NegotiationStatus
  assigned_to_id: number | null
  assigned_to_name: string | null
}

export async function createNegotiation(input: CreateNegotiationInput, createdById: string | null, createdByName: string): Promise<Negotiation | null> {
  const { data, error } = await supabase
    .from('market_negotiations')
    .insert({ ...input, created_by_id: createdById, created_by_name: createdByName })
    .select()
    .single()
  if (error) { console.error('createNegotiation error:', error); return null }
  await notifyMarketAssignee(data.assigned_to_id, createdById,
    `${createdByName} te asignó la negociación de ${data.player_name}${data.team_name ? ` → ${data.team_name}` : ''}`,
    `/mercado?highlight=negotiation-${data.id}`)
  const needId = await linkOrCreateNeedForNegotiation(data)
  return { ...data, need_id: needId }
}

export async function updateNeedStatus(id: number, status: NeedStatus): Promise<boolean> {
  const { error } = await supabase.from('market_club_needs').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) { console.error('updateNeedStatus error:', error); return false }
  return true
}

/** Oculta (o vuelve a mostrar) una búsqueda de club. No se borra: queda archivada. */
export async function setNeedHidden(id: number, hidden: boolean, userName: string): Promise<boolean> {
  const { error } = await supabase
    .from('market_club_needs')
    .update({ hidden_at: hidden ? new Date().toISOString() : null, hidden_by_name: hidden ? userName : null })
    .eq('id', id)
  if (error) { console.error('setNeedHidden error:', error); return false }
  return true
}

/** Oculta (o vuelve a mostrar) una negociación. No se borra: queda para consultarla después. */
export async function setNegotiationHidden(id: number, hidden: boolean, userName: string): Promise<boolean> {
  const { error } = await supabase
    .from('market_negotiations')
    .update({ hidden_at: hidden ? new Date().toISOString() : null, hidden_by_name: hidden ? userName : null })
    .eq('id', id)
  if (error) { console.error('setNegotiationHidden error:', error); return false }
  return true
}

export async function updateNegotiationStatus(id: number, status: NegotiationStatus): Promise<boolean> {
  const { data, error } = await supabase
    .from('market_negotiations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('need_id')
    .single()
  if (error) { console.error('updateNegotiationStatus error:', error); return false }

  if (data?.need_id) {
    const { error: syncErr } = await supabase
      .from('market_need_candidates')
      .update({ status: NEGOTIATION_TO_CANDIDATE_STATUS[status] })
      .eq('negotiation_id', id)
    if (syncErr) console.error('updateNegotiationStatus candidate sync error:', syncErr)
  }
  return true
}

export interface PlayerIdentity {
  name: string
  birth_date: string | null
  photo: string | null
  primary_position: string | null
}

/**
 * Busca nombre/fecha de nacimiento/foto reales por id de la API — fuente de
 * verdad única para "arreglar" el nombre de una negociación cuando se la
 * vincula a un jugador real. Los jefes que cargan negociaciones suelen
 * escribir mal nombres/apellidos; el nombre correcto sólo se sabe con certeza
 * acá, no en lo que se tipeó al crear la negociación.
 */
export async function fetchPlayerIdentity(playerApiId: number): Promise<PlayerIdentity | null> {
  const { data, error } = await supabase
    .from('players')
    .select('name, birth_date, photo, primary_position')
    .eq('id', playerApiId)
    .maybeSingle()
  if (error) { console.error('fetchPlayerIdentity error:', error); return null }
  return data
}

/**
 * Vincula el jugador y, si se resuelve su identidad real, corrige
 * `player_name` en el mismo paso — así el nombre prolijo del jugador de la
 * API reemplaza lo que se haya tipeado (con errores u otros) al crear la
 * negociación.
 */
export async function linkNegotiationPlayer(id: number, playerApiId: number, playerSource: 'interno' | 'externo' | null, correctedName?: string | null): Promise<boolean> {
  const update: Record<string, unknown> = { player_api_id: playerApiId, player_source: playerSource, updated_at: new Date().toISOString() }
  if (correctedName) update.player_name = correctedName
  const { error } = await supabase
    .from('market_negotiations')
    .update(update)
    .eq('id', id)
  if (error) { console.error('linkNegotiationPlayer error:', error); return false }
  return true
}

/**
 * Reasigna y deja una nota automática con el historial del cambio.
 *
 * La nota `is_system=true` es la prueba de auditoría del handoff — si falla,
 * la reasignación completa se considera fallida. Se actualiza el padre
 * primero para tener el `fromName` fresco en la nota; si la nota luego falla
 * al insertarse, se revierte la fila del padre a su responsable original
 * para no dejarla reasignada sin rastro, y se devuelve `false` reportando el
 * fallo de la operación completa (no queda ambiguo qué escritura falló: se
 * loguean ambas por separado).
 */
export async function reassignNeed(id: number, newAssigneeId: number, newAssigneeName: string, actingUserId: string | null, actingUserName: string): Promise<boolean> {
  const { data: current } = await supabase.from('market_club_needs').select('assigned_to_id, assigned_to_name').eq('id', id).single()
  const { error } = await supabase
    .from('market_club_needs')
    .update({ assigned_to_id: newAssigneeId, assigned_to_name: newAssigneeName, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { console.error('reassignNeed error:', error); return false }
  const fromName = current?.assigned_to_name ?? 'sin responsable'
  const { error: noteError } = await supabase.from('market_negotiation_notes').insert({
    need_id: id,
    body: `${actingUserName} reasignó de ${fromName} a ${newAssigneeName}.`,
    is_system: true,
    author_id: actingUserId,
    author_name: actingUserName,
  })
  if (noteError) {
    console.error('reassignNeed note error:', noteError)
    const { error: rollbackError } = await supabase
      .from('market_club_needs')
      .update({ assigned_to_id: current?.assigned_to_id ?? null, assigned_to_name: current?.assigned_to_name ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (rollbackError) console.error('reassignNeed rollback error:', rollbackError)
    return false
  }
  const { data: need } = await supabase.from('market_club_needs').select('team_name, position_label').eq('id', id).single()
  await notifyMarketAssignee(newAssigneeId, actingUserId,
    `${actingUserName} te asignó la búsqueda de ${need?.team_name ?? ''}${need?.position_label ? ` (${need.position_label})` : ''}`,
    `/mercado?highlight=need-${id}`)
  return true
}

export async function reassignNegotiation(id: number, newAssigneeId: number, newAssigneeName: string, actingUserId: string | null, actingUserName: string): Promise<boolean> {
  const { data: current } = await supabase.from('market_negotiations').select('assigned_to_id, assigned_to_name').eq('id', id).single()
  const { error } = await supabase
    .from('market_negotiations')
    .update({ assigned_to_id: newAssigneeId, assigned_to_name: newAssigneeName, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { console.error('reassignNegotiation error:', error); return false }
  const fromName = current?.assigned_to_name ?? 'sin responsable'
  const { error: noteError } = await supabase.from('market_negotiation_notes').insert({
    negotiation_id: id,
    body: `${actingUserName} reasignó de ${fromName} a ${newAssigneeName}.`,
    is_system: true,
    author_id: actingUserId,
    author_name: actingUserName,
  })
  if (noteError) {
    console.error('reassignNegotiation note error:', noteError)
    const { error: rollbackError } = await supabase
      .from('market_negotiations')
      .update({ assigned_to_id: current?.assigned_to_id ?? null, assigned_to_name: current?.assigned_to_name ?? null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (rollbackError) console.error('reassignNegotiation rollback error:', rollbackError)
    return false
  }
  const { data: neg } = await supabase.from('market_negotiations').select('player_name, team_name').eq('id', id).single()
  await notifyMarketAssignee(newAssigneeId, actingUserId,
    `${actingUserName} te asignó la negociación de ${neg?.player_name ?? ''}${neg?.team_name ? ` → ${neg.team_name}` : ''}`,
    `/mercado?highlight=negotiation-${id}`)
  return true
}

export async function fetchNotesFor(target: { negotiationId?: number; needId?: number }): Promise<MarketNote[]> {
  let query = supabase.from('market_negotiation_notes').select('*')
  query = target.negotiationId != null ? query.eq('negotiation_id', target.negotiationId) : query.eq('need_id', target.needId!)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Agrega una nota y, si trae fecha de seguimiento, la refleja en el padre
 * (negociación u objetivo) en el mismo paso. La nota ya quedó guardada en
 * ese punto — un fallo al sincronizar `next_followup_date` en el padre no
 * invalida la nota en sí, así que se loguea el error pero igual se devuelve
 * la nota creada (no `null`) para no ocultar una escritura que sí tuvo
 * éxito. El caller puede inspeccionar los logs si necesita saber que el
 * seguimiento no quedó reflejado en el padre.
 */
export async function addNoteTo(
  target: { negotiationId?: number; needId?: number },
  body: string,
  isMeeting: boolean,
  nextFollowupDate: string | null,
  authorId: string | null,
  authorName: string,
): Promise<MarketNote | null> {
  const { data, error } = await supabase
    .from('market_negotiation_notes')
    .insert({
      negotiation_id: target.negotiationId ?? null,
      need_id: target.needId ?? null,
      body,
      is_meeting: isMeeting,
      author_id: authorId,
      author_name: authorName,
    })
    .select()
    .single()
  if (error) { console.error('addNoteTo error:', error); return null }

  if (nextFollowupDate) {
    const table = target.negotiationId != null ? 'market_negotiations' : 'market_club_needs'
    const id = target.negotiationId ?? target.needId!
    const { error: syncError } = await supabase
      .from(table)
      .update({ next_followup_date: nextFollowupDate, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (syncError) console.error('addNoteTo followup sync error:', syncError)
  }

  return data
}

/**
 * Actualiza "cuándo volver a hablar" directo (sin pasar por una nota) — vive
 * aparte del compositor de notas a propósito: mezclar tildar reunión + poner
 * fecha en la misma barra de "escribir nota" confundía a los jefes que la
 * usan (gente grande, no son usuarios frecuentes de apps). Ver [[market_notes_simplify]].
 */
export async function updateFollowupDate(target: { negotiationId?: number; needId?: number }, date: string | null): Promise<boolean> {
  const table = target.negotiationId != null ? 'market_negotiations' : 'market_club_needs'
  const id = target.negotiationId ?? target.needId!
  const { error } = await supabase.from(table).update({ next_followup_date: date, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) { console.error('updateFollowupDate error:', error); return false }
  return true
}

// ─── Candidatos de un objetivo (jugadores ofrecidos para ese puesto) ────────

export async function fetchCandidatesFor(needId: number): Promise<NeedCandidate[]> {
  const { data, error } = await supabase
    .from('market_need_candidates')
    .select('*')
    .eq('need_id', needId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchAllCandidates(): Promise<NeedCandidate[]> {
  const { data, error } = await supabase
    .from('market_need_candidates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Crea la negociación de un jugador ofrecido en una búsqueda, con lo poco que
 * se sabe en ese momento (nombre, club y puesto de la búsqueda, responsable).
 * Ofrecer un nombre en una búsqueda ES abrir una negociación — así cada
 * ofrecido tiene su propia fecha para volver a hablar, su contacto en el
 * club y su responsable, y aparece en Negociaciones, en el calendario y en la
 * campanita sin cargarlo dos veces. Lo demás (club actual, representante,
 * vínculo con la API) se completa después desde Negociaciones.
 */
async function createNegotiationForCandidate(
  need: ClubNeed,
  playerName: string,
  status: NegotiationStatus,
  assignee: { id: number; name: string } | null,
  createdById: string | null,
  createdByName: string,
): Promise<Negotiation | null> {
  const { data, error } = await supabase
    .from('market_negotiations')
    .insert({
      team_id: need.team_id,
      team_name: need.team_name,
      team_logo: need.team_logo,
      player_name: playerName,
      position_label: need.position_label,
      need_id: need.id,
      status,
      assigned_to_id: assignee?.id ?? null,
      assigned_to_name: assignee?.name ?? null,
      created_by_id: createdById,
      created_by_name: createdByName,
    })
    .select()
    .single()
  if (error) { console.error('createNegotiationForCandidate error:', error); return null }
  return data
}

export async function addCandidate(
  need: ClubNeed,
  playerName: string,
  assignee: { id: number; name: string } | null,
  addedById: string | null,
  addedByName: string,
): Promise<{ candidate: NeedCandidate; negotiation: Negotiation } | null> {
  const negotiation = await createNegotiationForCandidate(need, playerName, 'ofrecido', assignee, addedById, addedByName)
  if (!negotiation) return null
  const { data, error } = await supabase
    .from('market_need_candidates')
    .insert({ need_id: need.id, player_name: playerName, negotiation_id: negotiation.id, added_by_id: addedById, added_by_name: addedByName })
    .select()
    .single()
  if (error) {
    console.error('addCandidate error:', error)
    await supabase.from('market_negotiations').delete().eq('id', negotiation.id)
    return null
  }
  return { candidate: data, negotiation }
}

/**
 * Ofrecidos cargados antes de que cada uno tuviera su negociación: se la crea
 * recién cuando alguien le pone fecha, contacto o responsable (no en masa al
 * abrir la búsqueda, para no llenar Negociaciones de golpe sin que nadie lo pida).
 */
export async function ensureCandidateNegotiation(
  candidate: NeedCandidate,
  need: ClubNeed,
  createdById: string | null,
  createdByName: string,
): Promise<Negotiation | null> {
  if (candidate.negotiation_id) {
    const { data, error } = await supabase.from('market_negotiations').select('*').eq('id', candidate.negotiation_id).single()
    if (error) { console.error('ensureCandidateNegotiation fetch error:', error); return null }
    return data
  }
  const negotiation = await createNegotiationForCandidate(
    need,
    candidate.player_name,
    CANDIDATE_TO_NEGOTIATION_STATUS[candidate.status],
    need.assigned_to_id != null && need.assigned_to_name ? { id: need.assigned_to_id, name: need.assigned_to_name } : null,
    createdById,
    createdByName,
  )
  if (!negotiation) return null
  const update: Record<string, unknown> = { negotiation_id: negotiation.id }
  if (candidate.player_api_id) {
    await supabase.from('market_negotiations')
      .update({ player_api_id: candidate.player_api_id, player_source: candidate.player_source })
      .eq('id', negotiation.id)
  }
  const { error } = await supabase.from('market_need_candidates').update(update).eq('id', candidate.id)
  if (error) { console.error('ensureCandidateNegotiation link error:', error); return null }
  return { ...negotiation, player_api_id: candidate.player_api_id, player_source: candidate.player_source }
}

/** "Con quién hablamos" del lado del club destino. */
export async function updateNegotiationTargetContacts(id: number, contacts: ClubContact[]): Promise<boolean> {
  const { error } = await supabase
    .from('market_negotiations')
    .update({ target_club_contacts: contacts, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) { console.error('updateNegotiationTargetContacts error:', error); return false }
  return true
}

/** Sacar a un ofrecido de la búsqueda saca también su negociación (se cargó junto con él). */
export async function removeCandidateAndNegotiation(candidate: NeedCandidate): Promise<boolean> {
  const ok = await removeCandidate(candidate.id)
  if (!ok) return false
  if (candidate.negotiation_id) {
    const { error } = await supabase.from('market_negotiations').delete().eq('id', candidate.negotiation_id)
    if (error) console.error('removeCandidateAndNegotiation negotiation error:', error)
  }
  return true
}

export async function updateCandidateStatus(id: number, status: CandidateStatus): Promise<boolean> {
  const { data, error } = await supabase
    .from('market_need_candidates')
    .update({ status })
    .eq('id', id)
    .select('negotiation_id')
    .single()
  if (error) { console.error('updateCandidateStatus error:', error); return false }

  if (data?.negotiation_id) {
    const { error: syncErr } = await supabase
      .from('market_negotiations')
      .update({ status: CANDIDATE_TO_NEGOTIATION_STATUS[status], updated_at: new Date().toISOString() })
      .eq('id', data.negotiation_id)
    if (syncErr) console.error('updateCandidateStatus negotiation sync error:', syncErr)
  }
  return true
}

export async function removeCandidate(id: number): Promise<boolean> {
  const { error } = await supabase.from('market_need_candidates').delete().eq('id', id)
  if (error) { console.error('removeCandidate error:', error); return false }
  return true
}

/** Mismo espiritu que `linkNegotiationPlayer`: corrige el nombre con el real apenas se confirma el id. */
export async function linkCandidatePlayer(id: number, playerApiId: number, playerSource: 'interno' | 'externo' | null, correctedName?: string | null): Promise<boolean> {
  const update: Record<string, unknown> = { player_api_id: playerApiId, player_source: playerSource }
  if (correctedName) update.player_name = correctedName
  const { error } = await supabase.from('market_need_candidates').update(update).eq('id', id)
  if (error) { console.error('linkCandidatePlayer error:', error); return false }
  return true
}
