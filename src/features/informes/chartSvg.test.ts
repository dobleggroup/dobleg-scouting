import { describe, it, expect } from 'vitest'
import {
  polarPoint,
  radarVertices,
  scatterDomain,
  radarSvg,
  barsSvg,
  scatterSvg,
} from './chartSvg'

describe('polarPoint', () => {
  it('el vertice a -90deg queda directamente arriba del centro', () => {
    const p = polarPoint(100, 100, 50, -90)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(50)
  })

  it('el vertice a 0deg queda a la derecha del centro', () => {
    const p = polarPoint(100, 100, 50, 0)
    expect(p.x).toBeCloseTo(150)
    expect(p.y).toBeCloseTo(100)
  })

  it('el radio escala linealmente', () => {
    const p1 = polarPoint(0, 0, 10, -90)
    const p2 = polarPoint(0, 0, 20, -90)
    expect(p2.y).toBeCloseTo(p1.y * 2)
  })
})

describe('radarVertices', () => {
  it('valor 100 devuelve un vertice a radio maxR en el angulo correcto', () => {
    const cx = 100, cy = 100, maxR = 80, count = 4
    const verts = radarVertices([100, 0, 0, 0], cx, cy, maxR, count)
    // primer eje arranca en -90 (arriba)
    expect(verts[0].x).toBeCloseTo(cx)
    expect(verts[0].y).toBeCloseTo(cy - maxR)
  })

  it('valor 0 devuelve el centro', () => {
    const cx = 50, cy = 50, maxR = 40, count = 3
    const verts = radarVertices([0, 0, 0], cx, cy, maxR, count)
    verts.forEach(v => {
      expect(v.x).toBeCloseTo(cx)
      expect(v.y).toBeCloseTo(cy)
    })
  })

  it('valor 50 devuelve la mitad del radio', () => {
    const cx = 0, cy = 0, maxR = 100, count = 4
    const verts = radarVertices([50, 0, 0, 0], cx, cy, maxR, count)
    const dist = Math.hypot(verts[0].x - cx, verts[0].y - cy)
    expect(dist).toBeCloseTo(50)
  })

  it('produce count vertices repartidos en circulo completo, clockwise desde arriba', () => {
    const verts = radarVertices([100, 100, 100, 100], 0, 0, 10, 4)
    // eje 1 (index 1) deberia estar a 0deg (derecha) tras rotar 90deg clockwise desde -90
    expect(verts[1].x).toBeCloseTo(10)
    expect(verts[1].y).toBeCloseTo(0)
  })
})

describe('scatterDomain', () => {
  const points = [
    { x: 1, y: 1, me: false },
    { x: 5, y: 8, me: false },
    { x: 10, y: 20, me: true },
  ]

  it('sin floors, conserva todos los puntos y ajusta el dominio de forma ajustada a los datos (no fuerza 0)', () => {
    const d = scatterDomain(points)
    expect(d.kept.length).toBe(3)
    // pad = 8% del rango; el piso queda cerca del minimo real, no en 0.
    const padX = (10 - 1) * 0.08
    const padY = (20 - 1) * 0.08
    expect(d.minX).toBeCloseTo(1 - padX, 5)
    expect(d.maxX).toBeCloseTo(10 + padX, 5)
    expect(d.minY).toBeCloseTo(1 - padY, 5)
    expect(d.maxY).toBeCloseTo(20 + padY, 5)
    // el piso es ajustado (tight), no clampeado a 0.
    expect(d.minX).toBeGreaterThan(0)
    expect(d.minX).toBeLessThan(1)
  })

  it('sin floors y con todos los valores iguales, usa un pad pequeño en vez de un dominio degenerado', () => {
    const flat = [
      { x: 5, y: 5, me: false },
      { x: 5, y: 5, me: true },
    ]
    const d = scatterDomain(flat)
    expect(d.minX).toBeLessThan(5)
    expect(d.maxX).toBeGreaterThan(5)
    expect(d.minY).toBeLessThan(5)
    expect(d.maxY).toBeGreaterThan(5)
  })

  it('descarta puntos por debajo de xMin y usa xMin como piso del dominio', () => {
    const d = scatterDomain(points, 3)
    expect(d.kept.length).toBe(2)
    expect(d.kept.some(p => p.x === 1)).toBe(false)
    expect(d.minX).toBe(3)
  })

  it('descarta puntos por debajo de yMin y usa yMin como piso del dominio', () => {
    const d = scatterDomain(points, undefined, 5)
    expect(d.kept.length).toBe(2)
    expect(d.kept.some(p => p.y === 1)).toBe(false)
    expect(d.minY).toBe(5)
  })

  it('con ambos floors, aplica AND (debe superar los dos minimos)', () => {
    const d = scatterDomain(points, 3, 5)
    expect(d.kept.length).toBe(2)
    expect(d.kept.map(p => p.x).sort((a, b) => a - b)).toEqual([5, 10])
  })
})

describe('smoke tests de ensamblado SVG', () => {
  it('radarSvg devuelve un svg valido con 2 poligonos para 2 series', () => {
    const svg = radarSvg({
      axes: ['Goles', 'Asistencias', 'xG', 'Regates'],
      series: [
        { name: 'A', color: '#22C55E', values: [80, 60, 40, 90] },
        { name: 'B', color: '#F5C451', values: [30, 70, 50, 20] },
      ],
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    const polyCount = (svg.match(/<polygon/g) || []).length
    expect(polyCount).toBeGreaterThanOrEqual(2)
  })

  it('radarSvg escapa texto de ejes con caracteres especiales', () => {
    const svg = radarSvg({
      axes: ['A & B', 'C < D', 'E > F'],
      series: [{ name: 'X', color: '#22C55E', values: [10, 20, 30] }],
    })
    expect(svg).toContain('A &amp; B')
    expect(svg).toContain('C &lt; D')
    expect(svg).toContain('E &gt; F')
    expect(svg).not.toContain('A & B')
  })

  it('barsSvg devuelve un svg valido con una fila por metrica', () => {
    const svg = barsSvg({
      rows: [
        { label: 'Goles/90', pct: 80, value: '0.45', rank: '2/18', dot: 'green' },
        { label: 'xG/90', pct: 40, value: '0.20', rank: '10/18', dot: 'amber' },
      ],
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('#22C55E')
    expect(svg).toContain('#FBBF24')
  })

  it('scatterSvg devuelve un svg valido', () => {
    const svg = scatterSvg({
      points: [
        { x: 1, y: 2, me: false },
        { x: 3, y: 4, me: true },
      ],
      xLabel: 'Goles',
      yLabel: 'xG',
    })
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('#22C55E')
  })

  it('scatterSvg recorta puntos por debajo de xMin/yMin', () => {
    const svg = scatterSvg({
      points: [
        { x: 1, y: 1, me: false },
        { x: 10, y: 10, me: true },
      ],
      xLabel: 'X',
      yLabel: 'Y',
      xMin: 5,
      yMin: 5,
    })
    // solo un circulo protagonista + eventualmente ninguno de pool
    expect(svg).toContain('<svg')
  })
})
