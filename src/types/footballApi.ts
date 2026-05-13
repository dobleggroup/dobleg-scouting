export interface ApiResponse<T> {
  get: string
  parameters: Record<string, string>
  errors: Record<string, string> | []
  results: number
  paging: { current: number; total: number }
  response: T
}

export interface ApiFixture {
  fixture: {
    id: number
    referee: string | null
    timezone: string
    date: string
    timestamp: number
    venue: {
      id: number | null
      name: string
      city: string
    }
    status: {
      long: string
      short: string
      elapsed: number | null
    }
  }
  league: {
    id: number
    name: string
    country: string
    logo: string
    flag: string | null
    season: number
    round: string
  }
  teams: {
    home: {
      id: number
      name: string
      logo: string
      winner: boolean | null
    }
    away: {
      id: number
      name: string
      logo: string
      winner: boolean | null
    }
  }
  goals: {
    home: number | null
    away: number | null
  }
  score: {
    halftime: { home: number | null; away: number | null }
    fulltime: { home: number | null; away: number | null }
    extratime: { home: number | null; away: number | null } | null
    penalty: { home: number | null; away: number | null } | null
  }
}

export interface ApiTeam {
  team: {
    id: number
    name: string
    code: string | null
    country: string
    founded: number | null
    national: boolean
    logo: string
  }
  venue: {
    id: number | null
    name: string | null
    address: string | null
    city: string | null
    capacity: number | null
    surface: string | null
    image: string | null
  }
}

export interface AgencyFixture {
  fixtureId: number
  date: string
  timestamp: number
  venue: string
  city: string
  status: string
  statusShort: string
  elapsed: number | null
  leagueName: string
  leagueLogo: string
  leagueCountry: string
  leagueFlag: string | null
  round: string
  homeTeam: { id: number; name: string; logo: string }
  awayTeam: { id: number; name: string; logo: string }
  goalsHome: number | null
  goalsAway: number | null
  isHome: boolean
  players: { shortName: string; fullName: string; image: string | null }[]
}

