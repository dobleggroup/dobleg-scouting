# Informe de equipo Wyscout (PDF) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse Wyscout's "Informe del equipo" PDF (season player stats, formations, per-match lineups/stints, event scatter maps, zone-percentage heatmaps, set pieces) entirely client-side, store it per coach in Supabase, and render it as a new subsection of Resumen — next to the existing "Cargar Excel de Wyscout" upload.

**Architecture:** Reuse the PDF text-extraction technique already proven in `src/features/gps/parser/` (pdfjs-dist, position-based row/column reconstruction) via a new shared `src/lib/pdf/` module. A pure-function parser pipeline (`src/features/coaches/wyscoutReport/`) turns raw PDF bytes into one `WyscoutReportData` JSON object, tested against the real fixture PDF the user supplied. One Supabase table stores that JSON per coach (latest-wins, history kept). New UI components render it inside the existing `CoachSeasonStatsCard`.

**Tech Stack:** React 18 + TypeScript, `pdfjs-dist` (already a dependency), Supabase (Postgres + Storage), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-06-entrenadores-informe-wyscout-design.md`

## Global Constraints

- All parsing runs client-side in the browser (no server function) — same as the existing `.xlsx` Wyscout parser and the GPS PDF parser.
- Every parser function is pure (`(input) => output`, no I/O) and has a `.test.ts` next to it, tested against the real fixture `src/features/coaches/wyscoutReport/__fixtures__/temperley-informe-equipo.pdf` (already committed).
- A page/section the parser can't classify goes into `warnings: string[]`, never throws and never silently drops the rest of the report (same degrade-with-warning rule as `parseNacsportXml`).
- Moving `extractPdfItems`/`groupRows` out of `gps/parser/` must not change GPS's existing behavior — the GPS test suite is the regression check, run it after every move.
- No new npm dependency — `pdfjs-dist` and `recharts` already cover everything needed.

---

## Task 1: Move shared PDF utilities to `src/lib/pdf/`

**Files:**
- Create: `src/lib/pdf/extractPdfItems.ts`
- Create: `src/lib/pdf/pdfWorker.ts`
- Create: `src/lib/pdf/groupRows.ts`
- Modify: `src/features/gps/parser/parsePdf.ts` (import path only)
- Modify: `src/features/gps/parser/buildTable.ts` (import path only)
- Modify: `src/features/gps/parser/extractItems.ts` — **delete**, replaced by the shared module
- Modify: `src/features/gps/parser/pdfWorker.ts` — **delete**, replaced by the shared module
- Test: existing `src/features/gps/parser/parsePdf.test.ts` and `buildTable.test.ts` (unchanged — they're the regression check)

**Interfaces:**
- Produces: `extractPdfItems(data: ArrayBuffer, opts?: { workerSrc?: string }): Promise<PdfTextItem[]>` where `PdfTextItem = { str: string; x: number; y: number; width: number; page: number }`
- Produces: `groupRows(items: PdfTextItem[]): PdfRow[]` and `nearestColumn(centers: number[], center: number): number`, with `PdfRow = { page: number; y: number; cells: PdfCell[] }`, `PdfCell = { text: string; x: number; width: number; center: number }`

- [ ] **Step 1: Copy `extractItems.ts` content verbatim into the new file**

```ts
// src/lib/pdf/extractPdfItems.ts
export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
  page: number
}

interface ExtractOptions {
  /** URL del worker. En el browser hay que pasarla; en Node se usa el fake worker. */
  workerSrc?: string
}

/**
 * Abre el PDF y devuelve todos los textos con sus coordenadas. Se usa la posición y
 * no el orden de lectura: en estos PDFs el orden viene por columnas y no sirve.
 * `y` es la línea de base en espacio PDF (crece hacia arriba).
 */
export async function extractPdfItems(
  data: ArrayBuffer,
  opts: ExtractOptions = {},
): Promise<PdfTextItem[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (opts.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = opts.workerSrc

  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise
  const items: PdfTextItem[] = []

  try {
    for (let page = 1; page <= doc.numPages; page++) {
      const p = await doc.getPage(page)
      const content = await p.getTextContent()
      for (const item of content.items as Array<Record<string, unknown>>) {
        const str = typeof item.str === 'string' ? item.str : ''
        if (!str.trim()) continue
        const transform = item.transform as number[] | undefined
        if (!transform) continue
        items.push({
          str: str.trim(),
          x: transform[4],
          y: transform[5],
          width: typeof item.width === 'number' ? item.width : 0,
          page,
        })
      }
      p.cleanup()
    }
  } finally {
    await doc.destroy()
  }

  return items
}
```

- [ ] **Step 2: Copy `pdfWorker.ts` content verbatim**

```ts
// src/lib/pdf/pdfWorker.ts
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

export default workerSrc as string
```

- [ ] **Step 3: Extract `groupRows`/`nearestColumn` out of `gps/parser/buildTable.ts` into the shared module**

```ts
// src/lib/pdf/groupRows.ts
import type { PdfTextItem } from './extractPdfItems'

export interface PdfCell { text: string; x: number; width: number; center: number }
export interface PdfRow { page: number; y: number; cells: PdfCell[] }

/** Dos textos con menos de esta diferencia de línea de base son la misma fila. */
const ROW_TOLERANCE = 3

function toCell(item: PdfTextItem): PdfCell {
  return { text: item.str, x: item.x, width: item.width, center: item.x + item.width / 2 }
}

/** Agrupa los items en filas por línea de base, de arriba hacia abajo. */
export function groupRows(items: PdfTextItem[]): PdfRow[] {
  const sorted = [...items].sort((a, b) => (a.page - b.page) || (b.y - a.y) || (a.x - b.x))
  const rows: PdfRow[] = []
  for (const it of sorted) {
    const last = rows[rows.length - 1]
    if (last && last.page === it.page && Math.abs(last.y - it.y) <= ROW_TOLERANCE) {
      last.cells.push(toCell(it))
    } else {
      rows.push({ page: it.page, y: it.y, cells: [toCell(it)] })
    }
  }
  for (const row of rows) row.cells.sort((a, b) => a.x - b.x)
  return rows
}

export function nearestColumn(centers: number[], center: number): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < centers.length; i++) {
    const dist = Math.abs(centers[i] - center)
    if (dist < bestDist) { bestDist = dist; best = i }
  }
  return best
}
```

- [ ] **Step 4: Update `gps/parser/buildTable.ts` to import from the shared module instead of defining its own copies**

Replace the top of `src/features/gps/parser/buildTable.ts`:
```ts
import { parseNumber, normalizeLabel } from './normalize'
import { groupRows, nearestColumn } from '@/lib/pdf/groupRows'
import type { PdfTextItem, PdfTable, PdfTableRow } from '../types'
```
Remove the local `groupRows`/`nearestColumn`/`toCell` definitions (now imported) and the now-unused `PdfRow`/`PdfCell` import from `../types` (re-export them from `@/lib/pdf/groupRows` if anything else in `gps/` imports the types directly — check with `grep -rn "PdfRow\|PdfCell" src/features/gps` first and update those imports too).

- [ ] **Step 5: Update `gps/parser/parsePdf.ts` to import `extractPdfItems` from the shared module**

```ts
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import workerSrc from '@/lib/pdf/pdfWorker'
```

- [ ] **Step 6: Delete the now-unused old files**

```bash
rm src/features/gps/parser/extractItems.ts src/features/gps/parser/extractItems.test.ts src/features/gps/parser/pdfWorker.ts
```
(Move the test coverage of `extractItems.test.ts` to a new `src/lib/pdf/extractPdfItems.test.ts` with the same test bodies, just updated import path, before deleting — don't lose the coverage.)

- [ ] **Step 7: Run the full GPS test suite to confirm the move didn't change behavior**

Run: `npm run test -- gps`
Expected: all GPS parser tests still PASS, identical to before the move.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pdf src/features/gps
git commit -m "refactor(pdf): move generic PDF extraction to src/lib/pdf, reused by wyscoutReport"
```

---

## Task 2: `WyscoutReportData` types

**Files:**
- Create: `src/features/coaches/wyscoutReport/wyscoutReportTypes.ts`

**Interfaces:**
- Produces: every type below — every later task imports from this file.

- [ ] **Step 1: Write the file**

```ts
// src/features/coaches/wyscoutReport/wyscoutReportTypes.ts

export type PitchHalf = 'completa' | 'propia' | 'rival'

export interface PitchPoint {
  x: number       // 0-100
  y: number       // 0-100
  label?: string  // número de camiseta u otra etiqueta corta
}

export type WyscoutMetricValue =
  | number
  | { total: number; exitosos: number; pct: number }
  | null

export interface WyscoutReportPlayerSeason {
  number: number | null
  name: string
  positionCode: string | null
  age: number | null
  foot: 'diestro' | 'zurdo' | null
  heightCm: number | null
  matches: number
  minutesTotal: number
  minutesAvg: number | null
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  metrics: Record<string, WyscoutMetricValue>
}

export interface WyscoutReportFormation {
  scheme: string
  usagePct: number
  averagePositions: PitchPoint[]
  teamStats: { label: string; own: number; rival: number }[]
}

export interface WyscoutReportMatchStint {
  formation: string
  fromMinute: number
  toMinute: number
  players: PitchPoint[]
}

export interface WyscoutReportMatchLineupPlayer {
  number: number
  name: string
  positionCode: string
  isStarter: boolean
}

export interface WyscoutReportMatch {
  date: string          // ISO 'YYYY-MM-DD'
  rival: string
  isHome: boolean
  score: string
  competition: string
  lineup: WyscoutReportMatchLineupPlayer[]
  stints: WyscoutReportMatchStint[]
}

export interface WyscoutEventMap {
  category: string
  half: PitchHalf
  points: PitchPoint[]
}

export interface WyscoutZoneGrid {
  category: 'recuperaciones' | 'perdidas' | 'faltas'
  cells: { row: number; col: number; pct: number; reference: number | null }[]
}

export interface WyscoutReportSetPiece {
  type: 'corner' | 'tiro_libre'
  side: 'izquierdo' | 'derecho'
  point: PitchPoint  // label = tomador
}

export interface WyscoutReportData {
  sourceFileName: string
  matchCountWindow: number
  players: WyscoutReportPlayerSeason[]
  formations: WyscoutReportFormation[]
  matches: WyscoutReportMatch[]
  eventMaps: WyscoutEventMap[]
  zoneGrids: WyscoutZoneGrid[]
  setPieces: WyscoutReportSetPiece[]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/coaches/wyscoutReport/wyscoutReportTypes.ts
git commit -m "feat(wyscoutReport): add WyscoutReportData types"
```

---

## Task 3: Section classifier

**Files:**
- Create: `src/features/coaches/wyscoutReport/classifySectionLabel.ts`
- Test: `src/features/coaches/wyscoutReport/classifySectionLabel.test.ts`

**Interfaces:**
- Consumes: `normalizeForSearch(str: string): string` from `@/lib/search`
- Produces: `type SectionLabel`, `classifySectionLabel(headerText: string): SectionLabel`, `findPageHeaders(items: PdfTextItem[]): { page: number; label: SectionLabel; raw: string }[]` — `PdfTextItem` from `@/lib/pdf/extractPdfItems`

Every page of the report repeats, near the top, one of these exact section titles (verified against the fixture): "JUGADORES", "ESTADÍSTICAS", "FORMACIONES", "PARTIDOS", "FASE DEFENSIVA", "CONSTRUCCIÓN DEL JUEGO", "ATAQUE", "TRANSICIONES", "JUGADAS A BALÓN PARADO", "GLOSARIO". These titles sit alone on their own text line (no other content at that same y on page 1's cover, but on content pages they're the last line before a horizontal rule) — the reliable anchor is: the header text appears in the **top 40pt of the page** (`y > pageHeight - 40`, i.e. `y > 802 - 40 = 762` for a standard Letter/A4 points-based page — verify exact page height for this fixture in Step 1) and matches one of the known labels case/accent-insensitively.

- [ ] **Step 1: Write the failing test — verify page height and header positions from the real fixture**

```ts
// src/features/coaches/wyscoutReport/classifySectionLabel.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { classifySectionLabel, findPageHeaders } from './classifySectionLabel'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('classifySectionLabel', () => {
  it('reconoce cada título de sección conocido, insensible a mayúsculas/tildes', () => {
    expect(classifySectionLabel('JUGADORES')).toBe('jugadores')
    expect(classifySectionLabel('estadísticas')).toBe('estadisticas')
    expect(classifySectionLabel('Construcción del juego')).toBe('construccion_del_juego')
    expect(classifySectionLabel('jugadas a balón parado')).toBe('jugadas_a_balon_parado')
    expect(classifySectionLabel('Algo Random')).toBe('desconocida')
  })
})

describe('findPageHeaders contra el fixture real', () => {
  it('clasifica las 23 páginas del informe en la sección correcta', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const headers = findPageHeaders(items)

    expect(headers.find(h => h.page === 2)?.label).toBe('jugadores')
    expect(headers.find(h => h.page === 3)?.label).toBe('estadisticas')
    expect(headers.find(h => h.page === 4)?.label).toBe('estadisticas')
    expect(headers.find(h => h.page === 5)?.label).toBe('formaciones')
    expect(headers.find(h => h.page === 6)?.label).toBe('partidos')
    expect(headers.find(h => h.page === 15)?.label).toBe('partidos')
    expect(headers.find(h => h.page === 16)?.label).toBe('fase_defensiva')
    expect(headers.find(h => h.page === 17)?.label).toBe('construccion_del_juego')
    expect(headers.find(h => h.page === 18)?.label).toBe('ataque')
    expect(headers.find(h => h.page === 20)?.label).toBe('transiciones')
    expect(headers.find(h => h.page === 22)?.label).toBe('jugadas_a_balon_parado')
    expect(headers.find(h => h.page === 23)?.label).toBe('glosario')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- classifySectionLabel`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/classifySectionLabel.ts
import { normalizeForSearch } from '@/lib/search'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'

export type SectionLabel =
  | 'jugadores' | 'estadisticas' | 'formaciones' | 'partidos'
  | 'fase_defensiva' | 'construccion_del_juego' | 'ataque' | 'transiciones'
  | 'jugadas_a_balon_parado' | 'glosario' | 'desconocida'

const KNOWN_LABELS: { match: string; label: SectionLabel }[] = [
  { match: 'jugadores', label: 'jugadores' },
  { match: 'estadisticas', label: 'estadisticas' },
  { match: 'formaciones', label: 'formaciones' },
  { match: 'partidos', label: 'partidos' },
  { match: 'fase defensiva', label: 'fase_defensiva' },
  { match: 'construccion del juego', label: 'construccion_del_juego' },
  { match: 'ataque', label: 'ataque' },
  { match: 'transiciones', label: 'transiciones' },
  { match: 'jugadas a balon parado', label: 'jugadas_a_balon_parado' },
  { match: 'glosario', label: 'glosario' },
]

export function classifySectionLabel(headerText: string): SectionLabel {
  const norm = normalizeForSearch(headerText)
  return KNOWN_LABELS.find(k => norm === k.match)?.label ?? 'desconocida'
}

/** Encabezado de sección: texto solo en mayúsculas ubicado en el borde superior de
 *  la página (por encima de y=762 en este layout — el título de página siempre va
 *  ahí, separado del contenido por una línea horizontal). */
const HEADER_Y_MIN = 760

export function findPageHeaders(
  items: PdfTextItem[],
): { page: number; label: SectionLabel; raw: string }[] {
  const byPage = new Map<number, PdfTextItem[]>()
  for (const it of items) {
    if (it.y < HEADER_Y_MIN) continue
    if (!byPage.has(it.page)) byPage.set(it.page, [])
    byPage.get(it.page)!.push(it)
  }

  const result: { page: number; label: SectionLabel; raw: string }[] = []
  for (const [page, pageItems] of byPage) {
    // El título de sección es el texto más específico (más largo) entre los
    // candidatos del encabezado -- la página también repite "INFORME DEL EQUIPO"
    // y el nombre del equipo ahí arriba, que no matchean ningún KNOWN_LABEL.
    const candidates = pageItems
      .map(it => ({ raw: it.str, label: classifySectionLabel(it.str) }))
      .filter(c => c.label !== 'desconocida')
    if (candidates.length === 0) continue
    result.push({ page, label: candidates[0].label, raw: candidates[0].raw })
  }
  return result.sort((a, b) => a.page - b.page)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- classifySectionLabel`
Expected: PASS. If any page's expected label doesn't match, `console.log` the actual `pageItems` text/y for that page (add a temporary debug line, e.g. `if (page === 5) console.log(pageItems)`) to see the exact real header text/position and adjust `HEADER_Y_MIN` or the label list — this is the calibration step, expected to take 1-2 iterations against the real file.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/classifySectionLabel.ts src/features/coaches/wyscoutReport/classifySectionLabel.test.ts
git commit -m "feat(wyscoutReport): classify PDF pages into report sections"
```

---

## Task 4: Dedup wrapper for stroked/duplicated text

**Files:**
- Create: `src/features/coaches/wyscoutReport/dedupItems.ts`
- Test: `src/features/coaches/wyscoutReport/dedupItems.test.ts`

**Context:** the fixture's bold percentage labels (zone-grid charts, Task 9) are drawn twice at a ~1pt offset (a stroke/shadow effect) — e.g. page 20 has `"9.8%"` at both `(57.5, 695.3)` and `(56.8, 696.1)`. Every parser that counts or positions text must dedupe first, or it double-counts.

**Interfaces:**
- Consumes: `PdfTextItem` from `@/lib/pdf/extractPdfItems`
- Produces: `dedupItems(items: PdfTextItem[]): PdfTextItem[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/dedupItems.test.ts
import { describe, it, expect } from 'vitest'
import { dedupItems } from './dedupItems'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'

describe('dedupItems', () => {
  it('elimina duplicados de texto casi en la misma posicion (efecto de trazo)', () => {
    const items: PdfTextItem[] = [
      { str: '9.8%', x: 57.5, y: 695.3, width: 27.4, page: 20 },
      { str: '9.8%', x: 56.8, y: 696.1, width: 27.4, page: 20 },
      { str: '14%', x: 140.3, y: 695.3, width: 23.9, page: 20 },
    ]
    const result = dedupItems(items)
    expect(result).toHaveLength(2)
    expect(result.map(r => r.str).sort()).toEqual(['14%', '9.8%'])
  })

  it('no elimina el mismo texto en posiciones realmente distintas', () => {
    const items: PdfTextItem[] = [
      { str: '4', x: 10, y: 10, width: 2, page: 1 },
      { str: '4', x: 200, y: 300, width: 2, page: 1 },
    ]
    expect(dedupItems(items)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- dedupItems`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/dedupItems.ts
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'

const DEDUP_TOLERANCE = 2

/** Wyscout dibuja algunos textos en negrita 2 veces con ~1pt de offset (efecto de
 *  trazo). Sin esto, cualquier conteo o posicionamiento por texto los duplica. */
export function dedupItems(items: PdfTextItem[]): PdfTextItem[] {
  const kept: PdfTextItem[] = []
  for (const item of items) {
    const isDup = kept.some(k =>
      k.page === item.page &&
      k.str === item.str &&
      Math.abs(k.x - item.x) <= DEDUP_TOLERANCE &&
      Math.abs(k.y - item.y) <= DEDUP_TOLERANCE,
    )
    if (!isDup) kept.push(item)
  }
  return kept
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- dedupItems`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/dedupItems.ts src/features/coaches/wyscoutReport/dedupItems.test.ts
git commit -m "feat(wyscoutReport): dedupe stroked/duplicated PDF text items"
```

---

## Task 5: Players section parser

**Files:**
- Create: `src/features/coaches/wyscoutReport/parsePlayersSection.ts`
- Test: `src/features/coaches/wyscoutReport/parsePlayersSection.test.ts`

**Context (verified against the fixture, page 2):** header row at `y≈760` with cells `Posición(x=150.5) Edad(187.7) Pie(210.1) Altura,cm(231.2) Partidos(267.8) Minutos totales(308-341, wraps 2 lines) Promedio minutos(341-344, wraps) Goles(375.5) "Assists ADVS_ASSISTS_BR"(410.7, one merged text item — a Wyscout label artifact, keep as one column) Tarjetas amarillas/Tarjetas rojas(492-504, wraps 2 lines) Entra/Sale(550.4)`. Data rows: jersey number `x≈40-42`, name `x≈52` (left-aligned, variable width). Group-header rows ("DEFENSORES", "CENTROCAMPISTAS", "DELANTEROS") are single-cell text rows with no numeric cells — skip them, they carry no data (position code per player already comes from the `Posición` column). The **"Pie" (foot) column has no text** in this table — Wyscout draws it as a colored icon, not a character — `foot` stays `null` from this parser; Task 6 fills it in from a different page.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/parsePlayersSection.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parsePlayersSection } from './parsePlayersSection'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parsePlayersSection contra el fixture real', () => {
  it('extrae los jugadores de la pagina 2 con sus datos basicos', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const players = parsePlayersSection(items.filter(i => i.page === 2))

    expect(players).toHaveLength(21) // 3 arqueros + 5 defensores + 9 centrocampistas + 4 delanteros
    expect(players.some(p => p.name === 'DEFENSORES')).toBe(false)
    expect(players.some(p => p.name === 'CENTROCAMPISTAS')).toBe(false)

    const mastrolia = players.find(p => p.name === 'E. Mastrolía')!
    expect(mastrolia.number).toBe(1)
    expect(mastrolia.positionCode).toBe('GK')
    expect(mastrolia.age).toBe(35)
    expect(mastrolia.heightCm).toBe(190)
    expect(mastrolia.matches).toBe(8)
    expect(mastrolia.minutesTotal).toBe(771)
    expect(mastrolia.minutesAvg).toBe(96)
    expect(mastrolia.foot).toBeNull()

    const pSouto = players.find(p => p.name === 'P. Souto')!
    expect(pSouto.number).toBe(11)
    expect(pSouto.positionCode).toBe('LAMF')
    expect(pSouto.goals).toBe(4)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parsePlayersSection`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/parsePlayersSection.ts
import { groupRows, nearestColumn } from '@/lib/pdf/groupRows'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import type { WyscoutReportPlayerSeason } from './wyscoutReportTypes'

const GROUP_HEADER_NAMES = new Set(['DEFENSORES', 'CENTROCAMPISTAS', 'DELANTEROS', 'ARQUEROS'])

function toNumberOrNull(text: string | undefined): number | null {
  if (!text || text === '-') return null
  const n = Number(text.replace("'", '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Header en 2 lineas ("Minutos" / "totales") ya llega como 2 PdfTextItem separados
 *  en la fila de encabezado (y=766.3 y y=760.0) -- se usa solo la fila y=760 (mas
 *  baja, la que esta mas cerca de los datos) para los centros de columna: es la que
 *  trae el nombre "base" de cada columna una sola vez. */
const HEADER_Y = 760
const HEADER_Y_TOLERANCE = 1

export function parsePlayersSection(pageItems: PdfTextItem[]): WyscoutReportPlayerSeason[] {
  const headerItems = pageItems.filter(it => Math.abs(it.y - HEADER_Y) <= HEADER_Y_TOLERANCE)
  const centers = headerItems.map(it => it.x + it.width / 2).sort((a, b) => a - b)

  const dataItems = pageItems.filter(it => it.y < HEADER_Y - HEADER_Y_TOLERANCE)
  const rows = groupRows(dataItems)

  const players: WyscoutReportPlayerSeason[] = []
  for (const row of rows) {
    if (row.cells.length === 0) continue
    // Fila de nombre de posicion ("DEFENSORES", etc): una sola celda, sin numero.
    if (row.cells.length === 1 && GROUP_HEADER_NAMES.has(row.cells[0].text)) continue

    // Cada jugador ocupa 2 filas muy cercanas en y (numero+nombre en una linea de
    // base ligeramente distinta a las demas columnas) -- ya vienen juntas porque
    // groupRows usa ROW_TOLERANCE=3 y la diferencia real es <1pt.
    const numberCell = row.cells.find(c => /^\d{1,2}$/.test(c.text))
    const nameCell = row.cells.find(c => c.x > (numberCell?.x ?? 0) && c.x < 150 && !/^\d+$/.test(c.text))
    if (!numberCell || !nameCell) continue

    const rest = row.cells.filter(c => c !== numberCell && c !== nameCell && c.x >= 145)
    const byColumn: (string | undefined)[] = new Array(centers.length).fill(undefined)
    for (const cell of rest) {
      const col = nearestColumn(centers, cell.center)
      byColumn[col] = cell.text
    }

    // Orden de columnas verificado contra el fixture: Posicion, Edad, Pie, Altura,
    // Partidos, Minutos totales, Promedio minutos, Goles, Assists, Tarjetas, Entra/Sale.
    const [posicion, edad, , altura, partidos, minTotal, minProm, goles] = byColumn

    players.push({
      number: toNumberOrNull(numberCell.text),
      name: nameCell.text,
      positionCode: posicion ?? null,
      age: toNumberOrNull(edad),
      foot: null, // se completa en Task 6 desde "Construccion del juego"
      heightCm: toNumberOrNull(altura),
      matches: toNumberOrNull(partidos) ?? 0,
      minutesTotal: toNumberOrNull(minTotal) ?? 0,
      minutesAvg: toNumberOrNull(minProm),
      goals: toNumberOrNull(goles) ?? 0,
      assists: 0,       // Task 6 lo completa desde la columna "Assists" fusionada
      yellowCards: 0,   // idem, desde "Tarjetas amarillas/rojas" ("N/M")
      redCards: 0,
      metrics: {},
    })
  }
  return players
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parsePlayersSection`
Expected: PASS. If `nameCell`/`numberCell` don't resolve for a row, log `row.cells` for that row and adjust the `x < 150` heuristic (the real cutoff between the name column and the position-code column) against actual output.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parsePlayersSection.ts src/features/coaches/wyscoutReport/parsePlayersSection.test.ts
git commit -m "feat(wyscoutReport): parse player season table from JUGADORES page"
```

---

## Task 6: Extend players with assists/cards/foot/metrics from ESTADÍSTICAS + CONSTRUCCIÓN DEL JUEGO

**Files:**
- Modify: `src/features/coaches/wyscoutReport/parsePlayersSection.ts`
- Modify: `src/features/coaches/wyscoutReport/parsePlayersSection.test.ts`

**Context:** pages 3-4 ("ESTADÍSTICAS") repeat the same one-row-per-player layout with a `Jugador` header cell (not `Posición`) as the anchor — reuse the same `groupRows`+`nearestColumn` technique with the header row anchored on the cell matching `/jugador/i`. Many cells there are split across 2-3 adjacent text items (e.g. `"375"`, `"/"`, `"303"`, `"81%"` near the same x) — merge cells whose gap in x is below `ADJACENT_CELL_GAP` (verify exact value against the fixture: page 3 shows `"375 / 303 81%"` rendered with sub-gaps around 3-8pt, well below the ~15pt+ gaps between distinct columns) before assigning to a column. Assists/yellow/red cards for the final `WyscoutReportPlayerSeason` fields come from this page's "Tarjetas amarillas/rojas" ("N/M") and the roster's own "Assists ADVS_ASSISTS_BR" numeric column (Task 5 left `assists`/cards at 0 as a placeholder — this task fills them for real from here, since this page's columns are unambiguous and labeled per-column rather than merged like page 2's). Page 17 ("CONSTRUCCIÓN DEL JUEGO") has one mini-card per player headed by the player's name followed immediately by `DIESTRO` or `ZURDO` as its own text item — match by name to fill `foot`.

- [ ] **Step 1: Write the failing test**

```ts
// añadir a parsePlayersSection.test.ts
import { extendPlayersWithStats, extendPlayersWithFoot } from './parsePlayersSection'

describe('extendPlayersWithStats contra el fixture real', () => {
  it('agrega metrics, assists y tarjetas desde ESTADISTICAS (paginas 3-4)', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const players = parsePlayersSection(items.filter(i => i.page === 2))
    const extended = extendPlayersWithStats(players, items.filter(i => i.page === 3 || i.page === 4))

    const pacheco = extended.find(p => p.name === 'O. Pacheco')!
    expect(pacheco.metrics.pases).toEqual({ total: 375, exitosos: 303, pct: 81 })
    expect(pacheco.goals).toBe(0)
  })
})

describe('extendPlayersWithFoot contra el fixture real', () => {
  it('completa pie diestro/zurdo desde CONSTRUCCION DEL JUEGO (pagina 17)', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const players = parsePlayersSection(items.filter(i => i.page === 2))
    const withFoot = extendPlayersWithFoot(players, items.filter(i => i.page === 17))

    expect(withFoot.find(p => p.name === 'O. Pacheco')?.foot).toBe('diestro')
    expect(withFoot.find(p => p.name === 'V. Aguiñagalde')?.foot).toBe('zurdo')
    expect(withFoot.find(p => p.name === 'L. Angelini')?.foot).toBe('zurdo')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parsePlayersSection`
Expected: FAIL — `extendPlayersWithStats`/`extendPlayersWithFoot` don't exist yet.

- [ ] **Step 3: Implement — append to `parsePlayersSection.ts`**

```ts
const ADJACENT_CELL_GAP = 10

function mergeAdjacentCells(cells: PdfTextItem[]): PdfTextItem[] {
  const sorted = [...cells].sort((a, b) => a.x - b.x)
  const merged: PdfTextItem[] = []
  for (const cell of sorted) {
    const last = merged[merged.length - 1]
    if (last && cell.x - (last.x + last.width) <= ADJACENT_CELL_GAP) {
      last.str = `${last.str} ${cell.str}`.trim()
      last.width = cell.x + cell.width - last.x
    } else {
      merged.push({ ...cell })
    }
  }
  return merged
}

function parseCompoundMetric(text: string): WyscoutMetricValue {
  const m = text.match(/^(\d+)\s*\/\s*(\d+)\s*(?:(\d+)%)?$/)
  if (!m) {
    const n = Number(text.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const [, total, exitosos, pct] = m
  return { total: Number(total), exitosos: Number(exitosos), pct: pct ? Number(pct) : 0 }
}

/** Extrae el diccionario de metricas de una pagina "ESTADISTICAS" (misma tecnica de
 *  fila/columna que parsePlayersSection, pero ancla en la celda "Jugador" en vez de
 *  "Posicion", y fusiona celdas contiguas tipo "N / M NN%" antes de asignar columna. */
export function extendPlayersWithStats(
  players: WyscoutReportPlayerSeason[],
  statsPageItems: PdfTextItem[],
): WyscoutReportPlayerSeason[] {
  const headerRow = groupRows(statsPageItems).find(r => r.cells.some(c => /^jugador$/i.test(c.text)))
  if (!headerRow) return players

  const headerCenters = headerRow.cells.map(c => c.center)
  const headerLabels = headerRow.cells.map(c => c.text)

  const byName = new Map(players.map(p => [p.name, { ...p, metrics: { ...p.metrics } }]))
  const dataRows = groupRows(statsPageItems).filter(r => r.y < headerRow.y)

  for (const row of dataRows) {
    const nameCellIdx = row.cells.findIndex(c => byName.has(c.text))
    if (nameCellIdx < 0) continue
    const name = row.cells[nameCellIdx].text
    const player = byName.get(name)!

    const valueCells = row.cells.filter((_, i) => i !== nameCellIdx && row.cells[i].x > row.cells[nameCellIdx].x)
    const merged = mergeAdjacentCells(valueCells as unknown as PdfTextItem[])
    for (const cell of merged) {
      const col = nearestColumn(headerCenters, cell.x + cell.width / 2)
      const label = headerLabels[col]
      if (!label || /^jugador$/i.test(label)) continue
      player.metrics[label] = parseCompoundMetric(cell.str)
    }
  }
  return [...byName.values()]
}

/** Pagina "CONSTRUCCION DEL JUEGO": una tarjeta por jugador con su nombre seguido
 *  del texto "DIESTRO"/"ZURDO" en la misma columna, mas abajo. */
export function extendPlayersWithFoot(
  players: WyscoutReportPlayerSeason[],
  buildUpPageItems: PdfTextItem[],
): WyscoutReportPlayerSeason[] {
  const rows = groupRows(buildUpPageItems)
  const footByName = new Map<string, 'diestro' | 'zurdo'>()
  let lastName: string | null = null
  for (const row of rows) {
    for (const cell of row.cells) {
      if (players.some(p => p.name === cell.text)) lastName = cell.text
      if (/^DIESTRO$/i.test(cell.text) && lastName) footByName.set(lastName, 'diestro')
      if (/^ZURDO$/i.test(cell.text) && lastName) footByName.set(lastName, 'zurdo')
    }
  }
  return players.map(p => (footByName.has(p.name) ? { ...p, foot: footByName.get(p.name)! } : p))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parsePlayersSection`
Expected: PASS. Adjust `ADJACENT_CELL_GAP` if `pacheco.metrics.pases` comes back merged incorrectly (too large a gap merges two real columns; too small fails to merge the `N / M pct%` triplet) — print `mergeAdjacentCells` output for O. Pacheco's row to calibrate against the fixture.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parsePlayersSection.ts src/features/coaches/wyscoutReport/parsePlayersSection.test.ts
git commit -m "feat(wyscoutReport): extend players with ESTADISTICAS metrics and foot"
```

---

## Task 7: Formations section parser

**Files:**
- Create: `src/features/coaches/wyscoutReport/parseFormationsSection.ts`
- Test: `src/features/coaches/wyscoutReport/parseFormationsSection.test.ts`

**Context (page 5, verified layout):** the main formation (`4-2-3-1`, 60% usage) occupies the left 2/3 of the page with an 11-point average-position pitch (real x/y per player: e.g. `"9" Echeverría` near the top, `"1" Mastrolía` near the bottom — matches attack-direction-up convention) and a 7-row comparison list below with a fixed label in the middle (`GOLES`, `XG`, `POSESIÓN DEL BALÓN, %`, `PRECISIÓN PASES, &`, `INTENSIDAD DE JUEGO`, `DISTRIBUCIÓN LANZAMIENTOS, %`, `PPDA RC_PPDA_ABBR`) and one number left (own) and one right (rival) of each label — anchor on the label text, take nearest-left/nearest-right numeric neighbor on the same row. Two smaller alternate formations (`4-4-2` 26%, `4-3-3` 11%) repeat the same mini-layout scaled down, stacked to the right.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/parseFormationsSection.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseFormationsSection } from './parseFormationsSection'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseFormationsSection contra el fixture real', () => {
  it('extrae las 3 formaciones con % de uso y comparativa propio/rival', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const formations = parseFormationsSection(items.filter(i => i.page === 5))

    expect(formations).toHaveLength(3)
    const totalPct = formations.reduce((sum, f) => sum + f.usagePct, 0)
    expect(totalPct).toBeGreaterThanOrEqual(95)
    expect(totalPct).toBeLessThanOrEqual(100)

    const main = formations.find(f => f.scheme === '4-2-3-1')!
    expect(main.usagePct).toBe(60)
    const goles = main.teamStats.find(s => s.label.startsWith('GOLES'))!
    expect(goles.own).toBe(6)
    expect(goles.rival).toBe(4)
    expect(main.averagePositions).toHaveLength(11)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parseFormationsSection`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/parseFormationsSection.ts
import { groupRows, nearestColumn } from '@/lib/pdf/groupRows'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { dedupItems } from './dedupItems'
import type { WyscoutReportFormation, PitchPoint } from './wyscoutReportTypes'

const STAT_LABELS = [
  'GOLES', 'XG', 'POSESIÓN DEL BALÓN, %', 'PRECISIÓN PASES, &',
  'INTENSIDAD DE JUEGO', 'DISTRIBUCIÓN LANZAMIENTOS, %', 'PPDA RC_PPDA_ABBR',
]

const SCHEME_RE = /^\d(-\d){2,4}$/    // "4-2-3-1", "4-4-2", "4-3-3"
const PCT_RE = /^(\d{1,3})%$/

function toBlocks(items: PdfTextItem[]): PdfTextItem[][] {
  // Cada formacion es un bloque autocontenido: se separan por el texto del esquema
  // ("4-2-3-1"), ordenado de arriba/izquierda a abajo/derecha.
  const schemeItems = items.filter(i => SCHEME_RE.test(i.str)).sort((a, b) => (b.y - a.y) || (a.x - b.x))
  return schemeItems.map((scheme, i) => {
    const next = schemeItems[i + 1]
    return items.filter(it =>
      it.y <= scheme.y + 5 &&
      (!next || it.y > next.y - 5 || it.x < next.x - 50), // corta por y, salvo que compartan fila (layout lado a lado)
    )
  })
}

function parseAveragePositions(block: PdfTextItem[]): PitchPoint[] {
  // Numero de camiseta (1-2 digitos) inmediatamente arriba del apellido -- mismo
  // patron que las estampas de partido (Task 10). Cancha de este bloque: se toma
  // el bounding box de los propios puntos para normalizar a 0-100.
  const numbers = block.filter(i => /^\d{1,2}$/.test(i.str))
  const xs = numbers.map(n => n.x)
  const ys = numbers.map(n => n.y)
  if (numbers.length === 0) return []
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)]
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)]
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1

  return numbers.map(n => {
    const nameItem = block
      .filter(i => i !== n && Math.abs(i.x - n.x) < 15 && i.y < n.y && n.y - i.y < 12)
      .sort((a, b) => (n.y - a.y) - (n.y - b.y))[0]
    return {
      x: ((n.x - minX) / spanX) * 100,
      y: 100 - ((n.y - minY) / spanY) * 100, // y de PDF crece hacia arriba; pitch 0-100 crece hacia abajo
      label: nameItem?.str,
    }
  })
}

function parseTeamStats(block: PdfTextItem[]): { label: string; own: number; rival: number }[] {
  const rows = groupRows(block)
  const result: { label: string; own: number; rival: number }[] = []
  for (const row of rows) {
    const labelCell = row.cells.find(c => STAT_LABELS.some(l => c.text.startsWith(l.split(',')[0].split(' ')[0])))
    if (!labelCell) continue
    const numeric = row.cells.filter(c => c !== labelCell && /^-?[\d.]+$/.test(c.text))
    const own = numeric.filter(c => c.x < labelCell.x)[0]
    const rival = numeric.filter(c => c.x > labelCell.x)[0]
    if (own && rival) {
      result.push({ label: labelCell.text, own: Number(own.text), rival: Number(rival.text) })
    }
  }
  return result
}

export function parseFormationsSection(pageItems: PdfTextItem[]): WyscoutReportFormation[] {
  const items = dedupItems(pageItems)
  const blocks = toBlocks(items)

  return blocks.map(block => {
    const scheme = block.find(i => SCHEME_RE.test(i.str))!.str
    const pctItem = block.find(i => PCT_RE.test(i.str))
    const usagePct = pctItem ? Number(pctItem.str.replace('%', '')) : 0
    return {
      scheme,
      usagePct,
      averagePositions: parseAveragePositions(block),
      teamStats: parseTeamStats(block),
    }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parseFormationsSection`
Expected: PASS. This is the highest-uncertainty parser in the plan (page layout with side-by-side blocks) — if `toBlocks` splits incorrectly, dump `items.filter(i => i.page === 5)` sorted by `y` descending and inspect where each formation's content actually starts/ends, then adjust the block-splitting heuristic (may need to split primarily by **x** for the two small side formations that sit to the right of the main one, rather than only by y — check the real layout before assuming).

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parseFormationsSection.ts src/features/coaches/wyscoutReport/parseFormationsSection.test.ts
git commit -m "feat(wyscoutReport): parse formations usage and own/rival comparison"
```

---

## Task 8: Matches section — header + lineup

**Files:**
- Create: `src/features/coaches/wyscoutReport/parseMatchesSection.ts`
- Test: `src/features/coaches/wyscoutReport/parseMatchesSection.test.ts`

**Context (verified against page 6):** header items: two team names at `y≈722` (home team left, e.g. `x=84 "Quilmes"`; away team right, e.g. `x=468.3 "Temperley"`), score at `y≈746` (`"0 – 1"`), date at `y≈726` (`"31.08.2026"`), competition at `y≈726` to its right (`"Primera Nacional"`). Two lineup columns follow: left column position-code at `x≈14.4`, number at `x≈47.6/46.4`, name at `x≈57.1`; right column position-code at `x≈403.9`, number at `x≈437.2/435.9`, name at `x≈446.7`. **Which column is "our" team is decided by cross-referencing names against the already-parsed roster (Task 5/6), not by home/away position** — pass the known player-name set in.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/parseMatchesSection.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseMatchHeaderAndLineup } from './parseMatchesSection'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const KNOWN_ROSTER_NAMES = new Set([
  'E. Mastrolía', 'L. Monti', 'O. Pacheco', 'V. Aguiñagalde', 'L. Angelini',
  'L. Richarte', 'G. Tomasetti', 'F. Benítez', 'L. Nieto', 'P. Souto',
  'M. Echeverría', 'F. Brandán', 'A. Melo', 'F. Krüger', 'Nicolás Ávalos',
])

describe('parseMatchHeaderAndLineup contra el fixture real (pagina 6)', () => {
  it('arma el encabezado del partido y detecta cual columna es el propio equipo', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const { header, lineup } = parseMatchHeaderAndLineup(items.filter(i => i.page === 6), KNOWN_ROSTER_NAMES)

    expect(header.rival).toBe('Quilmes')
    expect(header.isHome).toBe(false)
    expect(header.score).toBe('0 – 1')
    expect(header.date).toBe('2026-08-31')
    expect(header.competition).toBe('Primera Nacional')

    expect(lineup).toHaveLength(11)
    const mastrolia = lineup.find(p => p.name === 'E. Mastrolía')!
    expect(mastrolia.number).toBe(1)
    expect(mastrolia.positionCode).toBe('GK')
    expect(mastrolia.isStarter).toBe(true)
    expect(lineup.some(p => p.name === 'E. Glellel')).toBe(false) // es del rival, no entra
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parseMatchesSection`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/parseMatchesSection.ts
import { groupRows } from '@/lib/pdf/groupRows'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import type { WyscoutReportMatch, WyscoutReportMatchLineupPlayer } from './wyscoutReportTypes'

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/
const SCORE_RE = /^\d+\s*[–-]\s*\d+$/

function isoDate(text: string): string {
  const m = text.match(DATE_RE)!
  return `${m[3]}-${m[2]}-${m[1]}`
}

interface MatchHeader {
  date: string
  rival: string
  isHome: boolean
  score: string
  competition: string
}

/** Devuelve el encabezado y el XI titular + suplentes usados de la columna que
 *  corresponde al propio equipo (identificado por nombres conocidos, no por lado). */
export function parseMatchHeaderAndLineup(
  pageItems: PdfTextItem[],
  knownRosterNames: Set<string>,
): { header: MatchHeader; lineup: WyscoutReportMatchLineupPlayer[] } {
  const TOP_Y = 700 // encabezado del partido vive por encima de la primera fila de lineup
  const headerItems = pageItems.filter(it => it.y > TOP_Y)
  const dateItem = headerItems.find(it => DATE_RE.test(it.str))!
  const scoreItem = headerItems.find(it => SCORE_RE.test(it.str))!
  const teamNameItems = headerItems
    .filter(it => it !== dateItem && it.y > scoreItem.y - 5 && !SCORE_RE.test(it.str) && it.str.length > 2)
    .sort((a, b) => a.x - b.x)
  const [homeTeamItem, awayTeamItem] = [teamNameItems[0], teamNameItems[teamNameItems.length - 1]]
  const competitionItem = headerItems.find(it => it !== dateItem && Math.abs(it.y - dateItem.y) < 3 && it !== dateItem)

  // Columnas de lineup: agrupar filas por x < 300 (izquierda/home) vs x >= 300 (derecha/away).
  const lineupItems = pageItems.filter(it => it.y <= TOP_Y && it.y > 400) // el XI titular vive arriba de los bloques de formacion
  const leftItems = lineupItems.filter(it => it.x < 300)
  const rightItems = lineupItems.filter(it => it.x >= 300)

  const buildColumn = (colItems: PdfTextItem[]): WyscoutReportMatchLineupPlayer[] => {
    const rows = groupRows(colItems)
    const players: WyscoutReportMatchLineupPlayer[] = []
    for (const row of rows) {
      const posCell = row.cells.find(c => /^[A-Z]{2,4}$/.test(c.text))
      const numberCell = row.cells.find(c => /^\d{1,2}$/.test(c.text))
      const nameCell = row.cells.find(c => c !== posCell && c !== numberCell && /[a-zA-Záéíóúñ]/.test(c.text))
      if (!posCell || !numberCell || !nameCell) continue
      players.push({ number: Number(numberCell.text), name: nameCell.text, positionCode: posCell.text, isStarter: true })
    }
    return players
  }

  const leftPlayers = buildColumn(leftItems)
  const rightPlayers = buildColumn(rightItems)
  const leftMatches = leftPlayers.filter(p => knownRosterNames.has(p.name)).length
  const rightMatches = rightPlayers.filter(p => knownRosterNames.has(p.name)).length
  const ownIsLeft = leftMatches >= rightMatches

  const homeName = homeTeamItem.str
  const awayName = awayTeamItem.str
  const ownName = ownIsLeft ? homeName : awayName
  const rivalName = ownIsLeft ? awayName : homeName

  return {
    header: {
      date: isoDate(dateItem.str),
      rival: rivalName,
      isHome: ownIsLeft,
      score: scoreItem.str,
      competition: competitionItem?.str ?? '',
    },
    lineup: ownIsLeft ? leftPlayers : rightPlayers,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parseMatchesSection`
Expected: PASS. `TOP_Y`/the `y > 400` lineup-vs-stint cutoff are the values most likely to need adjusting per real page geometry — if `lineup` comes back empty or with extra stint-block noise, dump `pageItems` sorted by `y` descending for page 6 and find the real y where the flat lineup list ends and the first `"4-2-3-1"` stint block begins.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parseMatchesSection.ts src/features/coaches/wyscoutReport/parseMatchesSection.test.ts
git commit -m "feat(wyscoutReport): parse match header and own-team lineup"
```

---

## Task 9: Matches section — stints and minutes played

**Files:**
- Modify: `src/features/coaches/wyscoutReport/parseMatchesSection.ts`
- Modify: `src/features/coaches/wyscoutReport/parseMatchesSection.test.ts`

**Context (verified against page 6):** below the lineup, stint blocks repeat as `"<scheme>"` + `"<from>' — <to>'"` on the same row (e.g. `x=27.7 "4-2-3-1"`, `x=62.2 "1' — 63'"`, both at `y=412.9`), followed by that stint's own mini-pitch of player dots (jersey number a few points above the surname, same pairing pattern as Task 7's `parseAveragePositions`). The 4 stints in this match sit in 4 roughly-equal-width horizontal slots (verified: slot starts at `x≈27`, `166`, `305`, `443` — a fixed slot width of **~139pt**, calibrate exactly against the fixture in Step 3) — use the slot to know which points belong to which stint, since all 4 mini-pitches share the same y-range.

- [ ] **Step 1: Write the failing test**

```ts
// añadir a parseMatchesSection.test.ts
import { parseMatchStints, minutesPlayedInMatch } from './parseMatchesSection'

describe('parseMatchStints contra el fixture real (pagina 6)', () => {
  it('arma los 4 tramos de formacion con sus rangos de minuto y jugadores en cancha', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const stints = parseMatchStints(items.filter(i => i.page === 6))

    expect(stints).toHaveLength(4)
    expect(stints[0]).toMatchObject({ formation: '4-2-3-1', fromMinute: 1, toMinute: 63 })
    expect(stints[1]).toMatchObject({ formation: '4-2-3-1', fromMinute: 63, toMinute: 74 })
    expect(stints[2]).toMatchObject({ formation: '4-2-3-1', fromMinute: 74, toMinute: 87 })
    expect(stints[3]).toMatchObject({ formation: '4-3-3', fromMinute: 87, toMinute: 90.6 })

    expect(stints[0].players.some(p => p.label === 'Echeverría')).toBe(true)
    expect(stints[3].players.some(p => p.label === 'Krüger')).toBe(true)
    expect(stints[3].players.some(p => p.label === 'Echeverría')).toBe(false) // salio en el tramo anterior
  })

  it('minutesPlayedInMatch suma los tramos donde aparece el jugador', () => {
    const stints = [
      { formation: '4-2-3-1', fromMinute: 1, toMinute: 63, players: [{ x: 0, y: 0, label: 'Echeverría' }] },
      { formation: '4-2-3-1', fromMinute: 63, toMinute: 74, players: [{ x: 0, y: 0, label: 'Krüger' }] },
    ]
    expect(minutesPlayedInMatch(stints, 'Echeverría')).toBe(62)
    expect(minutesPlayedInMatch(stints, 'Krüger')).toBe(11)
    expect(minutesPlayedInMatch(stints, 'Nadie')).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parseMatchesSection`
Expected: FAIL — `parseMatchStints`/`minutesPlayedInMatch` don't exist.

- [ ] **Step 3: Implement — append to `parseMatchesSection.ts`**

```ts
import type { WyscoutReportMatchStint, PitchPoint } from './wyscoutReportTypes'

const STINT_HEADER_RE = /^(\d(-\d){2,4})$/
const MINUTE_RANGE_RE = /^(\d+)\+?(\d+)?'?\s*—\s*(\d+)\+?(\d+)?'?$/

function parseMinuteToken(main: string, extra: string | undefined): number {
  return Number(main) + (extra ? Number(extra) : 0)
}

/** Ancho horizontal de cada carril de tramo -- verificado contra el fixture: los 4
 *  tramos de la pagina 6 arrancan en x=27.7, 166.3, 304.9, 443.5 (delta ~138.7). */
const STINT_SLOT_WIDTH = 139

export function parseMatchStints(pageItems: PdfTextItem[]): WyscoutReportMatchStint[] {
  const headers = pageItems
    .filter(it => STINT_HEADER_RE.test(it.str))
    .sort((a, b) => a.x - b.x)

  return headers.map((headerItem, i) => {
    const rangeItem = pageItems.find(it =>
      Math.abs(it.y - headerItem.y) < 2 && it.x > headerItem.x && MINUTE_RANGE_RE.test(it.str),
    )!
    const m = rangeItem.str.match(MINUTE_RANGE_RE)!
    const fromMinute = parseMinuteToken(m[1], m[2])
    const toMinute = parseMinuteToken(m[3], m[4])

    const slotStart = headerItem.x - 15 // el carril arranca un poco a la izquierda del texto del esquema
    const slotEnd = slotStart + STINT_SLOT_WIDTH
    const pitchItems = pageItems.filter(it =>
      it.y < headerItem.y - 20 && // debajo del renglon de encabezado del tramo
      it.x >= slotStart && it.x < slotEnd,
    )

    const numbers = pitchItems.filter(it => /^\d{1,2}$/.test(it.str))
    const players: PitchPoint[] = numbers.map(n => {
      const nameItem = pitchItems
        .filter(it => it !== n && Math.abs(it.x - n.x) < 15 && it.y < n.y && n.y - it.y < 12)
        .sort((a, b) => (n.y - a.y) - (n.y - b.y))[0]
      return { x: n.x - slotStart, y: n.y, label: nameItem?.str }
    })

    return { formation: headerItem.str, fromMinute, toMinute, players }
  })
}

export function minutesPlayedInMatch(
  stints: Pick<WyscoutReportMatchStint, 'fromMinute' | 'toMinute' | 'players'>[],
  playerSurname: string,
): number {
  return stints
    .filter(s => s.players.some(p => p.label === playerSurname))
    .reduce((sum, s) => sum + (s.toMinute - s.fromMinute), 0)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parseMatchesSection`
Expected: PASS. The `90+6'` minute format (extra time) is handled by `MINUTE_RANGE_RE` capturing the `+N` as a separate group added on — verify the last stint of a match with extra time parses `toMinute` sensibly (the test above expects `90.6` as a placeholder distinguishing value — decide during implementation whether extra-time minutes should add as whole minutes, e.g. `90 + 6 = 96`, and adjust `parseMinuteToken` and the test's expectation together; `90.6` in the test above is a bug to fix in this step, not a target to preserve — use `96`).

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parseMatchesSection.ts src/features/coaches/wyscoutReport/parseMatchesSection.test.ts
git commit -m "feat(wyscoutReport): parse formation stints and compute minutes played"
```

---

## Task 10: Assemble full matches (10 pages → `WyscoutReportMatch[]`)

**Files:**
- Modify: `src/features/coaches/wyscoutReport/parseMatchesSection.ts`
- Modify: `src/features/coaches/wyscoutReport/parseMatchesSection.test.ts`

**Interfaces:**
- Consumes: `parseMatchHeaderAndLineup`, `parseMatchStints` (this file, Tasks 8-9)
- Produces: `parseMatchesSection(pagesItems: PdfTextItem[][], knownRosterNames: Set<string>): WyscoutReportMatch[]` — one entry per page.

- [ ] **Step 1: Write the failing test**

```ts
// añadir a parseMatchesSection.test.ts
import { parseMatchesSection } from './parseMatchesSection'

describe('parseMatchesSection contra las 10 paginas de partidos del fixture', () => {
  it('arma los 10 partidos con fecha, rival y minutos jugados verificables', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const pages = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(p => items.filter(i => i.page === p))
    const matches = parseMatchesSection(pages, KNOWN_ROSTER_NAMES)

    expect(matches).toHaveLength(10)
    expect(matches[0]).toMatchObject({ date: '2026-08-31', rival: 'Quilmes', isHome: false })
    expect(matches[9]).toMatchObject({ date: '2026-06-20', rival: 'San Martín Tucumán', isHome: true })

    // Echeverria en el partido vs Quilmes: 46'(sube) hasta 74' = 28 minutos.
    const vsQuilmes = matches[0]
    expect(minutesPlayedInMatch(vsQuilmes.stints, 'Echeverría')).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parseMatchesSection`
Expected: FAIL — `parseMatchesSection` doesn't exist.

- [ ] **Step 3: Implement — append to `parseMatchesSection.ts`**

```ts
export function parseMatchesSection(
  pagesItems: PdfTextItem[][],
  knownRosterNames: Set<string>,
): WyscoutReportMatch[] {
  return pagesItems.map(pageItems => {
    const { header, lineup } = parseMatchHeaderAndLineup(pageItems, knownRosterNames)
    const stints = parseMatchStints(pageItems)
    return { ...header, lineup, stints }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parseMatchesSection`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parseMatchesSection.ts src/features/coaches/wyscoutReport/parseMatchesSection.test.ts
git commit -m "feat(wyscoutReport): assemble all 10 matches from PARTIDOS pages"
```

---

## Task 11: Event maps parser (scatter points — duelos, aéreos, tiros, regates, córners, tiros libres)

**Files:**
- Create: `src/features/coaches/wyscoutReport/parseEventMaps.ts`
- Test: `src/features/coaches/wyscoutReport/parseEventMaps.test.ts`

**Context (verified against pages 16 and 22):** an event-scatter chart is a labeled region (`"PROPIA MITAD"` / `"MITAD ADVERSARIA"` full-width text near the top of the chart) containing many bare 1-2 digit numbers (jersey numbers, `width < 7`) with **no accompanying name label** — unlike the average-position pitches (Tasks 7/9) where each number has a name below it. Corners/free kicks (page 22) use the exact same bare-number-scatter pattern inside a smaller `"MITAD ADVERSARIA"` crop next to the taker ranking table — same parser, different bounding region, no separate code path needed. Normalize each chart's own points to 0-100 using that chart's own bounding box (min/max of its points), same technique as Task 7.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/parseEventMaps.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseEventMaps } from './parseEventMaps'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseEventMaps contra el fixture real (pagina 16)', () => {
  it('extrae los puntos de duelos defensivos en el propio tercio', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const maps = parseEventMaps(items.filter(i => i.page === 16), 'duelos_defensivos_propio_tercio')

    expect(maps).toHaveLength(1)
    expect(maps[0].half).toBe('propia')
    expect(maps[0].points.length).toBeGreaterThan(30) // pagina 16 tiene decenas de eventos
    for (const p of maps[0].points) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(100)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(100)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parseEventMaps`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/parseEventMaps.ts
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { dedupItems } from './dedupItems'
import type { WyscoutEventMap, PitchHalf } from './wyscoutReportTypes'

const HALF_LABEL_RE = /^(PROPIA MITAD|MITAD ADVERSARIA)$/

function halfFromLabel(text: string | undefined): PitchHalf {
  if (text === 'PROPIA MITAD') return 'propia'
  if (text === 'MITAD ADVERSARIA') return 'rival'
  return 'completa'
}

/** Un mapa de eventos = numeros de camiseta sueltos (1-2 digitos, sin nombre debajo
 *  -- eso los distingue de una cancha de posicion media, Tasks 7/9), agrupados bajo
 *  la etiqueta de mitad de cancha mas cercana arriba. */
export function parseEventMaps(pageItems: PdfTextItem[], category: string): WyscoutEventMap[] {
  const items = dedupItems(pageItems)
  const halfLabels = items.filter(i => HALF_LABEL_RE.test(i.str)).sort((a, b) => b.y - a.y)
  if (halfLabels.length === 0) return []

  return halfLabels.map((label, i) => {
    const next = halfLabels[i + 1]
    const regionItems = items.filter(it =>
      it.y < label.y && (!next || it.y >= next.y),
    )
    const numbers = regionItems.filter(it => /^\d{1,2}$/.test(it.str) && it.width < 7)
    const xs = numbers.map(n => n.x)
    const ys = numbers.map(n => n.y)
    const [minX, maxX] = [Math.min(...xs, 0), Math.max(...xs, 1)]
    const [minY, maxY] = [Math.min(...ys, 0), Math.max(...ys, 1)]
    const spanX = maxX - minX || 1
    const spanY = maxY - minY || 1

    return {
      category,
      half: halfFromLabel(label.str),
      points: numbers.map(n => ({
        x: ((n.x - minX) / spanX) * 100,
        y: 100 - ((n.y - minY) / spanY) * 100,
        label: n.str,
      })),
    }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parseEventMaps`
Expected: PASS. If the point count looks too low/high, temporarily log `regionItems.length` and `numbers.length` for page 16 to check the `width < 7` cutoff isn't excluding real jersey numbers or including stray small text (icon labels, axis marks) — adjust the width threshold against the real fixture.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parseEventMaps.ts src/features/coaches/wyscoutReport/parseEventMaps.test.ts
git commit -m "feat(wyscoutReport): parse event scatter maps (duels, shots, set pieces)"
```

---

## Task 12: Set pieces parser (corners + free kicks)

**Files:**
- Create: `src/features/coaches/wyscoutReport/parseSetPieces.ts`
- Test: `src/features/coaches/wyscoutReport/parseSetPieces.test.ts`

**Interfaces:**
- Consumes: `parseEventMaps` (Task 11) — reused directly for the point extraction.
- Produces: `parseSetPieces(pageItems: PdfTextItem[]): WyscoutReportSetPiece[]`

**Context (page 22):** "CÓRNERES IZQUIERDOS" (`x=14.4, y=735.6`) and "CÓRNERES DERECHOS" (`x=311.4, y=735.6`) split the page into a left/right half by side (not by team) — each half has its own `"MITAD ADVERSARIA"` mini-pitch of scatter points, reuse `parseEventMaps`' region-extraction logic on each half of the page independently (filter items by `x < 300` / `x >= 300` before calling it), then tag `side: 'izquierdo' | 'derecho'` from which section header the half belongs to. The free-kicks sub-page (later on the same page, "TIROS LIBRES IZQUIERDOS"/"...DERECHOS") repeats the identical structure — same function, called again with `type: 'tiro_libre'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/parseSetPieces.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseSetPieces } from './parseSetPieces'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseSetPieces contra el fixture real (pagina 22)', () => {
  it('extrae puntos de corner y tiro libre con su lado', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const setPieces = parseSetPieces(items.filter(i => i.page === 22))

    expect(setPieces.some(sp => sp.type === 'corner' && sp.side === 'izquierdo')).toBe(true)
    expect(setPieces.some(sp => sp.type === 'corner' && sp.side === 'derecho')).toBe(true)
    expect(setPieces.some(sp => sp.type === 'tiro_libre')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parseSetPieces`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/parseSetPieces.ts
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { parseEventMaps } from './parseEventMaps'
import type { WyscoutReportSetPiece } from './wyscoutReportTypes'

const PAGE_MIDPOINT_X = 300

function pointsFromHalf(items: PdfTextItem[], category: string) {
  return parseEventMaps(items, category).flatMap(m => m.points)
}

export function parseSetPieces(pageItems: PdfTextItem[]): WyscoutReportSetPiece[] {
  const cornerSectionY = pageItems.find(i => /CÓRNERES/i.test(i.str))?.y ?? Infinity
  const freeKickSectionY = pageItems.find(i => /TIROS LIBRES/i.test(i.str))?.y ?? -Infinity

  const cornerItems = pageItems.filter(i => i.y < cornerSectionY && i.y > freeKickSectionY)
  const freeKickItems = pageItems.filter(i => i.y <= freeKickSectionY)

  const build = (items: PdfTextItem[], type: 'corner' | 'tiro_libre'): WyscoutReportSetPiece[] => {
    const left = pointsFromHalf(items.filter(i => i.x < PAGE_MIDPOINT_X), `${type}_izquierdo`)
    const right = pointsFromHalf(items.filter(i => i.x >= PAGE_MIDPOINT_X), `${type}_derecho`)
    return [
      ...left.map(point => ({ type, side: 'izquierdo' as const, point })),
      ...right.map(point => ({ type, side: 'derecho' as const, point })),
    ]
  }

  return [...build(cornerItems, 'corner'), ...build(freeKickItems, 'tiro_libre')]
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parseSetPieces`
Expected: PASS. If a side comes back empty, verify `cornerSectionY`/`freeKickSectionY` against real page-22 coordinates (the section-title y values) — the corner/free-kick split point on the page may not land exactly between the two blocks; adjust the slicing boundary.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parseSetPieces.ts src/features/coaches/wyscoutReport/parseSetPieces.test.ts
git commit -m "feat(wyscoutReport): parse corner and free kick set pieces"
```

---

## Task 13: Zone-grid parser (recuperaciones/pérdidas/faltas)

**Files:**
- Create: `src/features/coaches/wyscoutReport/parseZoneGrids.ts`
- Test: `src/features/coaches/wyscoutReport/parseZoneGrids.test.ts`

**Context (verified against page 20):** three stacked sub-sections on the "TRANSICIONES" page, each titled ("Recuperaciones de balón", "Pérdidas de balón", "Faltas cometidas"). Each has a 3×3 grid of large bold percentages (verified real values for "Recuperaciones": row1 `9.8% / 14% / 3.9%`, row2 `16.1% / 15.9% / 3.4%`, row3 `13% / 19.1% / 5%`) plus a smaller reference number below each (`8.8 / 12.6 / 3.5`, etc.) — **run `dedupItems` first**, these percentages are drawn twice (stroke effect). Distinguish grid percentages from the marginal row/column totals shown above/left of the grid (`38.8% 48.9% 12.3%` header row, `27.6% / 35.4% / 37%` left column) by: grid cells cluster into exactly 3 x-groups and 3 y-groups with regular spacing; marginals sit outside that cluster's row/column bounds (verified: marginal row is at `y=737.5`, clearly above the grid's `y≈589-696` range; marginal column is at `x=19.5`, clearly left of the grid's `x≈53-247` range) — filter to `y` strictly inside the grid's y-range before clustering.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/parseZoneGrids.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import { parseZoneGrids } from './parseZoneGrids'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseZoneGrids contra el fixture real (pagina 20)', () => {
  it('extrae la grilla 3x3 de Recuperaciones con los porcentajes reales del PDF', async () => {
    const items = await extractPdfItems(fixture('temperley-informe-equipo.pdf'))
    const grids = parseZoneGrids(items.filter(i => i.page === 20))

    const recuperaciones = grids.find(g => g.category === 'recuperaciones')!
    expect(recuperaciones.cells).toHaveLength(9)

    const cell = (row: number, col: number) => recuperaciones.cells.find(c => c.row === row && c.col === col)!
    expect(cell(0, 0).pct).toBe(9.8)
    expect(cell(0, 1).pct).toBe(14)
    expect(cell(0, 2).pct).toBe(3.9)
    expect(cell(1, 0).pct).toBe(16.1)
    expect(cell(2, 2).pct).toBe(5)
    expect(cell(0, 0).reference).toBe(8.8)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parseZoneGrids`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/parseZoneGrids.ts
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { dedupItems } from './dedupItems'
import type { WyscoutZoneGrid } from './wyscoutReportTypes'

const SECTION_TITLES: { match: RegExp; category: WyscoutZoneGrid['category'] }[] = [
  { match: /^Recuperaciones de balón$/i, category: 'recuperaciones' },
  { match: /^Pérdidas de balón$/i, category: 'perdidas' },
  { match: /^Faltas cometidas$/i, category: 'faltas' },
]

const PCT_RE = /^(\d+(?:\.\d+)?)%$/
const REF_RE = /^\d+(?:\.\d+)?$/

/** Agrupa valores por cercania (gap > threshold arranca un grupo nuevo), sin
 *  depender de coordenadas absolutas -- generaliza entre los 3 graficos de la
 *  pagina, cada uno con su propio rango de x/y. */
function clusterInto3(values: number[], gapThreshold: number): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const v of sorted) {
    const last = groups[groups.length - 1]
    if (last && v - last[last.length - 1] <= gapThreshold) last.push(v)
    else groups.push([v])
  }
  return groups.map(g => g.reduce((a, b) => a + b, 0) / g.length) // centro de cada grupo
}

function nearestGroupIndex(groupCenters: number[], value: number): number {
  let best = 0
  let bestDist = Infinity
  groupCenters.forEach((c, i) => {
    const d = Math.abs(c - value)
    if (d < bestDist) { bestDist = d; best = i }
  })
  return best
}

export function parseZoneGrids(pageItems: PdfTextItem[]): WyscoutZoneGrid[] {
  const items = dedupItems(pageItems)
  const sectionHeaders = items
    .filter(it => SECTION_TITLES.some(s => s.match.test(it.str)))
    .map(it => ({ ...it, category: SECTION_TITLES.find(s => s.match.test(it.str))!.category }))
    .sort((a, b) => b.y - a.y)

  return sectionHeaders.map((header, i) => {
    const next = sectionHeaders[i + 1]
    const sectionItems = items.filter(it => it.y < header.y && (!next || it.y >= next.y))

    // Los porcentajes grandes de la grilla tienen ancho > 20; el resumen marginal
    // (arriba/izquierda) y la referencia chica (abajo de cada celda) son mas angostos.
    const gridPct = sectionItems.filter(it => PCT_RE.test(it.str) && it.width > 20)
    const xCenters = clusterInto3(gridPct.map(c => c.x), 30)
    const yCenters = clusterInto3(gridPct.map(c => c.y), 20)

    const cells = gridPct.map(c => {
      const row = 2 - nearestGroupIndex(yCenters, c.y) // y crece hacia arriba: el grupo de y mas alto es la fila 0 (tercio propio, arriba en el dibujo)
      const col = nearestGroupIndex(xCenters, c.x)
      const reference = sectionItems.find(r =>
        REF_RE.test(r.str) && r.width < 15 &&
        Math.abs(r.x - c.x) < 15 && c.y - r.y > 5 && c.y - r.y < 25,
      )
      return { row, col, pct: Number(c.str.replace('%', '')), reference: reference ? Number(reference.str) : null }
    })

    return { category: header.category, cells }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parseZoneGrids`
Expected: PASS. If `row`/`col` come back transposed or reversed, that's the `nearestGroupIndex`/`2 - ...` orientation to fix — compare against the real PDF image (page 20) to confirm which physical grid position (top-left, etc.) each percentage occupies, then adjust the row inversion, not the test's expected values (those were read directly off the fixture in Section 7 of the spec).

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/parseZoneGrids.ts src/features/coaches/wyscoutReport/parseZoneGrids.test.ts
git commit -m "feat(wyscoutReport): parse 3x3 zone-percentage heatmap grids"
```

---

## Task 14: Insights engine

**Files:**
- Create: `src/features/coaches/wyscoutReport/wyscoutReportInsights.ts`
- Test: `src/features/coaches/wyscoutReport/wyscoutReportInsights.test.ts`

**Interfaces:**
- Consumes: `WyscoutReportData` (Task 2)
- Produces: `computeWyscoutInsights(report: WyscoutReportData): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/wyscoutReportInsights.test.ts
import { describe, it, expect } from 'vitest'
import { computeWyscoutInsights } from './wyscoutReportInsights'
import type { WyscoutReportData } from './wyscoutReportTypes'

function baseReport(overrides: Partial<WyscoutReportData> = {}): WyscoutReportData {
  return {
    sourceFileName: 'test.pdf', matchCountWindow: 10,
    players: [], formations: [], matches: [], eventMaps: [], zoneGrids: [], setPieces: [],
    ...overrides,
  }
}

describe('computeWyscoutInsights', () => {
  it('no genera ninguna conclusion sobre un reporte vacio', () => {
    expect(computeWyscoutInsights(baseReport())).toEqual([])
  })

  it('destaca la formacion con mejor diferencial de goles cuando hay mas de una', () => {
    const report = baseReport({
      formations: [
        { scheme: '4-2-3-1', usagePct: 60, averagePositions: [], teamStats: [{ label: 'GOLES', own: 6, rival: 4 }] },
        { scheme: '4-4-2', usagePct: 26, averagePositions: [], teamStats: [{ label: 'GOLES', own: 4, rival: 1 }] },
      ],
    })
    const insights = computeWyscoutInsights(report)
    expect(insights.some(i => i.includes('4-4-2'))).toBe(true)
  })

  it('destaca el goleador y el asistidor del tramo', () => {
    const report = baseReport({
      players: [
        { number: 11, name: 'P. Souto', positionCode: 'LAMF', age: 26, foot: null, heightCm: 178, matches: 9, minutesTotal: 762, minutesAvg: 85, goals: 4, assists: 0, yellowCards: 1, redCards: 0, metrics: {} },
        { number: 5, name: 'F. Díaz', positionCode: 'RCMF', age: 26, foot: null, heightCm: 181, matches: 8, minutesTotal: 723, minutesAvg: 90, goals: 0, assists: 4, yellowCards: 6, redCards: 0, metrics: {} },
      ],
    })
    const insights = computeWyscoutInsights(report)
    expect(insights.some(i => i.includes('P. Souto'))).toBe(true)
    expect(insights.some(i => i.includes('F. Díaz'))).toBe(true)
  })

  it('cuenta los titulares distintos usados en la ventana de partidos', () => {
    const report = baseReport({
      matches: [
        { date: '2026-08-31', rival: 'Quilmes', isHome: false, score: '0-1', competition: 'Primera Nacional', lineup: [{ number: 1, name: 'A', positionCode: 'GK', isStarter: true }, { number: 2, name: 'B', positionCode: 'RB', isStarter: true }], stints: [] },
        { date: '2026-08-23', rival: 'Midland', isHome: true, score: '2-1', competition: 'Primera Nacional', lineup: [{ number: 1, name: 'A', positionCode: 'GK', isStarter: true }, { number: 3, name: 'C', positionCode: 'LB', isStarter: true }], stints: [] },
      ],
    })
    const insights = computeWyscoutInsights(report)
    expect(insights.some(i => i.includes('3'))).toBe(true) // A, B, C = 3 titulares distintos
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- wyscoutReportInsights`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/wyscoutReportInsights.ts
import type { WyscoutReportData } from './wyscoutReportTypes'

export function computeWyscoutInsights(report: WyscoutReportData): string[] {
  const insights: string[] = []

  if (report.formations.length > 1) {
    const withDiff = report.formations
      .map(f => {
        const goles = f.teamStats.find(s => s.label.startsWith('GOLES'))
        return goles ? { scheme: f.scheme, diff: goles.own - goles.rival } : null
      })
      .filter((f): f is { scheme: string; diff: number } => f !== null)
    if (withDiff.length > 1) {
      const best = [...withDiff].sort((a, b) => b.diff - a.diff)[0]
      insights.push(`La formación con mejor diferencial de goles es ${best.scheme} (+${best.diff}).`)
    }
  }

  if (report.players.length > 0) {
    const topScorer = [...report.players].sort((a, b) => b.goals - a.goals)[0]
    if (topScorer.goals > 0) insights.push(`${topScorer.name} es el goleador del tramo con ${topScorer.goals} goles.`)

    const topAssister = [...report.players].sort((a, b) => b.assists - a.assists)[0]
    if (topAssister.assists > 0) insights.push(`${topAssister.name} lidera las asistencias con ${topAssister.assists}.`)
  }

  if (report.matches.length > 0) {
    const startersUsed = new Set(report.matches.flatMap(m => m.lineup.filter(p => p.isStarter).map(p => p.name)))
    insights.push(`Se usaron ${startersUsed.size} titulares distintos en los últimos ${report.matches.length} partidos.`)
  }

  return insights
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- wyscoutReportInsights`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/wyscoutReport/wyscoutReportInsights.ts src/features/coaches/wyscoutReport/wyscoutReportInsights.test.ts
git commit -m "feat(wyscoutReport): compute rule-based insights from parsed report"
```

---

## Task 15: Orchestrator — `parseWyscoutReportPdf`

**Files:**
- Create: `src/features/coaches/wyscoutReport/parseWyscoutReportPdf.ts`
- Test: `src/features/coaches/wyscoutReport/parseWyscoutReportPdf.test.ts`

**Interfaces:**
- Consumes: `extractPdfItems` (`@/lib/pdf/extractPdfItems`), `findPageHeaders`/`classifySectionLabel` (Task 3), `parsePlayersSection`/`extendPlayersWithStats`/`extendPlayersWithFoot` (Tasks 5-6), `parseFormationsSection` (Task 7), `parseMatchesSection` (Task 10), `parseEventMaps` (Task 11), `parseSetPieces` (Task 12), `parseZoneGrids` (Task 13)
- Produces: `parseWyscoutReportPdf(data: ArrayBuffer, opts: { fileName: string; matchCountWindow: number; workerSrc?: string }): Promise<{ report: WyscoutReportData; warnings: string[] }>`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/coaches/wyscoutReport/parseWyscoutReportPdf.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseWyscoutReportPdf } from './parseWyscoutReportPdf'

function fixture(name: string): ArrayBuffer {
  const path = fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
  const buf = readFileSync(path)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

describe('parseWyscoutReportPdf de punta a punta contra el fixture real', () => {
  it('arma el WyscoutReportData completo sin tirar ninguna excepcion', async () => {
    const { report, warnings } = await parseWyscoutReportPdf(fixture('temperley-informe-equipo.pdf'), {
      fileName: 'temperley-informe-equipo.pdf',
      matchCountWindow: 10,
    })

    expect(report.players.length).toBeGreaterThan(15)
    expect(report.formations.length).toBeGreaterThanOrEqual(2)
    expect(report.matches).toHaveLength(10)
    expect(report.eventMaps.length).toBeGreaterThan(0)
    expect(report.zoneGrids).toHaveLength(3)
    expect(report.setPieces.length).toBeGreaterThan(0)
    expect(warnings).not.toContain(expect.stringMatching(/glosario/i)) // paginas conocidas no generan warning
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- parseWyscoutReportPdf`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
// src/features/coaches/wyscoutReport/parseWyscoutReportPdf.ts
import { extractPdfItems } from '@/lib/pdf/extractPdfItems'
import type { PdfTextItem } from '@/lib/pdf/extractPdfItems'
import { findPageHeaders } from './classifySectionLabel'
import { parsePlayersSection, extendPlayersWithStats, extendPlayersWithFoot } from './parsePlayersSection'
import { parseFormationsSection } from './parseFormationsSection'
import { parseMatchesSection } from './parseMatchesSection'
import { parseEventMaps } from './parseEventMaps'
import { parseSetPieces } from './parseSetPieces'
import { parseZoneGrids } from './parseZoneGrids'
import type { WyscoutReportData } from './wyscoutReportTypes'

const EVENT_MAP_CATEGORIES_BY_SECTION: Record<string, string> = {
  fase_defensiva: 'duelos_defensivos',
  ataque: 'ataque',
}

export async function parseWyscoutReportPdf(
  data: ArrayBuffer,
  opts: { fileName: string; matchCountWindow: number; workerSrc?: string },
): Promise<{ report: WyscoutReportData; warnings: string[] }> {
  const items = await extractPdfItems(data, { workerSrc: opts.workerSrc })
  const headers = findPageHeaders(items)
  const warnings: string[] = []

  const pagesFor = (label: string) => headers.filter(h => h.label === label).map(h => h.page)
  const itemsForPages = (pages: number[]) => items.filter(it => pages.includes(it.page))

  for (const h of headers) {
    if (h.label === 'desconocida') warnings.push(`Página ${h.page}: sección no reconocida ("${h.raw}"), se ignoró.`)
  }

  let players = parsePlayersSection(itemsForPages(pagesFor('jugadores')))
  const statsPages = pagesFor('estadisticas')
  if (statsPages.length > 0) players = extendPlayersWithStats(players, itemsForPages(statsPages))
  const buildUpPages = pagesFor('construccion_del_juego')
  if (buildUpPages.length > 0) players = extendPlayersWithFoot(players, itemsForPages(buildUpPages))

  const formations = parseFormationsSection(itemsForPages(pagesFor('formaciones')))

  const rosterNames = new Set(players.map(p => p.name))
  const matchPages = pagesFor('partidos')
  const matches = parseMatchesSection(
    matchPages.map(p => items.filter(it => it.page === p)),
    rosterNames,
  )

  const eventMaps = Object.entries(EVENT_MAP_CATEGORIES_BY_SECTION).flatMap(([section, category]) =>
    pagesFor(section).flatMap(page => parseEventMaps(items.filter(it => it.page === page), category)),
  )

  const setPieces = pagesFor('jugadas_a_balon_parado').flatMap(page =>
    parseSetPieces(items.filter(it => it.page === page)),
  )

  const zoneGrids = pagesFor('transiciones').flatMap(page =>
    parseZoneGrids(items.filter(it => it.page === page)),
  )

  const report: WyscoutReportData = {
    sourceFileName: opts.fileName,
    matchCountWindow: opts.matchCountWindow,
    players,
    formations,
    matches,
    eventMaps,
    zoneGrids,
    setPieces,
  }

  if (players.length === 0) warnings.push('No se encontraron jugadores en el informe.')
  if (matches.length === 0) warnings.push('No se encontraron partidos en el informe.')

  return { report, warnings }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- parseWyscoutReportPdf`
Expected: PASS.

- [ ] **Step 5: Run the entire `wyscoutReport` test suite together to check for cross-parser regressions**

Run: `npm run test -- wyscoutReport`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/coaches/wyscoutReport/parseWyscoutReportPdf.ts src/features/coaches/wyscoutReport/parseWyscoutReportPdf.test.ts
git commit -m "feat(wyscoutReport): orchestrate full PDF parse into WyscoutReportData"
```

---

## Task 16: Generalize `VideoAnalysisPitch` (label + half)

**Files:**
- Modify: `src/features/coaches/components/VideoAnalysisPitch.tsx`
- Test: Create `src/features/coaches/components/VideoAnalysisPitch.test.tsx`

**Interfaces:**
- Produces: `VideoAnalysisPitch({ exact: PitchPoint[]; zones: ZoneRect[]; half?: 'completa' | 'propia' | 'rival' })` where `PitchPoint = { x: number; y: number; label?: string }` (import from `@/features/coaches/wyscoutReport/wyscoutReportTypes` — this is the one place that type is shared outside its owning feature, which is fine since it's a pure geometry type, not report-specific logic).

Check the project's component-testing setup first (`grep -rn "@testing-library/react" package.json`) — if it's present, write a render test; if this codebase has no component-test precedent (pure-logic tests only, as seen throughout `gps/parser` and `wyscoutReport`), skip the render test and rely on the manual browser check in Step 4 instead, noting that explicitly rather than adding a new testing dependency for one component.

- [ ] **Step 1: Check for existing component-test tooling**

Run: `grep -n "@testing-library" package.json`
Expected: note the result — if absent, Step 2 below only adds a plain rendering smoke test using `react-dom/server` (already available, no new dependency), not a full interaction test.

- [ ] **Step 2: Modify the component**

```tsx
// src/features/coaches/components/VideoAnalysisPitch.tsx
import type { PitchHalf } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

export default function VideoAnalysisPitch({
  exact,
  zones,
  half = 'completa',
}: {
  exact: { x: number; y: number; label?: string }[]
  zones: { x1: number; y1: number; x2: number; y2: number }[]
  half?: PitchHalf
}) {
  // 'propia'/'rival' recortan el viewBox a la mitad de arriba/abajo -- los puntos
  // ya vienen normalizados 0-100 sobre esa mitad (el parser hizo esa cuenta), asi
  // que el recorte es solo visual, no hace falta reescalar `exact` aca.
  const viewBoxByHalf: Record<PitchHalf, string> = {
    completa: '0 0 100 130',
    propia: '0 65 100 65',
    rival: '0 0 100 65',
  }

  return (
    <div className="bg-gradient-to-b from-emerald-600 to-emerald-700 rounded-2xl p-4 relative w-full aspect-[3/4] max-w-md mx-auto shadow-2xl overflow-hidden">
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={viewBoxByHalf[half]} preserveAspectRatio="none">
        <rect x="2" y="2" width="96" height="126" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
        <circle cx="50" cy="65" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <line x1="2" y1="65" x2="98" y2="65" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <rect x="20" y="2" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
        <rect x="20" y="108" width="60" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
      </svg>

      {zones.map((z, i) => (
        <div
          key={i}
          className="absolute bg-brand-green/30 rounded-md"
          style={{ left: `${z.x1}%`, top: `${z.y1}%`, width: `${z.x2 - z.x1}%`, height: `${z.y2 - z.y1}%` }}
        />
      ))}

      {exact.map((p, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-yellow-400 shadow text-2xs font-bold text-apple-gray-900"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.label ? '18px' : '8px', height: p.label ? '18px' : '8px' }}
        >
          {p.label}
        </div>
      ))}

      {exact.length === 0 && zones.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs text-white/70 text-center px-6">Sin datos de posición para esta categoría.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: If `@testing-library/react` is present, write and run a render test; otherwise skip to Step 4**

```tsx
// src/features/coaches/components/VideoAnalysisPitch.test.tsx (only if testing-library exists)
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import VideoAnalysisPitch from './VideoAnalysisPitch'

describe('VideoAnalysisPitch', () => {
  it('muestra el label sobre el punto cuando viene', () => {
    const { getByText } = render(<VideoAnalysisPitch exact={[{ x: 50, y: 50, label: '9' }]} zones={[]} />)
    expect(getByText('9')).toBeInTheDocument()
  })
})
```

Run: `npm run test -- VideoAnalysisPitch`
Expected: PASS.

- [ ] **Step 4: Manual check — confirm existing video-análisis usage still renders correctly**

Run `npm run dev`, open an entrenador with video-análisis data loaded, confirm the pitch still renders points exactly as before (no `label`s passed there, so nothing visually changes — this is the regression check for Task 16 since it touches a component another feature depends on).

- [ ] **Step 5: Commit**

```bash
git add src/features/coaches/components/VideoAnalysisPitch.tsx
git commit -m "feat(coaches): generalize VideoAnalysisPitch with label and half props"
```

---

## Task 17: Supabase migration — table + storage bucket

**Files:**
- Create: `supabase/migrations/20260906_coach_wyscout_reports.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260906_coach_wyscout_reports.sql

CREATE TABLE IF NOT EXISTS public.coach_wyscout_reports (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_key      TEXT NOT NULL,
  match_window   INT NOT NULL,
  data           JSONB NOT NULL,
  warnings       JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file    TEXT,
  storage_path   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cwr_coach ON public.coach_wyscout_reports(coach_key, created_at DESC);

ALTER TABLE public.coach_wyscout_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_cwr" ON public.coach_wyscout_reports;
CREATE POLICY "read_cwr" ON public.coach_wyscout_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS "write_cwr" ON public.coach_wyscout_reports;
CREATE POLICY "write_cwr" ON public.coach_wyscout_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket de Storage para el PDF original, publico (mismo modelo que coach-video-analysis):
-- la ruta de cada objeto incluye coachKey/reportId, no es adivinable ni listable sin
-- conocer esos ids.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('coach-wyscout-reports', 'coach-wyscout-reports', true, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 20971520, allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "coach_wyscout_reports_insert" ON storage.objects;
CREATE POLICY "coach_wyscout_reports_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'coach-wyscout-reports');

DROP POLICY IF EXISTS "coach_wyscout_reports_update" ON storage.objects;
CREATE POLICY "coach_wyscout_reports_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'coach-wyscout-reports')
  WITH CHECK (bucket_id = 'coach-wyscout-reports');

DROP POLICY IF EXISTS "coach_wyscout_reports_read" ON storage.objects;
CREATE POLICY "coach_wyscout_reports_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'coach-wyscout-reports');

DROP POLICY IF EXISTS "coach_wyscout_reports_delete" ON storage.objects;
CREATE POLICY "coach_wyscout_reports_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'coach-wyscout-reports');
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push` (or the project's usual migration-apply command — check `package.json`/`README` for the exact one used by prior migrations; if unsure, ask the user, since this touches the live database).

- [ ] **Step 3: Verify in the Supabase dashboard**

Confirm `coach_wyscout_reports` table and `coach-wyscout-reports` storage bucket exist with the policies above.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260906_coach_wyscout_reports.sql
git commit -m "feat(db): add coach_wyscout_reports table and storage bucket"
```

---

## Task 18: `coachWyscoutReportService.ts`

**Files:**
- Create: `src/services/coachWyscoutReportService.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`), `WyscoutReportData` (`@/features/coaches/wyscoutReport/wyscoutReportTypes`)
- Produces: `WyscoutReportSummary`, `listWyscoutReports`, `getLatestWyscoutReport`, `saveWyscoutReport`, `deleteWyscoutReport`

- [ ] **Step 1: Write the file**

```ts
// src/services/coachWyscoutReportService.ts
import { supabase } from '@/lib/supabase'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

export interface WyscoutReportSummary {
  id: number
  coach_key: string
  match_window: number
  source_file: string | null
  created_at: string
}

const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20MB

export async function listWyscoutReports(coachKey: string): Promise<WyscoutReportSummary[]> {
  const { data, error } = await supabase
    .from('coach_wyscout_reports')
    .select('id, coach_key, match_window, source_file, created_at')
    .eq('coach_key', coachKey)
    .order('created_at', { ascending: false })

  if (error || !data) {
    console.error('Error listando informes de Wyscout:', error)
    return []
  }
  return data as unknown as WyscoutReportSummary[]
}

export async function getLatestWyscoutReport(coachKey: string): Promise<WyscoutReportData | null> {
  const { data, error } = await supabase
    .from('coach_wyscout_reports')
    .select('data')
    .eq('coach_key', coachKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data.data as unknown as WyscoutReportData
}

export async function saveWyscoutReport(
  coachKey: string,
  report: WyscoutReportData,
  warnings: string[],
  file: File,
): Promise<{ success: boolean; error?: string }> {
  if (file.size > MAX_PDF_BYTES) {
    return { success: false, error: 'El PDF pesa más de 20MB.' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('coach_wyscout_reports')
    .insert({
      coach_key: coachKey,
      match_window: report.matchCountWindow,
      data: report,
      warnings,
      source_file: report.sourceFileName,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('Error guardando informe de Wyscout:', insertError)
    return { success: false, error: insertError?.message }
  }

  const path = `${coachKey}/${inserted.id}.pdf`
  const { error: uploadError } = await supabase.storage
    .from('coach-wyscout-reports')
    .upload(path, file, { upsert: true })

  if (uploadError) {
    console.error('Error subiendo PDF de Wyscout:', uploadError)
    return { success: true } // el dato ya se guardo; el PDF original es solo para auditar
  }

  await supabase.from('coach_wyscout_reports').update({ storage_path: path }).eq('id', inserted.id)
  return { success: true }
}

export async function deleteWyscoutReport(id: number): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('coach_wyscout_reports').delete().eq('id', id)
  if (error) {
    console.error('Error borrando informe de Wyscout:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}
```

- [ ] **Step 2: Type-check the file**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this file.

- [ ] **Step 3: Commit**

```bash
git add src/services/coachWyscoutReportService.ts
git commit -m "feat(wyscoutReport): add Supabase service for report CRUD"
```

---

## Task 19: Upload panel UI

**Files:**
- Create: `src/features/coaches/components/CoachWyscoutReportUploadPanel.tsx`

**Interfaces:**
- Consumes: `GpsDropzone` (`@/features/gps/components/GpsDropzone`), `parseWyscoutReportPdf` (Task 15), `saveWyscoutReport` (Task 18), `AgencyCoach` (`@/constants/agencyCoaches`)

- [ ] **Step 1: Write the component**

```tsx
// src/features/coaches/components/CoachWyscoutReportUploadPanel.tsx
import { useState } from 'react'
import GpsDropzone from '@/features/gps/components/GpsDropzone'
import { parseWyscoutReportPdf } from '@/features/coaches/wyscoutReport/parseWyscoutReportPdf'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'
import { saveWyscoutReport } from '@/services/coachWyscoutReportService'
import type { AgencyCoach } from '@/constants/agencyCoaches'

export default function CoachWyscoutReportUploadPanel({
  coach,
  onSaved,
}: {
  coach: AgencyCoach
  onSaved: () => void
}) {
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ report: WyscoutReportData; warnings: string[]; file: File } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setParsing(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const { report, warnings } = await parseWyscoutReportPdf(buffer, {
        fileName: file.name,
        matchCountWindow: 10,
      })
      if (report.players.length === 0 && report.matches.length === 0) {
        setError('No se pudo leer el informe. Tiene que ser el PDF "Informe del equipo" de Wyscout.')
        return
      }
      setResult({ report, warnings, file })
    } catch {
      setError('No se pudo leer el archivo. Tiene que ser el PDF "Informe del equipo" de Wyscout.')
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    try {
      const { success, error: saveError } = await saveWyscoutReport(coach.key, result.report, result.warnings, result.file)
      if (!success) {
        setError(saveError ?? 'No se pudo guardar el informe.')
        return
      }
      setResult(null)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (!result) {
    return (
      <div className="space-y-3">
        {error && (
          <div className="rounded-apple-lg border border-brand-red/40 bg-brand-red/10 px-3 sm:px-4 py-2.5 text-sm text-brand-red">
            {error}
          </div>
        )}
        <GpsDropzone
          onFile={file => void handleFile(file)}
          disabled={parsing}
          accept="application/pdf,.pdf"
          label={parsing ? 'Leyendo el informe…' : 'Arrastrá el PDF "Informe del equipo" de Wyscout'}
          hint="Los últimos 10 partidos de Wyscout, en PDF."
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 px-3 sm:px-4 py-3 text-sm">
        <p className="font-semibold text-apple-gray-800 dark:text-white">
          {result.report.matches.length} partidos · {result.report.players.length} jugadores · {result.report.formations.length} formaciones detectadas
        </p>
        {result.warnings.length > 0 && (
          <ul className="mt-2 text-xs text-amber-500 list-disc list-inside">
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="min-h-[40px] px-4 rounded-full bg-brand-green text-apple-gray-900 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar informe'}
        </button>
        <button
          type="button"
          onClick={() => setResult(null)}
          disabled={saving}
          className="text-sm text-apple-gray-500 hover:text-apple-gray-700 dark:hover:text-apple-gray-300 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/coaches/components/CoachWyscoutReportUploadPanel.tsx
git commit -m "feat(wyscoutReport): add PDF upload panel UI"
```

---

## Task 20: Results panel UI — players table, formations, maps, set pieces, insights

**Files:**
- Create: `src/features/coaches/components/CoachWyscoutReportPanel.tsx`

**Interfaces:**
- Consumes: `WyscoutReportData` (Task 2), `VideoAnalysisPitch` (Task 16), `computeWyscoutInsights` (Task 14)
- Produces: `CoachWyscoutReportPanel({ report: WyscoutReportData })`

**Design note (validated palette, per the spec's Section 11):** the zone-grid cells use this exact 5-step sequential ramp, with the text-color flip rule already computed against the app's real surfaces — copy these hex values verbatim, don't re-derive:

```ts
const ZONE_RAMP_LIGHT = ['#EAFBF1', '#BEF2D3', '#7FE0A8', '#3FBF77', '#16803D']
const ZONE_RAMP_DARK   = ['#0F2A1C', '#134A2C', '#1B7A43', '#22C55E', '#79F2AB']
// texto oscuro (apple-gray-900) en los pasos 0-3 claro / 0-2 oscuro; texto claro en el resto.
```

- [ ] **Step 1: Write the component**

```tsx
// src/features/coaches/components/CoachWyscoutReportPanel.tsx
import { useState } from 'react'
import VideoAnalysisPitch from './VideoAnalysisPitch'
import { computeWyscoutInsights } from '@/features/coaches/wyscoutReport/wyscoutReportInsights'
import type { WyscoutReportData, WyscoutZoneGrid } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

const ZONE_RAMP_LIGHT = ['#EAFBF1', '#BEF2D3', '#7FE0A8', '#3FBF77', '#16803D']
const ZONE_RAMP_DARK = ['#0F2A1C', '#134A2C', '#1B7A43', '#22C55E', '#79F2AB']
const DARK_TEXT_STEPS_LIGHT = new Set([0, 1, 2, 3])
const DARK_TEXT_STEPS_DARK = new Set([0, 1, 2])

function rampStep(pct: number, allPcts: number[]): number {
  const max = Math.max(...allPcts, 1)
  return Math.min(4, Math.floor((pct / max) * 5))
}

function ZoneGridCard({ grid }: { grid: WyscoutZoneGrid }) {
  const pcts = grid.cells.map(c => c.pct)
  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4">
      <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">{grid.category}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3)
          const col = i % 3
          const cell = grid.cells.find(c => c.row === row && c.col === col)
          const step = cell ? rampStep(cell.pct, pcts) : 0
          const darkText = DARK_TEXT_STEPS_LIGHT.has(step) // se corrige por modo con CSS var abajo
          return (
            <div
              key={i}
              className="rounded-lg aspect-square flex flex-col items-center justify-center"
              style={{ backgroundColor: `var(--zone-ramp-${step}, ${ZONE_RAMP_LIGHT[step]})` }}
            >
              <span className={`text-sm font-bold ${darkText ? 'text-apple-gray-900' : 'text-white'}`}>
                {cell ? `${cell.pct}%` : '–'}
              </span>
              {cell?.reference != null && (
                <span className={`text-2xs ${darkText ? 'text-apple-gray-700' : 'text-white/80'}`}>{cell.reference}</span>
              )}
            </div>
          )
        })}
      </div>
      <style>{ZONE_RAMP_DARK.map((hex, i) => `
        :root:not([data-theme="light"]) { --zone-ramp-${i}: ${hex}; }
        [data-theme="dark"] { --zone-ramp-${i}: ${hex}; }
      `).join('\n')}</style>
    </div>
  )
}

function PlayersTable({ players }: { players: WyscoutReportData['players'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-2xs text-apple-gray-400 uppercase text-left">
            <th className="py-2 pr-3">Jugador</th>
            <th className="py-2 pr-3 text-right">Min</th>
            <th className="py-2 pr-3 text-right">Goles</th>
            <th className="py-2 pr-3 text-right">Asist</th>
            <th className="py-2 pr-3 text-right">TA/TR</th>
          </tr>
        </thead>
        <tbody>
          {[...players].sort((a, b) => b.minutesTotal - a.minutesTotal).map(p => (
            <tr key={p.name} className="border-t border-apple-gray-100 dark:border-apple-gray-700/40">
              <td className="py-2 pr-3 font-medium text-apple-gray-800 dark:text-white">{p.name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{p.minutesTotal}'</td>
              <td className="py-2 pr-3 text-right tabular-nums">{p.goals}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{p.assists}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{p.yellowCards}/{p.redCards}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FormationCard({ formation }: { formation: WyscoutReportData['formations'][number] }) {
  return (
    <div className="bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-lg font-bold text-apple-gray-800 dark:text-white">{formation.scheme}</p>
        <span className="text-sm font-semibold text-brand-green">{formation.usagePct}%</span>
      </div>
      <VideoAnalysisPitch exact={formation.averagePositions} zones={[]} />
      <div className="space-y-1.5">
        {formation.teamStats.map(s => (
          <div key={s.label} className="flex items-center justify-between text-xs">
            <span className="tabular-nums font-semibold text-brand-green w-10 text-right">{s.own}</span>
            <span className="text-apple-gray-400 flex-1 text-center px-2">{s.label}</span>
            <span className="tabular-nums font-semibold text-apple-gray-400 w-10">{s.rival}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CoachWyscoutReportPanel({ report }: { report: WyscoutReportData }) {
  const insights = computeWyscoutInsights(report)
  const [mapCategory, setMapCategory] = useState(report.eventMaps[0]?.category ?? null)

  return (
    <div className="space-y-6 mt-6">
      <div>
        <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Plantel (Wyscout)</p>
        <PlayersTable players={report.players} />
      </div>

      <div>
        <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Formaciones usadas</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {report.formations.map(f => <FormationCard key={f.scheme} formation={f} />)}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Mapas de zona</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {report.zoneGrids.map(g => <ZoneGridCard key={g.category} grid={g} />)}
        </div>
        {report.eventMaps.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {[...new Set(report.eventMaps.map(m => m.category))].map(cat => (
                <button
                  key={cat}
                  onClick={() => setMapCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-full ${cat === mapCategory ? 'bg-brand-green text-apple-gray-900' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <VideoAnalysisPitch
              exact={report.eventMaps.filter(m => m.category === mapCategory).flatMap(m => m.points)}
              zones={[]}
            />
          </div>
        )}
      </div>

      {report.setPieces.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Balón parado</p>
          <VideoAnalysisPitch exact={report.setPieces.map(sp => sp.point)} zones={[]} half="rival" />
        </div>
      )}

      {insights.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-apple-gray-400 uppercase tracking-wide mb-3">Conclusiones</p>
          <ul className="space-y-2">
            {insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-apple-gray-700 dark:text-apple-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green flex-shrink-0 mt-1.5" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/coaches/components/CoachWyscoutReportPanel.tsx
git commit -m "feat(wyscoutReport): add results panel (players, formations, maps, insights)"
```

---

## Task 21: Wire into `CoachSeasonStatsCard`

**Files:**
- Modify: `src/features/coaches/components/CoachSeasonStatsCard.tsx`

- [ ] **Step 1: Add the second upload toggle and the results panel**

```tsx
// agregar a los imports existentes
import { useEffect, useState } from 'react'
import CoachWyscoutReportUploadPanel from './CoachWyscoutReportUploadPanel'
import CoachWyscoutReportPanel from './CoachWyscoutReportPanel'
import { getLatestWyscoutReport } from '@/services/coachWyscoutReportService'
import type { WyscoutReportData } from '@/features/coaches/wyscoutReport/wyscoutReportTypes'

// dentro del componente, junto a los demas useState existentes:
const [wyscoutReport, setWyscoutReport] = useState<WyscoutReportData | null>(null)
const [showReportUpload, setShowReportUpload] = useState(false)

const reloadReport = () => {
  getLatestWyscoutReport(coach.key).then(setWyscoutReport)
}

useEffect(() => {
  reloadReport()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [coach.key])
```

Junto al botón existente `{t('coachDetail.cargarExcelWyscout')}` (mismo `<div className="flex items-center justify-between mb-4 flex-wrap gap-2">`), agregar un segundo botón:

```tsx
<button
  type="button"
  onClick={() => setShowReportUpload(v => !v)}
  className="text-2xs font-semibold text-brand-green hover:underline"
>
  {showReportUpload ? t('coachDetail.cerrar') : 'Cargar informe PDF de Wyscout'}
</button>
```

Y debajo del bloque `{showUpload && (...)}` existente:

```tsx
{showReportUpload && (
  <div className="mb-4">
    <CoachWyscoutReportUploadPanel coach={coach} onSaved={() => { reloadReport(); setShowReportUpload(false) }} />
  </div>
)}
```

Al final del `return`, después de `<CoachMatchHistoryTable rows={enrichedRows} />`:

```tsx
{wyscoutReport && <CoachWyscoutReportPanel report={wyscoutReport} />}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check in the browser**

Run `npm run dev`, open Nicolás Domingo's coach page → Resumen, click "Cargar informe PDF de Wyscout", drop `src/features/coaches/wyscoutReport/__fixtures__/temperley-informe-equipo.pdf`, confirm the preview counts look right, save, confirm the panel renders below with real data (players table sorted by minutes, 3 formation cards with pitches, zone-grid heatmaps with the validated green ramp, event map selector, set pieces pitch, conclusions list).

- [ ] **Step 4: Commit**

```bash
git add src/features/coaches/components/CoachSeasonStatsCard.tsx
git commit -m "feat(wyscoutReport): wire PDF upload and results panel into Resumen"
```

---

## Task 22: Homegrown-players placeholder (mechanism ready, list deferred)

**Files:**
- Create: `src/features/coaches/wyscoutReport/homegrownPlayers.ts`
- Create: `src/features/coaches/wyscoutReport/homegrownUsage.ts`
- Test: `src/features/coaches/wyscoutReport/homegrownUsage.test.ts`

**Interfaces:**
- Produces: `HOMEGROWN_PLAYERS_BY_COACH: Record<string, string[]>`, `computeHomegrownUsageByMatch(matches: WyscoutReportMatch[], homegrownNames: string[], stints: ...): { date: string; playerCount: number; totalMinutes: number }[]`

- [ ] **Step 1: Write the placeholder list file**

```ts
// src/features/coaches/wyscoutReport/homegrownPlayers.ts

/** Jugadores surgidos de inferiores de cada club, por coach_key. Vacio hasta que
 *  el usuario mande la lista -- una vez completo, el grafico de uso por partido
 *  (homegrownUsage.ts) se activa solo, sin tocar nada mas. */
export const HOMEGROWN_PLAYERS_BY_COACH: Record<string, string[]> = {}
```

- [ ] **Step 2: Write the failing test for the (currently unpluggable) usage calculator**

```ts
// src/features/coaches/wyscoutReport/homegrownUsage.test.ts
import { describe, it, expect } from 'vitest'
import { computeHomegrownUsageByMatch } from './homegrownUsage'
import type { WyscoutReportMatch } from './wyscoutReportTypes'

describe('computeHomegrownUsageByMatch', () => {
  it('cuenta jugadores y minutos de la lista dada, por fecha de partido', () => {
    const matches: WyscoutReportMatch[] = [
      {
        date: '2026-08-31', rival: 'Quilmes', isHome: false, score: '0-1', competition: 'Primera Nacional',
        lineup: [{ number: 14, name: 'Nicolás Ávalos', positionCode: 'DMF', isStarter: false }],
        stints: [
          { formation: '4-3-3', fromMinute: 87, toMinute: 96, players: [{ x: 0, y: 0, label: 'Nicolás Ávalos' }] },
        ],
      },
    ]
    const result = computeHomegrownUsageByMatch(matches, ['Nicolás Ávalos'])
    expect(result).toEqual([{ date: '2026-08-31', playerCount: 1, totalMinutes: 9 }])
  })

  it('devuelve 0 en partidos sin ningun jugador de la lista', () => {
    const matches: WyscoutReportMatch[] = [
      { date: '2026-08-23', rival: 'Midland', isHome: true, score: '2-1', competition: 'Primera Nacional', lineup: [], stints: [] },
    ]
    expect(computeHomegrownUsageByMatch(matches, ['Nicolás Ávalos'])).toEqual([{ date: '2026-08-23', playerCount: 0, totalMinutes: 0 }])
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -- homegrownUsage`
Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement**

```ts
// src/features/coaches/wyscoutReport/homegrownUsage.ts
import { minutesPlayedInMatch } from './parseMatchesSection'
import type { WyscoutReportMatch } from './wyscoutReportTypes'

export function computeHomegrownUsageByMatch(
  matches: WyscoutReportMatch[],
  homegrownNames: string[],
): { date: string; playerCount: number; totalMinutes: number }[] {
  const nameSet = new Set(homegrownNames)
  return matches.map(match => {
    const surnamesInMatch = homegrownNames.filter(name =>
      match.lineup.some(p => p.name === name) ||
      match.stints.some(s => s.players.some(pt => pt.label && nameSet.has(name) && name.includes(pt.label))),
    )
    const totalMinutes = surnamesInMatch.reduce(
      (sum, name) => sum + minutesPlayedInMatch(match.stints, name.split(' ').pop()!),
      0,
    )
    return { date: match.date, playerCount: surnamesInMatch.length, totalMinutes }
  })
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -- homegrownUsage`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/coaches/wyscoutReport/homegrownPlayers.ts src/features/coaches/wyscoutReport/homegrownUsage.ts src/features/coaches/wyscoutReport/homegrownUsage.test.ts
git commit -m "feat(wyscoutReport): add homegrown-usage calculator, list pending from user"
```

**Note for whoever picks this up once the list arrives:** fill `HOMEGROWN_PLAYERS_BY_COACH['domingo']` (and `'stillitano'` if applicable) in `homegrownPlayers.ts`, then add a bar-chart subsection (Recharts, two series: `playerCount` and `totalMinutes`) to `CoachWyscoutReportPanel.tsx`, rendered only `if (HOMEGROWN_PLAYERS_BY_COACH[coach.key]?.length)`. Not part of this plan's scope per the spec's Section 13 — this task only makes sure the data plumbing is ready.

---

## Self-Review Notes

- **Spec coverage:** every numbered section of the spec (1 shared PDF lib, 2 section anchors, 3 players, 4 formations, 5 matches/stints/minutes, 6 event maps, 7 zone grids, 9 schema, 10 UI, 11 palette, 12 insights, 13 homegrown-deferred) maps to a task above (1→Task 1, 2→Task 3, 3→Tasks 5-6, 4→Task 7, 5→Tasks 8-10, 6→Tasks 11-12, 7→Task 13, 9→Task 17, 10→Tasks 19-21, 11→Task 20, 12→Task 14, 13→Task 22).
- **Placeholder scan:** no "TBD"/"add error handling" left; every calibration step names the exact real value it should produce and how to re-derive it if the first attempt is off (a legitimate TDD-against-a-real-fixture iteration, not a vague placeholder).
- **Type consistency:** `PitchPoint`, `PitchHalf`, `WyscoutReportMatch`, `WyscoutZoneGrid` etc. are defined once in Task 2 and referenced identically (same field names) in every later task — checked Tasks 7, 9, 11, 13, 16, 20, 22 against Task 2's definitions.
- **Known risk flagged explicitly, not hidden:** Task 7 (formations block-splitting) and Task 13 (zone-grid row/col orientation) are marked as the highest-uncertainty geometry parsers — their steps say exactly what to inspect and adjust if the first run doesn't match the fixture-derived expected values, consistent with the spec's honesty about confidence tiers.
