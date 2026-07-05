# Informes — Armador de informes de jugador · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueva página *Informes* que arma un informe profesional de un jugador a partir de un archivo Wyscout (.xlsx/.csv/.xml), con métricas inteligentes, semáforo vs. el pool del archivo, contenido editorial y export a PDF de alta fidelidad.

**Architecture:** Módulos de lógica pura y testeables (parseo, registry de métricas, métricas derivadas, stats/semáforo, persistencia) bajo `src/features/informes/`, más una UI de wizard de 4 pasos (`InformesPage` + `components/`) que los orquesta. El pool de comparación son las demás filas del archivo. El PDF se genera capturando cada sección del preview por separado y paginándolas sin partir bloques.

**Tech Stack:** React 18 + TS, Vite, Tailwind, Recharts, PapaParse (ya instalado), SheetJS `xlsx` (nuevo), `DOMParser` (XML, nativo), `html-to-image` + `jsPDF` (ya instalados), vitest (ya instalado).

## Global Constraints

- **Fuera de alcance:** flujo PRO/email de los mockups. Persistencia solo `localStorage`. Sin link de Google Sheet.
- **Path alias:** importar con `@/` (mapea a `./src/`).
- **Tests:** vitest, colocados como `*.test.ts` junto al código (`include: ['src/**/*.test.ts']`, env global `node`). Comando: `npm test` (= `vitest run`). Un archivo puede pedir jsdom con el docblock `// @vitest-environment jsdom` en la línea 1.
- **Reutilizar:** `normalizeForSearch`/`fuzzyMatch`/`smartSearch` de `@/lib/search`; `getScoreColorClass`/`getScoreBgClass` de `@/components/ui/ScoreBar`; patrón de export de `@/pages/BusquedaPage` (funciones `exportToPDF`/`exportInformeCanva`); logos en `/brand/logo-black.png` y `/brand/logo-white.png`.
- **Semáforo:** 🟢 percentil ≥ 66 · 🟡 33–66 · 🔴 < 33. Métricas divergentes (ej. Goles−xG) colorean por signo.
- **Commits:** frecuentes, uno por task. Terminar el mensaje con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

```
src/pages/InformesPage.tsx                     # orquesta wizard + estado del Informe (Task 7+)
src/features/informes/
  types.ts                                     # Task 1
  metricRegistry.ts + .test.ts                 # Task 3
  derivedMetrics.ts + .test.ts                 # Task 4
  computeStats.ts + .test.ts                   # Task 5
  parseFile.ts + .test.ts                      # Task 2
  informesStore.ts + .test.ts                  # Task 6
  components/
    Stepper.tsx                                # Task 7
    Step1Archivo.tsx                           # Task 8
    Step2Metricas.tsx                          # Task 9
    Step3Contenido.tsx                         # Task 10
    Step4Preview.tsx                           # Task 11
    charts/InformeRadar.tsx                     # Task 11
    charts/InformeBars.tsx                      # Task 11
    charts/InformeScatter.tsx                   # Task 11
    charts/InformeNumberCard.tsx                # Task 11
  exportInformePDF.ts                          # Task 12
src/App.tsx                                     # Modify: ruta (Task 7)
src/components/layout/Navbar.tsx               # Modify: nav item (Task 7)
```

---

## Task 1: Tipos base + dependencias

**Files:**
- Create: `src/features/informes/types.ts`
- Modify: `package.json` (deps)

**Interfaces:**
- Produces: todos los tipos que consumen las tareas siguientes (`Row`, `ParsedFile`, `MetricDef`, `MetricStat`, `ChartAssignments`, `ScatterAssignment`, `MatchRow`, `Comparable`, `InformeContent`, `Informe`).

- [ ] **Step 1: Instalar dependencias**

Run:
```bash
npm install xlsx@0.18.5
npm install -D jsdom@25.0.1
```
Expected: ambos paquetes quedan en `package.json`.

- [ ] **Step 2: Crear `src/features/informes/types.ts`**

```ts
// Fila cruda del archivo: header -> valor
export type Row = Record<string, string | number>

export interface ParsedFile {
  headers: string[]
  rows: Row[]
}

// Definición de una métrica (base o derivada)
export interface MetricDef {
  key: string
  label: string
  short: string
  unit: '%' | '/90' | 'm' | ''
  higherIsBetter: boolean
  diverging?: boolean   // true = puede ser +/- (ej. Goles - xG); colorea por signo
  derived?: boolean     // true = calculada por regla, no viene del archivo
  sourceHeader?: string // header original del archivo (solo métricas base)
}

// Stat calculada del protagonista vs pool
export interface MetricStat {
  def: MetricDef
  value: number | null
  avg: number | null
  percentile: number | null           // 0..100
  color: 'green' | 'amber' | 'red' | 'neutral'
  rank: number | null                 // 1 = mejor del pool
  total: number                       // tamaño del grupo (pool + protagonista)
}

// Asignaciones de métricas a gráficos
export interface ScatterAssignment { xKey: string; yKey: string; caption: string }
export interface ChartAssignments {
  radar: string[]                     // metric keys
  bar: string[]
  numbers: string[]
  scatters: ScatterAssignment[]
}

// Contenido editorial
export interface MatchRow { rival: string; resultado: string; rating: string; minutos: string }
export interface Comparable { jugador: string; club: string; rating: string; delta: string }
export interface InformeContent {
  nombre: string; club: string; posicion: string; rol: string
  edad: string; nacionalidad: string; liga: string; contrato: string; valorMercado: string
  hideMainStats: boolean
  rating: string; pj: string; minutos: string; goles: string; asistencias: string
  lecturaAutor: string; lecturaTexto: string
  videoUrl: string; transfermarktUrl: string; representante: string
  ultimos5: MatchRow[]
  hideComparables: boolean
  comparables: Comparable[]
  comparaciones: string
}

// Modelo persistible
export interface Informe {
  id: string
  createdAt: string
  updatedAt: string
  contextoComparacion: string
  fotoDataUrl: string | null
  protagonistIndex: number            // índice de la fila protagonista en rows
  content: InformeContent
  charts: ChartAssignments
  headers: string[]
  rows: Row[]
  columnMap: Record<string, string>   // header -> metric key
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores en `types.ts`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/features/informes/types.ts
git commit -m "feat(informes): tipos base y dependencias (xlsx, jsdom)"
```

---

## Task 2: Parseo de archivos (.csv / .xlsx / .xml)

**Files:**
- Create: `src/features/informes/parseFile.ts`
- Test: `src/features/informes/parseFile.test.ts`

**Interfaces:**
- Consumes: `ParsedFile`, `Row` de `./types`.
- Produces:
  - `parseCsv(text: string): ParsedFile`
  - `parseXml(text: string): ParsedFile`
  - `parseXlsxBuffer(buf: ArrayBuffer): Promise<ParsedFile>`
  - `parseInformeFile(file: File): Promise<ParsedFile>` (dispatch por extensión)

- [ ] **Step 1: Escribir el test (falla)**

`src/features/informes/parseFile.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseCsv, parseXml, parseXlsxBuffer } from './parseFile'

describe('parseCsv', () => {
  it('devuelve headers y filas tipadas', () => {
    const csv = 'Jugador,Goles,xG\nYuri Oyarzo,2,0.71\nOtro Jugador,1,1.4'
    const out = parseCsv(csv)
    expect(out.headers).toEqual(['Jugador', 'Goles', 'xG'])
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].Jugador).toBe('Yuri Oyarzo')
    expect(out.rows[0].Goles).toBe(2)     // numérico
    expect(out.rows[0].xG).toBe(0.71)
  })
})

describe('parseXml', () => {
  it('lee filas repetidas de elementos como registros', () => {
    const xml =
      '<data><player><Jugador>Yuri Oyarzo</Jugador><Goles>2</Goles></player>' +
      '<player><Jugador>Otro</Jugador><Goles>1</Goles></player></data>'
    const out = parseXml(xml)
    expect(out.headers).toEqual(['Jugador', 'Goles'])
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].Jugador).toBe('Yuri Oyarzo')
    expect(out.rows[1].Goles).toBe(1)
  })
})

describe('parseXlsxBuffer', () => {
  it('lee la primera hoja como registros', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Jugador', 'Goles'],
      ['Yuri Oyarzo', 2],
      ['Otro', 1],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const out = await parseXlsxBuffer(buf)
    expect(out.headers).toEqual(['Jugador', 'Goles'])
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].Goles).toBe(2)
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/features/informes/parseFile.test.ts`
Expected: FAIL ("parseCsv is not a function" / módulo inexistente).

- [ ] **Step 3: Implementar `src/features/informes/parseFile.ts`**

```ts
import Papa from 'papaparse'
import type { ParsedFile, Row } from './types'

function coerce(v: unknown): string | number {
  if (v == null || v === '') return ''
  if (typeof v === 'number') return v
  const s = String(v).trim()
  // número con coma o punto decimal
  const normalized = s.replace(/\./g, '').includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(normalized)
  return normalized !== '' && !Number.isNaN(n) ? n : s
}

export function parseCsv(text: string): ParsedFile {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  const grid = res.data as unknown as string[][]
  if (!grid.length) return { headers: [], rows: [] }
  const headers = grid[0].map(h => String(h).trim())
  const rows: Row[] = grid.slice(1).map(cells => {
    const row: Row = {}
    headers.forEach((h, i) => { row[h] = coerce(cells[i]) })
    return row
  })
  return { headers, rows }
}

export function parseXml(text: string): ParsedFile {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('XML inválido')
  // Heurística: el nodo raíz tiene hijos "fila" repetidos; cada fila tiene hijos = columnas.
  const root = doc.documentElement
  const rowEls = Array.from(root.children)
  const headerSet: string[] = []
  const rows: Row[] = rowEls.map(rowEl => {
    const row: Row = {}
    Array.from(rowEl.children).forEach(col => {
      const key = col.tagName
      if (!headerSet.includes(key)) headerSet.push(key)
      row[key] = coerce(col.textContent)
    })
    return row
  })
  return { headers: headerSet, rows }
}

export async function parseXlsxBuffer(buf: ArrayBuffer): Promise<ParsedFile> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false })
  if (!grid.length) return { headers: [], rows: [] }
  const headers = (grid[0] as unknown[]).map(h => String(h).trim())
  const rows: Row[] = (grid.slice(1) as unknown[][]).map(cells => {
    const row: Row = {}
    headers.forEach((h, i) => { row[h] = coerce(cells[i]) })
    return row
  })
  return { headers, rows }
}

export async function parseInformeFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return parseCsv(await file.text())
  if (name.endsWith('.xml')) return parseXml(await file.text())
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsxBuffer(await file.arrayBuffer())
  throw new Error(`Formato no soportado: ${file.name}`)
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/features/informes/parseFile.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/informes/parseFile.ts src/features/informes/parseFile.test.ts
git commit -m "feat(informes): parseo de csv/xlsx/xml a ParsedFile"
```

---

## Task 3: Registry de métricas (header → métrica canónica)

**Files:**
- Create: `src/features/informes/metricRegistry.ts`
- Test: `src/features/informes/metricRegistry.test.ts`

**Interfaces:**
- Consumes: `MetricDef` de `./types`.
- Produces:
  - `normalizeHeader(h: string): string`
  - `INFORME_METRICS: Array<MetricDef & { aliases: string[] }>`
  - `matchHeaderToMetric(header: string): MetricDef | null`
  - `buildColumnMap(headers: string[]): { columnMap: Record<string, string>; defs: MetricDef[] }`
    (headers no reconocidos pero numéricos → métrica cruda `higherIsBetter: true`; `columnMap` mapea header→key)

- [ ] **Step 1: Escribir el test (falla)**

`src/features/informes/metricRegistry.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeHeader, matchHeaderToMetric, buildColumnMap } from './metricRegistry'

describe('normalizeHeader', () => {
  it('quita acentos, mayúsculas, barras y porcentajes', () => {
    expect(normalizeHeader('Regates / 90')).toBe('regates 90')
    expect(normalizeHeader('Duelos ganados, %')).toBe('duelos ganados')
    expect(normalizeHeader('xG')).toBe('xg')
  })
})

describe('matchHeaderToMetric', () => {
  it('matchea variantes de un header al mismo metric key', () => {
    expect(matchHeaderToMetric('Goles')?.key).toBe('goals')
    expect(matchHeaderToMetric('xG')?.key).toBe('xg')
    expect(matchHeaderToMetric('Regates/90')?.key).toBe('dribbles_p90')
    expect(matchHeaderToMetric('Regates realizados, %')?.key).toBe('dribbles_pct')
  })
  it('devuelve null si no reconoce', () => {
    expect(matchHeaderToMetric('Columna rara XYZ')).toBeNull()
  })
})

describe('buildColumnMap', () => {
  it('mapea headers conocidos y crea métrica cruda para desconocidos', () => {
    const { columnMap, defs } = buildColumnMap(['Jugador', 'Goles', 'Metrica Nueva'])
    expect(columnMap['Goles']).toBe('goals')
    // 'Jugador' no es numérica/métrica -> no está en el map
    expect(columnMap['Jugador']).toBeUndefined()
    // 'Metrica Nueva' -> métrica cruda con key derivada del header
    const rawKey = columnMap['Metrica Nueva']
    expect(rawKey).toBeDefined()
    const rawDef = defs.find(d => d.key === rawKey)
    expect(rawDef?.higherIsBetter).toBe(true)
    expect(rawDef?.label).toBe('Metrica Nueva')
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/features/informes/metricRegistry.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/features/informes/metricRegistry.ts`**

```ts
import { normalizeForSearch } from '@/lib/search'
import type { MetricDef } from './types'

export function normalizeHeader(h: string): string {
  return normalizeForSearch(h)
    .replace(/[/%()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type MetricSeed = MetricDef & { aliases: string[] }

// Catálogo canónico. `aliases` = variantes de header (se normalizan al comparar).
export const INFORME_METRICS: MetricSeed[] = [
  { key: 'goals', label: 'Goles', short: 'Goles', unit: '', higherIsBetter: true, aliases: ['Goles', 'Goals'] },
  { key: 'xg', label: 'xG', short: 'xG', unit: '', higherIsBetter: true, aliases: ['xG', 'Goles esperados', 'Expected goals'] },
  { key: 'assists', label: 'Asistencias', short: 'Asist', unit: '', higherIsBetter: true, aliases: ['Asistencias', 'Assists'] },
  { key: 'xa', label: 'xA', short: 'xA', unit: '', higherIsBetter: true, aliases: ['xA', 'Asistencias esperadas', 'Expected assists'] },
  { key: 'dribbles_p90', label: 'Regates /90', short: 'Reg/90', unit: '/90', higherIsBetter: true, aliases: ['Regates/90', 'Regates', 'Dribbles/90'] },
  { key: 'dribbles_pct', label: 'Regates completados, %', short: 'Reg%', unit: '%', higherIsBetter: true, aliases: ['Regates realizados, %', 'Regates completados, %', 'Dribbles, %'] },
  { key: 'shots_p90', label: 'Remates /90', short: 'Rem/90', unit: '/90', higherIsBetter: true, aliases: ['Remates/90', 'Tiros/90', 'Shots/90'] },
  { key: 'shots_on_pct', label: 'Tiros a puerta, %', short: 'TP%', unit: '%', higherIsBetter: true, aliases: ['Tiros a puerta, %', 'Remates a puerta, %', 'Shots on target, %'] },
  { key: 'duels_p90', label: 'Duelos /90', short: 'Duel/90', unit: '/90', higherIsBetter: true, aliases: ['Duelos/90', 'Duels/90'] },
  { key: 'duels_won_pct', label: 'Duelos ganados, %', short: 'Duel%', unit: '%', higherIsBetter: true, aliases: ['Duelos ganados, %', 'Duels won, %'] },
  { key: 'tackles_p90', label: 'Entradas /90', short: 'Ent/90', unit: '/90', higherIsBetter: true, aliases: ['Entradas/90', 'Tackles/90'] },
  { key: 'fouls_drawn_p90', label: 'Faltas recibidas /90', short: 'FR/90', unit: '/90', higherIsBetter: true, aliases: ['Faltas recibidas/90', 'Fouls suffered/90'] },
  { key: 'pass_len', label: 'Longitud media pases, m', short: 'LMP', unit: 'm', higherIsBetter: true, aliases: ['Longitud media pases, m', 'Average pass length, m'] },
]

// Índice alias-normalizado -> MetricDef (sin aliases)
const ALIAS_INDEX = new Map<string, MetricDef>()
for (const m of INFORME_METRICS) {
  const { aliases, ...def } = m
  for (const a of aliases) ALIAS_INDEX.set(normalizeHeader(a), def)
}

export function matchHeaderToMetric(header: string): MetricDef | null {
  return ALIAS_INDEX.get(normalizeHeader(header)) ?? null
}

function rawKey(header: string): string {
  return 'raw_' + normalizeHeader(header).replace(/\s+/g, '_')
}

// Headers que nunca son métricas numéricas (identidad del jugador)
const NON_METRIC = new Set(['jugador', 'player', 'nombre', 'name', 'equipo', 'team', 'club', 'posicion', 'position', 'pie', 'foot', 'nacionalidad', 'pais', 'id'])

export function buildColumnMap(headers: string[]): { columnMap: Record<string, string>; defs: MetricDef[] } {
  const columnMap: Record<string, string> = {}
  const defs: MetricDef[] = []
  for (const h of headers) {
    if (NON_METRIC.has(normalizeHeader(h))) continue
    const matched = matchHeaderToMetric(h)
    if (matched) {
      columnMap[h] = matched.key
      defs.push({ ...matched, sourceHeader: h })
    } else {
      const key = rawKey(h)
      columnMap[h] = key
      defs.push({ key, label: h, short: h.slice(0, 8), unit: '', higherIsBetter: true, sourceHeader: h })
    }
  }
  return { columnMap, defs }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/features/informes/metricRegistry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/informes/metricRegistry.ts src/features/informes/metricRegistry.test.ts
git commit -m "feat(informes): registry de metricas con alias y fallback crudo"
```

---

## Task 4: Métricas inteligentes derivadas

**Files:**
- Create: `src/features/informes/derivedMetrics.ts`
- Test: `src/features/informes/derivedMetrics.test.ts`

**Interfaces:**
- Consumes: `MetricDef` de `./types`.
- Produces:
  - `DERIVED_RULES: DerivedRule[]` con `DerivedRule = { def: MetricDef; requires: string[]; compute: (m: Record<string, number>) => number }`
  - `applyDerived(baseDefs: MetricDef[], matrix: Record<string, (number|null)[]>): { defs: MetricDef[]; matrix: Record<string, (number|null)[]> }`
    (agrega columnas derivadas fila por fila cuando TODAS las `requires` existen en `matrix`)

- [ ] **Step 1: Escribir el test (falla)**

`src/features/informes/derivedMetrics.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { applyDerived } from './derivedMetrics'
import type { MetricDef } from './types'

const baseDef = (key: string): MetricDef => ({ key, label: key, short: key, unit: '', higherIsBetter: true })

describe('applyDerived', () => {
  it('crea gambetas completadas/90 = regates/90 * %/100', () => {
    const defs = [baseDef('dribbles_p90'), baseDef('dribbles_pct')]
    const matrix = { dribbles_p90: [4, 2], dribbles_pct: [50, 100] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['dribbles_completed_p90']).toEqual([2, 2])
    expect(out.defs.some(d => d.key === 'dribbles_completed_p90' && d.derived)).toBe(true)
  })

  it('crea Goles - xG como métrica divergente', () => {
    const defs = [baseDef('goals'), baseDef('xg')]
    const matrix = { goals: [2, 1], xg: [0.71, 1.4] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg'][0]).toBeCloseTo(1.29)
    expect(out.matrix['goals_minus_xg'][1]).toBeCloseTo(-0.4)
    expect(out.defs.find(d => d.key === 'goals_minus_xg')?.diverging).toBe(true)
  })

  it('no crea la derivada si falta un input', () => {
    const defs = [baseDef('goals')]
    const matrix = { goals: [2] }
    const out = applyDerived(defs, matrix)
    expect(out.matrix['goals_minus_xg']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/features/informes/derivedMetrics.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/features/informes/derivedMetrics.ts`**

```ts
import type { MetricDef } from './types'

export interface DerivedRule {
  def: MetricDef
  requires: string[]
  compute: (m: Record<string, number>) => number
}

export const DERIVED_RULES: DerivedRule[] = [
  {
    def: { key: 'dribbles_completed_p90', label: 'Gambetas completadas /90', short: 'GamC/90', unit: '/90', higherIsBetter: true, derived: true },
    requires: ['dribbles_p90', 'dribbles_pct'],
    compute: m => m.dribbles_p90 * (m.dribbles_pct / 100),
  },
  {
    def: { key: 'goals_minus_xg', label: 'Goles − xG', short: 'G−xG', unit: '', higherIsBetter: true, diverging: true, derived: true },
    requires: ['goals', 'xg'],
    compute: m => m.goals - m.xg,
  },
  {
    def: { key: 'assists_minus_xa', label: 'Asistencias − xA', short: 'A−xA', unit: '', higherIsBetter: true, diverging: true, derived: true },
    requires: ['assists', 'xa'],
    compute: m => m.assists - m.xa,
  },
  {
    def: { key: 'shots_on_p90', label: 'Remates al arco /90', short: 'RA/90', unit: '/90', higherIsBetter: true, derived: true },
    requires: ['shots_p90', 'shots_on_pct'],
    compute: m => m.shots_p90 * (m.shots_on_pct / 100),
  },
  {
    def: { key: 'duels_won_p90', label: 'Duelos ganados /90', short: 'DG/90', unit: '/90', higherIsBetter: true, derived: true },
    requires: ['duels_p90', 'duels_won_pct'],
    compute: m => m.duels_p90 * (m.duels_won_pct / 100),
  },
]

export function applyDerived(
  baseDefs: MetricDef[],
  matrix: Record<string, (number | null)[]>,
): { defs: MetricDef[]; matrix: Record<string, (number | null)[]> } {
  const defs = [...baseDefs]
  const outMatrix: Record<string, (number | null)[]> = { ...matrix }
  const rowCount = Object.values(matrix)[0]?.length ?? 0
  const present = new Set(baseDefs.map(d => d.key))

  for (const rule of DERIVED_RULES) {
    if (!rule.requires.every(k => present.has(k))) continue
    const col: (number | null)[] = []
    for (let i = 0; i < rowCount; i++) {
      const inputs: Record<string, number> = {}
      let ok = true
      for (const k of rule.requires) {
        const v = matrix[k][i]
        if (v == null || Number.isNaN(v)) { ok = false; break }
        inputs[k] = v
      }
      col.push(ok ? rule.compute(inputs) : null)
    }
    outMatrix[rule.def.key] = col
    defs.push(rule.def)
  }
  return { defs, matrix: outMatrix }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/features/informes/derivedMetrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/informes/derivedMetrics.ts src/features/informes/derivedMetrics.test.ts
git commit -m "feat(informes): motor de metricas derivadas inteligentes"
```

---

## Task 5: Matriz de valores + stats/semáforo

**Files:**
- Create: `src/features/informes/computeStats.ts`
- Test: `src/features/informes/computeStats.test.ts`

**Interfaces:**
- Consumes: `ParsedFile`, `MetricDef`, `MetricStat` de `./types`; `buildColumnMap` de `./metricRegistry`; `applyDerived` de `./derivedMetrics`.
- Produces:
  - `buildMatrix(parsed: ParsedFile, columnMap: Record<string,string>, baseDefs: MetricDef[]): { defs: MetricDef[]; matrix: Record<string,(number|null)[]> }`
  - `percentile(values: (number|null)[], value: number, higherIsBetter: boolean): number`
  - `computeStats(defs: MetricDef[], matrix: Record<string,(number|null)[]>, protagonistIndex: number): MetricStat[]`

- [ ] **Step 1: Escribir el test (falla)**

`src/features/informes/computeStats.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { percentile, computeStats } from './computeStats'
import type { MetricDef } from './types'

const def = (over: Partial<MetricDef>): MetricDef => ({ key: 'k', label: 'k', short: 'k', unit: '', higherIsBetter: true, ...over })

describe('percentile', () => {
  it('mayor-es-mejor: el máximo da 100', () => {
    expect(percentile([1, 2, 3, 4], 4, true)).toBe(100)
    expect(percentile([1, 2, 3, 4], 1, true)).toBe(0)
  })
  it('menor-es-mejor invierte', () => {
    expect(percentile([1, 2, 3, 4], 1, false)).toBe(100)
  })
})

describe('computeStats', () => {
  const defs = [def({ key: 'goals' }), def({ key: 'gc', higherIsBetter: false }), def({ key: 'gmx', diverging: true })]
  const matrix = { goals: [3, 1, 2], gc: [1, 2, 3], gmx: [0.5, -0.3, 0.0] }

  it('protagonista (idx 0) arriba del promedio en goals => verde y rank 1', () => {
    const stats = computeStats(defs, matrix, 0)
    const g = stats.find(s => s.def.key === 'goals')!
    expect(g.color).toBe('green')
    expect(g.rank).toBe(1)
    expect(g.total).toBe(3)
    expect(g.value).toBe(3)
  })

  it('métrica divergente colorea por signo', () => {
    const pos = computeStats(defs, matrix, 0).find(s => s.def.key === 'gmx')!
    const neg = computeStats(defs, matrix, 1).find(s => s.def.key === 'gmx')!
    expect(pos.color).toBe('green')  // +0.5
    expect(neg.color).toBe('red')    // -0.3
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/features/informes/computeStats.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/features/informes/computeStats.ts`**

```ts
import type { ParsedFile, MetricDef, MetricStat } from './types'
import { applyDerived } from './derivedMetrics'

export function buildMatrix(
  parsed: ParsedFile,
  columnMap: Record<string, string>,
  baseDefs: MetricDef[],
): { defs: MetricDef[]; matrix: Record<string, (number | null)[]> } {
  const matrix: Record<string, (number | null)[]> = {}
  for (const def of baseDefs) {
    const header = def.sourceHeader
    if (!header) continue
    matrix[def.key] = parsed.rows.map(r => {
      const v = r[header]
      return typeof v === 'number' && !Number.isNaN(v) ? v : null
    })
  }
  return applyDerived(baseDefs, matrix)
}

export function percentile(values: (number | null)[], value: number, higherIsBetter: boolean): number {
  const nums = values.filter((v): v is number => v != null && !Number.isNaN(v))
  if (!nums.length) return 50
  const below = nums.filter(v => (higherIsBetter ? v < value : v > value)).length
  const equal = nums.filter(v => v === value).length
  // percentil medio para empates
  return Math.round(((below + equal / 2) / nums.length) * 100)
}

function colorFrom(pct: number): MetricStat['color'] {
  if (pct >= 66) return 'green'
  if (pct >= 33) return 'amber'
  return 'red'
}

export function computeStats(
  defs: MetricDef[],
  matrix: Record<string, (number | null)[]>,
  protagonistIndex: number,
): MetricStat[] {
  return defs.map(def => {
    const col = matrix[def.key] ?? []
    const value = col[protagonistIndex] ?? null
    const nums = col.filter((v): v is number => v != null && !Number.isNaN(v))
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null

    if (value == null || !nums.length) {
      return { def, value, avg, percentile: null, color: 'neutral', rank: null, total: nums.length }
    }

    const pct = percentile(col, value, def.higherIsBetter)
    let color: MetricStat['color']
    if (def.diverging) {
      color = value > 0.1 ? 'green' : value < -0.1 ? 'red' : 'amber'
    } else {
      color = colorFrom(pct)
    }
    const better = def.higherIsBetter
      ? nums.filter(v => v > value).length
      : nums.filter(v => v < value).length
    return { def, value, avg, percentile: pct, color, rank: better + 1, total: nums.length }
  })
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/features/informes/computeStats.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/informes/computeStats.ts src/features/informes/computeStats.test.ts
git commit -m "feat(informes): matriz de valores, percentil y semaforo"
```

---

## Task 6: Persistencia en localStorage

**Files:**
- Create: `src/features/informes/informesStore.ts`
- Test: `src/features/informes/informesStore.test.ts`

**Interfaces:**
- Consumes: `Informe` de `./types`.
- Produces:
  - `saveInforme(informe: Informe): void`
  - `listInformes(): Array<Pick<Informe, 'id' | 'protagonistIndex' | 'contextoComparacion' | 'updatedAt'> & { nombre: string }>`
  - `loadInforme(id: string): Informe | null`
  - `deleteInforme(id: string): void`
  - `newInformeId(): string`

- [ ] **Step 1: Escribir el test (falla)**

`src/features/informes/informesStore.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { saveInforme, listInformes, loadInforme, deleteInforme, newInformeId } from './informesStore'
import type { Informe } from './types'

function makeInforme(id: string, nombre: string): Informe {
  return {
    id, createdAt: '2026-07-05', updatedAt: '2026-07-05',
    contextoComparacion: 'LI - Uruguay', fotoDataUrl: null, protagonistIndex: 0,
    content: { nombre } as Informe['content'],
    charts: { radar: [], bar: [], numbers: [], scatters: [] },
    headers: [], rows: [], columnMap: {},
  }
}

describe('informesStore', () => {
  beforeEach(() => localStorage.clear())

  it('guarda, lista, carga y borra', () => {
    saveInforme(makeInforme('a', 'Yuri'))
    saveInforme(makeInforme('b', 'Otro'))
    const list = listInformes()
    expect(list).toHaveLength(2)
    expect(list.find(x => x.id === 'a')?.nombre).toBe('Yuri')
    expect(loadInforme('a')?.content.nombre).toBe('Yuri')
    deleteInforme('a')
    expect(listInformes()).toHaveLength(1)
    expect(loadInforme('a')).toBeNull()
  })

  it('newInformeId genera ids distintos', () => {
    expect(newInformeId()).not.toBe(newInformeId())
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/features/informes/informesStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `src/features/informes/informesStore.ts`**

```ts
import type { Informe } from './types'

const KEY = 'scout_informes_v1'

function readAll(): Record<string, Informe> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
}
function writeAll(all: Record<string, Informe>): void {
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function saveInforme(informe: Informe): void {
  const all = readAll()
  all[informe.id] = informe
  writeAll(all)
}

export function listInformes() {
  return Object.values(readAll())
    .map(i => ({
      id: i.id,
      protagonistIndex: i.protagonistIndex,
      contextoComparacion: i.contextoComparacion,
      updatedAt: i.updatedAt,
      nombre: i.content?.nombre ?? '',
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function loadInforme(id: string): Informe | null {
  return readAll()[id] ?? null
}

export function deleteInforme(id: string): void {
  const all = readAll()
  delete all[id]
  writeAll(all)
}

let counter = 0
export function newInformeId(): string {
  counter += 1
  return `inf_${performance.now().toString(36)}_${counter}`
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run src/features/informes/informesStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/informes/informesStore.ts src/features/informes/informesStore.test.ts
git commit -m "feat(informes): persistencia de informes en localStorage"
```

---

## Task 7: Ruta, nav, shell de página y stepper

**Files:**
- Create: `src/pages/InformesPage.tsx`
- Create: `src/features/informes/components/Stepper.tsx`
- Modify: `src/App.tsx` (agregar lazy import + `<Route path="/informes" .../>`)
- Modify: `src/components/layout/Navbar.tsx` (agregar item al grupo "Búsqueda de Talento")

**Interfaces:**
- Consumes: `Informe`, `ParsedFile` de `@/features/informes/types`; `parseInformeFile`; `buildColumnMap`; `buildMatrix`; `computeStats`.
- Produces:
  - `InformesPage` (default export)
  - `Stepper({ step, setStep }: { step: number; setStep: (n: number) => void })`
  - Estado central del wizard (en `InformesPage`): `parsed`, `columnMap`, `stats` (memoizados), `informe` (`Informe`), setter `updateInforme`.

- [ ] **Step 1: Agregar la ruta en `src/App.tsx`**

Junto a los demás `lazy(...)` (línea ~26):
```tsx
const InformesPage = lazy(() => import('@/pages/InformesPage'))
```
Dentro de `<Route element={<Layout />}>`, después de `/analisis-completo` (línea ~51):
```tsx
<Route path="/informes" element={<InformesPage />} />
```

- [ ] **Step 2: Agregar el item de nav en `src/components/layout/Navbar.tsx`**

En el grupo `label: 'Búsqueda de Talento'` (línea ~50), agregar como primer link:
```tsx
{ to: '/informes', label: 'Informes', icon: 'clipboard' },
```
(usar un `icon` ya soportado por el switch de íconos del Navbar; `clipboard` ya se usa en `reportLink`).

- [ ] **Step 3: Crear `Stepper.tsx`**

Barra superior con 4 pasos (1. Excel · 2. Métricas · 3. Contenido · 4. Preview), el activo en rojo de marca, clickeable para volver a pasos ya visitados. Reflejar estilos Tailwind del proyecto (dark-first, `brand-*` y `apple-gray-*`). Estructura:
```tsx
const STEPS = ['1. Excel', '2. Métricas', '3. Contenido', '4. Preview']
export default function Stepper({ step, setStep }: { step: number; setStep: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between border-b border-apple-gray-200 dark:border-apple-gray-800 pb-3">
      {STEPS.map((label, i) => (
        <button key={label} onClick={() => setStep(i)}
          className={`text-xs font-semibold uppercase tracking-wide transition-colors ${
            i === step ? 'text-brand-red' : 'text-apple-gray-400 hover:text-apple-gray-600 dark:hover:text-apple-gray-300'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Crear `InformesPage.tsx` (shell + estado)**

Página con estado del wizard. En este task solo el shell: header, `<Stepper>`, y un placeholder por paso. El estado central y los `useMemo` de stats:
```tsx
import { useState, useMemo } from 'react'
import Stepper from '@/features/informes/components/Stepper'
import type { ParsedFile, Informe, MetricStat } from '@/features/informes/types'
import { buildColumnMap } from '@/features/informes/metricRegistry'
import { buildMatrix, computeStats } from '@/features/informes/computeStats'

const EMPTY_INFORME: Informe = { /* id/fechas se setean al crear; ver types */ } as Informe

export default function InformesPage() {
  const [step, setStep] = useState(0)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [informe, setInforme] = useState<Informe | null>(null)

  const derived = useMemo(() => {
    if (!parsed) return null
    const { columnMap, defs } = buildColumnMap(parsed.headers, parsed.rows)
    const { defs: allDefs, matrix } = buildMatrix(parsed, columnMap, defs)
    return { columnMap, defs: allDefs, matrix }
  }, [parsed])

  const stats: MetricStat[] = useMemo(() => {
    if (!parsed || !derived || !informe) return []
    return computeStats(derived.defs, derived.matrix, informe.protagonistIndex)
  }, [parsed, derived, informe])

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-apple-gray-900 dark:text-white tracking-tight">Informes</h1>
        <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">
          Subí un archivo de métricas y armá un informe profesional del jugador.
        </p>
      </div>
      <Stepper step={step} setStep={setStep} />
      {/* Pasos: se completan en Tasks 8-11 */}
      {step === 0 && <div>Paso 1 (Task 8)</div>}
      {step === 1 && <div>Paso 2 (Task 9)</div>}
      {step === 2 && <div>Paso 3 (Task 10)</div>}
      {step === 3 && <div>Paso 4 (Task 11)</div>}
    </div>
  )
}
```
Nota: definir `EMPTY_INFORME` completo (todos los campos de `InformeContent` en `''`, arrays vacíos, `charts` vacío) — se instancia al parsear el primer archivo en Task 8.

- [ ] **Step 5: Verificar en el navegador**

Run: `npm run dev`
Verificar: la ruta `/informes` carga, aparece "Informes" en el nav de *Búsqueda de Talento*, el stepper cambia de paso al clickear. Sin errores en consola.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/Navbar.tsx src/pages/InformesPage.tsx src/features/informes/components/Stepper.tsx
git commit -m "feat(informes): ruta, nav, shell de pagina y stepper"
```

---

## Task 8: Paso 1 — Archivo (dropzone + jugador + contexto + foto)

**Files:**
- Create: `src/features/informes/components/Step1Archivo.tsx`
- Modify: `src/pages/InformesPage.tsx` (montar Step1, crear `Informe` al parsear)

**Interfaces:**
- Consumes: `parseInformeFile` de `@/features/informes/parseFile`; `newInformeId` de `@/features/informes/informesStore`; `usePlayersList` de `@/hooks/usePlayerStats` (buscador DB opcional); `ParsedFile`, `Informe`.
- Produces: `Step1Archivo({ parsed, informe, onParsed, onChange, onNext })` donde
  `onParsed(parsed: ParsedFile, informe: Informe)`, `onChange(informe: Informe)`, `onNext()`.

- [ ] **Step 1: Implementar `Step1Archivo.tsx`**

Layout de dos columnas (según mockup):
- Izquierda: **dropzone** (`onDrop`/`onDragOver`/input `.xlsx,.csv,.xml`) → `parseInformeFile(file)` → crea `Informe` (id via `newInformeId()`, `protagonistIndex: 0`, `content.nombre` autocompletado desde la fila 0 usando la columna de nombre), llama `onParsed`. Muestra estado (parseando / error / N jugadores detectados). Debajo, campo **contexto de comparación** (input controlado → `content` no; va en `informe.contextoComparacion`). Debajo, **uploader de foto** (input file image → `FileReader.readAsDataURL` → `informe.fotoDataUrl`, redimensionar a máx 400px con un `<canvas>` para no inflar localStorage).
- Derecha: **Seleccionar jugador** — lista/selector de las filas del archivo (nombre · club · posición · edad) que setea `protagonistIndex`; y buscador opcional en DB (`usePlayersList`) que autocompleta campos de `content`. Botón **Siguiente →** que llama `onNext()`.

Detección de columna de nombre: primera columna cuyo header normalizado ∈ `{jugador, player, nombre, name}`; fallback a la primera columna de texto.

Redimensionado de foto (helper local):
```tsx
async function resizePhoto(file: File, max = 400): Promise<string> {
  const dataUrl = await new Promise<string>((res) => {
    const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(file)
  })
  const img = new Image(); img.src = dataUrl; await img.decode()
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = img.width * scale; canvas.height = img.height * scale
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}
```

- [ ] **Step 2: Montar en `InformesPage.tsx`**

Reemplazar el placeholder de `step === 0` por `<Step1Archivo ... />`, cableando `setParsed`, `setInforme` y `onNext={() => setStep(1)}`.

- [ ] **Step 3: Verificar en el navegador**

Run: `npm run dev`
Verificar con un CSV real (o el ejemplo `Jugador,Goles,xG\n...`): al soltar el archivo se listan los jugadores, se puede elegir protagonista, escribir contexto, subir foto, y "Siguiente" pasa al paso 2. Sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/features/informes/components/Step1Archivo.tsx src/pages/InformesPage.tsx
git commit -m "feat(informes): paso 1 archivo (dropzone, jugador, contexto, foto)"
```

---

## Task 9: Paso 2 — Métricas (lista con semáforo + asignación a gráficos)

**Files:**
- Create: `src/features/informes/components/Step2Metricas.tsx`
- Modify: `src/pages/InformesPage.tsx`

**Interfaces:**
- Consumes: `MetricStat`, `MetricDef`, `ChartAssignments`, `ScatterAssignment` de `@/features/informes/types`.
- Produces: `Step2Metricas({ stats, charts, onChangeCharts, onBack, onNext })` con
  `onChangeCharts(charts: ChartAssignments)`.

- [ ] **Step 1: Implementar `Step2Metricas.tsx`**

Layout de dos columnas (mockup):
- Izquierda: buscador de métricas + **lista de `stats`**; cada item muestra punto de semáforo (verde/ámbar/rojo/gris según `stat.color`), `def.label` y `value` formateado. Leyenda "🟢 SOBRE PROM · 🟡 EN PROM · 🔴 BAJO".
- Derecha: cuatro secciones de asignación que editan `charts`:
  - **Radar** (recomendado 5–9): chips agregables/quitables de métricas → `charts.radar: string[]`.
  - **Barras comparativas**: chips → `charts.bar: string[]`.
  - **Scatter Plots**: lista de `charts.scatters` (cada uno: select eje X, select eje Y, input caption); botón "+ Agregar scatter plot".
  - **Solo número + ranking**: chips → `charts.numbers: string[]`.
- Botones **← Volver** / **Siguiente →**.

Formateo de valor: `%` → `v.toFixed(0)`, `/90` o `''` → `v.toFixed(2)`. Color del punto: mapear `stat.color` a clases (`bg-brand-green` / `bg-amber-400` / `bg-brand-red` / `bg-apple-gray-400`).

- [ ] **Step 2: Montar en `InformesPage.tsx`**

`step === 1` → `<Step2Metricas stats={stats} charts={informe.charts} onChangeCharts={c => setInforme({...informe, charts: c})} onBack={() => setStep(0)} onNext={() => setStep(2)} />`.

- [ ] **Step 3: Verificar en el navegador**

Verificar: las métricas aparecen con su color correcto (probar con un CSV donde el protagonista sea claramente el mejor y el peor), se pueden asignar a radar/barras/scatter/números, y persisten al volver/avanzar de paso.

- [ ] **Step 4: Commit**

```bash
git add src/features/informes/components/Step2Metricas.tsx src/pages/InformesPage.tsx
git commit -m "feat(informes): paso 2 metricas con semaforo y asignacion a graficos"
```

---

## Task 10: Paso 3 — Contenido editorial

**Files:**
- Create: `src/features/informes/components/Step3Contenido.tsx`
- Modify: `src/pages/InformesPage.tsx`

**Interfaces:**
- Consumes: `InformeContent`, `MatchRow`, `Comparable` de `@/features/informes/types`.
- Produces: `Step3Contenido({ content, onChange, onBack, onNext })` con `onChange(content: InformeContent)`.

- [ ] **Step 1: Implementar `Step3Contenido.tsx`**

Formulario controlado (dos columnas, mockup) que edita `content`:
- Datos del jugador: nombre, club, posición, rol, edad, nacionalidad, liga, contrato, valor de mercado.
- Estadísticas principales (rating, PJ, minutos, goles, asistencias) + checkbox "Ocultar en el email" → `hideMainStats`.
- **Lectura táctica**: input autor + `<textarea>` de análisis (`lecturaTexto`).
- Links: video (URL), Transfermarkt, representante.
- **Últimos 5 partidos**: 5 filas editables (`ultimos5: MatchRow[]`, rival/resultado/rating/minutos).
- **Comparables**: filas editables (`comparables: Comparable[]`) + checkbox "Ocultar comparables" → `hideComparables`.
- Comparaciones: `<textarea>` `comparaciones`.
- Botones **← Volver** / **Preview del informe →**.

Todos los inputs son `value={content.x}` / `onChange={e => onChange({...content, x: e.target.value})}`.

- [ ] **Step 2: Montar en `InformesPage.tsx`**

`step === 2` → `<Step3Contenido content={informe.content} onChange={c => setInforme({...informe, content: c})} onBack={() => setStep(1)} onNext={() => setStep(3)} />`.

- [ ] **Step 3: Verificar en el navegador**

Verificar: todos los campos editan el estado y se conservan al navegar entre pasos.

- [ ] **Step 4: Commit**

```bash
git add src/features/informes/components/Step3Contenido.tsx src/pages/InformesPage.tsx
git commit -m "feat(informes): paso 3 contenido editorial"
```

---

## Task 11: Paso 4 — Preview con tabs y gráficos

**Files:**
- Create: `src/features/informes/components/Step4Preview.tsx`
- Create: `src/features/informes/components/charts/InformeRadar.tsx`
- Create: `src/features/informes/components/charts/InformeBars.tsx`
- Create: `src/features/informes/components/charts/InformeScatter.tsx`
- Create: `src/features/informes/components/charts/InformeNumberCard.tsx`
- Modify: `src/pages/InformesPage.tsx`

**Interfaces:**
- Consumes: `MetricStat`, `Informe`, `ChartAssignments` de `@/features/informes/types`; Recharts.
- Produces: `Step4Preview({ informe, stats, matrix, defs, onBack, onSave, onExport })`.
  - Los 4 charts consumen `stats`/`matrix` y una lista de metric keys.
  - Cada bloque exportable lleva `data-informe-section` (lo usa Task 12).

- [ ] **Step 1: Implementar los 4 componentes de charts**

Reutilizar los patrones de Recharts de `BusquedaPage` (radar normalizado, barras jugador-vs-promedio, scatter con `ReferenceLine` en el promedio). Interfaces:
- `InformeRadar({ stats, keys })`: normaliza jugador vs promedio del pool (usar `stat.percentile` como valor 0–100 del jugador; promedio = 50 o percentil del avg). Etiquetas = `def.short`.
- `InformeBars({ stats, keys, contexto })`: una barra por métrica con valor real, ranking `N°X` y color por `stat.color`.
- `InformeScatter({ scatter, matrix, defs, protagonistIndex })`: puntos del pool + protagonista resaltado; ejes = `scatter.xKey`/`scatter.yKey`; caption debajo.
- `InformeNumberCard({ stat })`: card con valor grande + `N°rank` + `def.label`.

- [ ] **Step 2: Implementar `Step4Preview.tsx`**

Columna izquierda: ficha (foto/`fotoDataUrl` o iniciales, club/liga/edad/país/contrato/representante, botón Transfermarkt). Derecha: tabs **Radar · Barras · Scatter · Video · Opinión · Carrera · Comparaciones**:
- Radar → `<InformeRadar>` con `charts.radar`.
- Barras → `<InformeBars>` con `charts.bar` + resumen "N por encima / N por debajo".
- Scatter → un `<InformeScatter>` por `charts.scatters`.
- Video → iframe de YouTube (parsear id de `content.videoUrl`; si vacío, placeholder).
- Opinión → render de `lecturaTexto` (markdown liviano: `**negrita**` y `[txt](url)`) + fortalezas (top métricas verdes).
- Carrera → últimos 5 partidos + datos de contrato/valor.
- Comparaciones → tabla de `comparables` + texto `comparaciones`.

Barra de acciones (arriba): **← Editar** (`onBack`), **Guardar** (`onSave`), **Exportar PDF** (`onExport`). Cada panel de tab que deba entrar al PDF envuelto en `<div data-informe-section>`.

Parseo de YouTube id (helper): aceptar `watch?v=`, `youtu.be/`, `embed/`.

- [ ] **Step 3: Montar en `InformesPage.tsx`**

`step === 3` → `<Step4Preview informe={informe} stats={stats} matrix={derived.matrix} defs={derived.defs} onBack={() => setStep(2)} onSave={handleSave} onExport={handleExport} />`. `handleSave`/`handleExport` se completan en Tasks 12–13 (por ahora stubs que logean).

- [ ] **Step 4: Verificar en el navegador**

Verificar con un archivo real: cada tab renderiza, el radar/barras/scatter usan las métricas asignadas, el video embebe, la opinión formatea negritas y links. Comparar visualmente contra los mockups.

- [ ] **Step 5: Commit**

```bash
git add src/features/informes/components/Step4Preview.tsx src/features/informes/components/charts/ src/pages/InformesPage.tsx
git commit -m "feat(informes): paso 4 preview con tabs y graficos"
```

---

## Task 12: Export PDF de alta fidelidad (captura por sección)

**Files:**
- Create: `src/features/informes/exportInformePDF.ts`
- Modify: `src/pages/InformesPage.tsx` (`handleExport`)

**Interfaces:**
- Consumes: `html-to-image` (`toPng`), `jspdf` (`jsPDF`), `Informe`.
- Produces: `exportInformePDF(opts: { rootEl: HTMLElement; nombre: string; isDark: boolean; logoDataUrl?: string }): Promise<void>`.

- [ ] **Step 1: Implementar `exportInformePDF.ts`**

Estrategia (según spec — captura por sección, paginado sin partir bloques):
```ts
import type { jsPDF as JsPdfType } from 'jspdf'

export async function exportInformePDF(opts: {
  rootEl: HTMLElement; nombre: string; isDark: boolean; logoDataUrl?: string
}): Promise<void> {
  const { toPng } = await import('html-to-image')
  const { jsPDF } = await import('jspdf')

  const bg = opts.isDark ? '#0f0f11' : '#ffffff'
  const sections = Array.from(opts.rootEl.querySelectorAll<HTMLElement>('[data-informe-section]'))
  const targets = sections.length ? sections : [opts.rootEl]

  const pdf: JsPdfType = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const usableW = pageW - margin * 2
  const headerH = opts.logoDataUrl ? 40 : 0
  let cursorY = margin + headerH

  function addHeader() {
    pdf.setFillColor(bg)
    pdf.rect(0, 0, pageW, pageH, 'F')
    if (opts.logoDataUrl) pdf.addImage(opts.logoDataUrl, 'PNG', margin, margin, 80, 24)
  }
  addHeader()

  for (const el of targets) {
    const dataUrl = await toPng(el, { pixelRatio: 3, backgroundColor: bg, skipFonts: true,
      filter: (n) => !(n instanceof HTMLImageElement &&
        (n.getAttribute('src') || '').startsWith('http') &&
        !(n.getAttribute('src') || '').startsWith(window.location.origin)) })
    const imgW = usableW
    const imgH = (el.offsetHeight / el.offsetWidth) * imgW
    if (cursorY + imgH > pageH - margin && cursorY > margin + headerH) {
      pdf.addPage(); addHeader(); cursorY = margin + headerH
    }
    pdf.addImage(dataUrl, 'PNG', margin, cursorY, imgW, imgH)
    cursorY += imgH + 16
  }

  pdf.save(`Informe_${opts.nombre.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')}.pdf`)
}
```
Nota: si una sola sección es más alta que la página, se coloca en su propia página escalando al ancho (queda entera; aceptable). El logo se carga en `handleExport` (Task) desde `/brand/logo-white.png` (dark) o `/brand/logo-black.png` (claro) como data URL (mismo patrón que `exportInformeCanva` en `BusquedaPage`).

- [ ] **Step 2: Cablear `handleExport` en `InformesPage.tsx`**

`handleExport` toma el `ref` del contenedor del preview, detecta tema (`document.documentElement.classList.contains('dark')`), carga el logo apropiado a data URL y llama `exportInformePDF`.

- [ ] **Step 3: Verificar en el navegador**

Generar un PDF real desde un informe completo. Verificar: (a) ningún gráfico queda cortado entre páginas, (b) logo presente, (c) fondo correcto en claro y oscuro, (d) se parece a la pantalla. Repetir en ambos temas.

- [ ] **Step 4: Commit**

```bash
git add src/features/informes/exportInformePDF.ts src/pages/InformesPage.tsx
git commit -m "feat(informes): export PDF por seccion, paginado sin cortes, logo y tema"
```

---

## Task 13: Guardar / cargar informes + listado de borradores

**Files:**
- Create: `src/features/informes/components/InformesList.tsx`
- Modify: `src/pages/InformesPage.tsx` (`handleSave`, autosave, cargar informe)

**Interfaces:**
- Consumes: `saveInforme`, `listInformes`, `loadInforme`, `deleteInforme` de `@/features/informes/informesStore`.
- Produces: `InformesList({ onOpen, onNew })` (pantalla inicial cuando no hay informe en edición).

- [ ] **Step 1: Implementar `handleSave` + autosave en `InformesPage.tsx`**

`handleSave`: setea `updatedAt` (usar `new Date().toISOString()`), llama `saveInforme(informe)`, muestra confirmación breve. Autosave: `useEffect` que, ante cambios de `informe` (debounce ~1s), guarda si ya tiene `id`.

- [ ] **Step 2: Implementar `InformesList.tsx`**

Grilla/lista de `listInformes()`: cada card muestra nombre, contexto y fecha; acciones **Abrir** (`onOpen(id)` → `loadInforme` → set estado + `step=3`) y **Borrar** (`deleteInforme`). Botón **+ Nuevo informe** (`onNew`) que resetea el estado y va al paso 0.

- [ ] **Step 3: Integrar en `InformesPage.tsx`**

Mostrar `<InformesList>` cuando no hay `informe` en edición (o un toggle "Mis informes"). Al abrir uno, restaurar `parsed` desde `informe.rows/headers` y saltar al preview.

- [ ] **Step 4: Verificar en el navegador**

Verificar el ciclo completo: crear informe → guardar → recargar la página → aparece en "Mis informes" → abrir → editar → re-exportar PDF. Borrar funciona.

- [ ] **Step 5: Correr toda la suite de tests**

Run: `npm test`
Expected: PASS (todos los `*.test.ts`, incluidos los previos del repo).

- [ ] **Step 6: Commit**

```bash
git add src/features/informes/components/InformesList.tsx src/pages/InformesPage.tsx
git commit -m "feat(informes): guardar/cargar informes y listado de borradores"
```

---

## Self-Review (cobertura del spec)

- Nueva página + nav en Búsqueda de Talento → Task 7. ✅
- Subida/parseo .xlsx/.csv/.xml → Task 2. ✅
- Selección de protagonista + pool del archivo + contexto + foto → Task 8. ✅
- Métricas inteligentes derivadas (gambetas completadas/90, Goles−xG, etc.) → Task 4. ✅
- Semáforo verde/amarillo/rojo vs pool + ranking → Task 5, mostrado en Tasks 9/11. ✅
- Asignación a radar/barras/scatter/números → Task 9; render → Task 11. ✅
- Contenido editorial (bio, lectura táctica, últimos 5, comparables, video YouTube) → Tasks 10/11. ✅
- Preview con tabs idéntico a mockups → Task 11. ✅
- Export PDF alta fidelidad, cortes inteligentes, claro/oscuro, logo → Task 12. ✅
- Guardado (localStorage) + listado → Tasks 6/13. ✅
- Tests unitarios de parser/registry/derivadas/stats/store → Tasks 2–6. ✅

**Riesgos conocidos:** el esquema real del XML de Wyscout puede diferir de la heurística de Task 2 (mitigado: fallback a métrica cruda + ajuste con un archivo real); fidelidad del PDF en dark mode (verificar en Task 12 con ambos temas).
