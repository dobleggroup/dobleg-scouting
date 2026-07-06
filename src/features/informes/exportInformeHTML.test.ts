import { describe, it, expect } from 'vitest'
import { buildInformeHtml } from './exportInformeHTML'
import type { Informe, MetricDef, MetricStat } from './types'

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
    expect(htmlValid).toContain('https://www.youtube.com/embed/abc12345')

    const withInvalid = makeInforme({
      content: { ...makeInforme().content, videoUrl: 'not-a-video-url' },
    })
    const htmlInvalid = buildInformeHtml({
      informe: withInvalid,
      stats: emptyStats,
      matrix: emptyMatrix,
      defs: emptyDefs,
    })
    expect(htmlInvalid).not.toContain('youtube.com/embed')
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
    expect(html).toContain('Comparación de jugadores')
    expect(html).toContain('&lt;b&gt;Rival Peligroso&lt;/b&gt;')
    expect(html).not.toContain('<b>Rival Peligroso</b>')
  })
})
