export interface AgencyCoach {
  key: string
  fullName: string
  photo: string | null
  status: 'activo' | 'sin_club'
  club: string | null
  apiTeamId: number | null
  reserveApiTeamId?: number | null
  leagueApiId?: number | null
  leagueName?: string | null
  leagueSeason?: number | null
  coachApiId?: number | null
  relationship: 'propio' | 'intermediado'
  /** Fecha (YYYY-MM-DD) en que el DT asumió en su club actual. Null = usar la de API-Football. */
  tenureStart?: string | null
}
