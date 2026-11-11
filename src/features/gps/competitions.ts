/**
 * Competencias sugeridas al cargar GPS. Cubren las ligas donde juegan los jugadores
 * de la agencia; las internacionales van sin país porque no pertenecen a ninguna.
 * El campo sigue siendo texto libre: esto es sólo el punto de partida, y lo que se
 * escribe a mano queda como sugerencia para la próxima.
 */
export const KNOWN_COMPETITIONS: string[] = [
  // Argentina
  'LPF Argentina',
  'Primera Nacional Argentina',
  'Reserva Argentina',
  'Copa Argentina',
  'Primera B Metropolitana Argentina',
  'Torneo Federal A Argentina',
  // Resto de Sudamérica
  'Primera División Uruguay',
  'Primera División Chile',
  'Copa Chile',
  'Copa de la Liga Chile',
  'Supercopa de Chile',
  'División Profesional Bolivia',
  'LigaPro Ecuador',
  'Primera A Colombia',
  'Brasileirão Brasil',
  'División Profesional Paraguay',
  'Liga 1 Perú',
  // Norte y Centroamérica
  'Liga MX México',
  'Liga Nacional Honduras',
  'MLS Estados Unidos',
  // Europa y resto
  'Primeira Liga Portugal',
  'LaLiga España',
  'Serie A Italia',
  'Liga Profesional Emiratos',
  // Internacionales: sin país
  'Copa Libertadores',
  'Copa Sudamericana',
  'Recopa Sudamericana',
  'Champions League',
  'Europa League',
  'Conference League',
  'Mundial de Clubes',
  'Eliminatorias Sudamericanas',
  'Amistoso',
]

/**
 * Sugerencias para el campo Competencia: primero las que ya se usaron (son las más
 * probables) y después el resto del catálogo, sin repetir.
 */
export function mergeCompetitions(used: string[], known: string[] = KNOWN_COMPETITIONS): string[] {
  const seen = new Set(used.map(c => c.trim().toLowerCase()))
  return [...used, ...known.filter(c => !seen.has(c.toLowerCase()))]
}
