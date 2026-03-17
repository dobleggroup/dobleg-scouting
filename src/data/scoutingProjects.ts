// Scouting Projects Data
// Each project represents a scouting assignment (tournament, league, etc.)

export interface ScoutedPlayer {
  Jugador: string
  Club: string
  Edad: number
  Nacionalidad: string
  Posicion: string
  Rol: string
  Comentario: string
  FichaTecnica: string
  destacado?: boolean
}

export interface ScoutingProject {
  id: string
  title: string
  subtitle: string
  year: number
  category: string
  status: 'completed' | 'in-progress' | 'upcoming'
  coverImage?: string
  description: string
  dateRange: string
  location: string
  totalPlayers: number
  highlightedPlayers: number
  players: ScoutedPlayer[]
}

// Sudamericano Sub-15 2025 - scouting data
export const SUDAMERICANO_SUB15_2025: ScoutingProject = {
  id: 'sudamericano-sub15-2025',
  title: 'Sudamericano Sub-15',
  subtitle: 'CONMEBOL 2025',
  year: 2025,
  category: 'Selecciones',
  status: 'completed',
  description: 'Trabajo de scouting en el Campeonato Sudamericano Sub-15 de la CONMEBOL. Se evaluaron los mejores talentos juveniles de Sudamérica.',
  dateRange: 'Octubre 2025',
  location: 'Paraguay',
  totalPlayers: 23,
  highlightedPlayers: 5,
  players: [
    {
      Jugador: 'Marco Villarreal',
      Club: 'Caracas',
      Edad: 15,
      Nacionalidad: 'Venezuela',
      Posicion: 'Volante central',
      Rol: 'Volante central posicional',
      Comentario: 'Destaca técnicamente. Buenos controles, buenos pases progresivos y agresivo en la marca.',
      FichaTecnica: 'https://www.transfermarkt.es/marco-villarreal/profil/spieler/1464930',
      destacado: true // VERDE
    },
    {
      Jugador: 'Luis Machín',
      Club: 'Nacional',
      Edad: 15,
      Nacionalidad: 'Uruguay',
      Posicion: 'Arquero',
      Rol: 'Arquero',
      Comentario: 'Gran juego con los pies (casi líbero) y buenos reflejos.',
      FichaTecnica: '',
      destacado: false
    },
    {
      Jugador: 'Geovane Silva',
      Club: 'Vitória',
      Edad: 15,
      Nacionalidad: 'Brasil',
      Posicion: 'Defensor central derecho',
      Rol: 'Defensor central clásico',
      Comentario: 'Destaca defensivamente y tiene la técnica de un defensor brasilero, aunque no sea su fuerte.',
      FichaTecnica: '',
      destacado: false
    },
    {
      Jugador: 'Ezequiel Fernández',
      Club: 'Peñarol',
      Edad: 15,
      Nacionalidad: 'Uruguay',
      Posicion: 'Defensor central derecho',
      Rol: 'Defensor central iniciador',
      Comentario: 'Bien en el 1 vs 1. Agresivo y buena salida del fondo. Conduce.',
      FichaTecnica: '',
      destacado: true // VERDE
    },
    {
      Jugador: 'Nicolás Bernal',
      Club: 'Atlético Nacional',
      Edad: 15,
      Nacionalidad: 'Colombia',
      Posicion: 'Volante interno',
      Rol: 'Volante interno ofensivo',
      Comentario: 'Buena progresión con pases filtrados, conducciones o duelos 1 vs 1. Arriesga mucho.',
      FichaTecnica: 'https://www.transfermarkt.es/nicolas-bernal/profil/spieler/1467479',
      destacado: false
    },
    {
      Jugador: 'Deverson García',
      Club: 'Caracas',
      Edad: 15,
      Nacionalidad: 'Venezuela',
      Posicion: 'Extremo',
      Rol: 'Extremo desequilibrante',
      Comentario: 'Buen 1 vs 1 ofensivo. Debe mejorar la toma de decisión y el control orientado para ganar tiempo / espacio.',
      FichaTecnica: 'https://www.transfermarkt.es/deverson-garcia/profil/spieler/1464932',
      destacado: false
    },
    {
      Jugador: 'Martín Navarrete',
      Club: 'Colo Colo',
      Edad: 15,
      Nacionalidad: 'Chile',
      Posicion: 'Defensor central izquierdo',
      Rol: 'Defensor central iniciador',
      Comentario: 'Muy buena salida. Correcto defensivamente, aunque debe mejorar.',
      FichaTecnica: 'https://www.transfermarkt.es/martin-navarrete/profil/spieler/1471003',
      destacado: false
    },
    {
      Jugador: 'Tomás Inthamoussu',
      Club: 'Nacional',
      Edad: 15,
      Nacionalidad: 'Uruguay',
      Posicion: 'Defensor central izquierdo',
      Rol: 'Defensor central iniciador',
      Comentario: 'Muy buena salida. Muchas conducciones.',
      FichaTecnica: '',
      destacado: false
    },
    {
      Jugador: 'Samir Marmolejo',
      Club: 'DIM',
      Edad: 15,
      Nacionalidad: 'Colombia',
      Posicion: 'Volante central',
      Rol: 'Volante central posicional',
      Comentario: 'Buena técnica y buen físico.',
      FichaTecnica: 'https://www.transfermarkt.es/samir-marmolejo/profil/spieler/1467476',
      destacado: false
    },
    {
      Jugador: 'Lionel Condezo',
      Club: 'Alianza Lima',
      Edad: 15,
      Nacionalidad: 'Perú',
      Posicion: 'Volante interno',
      Rol: 'Volante interno ofensivo',
      Comentario: 'Buena conducción. Buena gambeta. Mucha técnica.',
      FichaTecnica: 'https://www.transfermarkt.es/lionel-condezo/profil/spieler/1435904',
      destacado: false
    },
    {
      Jugador: 'Cristian Arboleda',
      Club: 'Atlético Nacional',
      Edad: 15,
      Nacionalidad: 'Colombia',
      Posicion: 'Extremo',
      Rol: 'Extremo desequilibrante',
      Comentario: 'Buen 1 vs 1 ofensivo. Mucha potencia y velocidad. Mostró buena definición.',
      FichaTecnica: 'https://www.transfermarkt.es/cristian-arboleda/profil/spieler/1467474',
      destacado: false
    },
    {
      Jugador: 'Marvin Vásquez',
      Club: 'Emelec',
      Edad: 15,
      Nacionalidad: 'Ecuador',
      Posicion: 'Volante central',
      Rol: 'Volante central defensivo',
      Comentario: 'Tiene buena pegada y buena visión de juego, aunque destaca por su agresividad al marcar alto.',
      FichaTecnica: 'https://www.transfermarkt.es/marvin-vasquez/profil/spieler/1461184',
      destacado: false
    },
    {
      Jugador: 'Amaro Delgado',
      Club: 'Colo Colo',
      Edad: 14,
      Nacionalidad: 'Chile',
      Posicion: 'Extremo',
      Rol: 'Extremo desequilibrante',
      Comentario: 'Extremo con centro de gravedad muy bajo y buen cambio de ritmo. Eso lo hace ganar muchos duelos 1 vs 1 en ofensiva.',
      FichaTecnica: 'https://www.transfermarkt.es/amaro-delgado/profil/spieler/1470998',
      destacado: false
    },
    {
      Jugador: 'Ruan Pablo',
      Club: 'Palmeiras',
      Edad: 15,
      Nacionalidad: 'Brasil',
      Posicion: 'Defensor central izquierdo',
      Rol: 'Defensor central iniciador',
      Comentario: 'Mucha técnica de pase corto y largo. Muy fuerte y rápido para defender.',
      FichaTecnica: 'https://www.transfermarkt.es/ruan-pablo/profil/spieler/1466528',
      destacado: true
    },
    {
      Jugador: 'Weiner Martínez',
      Club: 'Envigado',
      Edad: 15,
      Nacionalidad: 'Colombia',
      Posicion: 'Lateral izquierdo',
      Rol: 'Lateral izquierdo ofensivo',
      Comentario: "Destaca en los duelos ofensivos. Buen porte. Rápido. Podría transformarse a 'extremo'.",
      FichaTecnica: 'https://www.transfermarkt.es/weiner-martinez/profil/spieler/1467477',
      destacado: false
    },
    {
      Jugador: 'León Palma',
      Club: 'U Católica',
      Edad: 15,
      Nacionalidad: 'Chile',
      Posicion: 'Lateral derecho',
      Rol: 'Lateral derecho completo',
      Comentario: 'Mucho ida y vuelta. Criterioso con la pelota.',
      FichaTecnica: 'https://www.transfermarkt.es/leon-palma/profil/spieler/1471000',
      destacado: false
    },
    {
      Jugador: 'Ángel González',
      Club: 'Nacional Paraguay',
      Edad: 15,
      Nacionalidad: 'Paraguay',
      Posicion: 'Extremo',
      Rol: 'Extremo desequilibrante',
      Comentario: 'Buena gambeta y buen retroceso.',
      FichaTecnica: '',
      destacado: false
    },
    {
      Jugador: 'Mateo Rivero',
      Club: 'Argentinos Juniors',
      Edad: 15,
      Nacionalidad: 'Argentina',
      Posicion: 'Enganche',
      Rol: 'Enganche',
      Comentario: 'Buen 1 vs ofensivo. Rápido. Buena conducción. Mucha técnica. Buen pase filtrado / en profundidad.',
      FichaTecnica: 'https://www.transfermarkt.es/mateo-rivero/profil/spieler/1427203',
      destacado: false
    },
    {
      Jugador: 'Facundo Amaya',
      Club: 'Boca Juniors',
      Edad: 15,
      Nacionalidad: 'Argentina',
      Posicion: 'Volante interno',
      Rol: 'Volante interno mixto',
      Comentario: 'Buen pase. Su primera opción es dar el pase hacia adelante. Buen juego bajo presión.',
      FichaTecnica: 'https://www.transfermarkt.es/facundo-amaya/profil/spieler/1427205',
      destacado: true // VERDE
    },
    {
      Jugador: 'Adrián Mosquera',
      Club: 'BTL Sport Project',
      Edad: 15,
      Nacionalidad: 'Colombia',
      Posicion: 'Defensor central izquierdo',
      Rol: 'Defensor central clásico',
      Comentario: 'Destaca defensivamente.',
      FichaTecnica: 'https://www.transfermarkt.es/adrian-mosquera/profil/spieler/1467482',
      destacado: false
    },
    {
      Jugador: 'Bruno Cabral',
      Club: 'River Plate',
      Edad: 15,
      Nacionalidad: 'Argentina',
      Posicion: 'Delantero',
      Rol: 'Delantero completo',
      Comentario: 'Buen juego aéreo, buena definición, buenos apoyos y buenos desmarques de ruptura. Completo.',
      FichaTecnica: 'https://www.transfermarkt.es/bruno-cabral/profil/spieler/1427196',
      destacado: true
    },
    {
      Jugador: 'José López',
      Club: 'Monagas',
      Edad: 15,
      Nacionalidad: 'Venezuela',
      Posicion: 'Extremo',
      Rol: 'Extremo desequilibrante',
      Comentario: 'Buena gambeta y buena asociación en corto.',
      FichaTecnica: 'https://www.transfermarkt.es/jose-lopez/profil/spieler/1467482',
      destacado: false
    }
  ]
}

// Libertadores Sub-20 2026 placeholder
export const LIBERTADORES_SUB20_2026: ScoutingProject = {
  id: 'libertadores-sub20-2026',
  title: 'Libertadores Sub-20',
  subtitle: 'CONMEBOL 2026',
  year: 2026,
  category: 'Clubes',
  status: 'upcoming',
  description: 'Trabajo de scouting en la Copa Libertadores Sub-20 de la CONMEBOL.',
  dateRange: 'Abril - Mayo 2026',
  location: 'Por definir',
  totalPlayers: 0,
  highlightedPlayers: 0,
  players: []
}

// Export all projects
export const SCOUTING_PROJECTS: ScoutingProject[] = [
  SUDAMERICANO_SUB15_2025,
  LIBERTADORES_SUB20_2026
]

// Get flag emoji for nationality
export function getNationalityFlag(nationality: string): string {
  const flags: Record<string, string> = {
    'Argentina': '🇦🇷',
    'Brasil': '🇧🇷',
    'Brazil': '🇧🇷',
    'Chile': '🇨🇱',
    'Colombia': '🇨🇴',
    'Ecuador': '🇪🇨',
    'Paraguay': '🇵🇾',
    'Peru': '🇵🇪',
    'Perú': '🇵🇪',
    'Uruguay': '🇺🇾',
    'Venezuela': '🇻🇪',
    'Bolivia': '🇧🇴',
  }
  return flags[nationality] || '🏳️'
}

// Get position color
export function getPositionColor(position: string): string {
  const pos = position.toLowerCase()
  if (pos.includes('arquero') || pos.includes('portero')) return 'bg-amber-500'
  if (pos.includes('defensor') || pos.includes('central') || pos.includes('lateral')) return 'bg-blue-500'
  if (pos.includes('volante') || pos.includes('medio') || pos.includes('interior')) return 'bg-emerald-500'
  if (pos.includes('extremo') || pos.includes('enganche') || pos.includes('delantero')) return 'bg-red-500'
  return 'bg-gray-500'
}
