import { describe, it, expect } from 'vitest'
import { buildInformeHtml, informeRating } from './exportInformeHTML'
import type { Informe, MetricDef, MetricStat } from './types'
import type { InformeEnrichment } from './useInformeEnrichment'
import type { PlayerTransfer } from '@/services/footballApiService'

function makeStat(percentile: number | null, key = 'k'): MetricStat {
  return {
    def: { key, label: key, short: key, unit: '', higherIsBetter: true },
    value: 1, avg: 1, percentile, avgPercentile: 50, color: 'neutral', rank: 1, total: 10,
  }
}

const emptyEnrichment: InformeEnrichment = {
  isInternal: false, hasPhysical: false, physicalTiles: [], physicalMatches: 0,
  physicalEvolution: [], levelEvolution: [], levelByMatch: [], levelByWeek: [], levelByMonth: [],
  marketEvolution: [], continuity: null, last5: [], injuries: [], loading: false,
}

function makeDef(over: Partial<MetricDef>): MetricDef {
  return { key: 'k', label: 'k', short: 'k', unit: '', higherIsBetter: true, ...over }
}

function makeInforme(over: Partial<Informe> = {}): Informe {
  return {
    id: 'i1',
    createdAt: '',
    updatedAt: '',
    contextoComparacion: 'Contexto de prueba',
    fotoDataUrl: null,
    protagonistIndex: 0,
    comparePlayerIndices: [],
    content: {
      nombre: 'Jugador Ejemplo',
      club: 'Club X',
      posicion: 'DEL',
      rol: 'Extremo',
      edad: '22',
      nacionalidad: 'ARG',
      liga: 'Liga X',
      contrato: '2027',
      valorMercado: '5M',
      hideMainStats: false,
      rating: '7.2',
      pj: '10',
      minutos: '900',
      goles: '3',
      asistencias: '2',
      lecturaAutor: '',
      lecturaTexto: '',
      videoUrl: '',
      transfermarktUrl: '',
      representante: 'Doble G',
      ultimos5: [],
      hideComparables: false,
      comparables: [],
      comparaciones: '',
    },
    charts: { radar: [], bar: [], numbers: [], scatters: [] },
    headers: ['Jugador', 'Goles'],
    rows: [{ Jugador: 'Jugador Ejemplo', Goles: 3 }],
    columnMap: {},
    ...over,
  }
}

const emptyStats: MetricStat[] = []
const emptyMatrix: Record<string, (number | null)[]> = {}
const emptyDefs: MetricDef[] = []

describe('buildInformeHtml', () => {
  it('genera un documento HTML completo con el script de tabs', () => {
    const html = buildInformeHtml({
      informe: makeInforme(),
      stats: emptyStats,
      matrix: emptyMatrix,
      defs: emptyDefs,
    })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('dg-tab')
    expect(html).toContain("addEventListener('click'")
  })

  it('escapa contenido malicioso en vez de insertarlo crudo', () => {
    const informe = makeInforme({
      content: {
        ...makeInforme().content,
        nombre: '<img src=x onerror=alert(1)>',
      },
    })
    const html = buildInformeHtml({
      informe,
      stats: emptyStats,
      matrix: emptyMatrix,
      defs: emptyDefs,
    })
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
  })

  it('descarta URLs javascript: para transfermarkt y no las embebe', () => {
    const informe = makeInforme({
      content: {
        ...makeInforme().content,
        transfermarktUrl: 'javascript:alert(1)',
      },
    })
    const html = buildInformeHtml({
      informe,
      stats: emptyStats,
      matrix: emptyMatrix,
      defs: emptyDefs,
    })
    expect(html).not.toContain('javascript:alert(1)')
  })

  it('valida el id de YouTube antes de embeberlo', () => {
    const withValid = makeInforme({
      content: { ...makeInforme().content, videoUrl: 'https://www.youtube.com/watch?v=abc12345' },
    })
    const htmlValid = buildInformeHtml({
      informe: withValid,
      stats: emptyStats,
      matrix: emptyMatrix,
      defs: emptyDefs,
    })
    // El id validado se embebe en el facade (data-yt) y en la portada; el reproductor
    // se arma al tocar. Basta con que el id aparezca como atributo controlado.
    expect(htmlValid).toContain('data-yt="abc12345"')

    const withInvalid = makeInforme({
      content: { ...makeInforme().content, videoUrl: 'not-a-video-url' },
    })
    const htmlInvalid = buildInformeHtml({
      informe: withInvalid,
      stats: emptyStats,
      matrix: emptyMatrix,
      defs: emptyDefs,
    })
    // URL inválida => no se renderiza el facade de video.
    expect(htmlInvalid).not.toContain('data-yt=')
  })

  it('renderiza el nombre de una métrica del radar', () => {
    const def = makeDef({ key: 'goles', label: 'Goles' })
    const informe = makeInforme({
      charts: { radar: ['goles'], bar: [], numbers: [], scatters: [] },
    })
    const html = buildInformeHtml({
      informe,
      stats: emptyStats,
      matrix: { goles: [3] },
      defs: [def],
    })
    expect(html).toContain('Goles')
  })

  it('incluye la tabla de comparación de jugadores en el panel de Comparaciones cuando hay comparados', () => {
    const def = makeDef({ key: 'goles', label: 'Goles' })
    const informe = makeInforme({
      comparePlayerIndices: [1],
      charts: { radar: ['goles'], bar: [], numbers: [], scatters: [] },
      rows: [
        { Jugador: 'Jugador Ejemplo', Goles: 3 },
        { Jugador: '<b>Rival Peligroso</b>', Goles: 5 },
      ],
    })
    const html = buildInformeHtml({
      informe,
      stats: emptyStats,
      matrix: { goles: [3, 5] },
      defs: [def],
    })
    expect(html).toContain('Detalle por métrica')
    expect(html).toContain('métricas ganadas')
    expect(html).toContain('&lt;b&gt;Rival Peligroso&lt;/b&gt;')
    expect(html).not.toContain('<b>Rival Peligroso</b>')
  })

  it('renderiza los últimos 5 partidos (API) en el panel General con color por resultado', () => {
    const enrichment: InformeEnrichment = {
      ...emptyEnrichment,
      last5: [
        { rival: 'Ajax', result: '2-1', outcome: 'win', rating: '7.4', minutes: 90, date: '03/05' },
        { rival: 'PSV', result: '0-0', outcome: 'draw', rating: '6.8', minutes: 78, date: '27/04' },
      ],
    }
    const html = buildInformeHtml({ informe: makeInforme(), stats: emptyStats, matrix: emptyMatrix, defs: emptyDefs, enrichment })
    expect(html).toContain('Últimos 5 partidos')
    expect(html).toContain('Ajax')
    expect(html).toContain('#22C55E') // color de victoria
    expect(html).toContain('dg-result-dot')
  })

  it('embebe el escudo de liga solo si es un data URL de imagen', () => {
    const ok = buildInformeHtml({ informe: makeInforme({ ligaCrestDataUrl: 'data:image/png;base64,AAAA' }), stats: emptyStats, matrix: emptyMatrix, defs: emptyDefs })
    expect(ok).toContain('class="dg-liga-crest"')
    expect(ok).toContain('data:image/png;base64,AAAA')

    const bad = buildInformeHtml({ informe: makeInforme({ ligaCrestDataUrl: 'javascript:alert(1)' }), stats: emptyStats, matrix: emptyMatrix, defs: emptyDefs })
    expect(bad).not.toContain('class="dg-liga-crest"')
    expect(bad).not.toContain('javascript:alert(1)')
  })

  it('renderiza traspasos y solo embebe logos con URL http(s)', () => {
    const transfers: PlayerTransfer[] = [
      { date: '2025-07-01', type: 'Transfer', fee: '€5M', teams: { out: { id: 1, name: 'Vélez', logo: 'https://media/v.png' }, in: { id: 2, name: 'Benfica', logo: 'javascript:alert(1)' } } },
    ]
    const html = buildInformeHtml({ informe: makeInforme(), stats: emptyStats, matrix: emptyMatrix, defs: emptyDefs, transfers })
    expect(html).toContain('Historial de traspasos')
    expect(html).toContain('Vélez')
    expect(html).toContain('Benfica')
    expect(html).toContain('https://media/v.png')
    expect(html).not.toContain('javascript:alert(1)')
  })

  it('muestra el estado vacío de traspasos cuando no hay', () => {
    const html = buildInformeHtml({ informe: makeInforme(), stats: emptyStats, matrix: emptyMatrix, defs: emptyDefs, transfers: [] })
    expect(html).toContain('Sin traspasos registrados')
  })

  it('muestra el "Rating del informe" solo si hay métricas elegidas y no está oculto', () => {
    const stats = [makeStat(80, 'a'), makeStat(60, 'b')]
    const withRating = buildInformeHtml({
      informe: makeInforme({ informeRatingMetrics: ['a', 'b'] }),
      stats, matrix: emptyMatrix, defs: emptyDefs,
    })
    expect(withRating).toContain('class="dg-inf-rating"')
    expect(withRating).toContain('Rating del informe')
    expect(withRating).toContain('7.0') // promedio 70 => nota 7.0
    expect(withRating).toContain('Contexto de prueba')

    // Sin métricas elegidas: no aparece.
    const noMetrics = buildInformeHtml({ informe: makeInforme(), stats, matrix: emptyMatrix, defs: emptyDefs })
    expect(noMetrics).not.toContain('class="dg-inf-rating"')

    // Oculto explícitamente: no aparece aunque haya métricas.
    const hidden = buildInformeHtml({
      informe: makeInforme({ informeRatingMetrics: ['a', 'b'], hideInformeRating: true }),
      stats, matrix: emptyMatrix, defs: emptyDefs,
    })
    expect(hidden).not.toContain('class="dg-inf-rating"')
  })
})

describe('informeRating', () => {
  it('convierte el promedio de percentiles a nota 1..10 con 1 decimal', () => {
    expect(informeRating([makeStat(70, 'a'), makeStat(90, 'b')], ['a', 'b'])).toBe(8)
    expect(informeRating([makeStat(73, 'a')], ['a'])).toBe(7.3)
  })
  it('solo considera las métricas elegidas', () => {
    // Elige solo 'a' (percentil 40 => 4.0); ignora 'b' (percentil 90).
    expect(informeRating([makeStat(40, 'a'), makeStat(90, 'b')], ['a'])).toBe(4)
  })
  it('clampa a [1, 10]', () => {
    expect(informeRating([makeStat(0, 'a')], ['a'])).toBe(1)
    expect(informeRating([makeStat(100, 'a')], ['a'])).toBe(10)
  })
  it('devuelve null sin métricas elegidas', () => {
    expect(informeRating([makeStat(80, 'a')], undefined)).toBeNull()
    expect(informeRating([makeStat(80, 'a')], [])).toBeNull()
  })
  it('devuelve null si las métricas elegidas no tienen percentil', () => {
    expect(informeRating([makeStat(null, 'a')], ['a'])).toBeNull()
    // Métrica elegida inexistente en stats => null.
    expect(informeRating([makeStat(80, 'a')], ['zzz'])).toBeNull()
  })
})
