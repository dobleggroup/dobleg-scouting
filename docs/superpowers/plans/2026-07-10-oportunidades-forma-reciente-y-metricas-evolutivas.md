# Oportunidades por forma reciente + Métricas evolutivas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Oportunidades rankee por forma reciente (Score GG) + condición de mercado, mostrar un adelanto en Inicio, y sumar gráficos evolutivos Wyscout (con insights) en la ficha interna y en Informes.

**Architecture:** Dos piezas base reutilizables: (1) un RPC de Supabase `fetch_recent_form` que agrega `player_match_stats.match_score` por ventana temporal, y (2) un módulo `wyscoutEvolutionService` que baja/parsea la planilla Wyscout por partido. Encima se construyen las 7 features. Todo pega a Supabase o a la planilla CSV vía el proxy existente — no toca API-Football ni functions de Netlify.

**Tech Stack:** React 18 + TS, Vite, Recharts, PapaParse, Supabase (Postgres RPC), Vitest.

## Global Constraints

- No consumir API-Football (límite 7500 req/día es del cron de sync) ni functions de Netlify: los datos salen de Supabase (`player_match_stats`) o de la planilla publicada como CSV vía `buildSheetUrl` (proxy ya existente).
- La marca del scoring es **"Score GG"** — nunca renombrarla en la UI.
- Match de nombres siempre con `normalizeName` de `src/utils/scoring.ts` (NFD, case/acento-insensitive).
- Comando de tests: `npm test` (= `vitest run`). Un solo archivo: `npx vitest run <ruta>`.
- Gráfico evolutivo Wyscout: planilla `1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s`, `gid=284673441`, export CSV.
- Métricas de par ("X / Y" = intentos / logrados) → graficar **% de eficacia** (logrados/intentos); métricas simples → valor crudo.
- Solo jugadores del scouting **interno** ven: pestaña Rendimiento reordenada, gráfico Wyscout, insights y (en Informes) pestaña "Métricas evolutivas".

---

## Estructura de archivos

**Crear:**
- `src/services/wyscoutEvolutionService.ts` — baja/parsea la planilla Wyscout, detecta pares, expone métricas y series por jugador.
- `src/services/wyscoutEvolutionService.test.ts`
- `src/features/wyscout/wyscoutInsights.ts` — motor de reglas de insights (puro).
- `src/features/wyscout/wyscoutInsights.test.ts`
- `src/components/charts/MetricEvolutionChart.tsx` — gráfico de línea reutilizable (ficha + informes preview).
- `supabase/migrations/20260710120000_recent_form_rpc.sql` — RPC `fetch_recent_form`.
- `src/utils/opportunities.test.ts` — tests de la clasificación de oportunidades.
- `src/components/dashboard/OpportunityHero.tsx` — hero rotativo de Inicio.

**Modificar:**
- `src/constants/scoring.ts` — agregar URL de la planilla Wyscout evolutiva.
- `src/types/scoring.ts` — tipo `RecentFormPlayer`.
- `src/services/playerStatsService.ts` — `fetchRecentForm()`.
- `src/hooks/usePlayerStats.ts` — hook `useRecentForm()`.
- `src/utils/opportunities.ts` — clasificación por forma + tag de mercado.
- `src/pages/OpportunitiesPage.tsx` — selector de ventana + consumo del RPC + sparkline.
- `src/pages/HomePage.tsx` — reemplazar "Actividad de la semana" por `OpportunityHero`.
- `src/pages/PlayerDetailPage.tsx` — reorden de tabs + gráfico Wyscout + insights.
- `src/components/players/PlayerTable.tsx` — columna "Video Cargado".
- `src/features/informes/types.ts` — campo `evolutionCharts?`.
- `src/features/informes/components/Step2Metricas.tsx` — sección "Métricas evolutivas".
- `src/features/informes/components/Step4Preview.tsx` — pestaña de preview.
- `src/features/informes/chartSvg.ts` — generador `lineSvg`.
- `src/features/informes/exportInformeHTML.ts` — sección exportada.

---

## Task 1: Módulo `wyscoutEvolutionService` (parseo de la planilla)

**Files:**
- Modify: `src/constants/scoring.ts` (bloque `SHEET_URLS`, ~línea 27-38)
- Create: `src/services/wyscoutEvolutionService.ts`
- Test: `src/services/wyscoutEvolutionService.test.ts`

**Interfaces:**
- Consumes: `buildSheetUrl` (privado en scoring.ts — se agrega una entrada a `SHEET_URLS`), `normalizeName` de `@/utils/scoring`, `Papa` de `papaparse`.
- Produces:
  - `type WyscoutMetric = { key: string; label: string; type: 'simple' | 'ratio'; unit: '%' | '' }`
  - `type WyscoutPoint = { date: string; matchLabel: string; competition: string; value: number | null }`
  - `parseWyscoutCsv(text: string): { metrics: WyscoutMetric[]; rowsByPlayer: Map<string, WyscoutPoint[]>... }` (interno, exportado para test)
  - `function buildMetricSeries(rows: Record<string,string>[], headers: string[], metricKey: string): WyscoutPoint[]`
  - `async function loadWyscoutEvolution(): Promise<WyscoutEvolutionData>` donde `WyscoutEvolutionData = { metrics: WyscoutMetric[]; getSeries(playerName: string, metricKey: string): WyscoutPoint[]; hasPlayer(playerName: string): boolean }`

- [ ] **Step 1: Agregar la URL de la planilla en `SHEET_URLS`**

En `src/constants/scoring.ts`, dentro del objeto `SHEET_URLS` (después de la línea `gps:` ~37), agregar:

```ts
  wyscoutEvolucion: buildSheetUrl('/spreadsheets/d/1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s/export?format=csv&gid=284673441'),
```

- [ ] **Step 2: Escribir el test de parseo de headers en pares**

Crear `src/services/wyscoutEvolutionService.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseMetricSchema, buildMetricSeries } from './wyscoutEvolutionService'

// Header real: label del par ocupa 2 columnas (intentos, logrados); la 2da viene vacía.
const HEADERS = [
  'Jugador', 'Partido', 'Competition', 'Date', 'Minutos jugados',
  'Pases / logrados', '', 'Goles', 'xG',
]

describe('parseMetricSchema', () => {
  it('detecta métricas simples y de par', () => {
    const metrics = parseMetricSchema(HEADERS)
    const pases = metrics.find(m => m.label.startsWith('Pases'))!
    expect(pases.type).toBe('ratio')
    expect(pases.unit).toBe('%')
    const goles = metrics.find(m => m.label === 'Goles')!
    expect(goles.type).toBe('simple')
    // No incluye columnas de contexto (Jugador/Partido/Competition/Date)
    expect(metrics.some(m => m.label === 'Jugador')).toBe(false)
  })
})

describe('buildMetricSeries', () => {
  const rows = [
    { Jugador: 'José Paradela', Partido: 'A - B 2:1', Competition: 'Liga MX', Date: '2024-05-06',
      'Minutos jugados': '90', 'Pases / logrados': '26', __COL6: '16', Goles: '0', xG: '0.06' },
  ]
  it('métrica de par devuelve el % de eficacia (logrados/intentos)', () => {
    const s = buildMetricSeries(rows as any, HEADERS, 'pases')
    expect(s[0].value).toBeCloseTo((16 / 26) * 100, 1)
  })
  it('métrica simple devuelve el valor crudo', () => {
    const s = buildMetricSeries(rows as any, HEADERS, 'xg')
    expect(s[0].value).toBeCloseTo(0.06, 3)
  })
})
```

> Nota de parseo: PapaParse con `header:true` colapsa headers duplicados/vacíos. Para conservar la 2da columna del par, parsear con `header:false` (array de arrays) y mapear por índice. El test usa `HEADERS` + filas indexadas; el service debe trabajar con la matriz cruda por índice, no con objetos por header.

- [ ] **Step 3: Correr el test — debe fallar**

Run: `npx vitest run src/services/wyscoutEvolutionService.test.ts`
Expected: FAIL — `parseMetricSchema is not a function`.

- [ ] **Step 4: Implementar `wyscoutEvolutionService.ts`**

```ts
import Papa from 'papaparse'
import { SHEET_URLS } from '@/constants/scoring'
import { normalizeName } from '@/utils/scoring'

export interface WyscoutMetric {
  key: string
  label: string
  type: 'simple' | 'ratio'
  unit: '%' | ''
  attemptsIdx: number          // índice de columna (intentos, o valor si simple)
  achievedIdx: number | null   // índice de columna logrados (solo ratio)
}

export interface WyscoutPoint {
  date: string
  matchLabel: string
  competition: string
  value: number | null
}

const CTX_COLS = new Set(['Jugador', 'Partido', 'Competition', 'Date', 'Minutos jugados'])

function slug(label: string): string {
  return normalizeName(label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

// A partir de la fila de headers cruda (array), detecta métricas.
// Un label "X / Y" cuya columna siguiente tiene header vacío => métrica de par (ratio).
export function parseMetricSchema(headers: string[]): WyscoutMetric[] {
  const metrics: WyscoutMetric[] = []
  for (let i = 0; i < headers.length; i++) {
    const raw = (headers[i] ?? '').trim()
    if (!raw || CTX_COLS.has(raw)) continue
    const nextEmpty = i + 1 < headers.length && (headers[i + 1] ?? '').trim() === ''
    const isPair = /\s\/\s|\/(precisos|lograd|ganad)/i.test(raw) && nextEmpty
    metrics.push({
      key: slug(raw),
      label: raw,
      type: isPair ? 'ratio' : 'simple',
      unit: isPair ? '%' : '',
      attemptsIdx: i,
      achievedIdx: isPair ? i + 1 : null,
    })
    if (isPair) i++ // saltar la columna consumida
  }
  return metrics
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? null : n
}

// rows = matriz cruda (array de arrays) DESPUÉS de la fila de headers.
export function buildMetricSeries(rows: string[][], headers: string[], metricKey: string): WyscoutPoint[] {
  const metric = parseMetricSchema(headers).find(m => m.key === metricKey)
  if (!metric) return []
  const idxJug = headers.indexOf('Jugador')
  const idxPar = headers.indexOf('Partido')
  const idxComp = headers.indexOf('Competition')
  const idxDate = headers.indexOf('Date')
  return rows
    .map(r => {
      const attempts = num(r[metric.attemptsIdx])
      let value: number | null
      if (metric.type === 'ratio' && metric.achievedIdx !== null) {
        const achieved = num(r[metric.achievedIdx])
        value = attempts && attempts > 0 && achieved !== null ? (achieved / attempts) * 100 : null
      } else {
        value = attempts
      }
      return {
        date: r[idxDate] ?? '',
        matchLabel: r[idxPar] ?? '',
        competition: r[idxComp] ?? '',
        value,
        _player: r[idxJug] ?? '',
      }
    })
    .filter(p => p.date)
    .sort((a, b) => a.date.localeCompare(b.date)) as WyscoutPoint[]
}

export interface WyscoutEvolutionData {
  metrics: WyscoutMetric[]
  getSeries(playerName: string, metricKey: string): WyscoutPoint[]
  hasPlayer(playerName: string): boolean
}

let cache: Promise<WyscoutEvolutionData> | null = null

export function loadWyscoutEvolution(): Promise<WyscoutEvolutionData> {
  if (cache) return cache
  cache = (async () => {
    const res = await fetch(SHEET_URLS.wyscoutEvolucion)
    const text = await res.text()
    const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true })
    const matrix = parsed.data as string[][]
    const headers = (matrix[0] ?? []).map(h => (h ?? '').trim())
    const body = matrix.slice(1)
    const metrics = parseMetricSchema(headers)
    const idxJug = headers.indexOf('Jugador')

    const byPlayer = new Map<string, string[][]>()
    for (const r of body) {
      const key = normalizeName(r[idxJug] ?? '')
      if (!key) continue
      if (!byPlayer.has(key)) byPlayer.set(key, [])
      byPlayer.get(key)!.push(r)
    }

    return {
      metrics,
      hasPlayer: (name: string) => byPlayer.has(normalizeName(name)),
      getSeries: (name: string, metricKey: string) => {
        const rows = byPlayer.get(normalizeName(name)) ?? []
        return buildMetricSeries(rows, headers, metricKey)
      },
    }
  })()
  return cache
}
```

- [ ] **Step 5: Correr los tests — deben pasar**

Run: `npx vitest run src/services/wyscoutEvolutionService.test.ts`
Expected: PASS (3 tests). Ajustar el test si el índice del par difiere del real (el header vacío del par es la columna `achievedIdx`).

- [ ] **Step 6: Verificar el parseo contra la planilla real**

Run: `curl -sL "https://docs.google.com/spreadsheets/d/1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s/export?format=csv&gid=284673441" | head -3`
Expected: confirmar que los headers de par van seguidos de una columna vacía (ej. `Pases / logrados,,`).

- [ ] **Step 7: Commit**

```bash
git add src/constants/scoring.ts src/services/wyscoutEvolutionService.ts src/services/wyscoutEvolutionService.test.ts
git commit -m "feat(wyscout): servicio de datos evolutivos desde planilla (pares -> % eficacia)"
```

---

## Task 2: RPC `fetch_recent_form` + servicio cliente

**Files:**
- Create: `supabase/migrations/20260710120000_recent_form_rpc.sql`
- Modify: `src/types/scoring.ts` (agregar tipo al final)
- Modify: `src/services/playerStatsService.ts` (agregar función)
- Modify: `src/hooks/usePlayerStats.ts` (agregar hook)

**Interfaces:**
- Produces:
  - `interface RecentFormPlayer { id: number; name: string; photo: string | null; team: TeamInfo | null; league_name: string | null; primary_position: string | null; birth_date: string | null; market_value_eur: number | null; contract_end_date: string | null; primary_score: number | null; recent_avg: number; recent_matches: number; recent_scores: number[]; on_the_rise: boolean; window_used: 'window' | 'fallback' }`
  - `async function fetchRecentForm(opts: { windowMonths: number; minMatches?: number; fallbackMonths?: number; fallbackLimit?: number; cheapMaxValue?: number | null; contractMaxMonths?: number | null; positions?: string[]; limit?: number }): Promise<RecentFormPlayer[]>`
  - `function useRecentForm(opts): { players: RecentFormPlayer[]; loading: boolean; error: string | null }`

- [ ] **Step 1: Escribir la migración SQL**

Crear `supabase/migrations/20260710120000_recent_form_rpc.sql`:

```sql
-- fetch_recent_form: jugadores con buena forma reciente (avg match_score en ventana)
-- + condición de mercado (precio bajo OR contrato por vencer). Ranking por avg reciente.
-- Fallback: si la ventana no llega a p_min_matches, usa los últimos p_fallback_limit
-- partidos dentro de p_fallback_months.

CREATE OR REPLACE FUNCTION fetch_recent_form(
  p_window_months       int,
  p_min_matches         int    DEFAULT 3,
  p_fallback_months     int    DEFAULT 6,
  p_fallback_limit      int    DEFAULT 5,
  p_cheap_max_value     bigint DEFAULT NULL,
  p_contract_max_months int    DEFAULT NULL,
  p_positions           text[] DEFAULT NULL,
  p_limit               int    DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH scored AS (
    SELECT pms.player_id, pms.match_score, f.date::date AS d
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    WHERE pms.match_score IS NOT NULL
  ),
  window_agg AS (
    SELECT player_id, count(*) AS n, avg(match_score) AS avg_score,
           jsonb_agg(match_score ORDER BY d) AS scores
    FROM scored
    WHERE d >= (now() - make_interval(months => p_window_months))::date
    GROUP BY player_id
  ),
  fb_ranked AS (
    SELECT player_id, match_score, d,
           row_number() OVER (PARTITION BY player_id ORDER BY d DESC) AS rn
    FROM scored
    WHERE d >= (now() - make_interval(months => p_fallback_months))::date
  ),
  fb_agg AS (
    SELECT player_id, count(*) AS n, avg(match_score) AS avg_score,
           jsonb_agg(match_score ORDER BY d) AS scores
    FROM fb_ranked
    WHERE rn <= p_fallback_limit
    GROUP BY player_id
  ),
  chosen AS (
    SELECT
      COALESCE(w.player_id, fb.player_id) AS player_id,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.n        ELSE fb.n END        AS n,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.avg_score ELSE fb.avg_score END AS avg_score,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.scores   ELSE fb.scores END   AS scores,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN 'window'   ELSE 'fallback' END  AS window_used
    FROM window_agg w
    FULL OUTER JOIN fb_agg fb ON fb.player_id = w.player_id
  ),
  qualified AS (
    SELECT
      c.player_id, c.n, c.avg_score, c.scores, c.window_used,
      pl.name, pl.photo, pl.birth_date, pl.primary_position,
      pl.market_value_eur, pl.contract_end_date, pl.current_team_id,
      tm.id AS team_id, tm.name AS team_name, tm.logo AS team_logo, tm.league_id AS team_league_id,
      lg.name AS league_name,
      pss.avg_score AS primary_score
    FROM chosen c
    JOIN players pl ON pl.id = c.player_id
    LEFT JOIN teams tm ON tm.id = pl.current_team_id
    LEFT JOIN leagues lg ON lg.id = tm.league_id
    LEFT JOIN LATERAL (
      SELECT s.avg_score
      FROM player_season_scores s
      WHERE s.player_id = c.player_id AND s.position = pl.primary_position
      ORDER BY s.season DESC, s.matches_played DESC
      LIMIT 1
    ) pss ON true
    WHERE c.n >= p_min_matches
      AND (p_positions IS NULL OR pl.primary_position = ANY(p_positions))
      AND (
        (p_cheap_max_value IS NOT NULL AND pl.market_value_eur IS NOT NULL
           AND pl.market_value_eur <= p_cheap_max_value)
        OR
        (p_contract_max_months IS NOT NULL AND pl.contract_end_date IS NOT NULL
           AND pl.contract_end_date >= now()::date
           AND pl.contract_end_date <= (now() + make_interval(months => p_contract_max_months))::date)
      )
  )
  SELECT COALESCE(jsonb_agg(obj ORDER BY avg_score DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', player_id, 'name', name, 'photo', photo, 'birth_date', birth_date,
      'primary_position', primary_position, 'market_value_eur', market_value_eur,
      'contract_end_date', contract_end_date, 'primary_score', primary_score,
      'recent_avg', round(avg_score::numeric, 2), 'recent_matches', n,
      'recent_scores', scores, 'window_used', window_used,
      'on_the_rise', (primary_score IS NOT NULL AND avg_score > primary_score),
      'league_name', league_name,
      'team', CASE WHEN team_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', team_id, 'name', team_name, 'logo', team_logo, 'league_id', team_league_id
      ) END
    ) AS obj, avg_score
    FROM qualified
    ORDER BY avg_score DESC
    LIMIT GREATEST(p_limit, 0)
  ) s;
$$;

GRANT EXECUTE ON FUNCTION fetch_recent_form(int, int, int, int, bigint, int, text[], int)
  TO anon, authenticated, service_role;
```

- [ ] **Step 2: Aplicar la migración a Supabase**

Run: `npx supabase db push` (o aplicar el SQL en el editor de Supabase del proyecto).
Expected: `fetch_recent_form` creada sin error.

- [ ] **Step 3: Verificar el RPC contra datos reales**

En el SQL editor de Supabase:
```sql
SELECT jsonb_array_length(fetch_recent_form(3, 3, 6, 5, 5000000, 12, NULL, 20));
```
Expected: un entero ≥ 0 (cantidad de oportunidades). Inspeccionar 1 elemento para confirmar `recent_avg`, `recent_scores` (array), `on_the_rise`, `team`.

- [ ] **Step 4: Agregar el tipo `RecentFormPlayer`**

Al final de `src/types/scoring.ts`:

```ts
export interface RecentFormPlayer {
  id: number
  name: string
  photo: string | null
  team: TeamInfo | null
  league_name: string | null
  primary_position: string | null
  birth_date: string | null
  market_value_eur: number | null
  contract_end_date: string | null
  primary_score: number | null
  recent_avg: number
  recent_matches: number
  recent_scores: number[]
  on_the_rise: boolean
  window_used: 'window' | 'fallback'
}
```

(Si `TeamInfo` no está exportado en ese archivo, importar/definir según el existente en `playerStatsService.ts`.)

- [ ] **Step 5: Agregar `fetchRecentForm` al servicio**

En `src/services/playerStatsService.ts` (importar `RecentFormPlayer` del types):

```ts
export async function fetchRecentForm(opts: {
  windowMonths: number
  minMatches?: number
  fallbackMonths?: number
  fallbackLimit?: number
  cheapMaxValue?: number | null
  contractMaxMonths?: number | null
  positions?: string[]
  limit?: number
}): Promise<RecentFormPlayer[]> {
  const { data, error } = await supabase.rpc('fetch_recent_form', {
    p_window_months: opts.windowMonths,
    p_min_matches: opts.minMatches ?? 3,
    p_fallback_months: opts.fallbackMonths ?? 6,
    p_fallback_limit: opts.fallbackLimit ?? 5,
    p_cheap_max_value: opts.cheapMaxValue ?? null,
    p_contract_max_months: opts.contractMaxMonths ?? null,
    p_positions: opts.positions?.length ? opts.positions : null,
    p_limit: opts.limit ?? 200,
  })
  if (error) throw error
  return (data ?? []) as RecentFormPlayer[]
}
```

- [ ] **Step 6: Agregar el hook `useRecentForm`**

En `src/hooks/usePlayerStats.ts` (mismo patrón que `usePlayersList`):

```ts
export function useRecentForm(opts: Parameters<typeof fetchRecentForm>[0]) {
  const [players, setPlayers] = useState<RecentFormPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const key = JSON.stringify(opts)
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchRecentForm(opts)
      .then(p => { if (alive) { setPlayers(p); setError(null) } })
      .catch(e => { if (alive) setError(e.message ?? 'Error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { players, loading, error }
}
```

Asegurar los imports (`fetchRecentForm`, `RecentFormPlayer`, `useState`/`useEffect` ya presentes).

- [ ] **Step 7: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en los archivos tocados.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260710120000_recent_form_rpc.sql src/types/scoring.ts src/services/playerStatsService.ts src/hooks/usePlayerStats.ts
git commit -m "feat(oportunidades): RPC fetch_recent_form + servicio y hook de forma reciente"
```

---

## Task 3: Reordenar pestañas de la ficha interna

**Files:**
- Modify: `src/pages/PlayerDetailPage.tsx` (`tabsConfig`, ~línea 910-923)

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Mover "Rendimiento evolutivo" al 2º lugar**

En `tabsConfig`, reordenar para que quede: `General`, `Rendimiento evolutivo`, `Métricas`, `Valor`, `Físico`, … (el resto igual). Es decir, mover el objeto `{ id: 'Rendimiento evolutivo', label: 'Rendimiento', … }` para que aparezca inmediatamente después de `General` y antes de `Métricas`.

- [ ] **Step 2: Verificar en la app**

Run: `npm run dev`, abrir la ficha de un jugador **interno**.
Expected: el orden de tabs es General → Rendimiento → Métricas → Valor → Físico → …. Para externos no cambia (Rendimiento es `internal: true`, sigue filtrado).

- [ ] **Step 3: Commit**

```bash
git add src/pages/PlayerDetailPage.tsx
git commit -m "feat(ficha): Rendimiento como 2da pestaña en scouting interno"
```

---

## Task 4: Motor de insights Wyscout

**Files:**
- Create: `src/features/wyscout/wyscoutInsights.ts`
- Test: `src/features/wyscout/wyscoutInsights.test.ts`

**Interfaces:**
- Consumes: `WyscoutPoint`, `WyscoutMetric` de `@/services/wyscoutEvolutionService`.
- Produces: `function buildInsights(series: WyscoutPoint[], metric: WyscoutMetric): string[]` (devuelve 0–2 strings, prioridad: racha > tendencia > récord > vs promedio).

- [ ] **Step 1: Escribir los tests**

Crear `src/features/wyscout/wyscoutInsights.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildInsights } from './wyscoutInsights'
import type { WyscoutMetric, WyscoutPoint } from '@/services/wyscoutEvolutionService'

const ratio: WyscoutMetric = { key: 'pases', label: 'Pases / logrados', type: 'ratio', unit: '%', attemptsIdx: 5, achievedIdx: 6 }
const count: WyscoutMetric = { key: 'goles', label: 'Goles', type: 'simple', unit: '', attemptsIdx: 7, achievedIdx: null }

function pts(vals: (number | null)[]): WyscoutPoint[] {
  return vals.map((v, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, matchLabel: `M${i}`, competition: 'X', value: v }))
}

describe('buildInsights', () => {
  it('detecta racha sin marcar en métrica de conteo', () => {
    const out = buildInsights(pts([1, 0, 0, 0, 0]), count)
    expect(out.join(' ')).toMatch(/Hace 4 partidos que no/i)
  })
  it('detecta caída de tendencia en %', () => {
    const out = buildInsights(pts([85, 84, 60, 55]), ratio)
    expect(out.join(' ')).toMatch(/baj/i)
  })
  it('serie vacía => sin insights', () => {
    expect(buildInsights([], ratio)).toEqual([])
  })
})
```

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run src/features/wyscout/wyscoutInsights.test.ts`
Expected: FAIL — `buildInsights is not a function`.

- [ ] **Step 3: Implementar `wyscoutInsights.ts`**

```ts
import type { WyscoutPoint, WyscoutMetric } from '@/services/wyscoutEvolutionService'

function fmt(v: number, unit: string): string {
  return unit === '%' ? `${Math.round(v)}%` : (Math.round(v * 100) / 100).toString()
}

export function buildInsights(series: WyscoutPoint[], metric: WyscoutMetric): string[] {
  const vals = series.map(s => s.value).filter((v): v is number => v !== null)
  if (vals.length < 3) return []
  const out: string[] = []
  const noun = metric.label.split('/')[0].trim().toLowerCase()

  // 1) Racha en 0 (solo conteo/simple)
  if (metric.type === 'simple') {
    let streak = 0
    for (let i = vals.length - 1; i >= 0 && vals[i] === 0; i--) streak++
    if (streak >= 3) out.push(`Hace ${streak} partidos que no registra ${noun}`)
  }

  // 2) Tendencia: promedio últimos 3 vs 3 previos
  if (vals.length >= 6 && out.length < 2) {
    const last3 = vals.slice(-3)
    const prev3 = vals.slice(-6, -3)
    const a = last3.reduce((s, v) => s + v, 0) / 3
    const b = prev3.reduce((s, v) => s + v, 0) / 3
    const diff = a - b
    const rel = b !== 0 ? Math.abs(diff / b) : 1
    if (rel >= 0.1) {
      const dir = diff < 0 ? '▼ bajó' : '▲ subió'
      out.push(`Su ${noun} ${dir} de ${fmt(b, metric.unit)} a ${fmt(a, metric.unit)} en los últimos 3 partidos`)
    }
  }

  // 3) Récord del semestre en el último partido
  if (out.length < 2) {
    const last = vals[vals.length - 1]
    const prevMax = Math.max(...vals.slice(0, -1))
    const prevMin = Math.min(...vals.slice(0, -1))
    if (last > prevMax) out.push(`▲ Mejor ${noun} del período (${fmt(last, metric.unit)}) el último partido`)
    else if (last < prevMin && metric.type === 'ratio') out.push(`▼ Peor ${noun} del período (${fmt(last, metric.unit)}) el último partido`)
  }

  // 4) vs promedio personal
  if (out.length < 2) {
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length
    const last3 = vals.slice(-3)
    if (last3.every(v => v > avg)) out.push(`Últimos 3 partidos por encima de su promedio (${fmt(avg, metric.unit)})`)
    else if (last3.every(v => v < avg)) out.push(`Últimos 3 partidos por debajo de su promedio (${fmt(avg, metric.unit)})`)
  }

  return out.slice(0, 2)
}
```

- [ ] **Step 4: Correr — deben pasar**

Run: `npx vitest run src/features/wyscout/wyscoutInsights.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/wyscout/wyscoutInsights.ts src/features/wyscout/wyscoutInsights.test.ts
git commit -m "feat(wyscout): motor de insights (racha, tendencia, récord, vs promedio)"
```

---

## Task 5: Gráfico `MetricEvolutionChart` + integración en la ficha

**Files:**
- Create: `src/components/charts/MetricEvolutionChart.tsx`
- Modify: `src/pages/PlayerDetailPage.tsx` (tab `Rendimiento evolutivo`, ~línea 2161-2258)

**Interfaces:**
- Consumes: `WyscoutPoint` de `@/services/wyscoutEvolutionService`, Recharts.
- Produces: componente `MetricEvolutionChart({ series, unit, label }: { series: WyscoutPoint[]; unit: '%' | ''; label: string })`.

- [ ] **Step 1: Implementar `MetricEvolutionChart.tsx`**

Basado en el estilo de `ScoreEvolutionChart` (línea + área verde + promedio punteado):

```tsx
import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { WyscoutPoint } from '@/services/wyscoutEvolutionService'

interface Props { series: WyscoutPoint[]; unit: '%' | ''; label: string }

function shortDate(d: string): string {
  const dt = new Date(d)
  const m = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return isNaN(dt.getTime()) ? d : `${dt.getDate()} ${m[dt.getMonth()]}`
}

export default function MetricEvolutionChart({ series, unit, label }: Props) {
  const data = useMemo(
    () => series.filter(s => s.value !== null).map(s => ({
      label: shortDate(s.date), value: s.value as number, match: s.matchLabel, comp: s.competition,
    })),
    [series],
  )
  const avg = useMemo(
    () => data.length ? Math.round((data.reduce((a, b) => a + b.value, 0) / data.length) * 10) / 10 : null,
    [data],
  )
  if (data.length === 0) {
    return <div className="text-center text-apple-gray-400 text-sm py-8">Sin datos de Wyscout para esta métrica</div>
  }
  const fmt = (v: number) => unit === '%' ? `${Math.round(v)}%` : (Math.round(v * 100) / 100).toString()
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <defs>
          <linearGradient id="wyscoutGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
               domain={unit === '%' ? [0, 100] : ['auto', 'auto']} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.[0]) return null
          const d = payload[0].payload as { value: number; match: string; comp: string }
          return (
            <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
              <p className="font-bold text-white">{fmt(d.value)}</p>
              <p className="text-gray-300">{d.match}</p>
              <p className="text-gray-400">{d.comp}</p>
            </div>
          )
        }} />
        {avg !== null && (
          <ReferenceLine y={avg} stroke="#6b7280" strokeDasharray="4 4"
            label={{ value: `Prom: ${fmt(avg)}`, fill: '#6b7280', fontSize: 10, position: 'right' }} />
        )}
        <Area type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2}
          fill="url(#wyscoutGradient)" dot={false}
          activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 1 }} animationDuration={600} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Cargar los datos Wyscout en `PlayerDetailPage`**

Cerca de los otros hooks de estado del componente (donde se declaran `supabaseMatches`, etc.), agregar:

```tsx
// Datos evolutivos Wyscout (solo interno)
const [wyscout, setWyscout] = useState<import('@/services/wyscoutEvolutionService').WyscoutEvolutionData | null>(null)
const [wyscoutMetric, setWyscoutMetric] = useState<string>('')
useEffect(() => {
  if (source !== 'interno') return
  import('@/services/wyscoutEvolutionService').then(m => m.loadWyscoutEvolution()).then(setWyscout).catch(() => {})
}, [source])

const wyscoutSeries = useMemo(() => {
  if (!wyscout || !player || !wyscoutMetric) return []
  return wyscout.getSeries(player.Jugador, wyscoutMetric)
}, [wyscout, player, wyscoutMetric])

const wyscoutMetricDef = useMemo(
  () => wyscout?.metrics.find(m => m.key === wyscoutMetric) ?? null,
  [wyscout, wyscoutMetric],
)
const wyscoutInsights = useMemo(() => {
  if (!wyscoutMetricDef || wyscoutSeries.length === 0) return []
  return buildInsights(wyscoutSeries, wyscoutMetricDef)
}, [wyscoutSeries, wyscoutMetricDef])

// setear métrica por defecto cuando cargan
useEffect(() => {
  if (wyscout && !wyscoutMetric && wyscout.metrics.length) setWyscoutMetric(wyscout.metrics[0].key)
}, [wyscout, wyscoutMetric])
```

Agregar los imports arriba del archivo:
```tsx
import MetricEvolutionChart from '@/components/charts/MetricEvolutionChart'
import { buildInsights } from '@/features/wyscout/wyscoutInsights'
```

- [ ] **Step 3: Renderizar el gráfico + insights debajo de "Evolución del Score"**

Dentro del bloque `activeTab === 'Rendimiento evolutivo'` (después del `<div>` que cierra "Evolución del Score" con `ScoreEvolutionChart`, y antes de "Historial de Partidos"), insertar:

```tsx
{wyscout && player && wyscout.hasPlayer(player.Jugador) && (
  <div>
    <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
      <h3 className="text-sm font-semibold text-apple-gray-700 dark:text-apple-gray-300">
        Métricas evolutivas (Wyscout)
      </h3>
      <select
        value={wyscoutMetric}
        onChange={e => setWyscoutMetric(e.target.value)}
        className="px-3 py-1.5 rounded-lg text-sm bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-700 dark:text-apple-gray-200 border-0 focus:ring-2 focus:ring-brand-green"
      >
        {wyscout.metrics.map(m => (
          <option key={m.key} value={m.key}>{m.label}{m.unit === '%' ? ' (%)' : ''}</option>
        ))}
      </select>
    </div>
    <p className="text-xs text-apple-gray-400 mb-4">Por partido · la línea punteada indica el promedio</p>
    {wyscoutMetricDef && (
      <MetricEvolutionChart series={wyscoutSeries} unit={wyscoutMetricDef.unit} label={wyscoutMetricDef.label} />
    )}
    {wyscoutInsights.length > 0 && (
      <div className="mt-3 space-y-1.5">
        {wyscoutInsights.map((t, i) => (
          <div key={i} className="text-xs text-apple-gray-600 dark:text-apple-gray-300 bg-apple-gray-50 dark:bg-apple-gray-700/50 px-3 py-2 rounded-lg">
            {t}
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

> Nota: este bloque va dentro del `<div className="space-y-6">` que ya envuelve "Evolución del Score" + "Historial de Partidos" (rama `supabaseMatches.length > 0`). Si el jugador no tiene `supabaseMatches`, agregar el mismo bloque también en la rama `else` para que el gráfico Wyscout se muestre igual.

- [ ] **Step 4: Verificar en la app**

Run: `npm run dev`, abrir la ficha de **José Paradela** o **Matías Palacios** (interno) → tab Rendimiento.
Expected: debajo del score aparece el dropdown de métricas; al cambiar de métrica cambian gráfico e insights. Para un interno sin datos en la planilla, el bloque no aparece.

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/MetricEvolutionChart.tsx src/pages/PlayerDetailPage.tsx
git commit -m "feat(ficha): grafico evolutivo Wyscout con dropdown e insights"
```

---

## Task 6: Reescribir Oportunidades sobre forma reciente

**Files:**
- Modify: `src/utils/opportunities.ts`
- Test: `src/utils/opportunities.test.ts` (create)
- Modify: `src/pages/OpportunitiesPage.tsx`

**Interfaces:**
- Consumes: `RecentFormPlayer`, `useRecentForm`.
- Produces:
  - `type MarketTag = 'contract' | 'cheap'`
  - `function marketTagsFor(p: RecentFormPlayer, opts: { cheapMaxValue: number; contractMaxMonths: number }): MarketTag[]`
  - Mantener `ageFromBirthDate`, `monthsToContractEnd` (ya existen).

- [ ] **Step 1: Escribir tests de clasificación**

Crear `src/utils/opportunities.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { marketTagsFor } from './opportunities'
import type { RecentFormPlayer } from '@/types/scoring'

function mk(over: Partial<RecentFormPlayer>): RecentFormPlayer {
  return {
    id: 1, name: 'X', photo: null, team: null, league_name: null, primary_position: 'EXT',
    birth_date: '2002-01-01', market_value_eur: null, contract_end_date: null,
    primary_score: 6, recent_avg: 7.5, recent_matches: 4, recent_scores: [7,8,7,8],
    on_the_rise: true, window_used: 'window', ...over,
  }
}

describe('marketTagsFor', () => {
  const opts = { cheapMaxValue: 2_000_000, contractMaxMonths: 12 }
  it('marca precio bajo', () => {
    expect(marketTagsFor(mk({ market_value_eur: 1_000_000 }), opts)).toContain('cheap')
  })
  it('marca fin de contrato', () => {
    const soon = new Date(); soon.setMonth(soon.getMonth() + 6)
    expect(marketTagsFor(mk({ contract_end_date: soon.toISOString().slice(0, 10) }), opts)).toContain('contract')
  })
  it('sin condición => vacío', () => {
    expect(marketTagsFor(mk({ market_value_eur: 50_000_000 }), opts)).toEqual([])
  })
})
```

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run src/utils/opportunities.test.ts`
Expected: FAIL — `marketTagsFor is not a function`.

- [ ] **Step 3: Implementar `marketTagsFor` en `opportunities.ts`**

Agregar (mantener las funciones existentes `ageFromBirthDate`/`monthsToContractEnd`):

```ts
import type { RecentFormPlayer } from '@/types/scoring'

export type MarketTag = 'contract' | 'cheap'

export function marketTagsFor(
  p: RecentFormPlayer,
  opts: { cheapMaxValue: number; contractMaxMonths: number },
): MarketTag[] {
  const tags: MarketTag[] = []
  const months = monthsToContractEnd(p.contract_end_date)
  if (months !== null && months >= 0 && months <= opts.contractMaxMonths) tags.push('contract')
  if (p.market_value_eur != null && p.market_value_eur > 0 && p.market_value_eur <= opts.cheapMaxValue) tags.push('cheap')
  return tags
}
```

- [ ] **Step 4: Correr — deben pasar**

Run: `npx vitest run src/utils/opportunities.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Reescribir `OpportunitiesPage.tsx`**

Cambios clave (mantener el layout de filtros y el grid de cards existentes):
1. Reemplazar `usePlayersList` por `useRecentForm` con estado de ventana:
```tsx
const [windowMonths, setWindowMonths] = useState<number>(3)
const CHEAP_MAX = 5_000_000
const CONTRACT_MAX = 12
const { players, loading } = useRecentForm({
  windowMonths, cheapMaxValue: CHEAP_MAX, contractMaxMonths: CONTRACT_MAX, limit: 200,
})
```
2. Construir las oportunidades desde `players` (ya vienen calificadas por el RPC): mapear cada `RecentFormPlayer` a la card, calculando `marketTagsFor(p, { cheapMaxValue: CHEAP_MAX, contractMaxMonths: CONTRACT_MAX })` para los tags. Ordenar por `recent_avg` desc (ya vienen ordenados).
3. Agregar el **selector de ventana** en el header de filtros:
```tsx
<div className="flex items-center gap-2">
  <span className="text-xs font-semibold text-apple-gray-500 uppercase tracking-wider">Forma:</span>
  {[1, 3, 6, 12].map(w => (
    <button key={w} onClick={() => setWindowMonths(w)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
        windowMonths === w ? 'bg-apple-gray-800 dark:bg-white text-white dark:text-apple-gray-800'
        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300'}`}>
      {w === 1 ? '1 mes' : `${w} meses`}
    </button>
  ))}
</div>
```
4. En cada card: mostrar `recent_avg` como el score destacado, flecha ▲ si `on_the_rise`, un **sparkline** de `recent_scores`, y chips de tags: `contract` → "Fin de contrato", `cheap` → "Precio bajo".
5. Sparkline inline (sin dependencia nueva): mini-SVG de `recent_scores` normalizado a alto fijo:
```tsx
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 60, h = 18, min = Math.min(...values), max = Math.max(...values)
  const rng = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / rng) * h}`).join(' ')
  return <svg width={w} height={h} className="overflow-visible"><polyline points={pts} fill="none" stroke="#22c55e" strokeWidth="1.5" /></svg>
}
```
6. Los filtros existentes (edad, posición, valor, contrato) se aplican sobre `players` en memoria (adaptar `filteredOpportunities` para leer de `RecentFormPlayer`: `p.birth_date`, `p.market_value_eur`, `p.contract_end_date`, `p.primary_position`). El filtro por "tipo" pasa a filtrar por tag (`all` | `contract` | `cheap`).
7. Navegación al hacer click: `navigate(\`/jugador/${encodeURIComponent(p.name)}?source=externo&apiId=${p.id}\`)` (igual que hoy).

- [ ] **Step 6: Verificar en la app**

Run: `npm run dev`, ir a Oportunidades (Búsqueda de Talento).
Expected: al cambiar la ventana (1/3/6/12) cambia la lista; cada card muestra Score GG reciente, sparkline, ▲ si está en alza, y el/los tag(s) de mercado. Sin resultados si el pool aún no tiene ≥3 partidos.

- [ ] **Step 7: Commit**

```bash
git add src/utils/opportunities.ts src/utils/opportunities.test.ts src/pages/OpportunitiesPage.tsx
git commit -m "feat(oportunidades): ranking por forma reciente + tags de mercado + sparkline"
```

---

## Task 7: Adelanto de Oportunidades en Inicio (hero rotativo)

**Files:**
- Create: `src/components/dashboard/OpportunityHero.tsx`
- Modify: `src/pages/HomePage.tsx` (reemplazar bloque "Actividad de la semana", ~625-663; quitar `weekActivity`/`activePlayers`/`inactivePlayers` si quedan sin uso)

**Interfaces:**
- Consumes: `useRecentForm`, `marketTagsFor`, `Sparkline` (extraer a componente compartido `src/components/ui/Sparkline.tsx` para reusar desde Oportunidades e Inicio).
- Produces: `OpportunityHero()` (autónomo, sin props; carga su propia data).

- [ ] **Step 1: Extraer `Sparkline` a `src/components/ui/Sparkline.tsx`**

Mover la función `Sparkline` de la Task 6 a `src/components/ui/Sparkline.tsx` como `export default`, e importarla en `OpportunitiesPage` y en el hero.

- [ ] **Step 2: Implementar `OpportunityHero.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecentForm } from '@/hooks/usePlayerStats'
import { marketTagsFor } from '@/utils/opportunities'
import Sparkline from '@/components/ui/Sparkline'

const CHEAP_MAX = 5_000_000, CONTRACT_MAX = 12
const TAG_LABEL = { contract: 'Fin de contrato', cheap: 'Precio bajo' } as const

export default function OpportunityHero() {
  const navigate = useNavigate()
  const { players, loading } = useRecentForm({
    windowMonths: 3, cheapMaxValue: CHEAP_MAX, contractMaxMonths: CONTRACT_MAX, limit: 8,
  })
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused || players.length < 2) return
    const t = setInterval(() => setIdx(i => (i + 1) % players.length), 5000)
    return () => clearInterval(t)
  }, [paused, players.length])

  useEffect(() => { if (idx >= players.length) setIdx(0) }, [players.length, idx])

  const active = players[idx]
  const tags = useMemo(
    () => active ? marketTagsFor(active, { cheapMaxValue: CHEAP_MAX, contractMaxMonths: CONTRACT_MAX }) : [],
    [active],
  )

  if (loading || players.length === 0) return null

  return (
    <section onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <h2 className="text-lg font-semibold text-apple-gray-800 dark:text-white mb-4">
        Oportunidades de mercado
      </h2>
      <div
        onClick={() => navigate(`/jugador/${encodeURIComponent(active.name)}?source=externo&apiId=${active.id}`)}
        className="cursor-pointer bg-white dark:bg-apple-gray-800/60 rounded-apple-lg border border-apple-gray-200/60 dark:border-apple-gray-700/40 p-5 hover:shadow-apple-md transition-all"
      >
        <div className="flex items-center gap-1.5 mb-4">
          {players.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-brand-green' : 'w-1.5 bg-apple-gray-300 dark:bg-apple-gray-600'}`} />
          ))}
        </div>
        <div className="flex items-center gap-4">
          {active.photo
            ? <img src={active.photo} alt="" className="w-16 h-16 rounded-full object-cover" />
            : <div className="w-16 h-16 rounded-full bg-apple-gray-200 dark:bg-apple-gray-700" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-apple-gray-800 dark:text-white truncate">{active.name}</h3>
              {active.on_the_rise && <span className="text-brand-green text-sm font-semibold">▲ en alza</span>}
            </div>
            <p className="text-sm text-apple-gray-500 truncate">
              {[active.team?.name, active.league_name].filter(Boolean).join(' · ')}
            </p>
            <div className="flex items-center gap-3 mt-1.5">
              {tags.map(t => (
                <span key={t} className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-green/10 text-brand-green">{TAG_LABEL[t]}</span>
              ))}
              {active.market_value_eur && (
                <span className="text-xs text-apple-gray-500">€{(active.market_value_eur / 1_000_000).toFixed(1)}M</span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-brand-green tabular-nums">{active.recent_avg.toFixed(1)}</p>
            <p className="text-2xs text-apple-gray-400">Score GG · {active.recent_matches} PJ</p>
            <div className="mt-1 flex justify-end"><Sparkline values={active.recent_scores} /></div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-thin">
        {players.map((p, i) => (
          <button key={p.id} onClick={() => setIdx(i)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all ${
              i === idx ? 'bg-brand-green/15 text-brand-green' : 'bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500'}`}>
            {p.photo && <img src={p.photo} alt="" className="w-4 h-4 rounded-full object-cover" />}
            {p.name.split(' ').slice(-1)[0]}
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Reemplazar el bloque de Inicio**

En `src/pages/HomePage.tsx`, reemplazar toda la sección "Actividad de la semana" (el `{!loading && (<section>…Actividad de la semana…</section>)}`, ~625-663) por:

```tsx
<OpportunityHero />
```

Agregar el import: `import OpportunityHero from '@/components/dashboard/OpportunityHero'`. Eliminar los `useMemo` `weekActivity`, `activePlayers`, `inactivePlayers` que quedan sin uso (verificar que no se usen en otro lado del archivo).

- [ ] **Step 4: Verificar**

Run: `npm run dev`, abrir Inicio.
Expected: donde estaba "Actividad de la semana" ahora hay un hero que rota cada 5s entre oportunidades, se pausa al pasar el mouse, y las miniaturas saltan a cada jugador. Click → ficha. `npx tsc --noEmit` sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/OpportunityHero.tsx src/components/ui/Sparkline.tsx src/pages/OpportunitiesPage.tsx src/pages/HomePage.tsx
git commit -m "feat(inicio): adelanto de oportunidades con hero rotativo"
```

---

## Task 8: Columna "Video Cargado" en el listado interno

**Files:**
- Modify: `src/components/players/PlayerTable.tsx`

**Interfaces:** ninguna nueva. Usa `FRESH_DOT`, `FRESH_LABEL`, `videoFreshnessByKey`, `playerVideoKey` ya presentes.

- [ ] **Step 1: Agregar la columna a `BASE_COLUMNS_INTERNAL`**

Insertar antes de `{ key: 'Equipo', … }` (línea ~57):

```ts
  { key: 'videoFreshness', label: 'Video Cargado', sortable: false, align: 'center' },
```

- [ ] **Step 2: Renderizar el cell de video en la posición correcta**

En el `<tbody>` de la tabla desktop, quitar el puntito de video del cell "Jugador" (bloque `source === 'interno' && (() => { … FRESH_DOT … })()`, ~320-328) y agregar un nuevo `<td>` **antes** del cell "Equipo" (línea ~340):

```tsx
{/* Video Cargado */}
{source === 'interno' && (
  <td className="px-3 py-3 text-center">
    {(() => {
      const fr: VideoFreshness = videoFreshnessByKey.get(playerVideoKey(player.Jugador)) ?? 'none'
      return <span title={FRESH_LABEL[fr]} className={`inline-block w-2.5 h-2.5 rounded-full ${FRESH_DOT[fr]}`} />
    })()}
  </td>
)}
```

El `ContractBadge` **se mantiene** junto al nombre.

- [ ] **Step 3: Ajustar la vista mobile**

En la card mobile (~217-229), separar el puntito de video del `ContractBadge`: mover el puntito de video a la línea de meta (junto a `{[player.Liga, player.Equipo, player.Edad…]}`), precedido de un rótulo compacto:

```tsx
<span className="inline-flex items-center gap-1 text-2xs text-apple-gray-400">
  Video
  <span className={`inline-block w-2 h-2 rounded-full ${FRESH_DOT[videoFreshnessByKey.get(playerVideoKey(player.Jugador)) ?? 'none']}`} />
</span>
```

- [ ] **Step 4: Verificar**

Run: `npm run dev`, ir a Scouting Interno.
Expected (desktop): nueva columna "Video Cargado" (puntito verde/ámbar/rojo/gris) antes de la columna Club/Equipo; el badge de contrato (naranja/rojo) sigue junto al nombre — ya no se confunden. Mobile: video separado del badge de contrato. La leyenda de "Videos" sigue funcionando.

- [ ] **Step 5: Commit**

```bash
git add src/components/players/PlayerTable.tsx
git commit -m "feat(interno): columna Video Cargado separada del badge de contrato"
```

---

## Task 9: Informes — configurar "Métricas evolutivas" (modelo + wizard)

**Files:**
- Modify: `src/features/informes/types.ts` (`Informe`)
- Modify: `src/features/informes/components/Step2Metricas.tsx`

**Interfaces:**
- Consumes: `loadWyscoutEvolution`, `WyscoutEvolutionData` de `@/services/wyscoutEvolutionService`.
- Produces: `Informe.evolutionCharts?: string[]` (metric keys, máx 8).

- [ ] **Step 1: Agregar el campo al modelo**

En `src/features/informes/types.ts`, dentro de `interface Informe`, agregar:

```ts
  evolutionCharts?: string[]          // metric keys Wyscout (máx 8); solo jugadores internos
```

- [ ] **Step 2: Sección "Métricas evolutivas" en Step2**

En `Step2Metricas.tsx`, agregar una sección visible solo cuando el protagonista es interno y está en la planilla. Cargar Wyscout una vez:

```tsx
const [wyscout, setWyscout] = useState<WyscoutEvolutionData | null>(null)
useEffect(() => {
  if (!informe.dbPlayerName) return
  loadWyscoutEvolution().then(w => { if (w.hasPlayer(informe.dbPlayerName!)) setWyscout(w) }).catch(() => {})
}, [informe.dbPlayerName])
```

UI (agregar/quitar gráficos, máx 8):

```tsx
{wyscout && (
  <div className="mt-6">
    <h4 className="text-sm font-semibold mb-2">Métricas evolutivas (Wyscout)</h4>
    <p className="text-xs text-gray-400 mb-3">Hasta 8 gráficos. Si no agregás ninguno, la pestaña no aparece en el informe.</p>
    <div className="space-y-2">
      {(informe.evolutionCharts ?? []).map((key, i) => (
        <div key={i} className="flex items-center gap-2">
          <select value={key}
            onChange={e => {
              const next = [...(informe.evolutionCharts ?? [])]; next[i] = e.target.value
              onChange({ ...informe, evolutionCharts: next })
            }}
            className="flex-1 px-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-700">
            {wyscout.metrics.map(m => <option key={m.key} value={m.key}>{m.label}{m.unit === '%' ? ' (%)' : ''}</option>)}
          </select>
          <button onClick={() => {
            const next = (informe.evolutionCharts ?? []).filter((_, j) => j !== i)
            onChange({ ...informe, evolutionCharts: next })
          }} className="text-red-500 text-sm px-2">Quitar</button>
        </div>
      ))}
    </div>
    {(informe.evolutionCharts?.length ?? 0) < 8 && (
      <button onClick={() => onChange({ ...informe, evolutionCharts: [...(informe.evolutionCharts ?? []), wyscout.metrics[0].key] })}
        className="mt-2 text-sm text-brand-green font-medium">+ Agregar gráfico</button>
    )}
  </div>
)}
```

(Adaptar `onChange`/`informe` a los nombres reales de props del componente — revisar la firma actual de `Step2Metricas`. Importar `loadWyscoutEvolution`, `WyscoutEvolutionData`, `useState`, `useEffect`.)

- [ ] **Step 3: Verificar**

Run: `npm run dev`, crear un informe linkeando a **José Paradela** (interno) → Paso 2.
Expected: aparece la sección "Métricas evolutivas"; se pueden agregar hasta 8 selectores y quitarlos. Para un jugador sin datos Wyscout, la sección no aparece. `npx tsc --noEmit` sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/features/informes/types.ts src/features/informes/components/Step2Metricas.tsx
git commit -m "feat(informes): configurar metricas evolutivas Wyscout en el wizard"
```

---

## Task 10: Informes — render de "Métricas evolutivas" (preview + export)

**Files:**
- Modify: `src/features/informes/components/Step4Preview.tsx`
- Modify: `src/features/informes/chartSvg.ts` (agregar `lineSvg`)
- Test: `src/features/informes/chartSvg.test.ts` (agregar test de `lineSvg`)
- Modify: `src/features/informes/exportInformeHTML.ts`

**Interfaces:**
- Produces: `export function lineSvg(opts: { points: { label: string; value: number }[]; unit: '%' | ''; width?: number; height?: number }): string`

- [ ] **Step 1: Test de `lineSvg`**

Agregar a `src/features/informes/chartSvg.test.ts`:

```ts
import { lineSvg } from './chartSvg'

describe('lineSvg', () => {
  it('genera un polyline con un punto por dato', () => {
    const svg = lineSvg({ points: [{ label: 'A', value: 50 }, { label: 'B', value: 80 }], unit: '%' })
    expect(svg).toContain('<polyline')
    expect(svg).toMatch(/<svg/)
  })
  it('serie vacía no rompe', () => {
    expect(() => lineSvg({ points: [], unit: '' })).not.toThrow()
  })
})
```

- [ ] **Step 2: Correr — debe fallar**

Run: `npx vitest run src/features/informes/chartSvg.test.ts`
Expected: FAIL — `lineSvg is not a function`.

- [ ] **Step 3: Implementar `lineSvg` en `chartSvg.ts`**

Seguir el patrón de `barsSvg`/`gaugeSvg` (usa constantes de color `COLOR_*` ya definidas en el archivo; reusar `escapeSvgText`, `round2`):

```ts
export function lineSvg(opts: {
  points: { label: string; value: number }[]
  unit: '%' | ''
  width?: number
  height?: number
}): string {
  const W = opts.width ?? 520, H = opts.height ?? 180
  const padL = 34, padR = 12, padT = 12, padB = 24
  const pts = opts.points
  if (pts.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"></svg>`
  }
  const vals = pts.map(p => p.value)
  const min = opts.unit === '%' ? 0 : Math.min(...vals)
  const max = opts.unit === '%' ? 100 : Math.max(...vals)
  const rng = max - min || 1
  const plotW = W - padL - padR, plotH = H - padT - padB
  const x = (i: number) => padL + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW)
  const y = (v: number) => padT + plotH - ((v - min) / rng) * plotH
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  const poly = pts.map((p, i) => `${round2(x(i))},${round2(y(p.value))}`).join(' ')
  const dots = pts.map((p, i) => `<circle cx="${round2(x(i))}" cy="${round2(y(p.value))}" r="2.5" fill="#22c55e"/>`).join('')
  const avgY = round2(y(avg))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <line x1="${padL}" y1="${avgY}" x2="${W - padR}" y2="${avgY}" stroke="${COLOR_AVG_MARK}" stroke-width="1" stroke-dasharray="4 4"/>
    <polyline points="${poly}" fill="none" stroke="#22c55e" stroke-width="2"/>
    ${dots}
  </svg>`
}
```

(Si alguna constante de color no existe con ese nombre, usar la equivalente definida arriba en el archivo — revisar el bloque `COLOR_*`.)

- [ ] **Step 4: Correr — deben pasar**

Run: `npx vitest run src/features/informes/chartSvg.test.ts`
Expected: PASS.

- [ ] **Step 5: Pestaña en el Preview**

En `Step4Preview.tsx`, si `informe.evolutionCharts?.length`, agregar una pestaña/sección "Métricas evolutivas" que, por cada metric key, cargue la serie con `loadWyscoutEvolution().getSeries(informe.dbPlayerName, key)` y la renderice con `MetricEvolutionChart`. Cargar Wyscout una vez con `useEffect` (igual que Task 9). Si `dbPlayerName` no está en la planilla, no mostrar la pestaña.

- [ ] **Step 6: Export HTML/PDF**

En `exportInformeHTML.ts`, cuando `informe.evolutionCharts?.length`, agregar una sección al HTML exportado que, por cada metric key, genere el gráfico con `lineSvg({ points, unit })` (los `points` = serie Wyscout mapeada a `{ label: shortDate(date), value }`). Reusar el helper de fecha corta. El PDF (`exportInformePDF.ts`) toma el HTML, así que hereda la sección sin cambios adicionales.

- [ ] **Step 7: Verificar**

Run: `npm run dev`, informe de José Paradela con 2 métricas evolutivas agregadas → Preview + Exportar.
Expected: la pestaña "Métricas evolutivas" muestra los gráficos; el HTML/PDF exportado incluye la sección con los line charts. Un informe sin `evolutionCharts` no muestra ni exporta la pestaña.

- [ ] **Step 8: Commit**

```bash
git add src/features/informes/components/Step4Preview.tsx src/features/informes/chartSvg.ts src/features/informes/chartSvg.test.ts src/features/informes/exportInformeHTML.ts
git commit -m "feat(informes): render y export de metricas evolutivas (lineSvg)"
```

---

## Verificación final

- [ ] `npm test` — toda la suite en verde.
- [ ] `npx tsc --noEmit` — sin errores de tipos.
- [ ] `npm run build` — build de producción OK.
- [ ] Recorrido manual: Oportunidades (ventanas), Inicio (hero), ficha interna (tabs + Wyscout + insights), listado interno (columna video), Informes (métricas evolutivas + export).

---

## Self-review (cobertura del spec)

- Motor de forma reciente (spec §1) → Task 2 ✓
- Oportunidades (spec §2) → Task 6 ✓
- Adelanto de Inicio (spec §3) → Task 7 ✓
- Reorden de pestañas (spec §4) → Task 3 ✓
- Gráfico Wyscout + insights (spec §5) → Tasks 1, 4, 5 ✓
- Columna Video Cargado (spec §6) → Task 8 ✓
- Pestaña Métricas evolutivas en Informes (spec §7) → Tasks 9, 10 ✓
