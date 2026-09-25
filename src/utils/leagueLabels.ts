import type { LeagueInfo } from '@/types/scoring'

// Los nombres de liga y país vienen de los proveedores en inglés y sin acentos
// ("Primera B (Colombia)" no se reconocía como la segunda de Colombia).

const COUNTRY_ES: Record<string, string> = {
  England: 'Inglaterra',
  Spain: 'España',
  Italy: 'Italia',
  Germany: 'Alemania',
  France: 'Francia',
  Netherlands: 'Países Bajos',
  USA: 'Estados Unidos',
  Mexico: 'México',
  Peru: 'Perú',
  Brazil: 'Brasil',
  'United-Arab-Emirates': 'Emiratos Árabes Unidos',
  'South America': 'Sudamérica',
  Europe: 'Europa',
}

const NAME_ES: Record<string, string> = {
  'Primera Division': 'Primera División',
  'Division Profesional - Clausura': 'División Profesional',
}

/** Ligas de segunda división (el `tier` de la tabla es un nivel de calidad, no la división). */
const SECOND_DIVISION = new Set([131, 240])

export function countryEs(country: string): string {
  return COUNTRY_ES[country] ?? country
}

export function leagueLabel(league: LeagueInfo): string {
  const name = NAME_ES[league.name] ?? league.name
  const division = SECOND_DIVISION.has(league.id) ? ' (2ª división)' : ''
  return `${countryEs(league.country)} · ${name}${division}`
}

/** Argentina primero; después por país (en castellano) y dentro de cada país, primera antes que segunda. */
export function sortLeaguesForPicker(leagues: LeagueInfo[]): LeagueInfo[] {
  const rank = (l: LeagueInfo) => (l.country === 'Argentina' ? 0 : 1)
  return [...leagues].sort((a, b) =>
    rank(a) - rank(b)
    || countryEs(a.country).localeCompare(countryEs(b.country), 'es')
    || Number(SECOND_DIVISION.has(a.id)) - Number(SECOND_DIVISION.has(b.id))
    || a.tier - b.tier,
  )
}
