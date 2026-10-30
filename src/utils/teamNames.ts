// API-Football manda algunos clubes abreviados ("A. Italiano") y cada
// sincronización vuelve a pisar el nombre en `teams`, así que se corrige al
// mostrarlo. La clave es el nombre tal cual viene del proveedor.
const FULL_TEAM_NAMES: Record<string, string> = {
  'A. Italiano': 'Audax Italiano',
  'D. La Serena': 'Deportes La Serena',
  'U. Catolica': 'Universidad Católica',
  'Independ. Rivadavia': 'Independiente Rivadavia',
  'Club Sp. San Lorenzo': 'Sportivo San Lorenzo',
  'U.N.A.M. - Pumas': 'Pumas UNAM',
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function fullTeamName(name: string): string {
  return FULL_TEAM_NAMES[name.trim()] ?? name
}

/** Nombres abreviados del proveedor cuyo nombre completo contiene lo buscado ("audax" → "A. Italiano"). */
export function abbreviatedTeamNamesMatching(query: string): string[] {
  const q = norm(query)
  if (!q) return []
  return Object.entries(FULL_TEAM_NAMES).filter(([, full]) => norm(full).includes(q)).map(([short]) => short)
}
