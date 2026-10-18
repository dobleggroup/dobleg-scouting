/** Qué se puede elegir para el PDF de Test Opta (mismo orden que la página). */
export type PdfGroup = 'panorama' | 'rival' | 'ciclo' | 'partidos' | 'liga' | 'plantel' | 'dt'

export interface PdfSection { id: string; title: string; section: PdfGroup }

export const PDF_GROUP_TITLES: Record<PdfGroup, string> = {
  panorama: 'Panorama',
  rival: 'Próximo rival',
  ciclo: 'Con Ponzio',
  partidos: 'Partido a partido',
  liga: 'River vs la liga',
  plantel: 'Plantel y surgidos',
  dt: 'El DT',
}

export const PDF_SECTIONS: PdfSection[] = [
  { id: 'situacion', title: 'Situación, último y próximo partido', section: 'panorama' },
  { id: 'claves', title: 'Lo que define a River', section: 'panorama' },
  { id: 'estilo', title: 'Cómo juega River y por dónde ataca', section: 'panorama' },
  { id: 'forma', title: 'Cómo viene (últimos 10)', section: 'panorama' },
  { id: 'tabla', title: 'Tabla de la zona y River en números', section: 'panorama' },
  { id: 'datos', title: 'Todos los datos de River', section: 'panorama' },

  { id: 'rivalClaves', title: 'Lo que hay que saber del rival', section: 'rival' },
  { id: 'rivalEstilo', title: 'Cómo juega el rival', section: 'rival' },
  { id: 'rivalCancha', title: 'Cómo se para y por dónde ataca', section: 'rival' },
  { id: 'rivalRemates', title: 'Remates y fortalezas/debilidades', section: 'rival' },
  { id: 'rivalJugadores', title: 'Jugadores clave y partidos entre ellos', section: 'rival' },
  { id: 'rivalCaraACara', title: 'River y el rival, dato por dato', section: 'rival' },

  { id: 'cicloResumen', title: 'Récord antes y con Ponzio', section: 'ciclo' },
  { id: 'cicloCambios', title: 'Qué cambió, dato por dato', section: 'ciclo' },
  { id: 'cicloEquipo', title: 'El equipo que más usa y quién ganó lugar', section: 'ciclo' },

  { id: 'evolucion', title: 'Evolución: xG, posesión y presión', section: 'partidos' },
  { id: 'partidos', title: 'Todos los partidos', section: 'partidos' },

  { id: 'ligaRanking', title: 'Puesto de River en cada dato', section: 'liga' },
  { id: 'ligaDispersion', title: 'Gráficos de los 30 equipos', section: 'liga' },

  { id: 'plantelMinutos', title: 'Minutos con Ponzio', section: 'plantel' },
  { id: 'plantelSurgidos', title: 'Surgidos del club', section: 'plantel' },

  { id: 'dt', title: 'Carrera de Ponzio', section: 'dt' },
]
