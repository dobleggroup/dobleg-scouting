/**
 * Escudos y banderas que cargamos nosotros (en `public/clubs`) para clubes o
 * selecciones que no están en `teams` o cuyo escudo externo no carga. Se
 * buscan por nombre normalizado (sin tildes ni mayúsculas).
 */
interface CustomClub {
  /** El nombre normalizado contiene alguna de estas palabras. */
  contains?: string[]
  /** El nombre normalizado es exactamente alguno de estos. */
  exact?: string[]
  logo: string
  /** Liga a mostrar en Búsquedas cuando el club no está vinculado a la base. */
  league?: string
}

const CUSTOM_CLUBS: CustomClub[] = [
  { contains: ['acassuso'], logo: '/clubs/acassuso.png' },
  { exact: ['belgrano', 'belgrano cordoba', 'belgrano de cordoba', 'ca belgrano', 'club atletico belgrano'], logo: '/clubs/belgrano.png' },
  { contains: ['roda'], logo: '/clubs/roda-jc.png', league: 'Segunda División de Holanda' },
  { contains: ['arabia'], logo: '/clubs/arabia-saudita.png', league: 'Primera División de Arabia Saudita' },
  { contains: ['corea', 'korea'], logo: '/clubs/corea-del-sur.png', league: 'Primera División de Corea del Sur' },
]

function normalize(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.]/g, '').replace(/\s+/g, ' ').trim()
}

function findCustomClub(name: string | null | undefined): CustomClub | null {
  if (!name) return null
  const n = normalize(name)
  return CUSTOM_CLUBS.find(c => c.exact?.includes(n) || c.contains?.some(w => n.includes(w))) ?? null
}

export function customClubLogo(name: string | null | undefined): string | null {
  return findCustomClub(name)?.logo ?? null
}

export function customClubLeague(name: string | null | undefined): string | null {
  return findCustomClub(name)?.league ?? null
}
