export interface TeamMember {
  id: number
  name: string
  active: boolean
  /** Cuenta real de la app vinculada a esta persona, si la tiene — permite que
   * la campanita de alertas sepa "esto es mío" sin depender de que el nombre
   * coincida exactamente con el de la cuenta logueada. */
  user_id: string | null
}

export type NeedStatus = 'abierto' | 'cerrado'
export type NegotiationStatus = 'ofrecido' | 'pausado' | 'en_negociacion' | 'avanzado' | 'cerrado_exito' | 'cerrado_caido'
export type CandidateStatus = 'propuesto' | 'en_negociacion' | 'descartado' | 'fichado'

export interface ClubNeed {
  id: number
  /** Null cuando el club se escribió a mano (no estaba en la lista). */
  team_id: number | null
  team_name: string
  team_logo: string | null
  position_label: string
  status: NeedStatus
  assigned_to_id: number | null
  assigned_to_name: string | null
  next_followup_date: string | null
  created_by_id: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

/** Una persona de contacto en un club — no siempre es "el" director
 * deportivo, puede ser cualquiera que atienda la negociación. `role` es
 * libre (cargo) y opcional. */
export interface ClubContact {
  name: string
  role: string | null
}

/**
 * Una negociacion real tiene contactos de ambos lados del club (el actual,
 * para sacarlo, y el destino, para meterlo — `team_id`/`team_name`/`team_logo`)
 * y a veces un representante externo del jugador, cuando el jugador no es
 * de la propia agencia (`belongs_to_agency`).
 *
 * Ambos clubes son opcionales, no solo el actual: `team_id` null representa
 * "el objetivo es dejarlo libre" (sin destino puntual todavia), y
 * `current_team_id` null representa "el jugador ya está libre" (sin club
 * actual). Al menos uno de los dos suele tener valor, pero no se fuerza.
 */
export interface Negotiation {
  id: number
  team_id: number | null
  team_name: string | null
  team_logo: string | null
  current_team_id: number | null
  current_team_name: string | null
  current_team_logo: string | null
  player_name: string
  player_api_id: number | null
  player_source: 'interno' | 'externo' | null
  /** Posición del jugador ofrecido — se usa para enganchar (o crear) la
   * búsqueda de club correspondiente. Ver [[market_negotiation_need_link]]. */
  position_label: string | null
  /** Búsqueda de club a la que quedó vinculada esta negociación, si el club
   * destino tiene una (se crea sola si no existía). Null si no hay club
   * destino o no se pudo determinar la posición del jugador. */
  need_id: number | null
  /** Si el jugador es de la propia agencia (Doble G lo representa
   * directamente) o si hay un representante externo (`agent_name`).
   * Null en negociaciones viejas, cargadas antes de que se preguntara esto. */
  belongs_to_agency: boolean | null
  agent_name: string | null
  target_club_contacts: ClubContact[]
  current_club_contacts: ClubContact[]
  status: NegotiationStatus
  assigned_to_id: number | null
  assigned_to_name: string | null
  next_followup_date: string | null
  created_by_id: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export interface MarketNote {
  id: number
  negotiation_id: number | null
  need_id: number | null
  body: string
  is_meeting: boolean
  is_system: boolean
  author_id: string | null
  author_name: string | null
  created_at: string
}

/**
 * Un objetivo de club no es "un" jugador — el club va evaluando varios
 * candidatos para el mismo puesto a medida que se los ofrecen. Cada fila acá
 * es un jugador propuesto para ese objetivo puntual.
 */
export interface NeedCandidate {
  id: number
  need_id: number
  player_name: string
  player_api_id: number | null
  player_source: 'interno' | 'externo' | null
  status: CandidateStatus
  /** Negociación de la que salió este candidato, si vino de ahí (en vez de
   * haberse agregado a mano directo en la búsqueda). */
  negotiation_id: number | null
  added_by_id: string | null
  added_by_name: string | null
  created_at: string
}

export interface MarketTeamSearchResult {
  id: number
  name: string
  logo: string | null
}

/** Club elegido en un formulario de Mercado: de la lista (con id) o escrito a
 * mano cuando no aparece (id null, sin escudo). */
export interface MarketTeamChoice {
  id: number | null
  name: string
  logo: string | null
}
