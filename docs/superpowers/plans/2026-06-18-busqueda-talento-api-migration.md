# Migración de Búsqueda de Talento a la API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar las 7 páginas de "Búsqueda de Talento" del CSV (`ggScore` 0-100, métricas Wyscout) a la API (Supabase: Score GG `avg_score` 1-10 + métricas p90 de API-Football/Sofascore).

**Architecture:** Fase 0 agrega métricas p90 por jugador a `player_season_scores` (pobladas en `recalc-scores`, expuestas por el RPC `fetch_players_list`) y crea un catálogo de métricas de la API. Luego cada página deja de leer `DataContext`/CSV y usa los hooks de Supabase (`usePlayersList`, `usePositionAverages`), con Score GG 1-10.

**Tech Stack:** React 18 + TS, Vite, Supabase (Postgres + Edge Functions Deno), Recharts.

## Global Constraints

- Score visible = **Score GG**, escala 1-10, color con `getScoreColorClass(score, '10')`. Nunca renombrar "Score GG" en la UI.
- En datos repetidos/conflicto, **la API gana sobre el CSV**.
- **Sin consumo de API-Football**: todo sale de datos ya sincronizados en Supabase.
- Migraciones SQL nuevas en `supabase/migrations/` con timestamp `YYYYMMDDHHMMSS_`.
- Commits frecuentes, mensajes en español, terminar con la línea `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- El RPC `fetch_players_list` ya existe (devuelve `{count, players}` con `season_scores[0]`).

---

## FASE 0 — Base común

### Task 1: Migración SQL — columnas de métricas en `player_season_scores`

**Files:**
- Create: `supabase/migrations/20260618120000_pss_player_metrics.sql`

**Interfaces:**
- Produces: columnas nuevas en `player_season_scores`: `tackles_p90, interceptions_p90, blocks_p90, duels_won_pct, passes_accuracy, passes_key_p90, passes_total_p90, dribbles_success_p90, dribbles_pct, shots_on_p90, shots_pct, goals_p90, assists_p90, fouls_drawn_p90, saves_p90, goals_conceded_p90, penalty_saved_avg, clean_sheet_pct` (todas `NUMERIC`, nullable).

- [ ] **Step 1: Escribir la migración**

```sql
-- Métricas p90 por jugador en player_season_scores (para radar/scatter/similares
-- sobre el pool, sin recalcular desde player_match_stats en el cliente).
ALTER TABLE public.player_season_scores
  ADD COLUMN IF NOT EXISTS tackles_p90        NUMERIC,
  ADD COLUMN IF NOT EXISTS interceptions_p90  NUMERIC,
  ADD COLUMN IF NOT EXISTS blocks_p90         NUMERIC,
  ADD COLUMN IF NOT EXISTS duels_won_pct      NUMERIC,
  ADD COLUMN IF NOT EXISTS passes_accuracy    NUMERIC,
  ADD COLUMN IF NOT EXISTS passes_key_p90     NUMERIC,
  ADD COLUMN IF NOT EXISTS passes_total_p90   NUMERIC,
  ADD COLUMN IF NOT EXISTS dribbles_success_p90 NUMERIC,
  ADD COLUMN IF NOT EXISTS dribbles_pct       NUMERIC,
  ADD COLUMN IF NOT EXISTS shots_on_p90       NUMERIC,
  ADD COLUMN IF NOT EXISTS shots_pct          NUMERIC,
  ADD COLUMN IF NOT EXISTS goals_p90          NUMERIC,
  ADD COLUMN IF NOT EXISTS assists_p90        NUMERIC,
  ADD COLUMN IF NOT EXISTS fouls_drawn_p90    NUMERIC,
  ADD COLUMN IF NOT EXISTS saves_p90          NUMERIC,
  ADD COLUMN IF NOT EXISTS goals_conceded_p90 NUMERIC,
  ADD COLUMN IF NOT EXISTS penalty_saved_avg  NUMERIC,
  ADD COLUMN IF NOT EXISTS clean_sheet_pct    NUMERIC;
```

- [ ] **Step 2: Aplicar la migración**

Aplicar en Supabase (SQL Editor del dashboard, o `supabase db push` si hay login). Esperado: "Success. No rows returned".

- [ ] **Step 3: Verificar columnas (anon)**

```bash
KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2- | tr -d '\r"')
URL=$(grep VITE_SUPABASE_URL .env.local | cut -d= -f2- | tr -d '\r"')
curl -s "$URL/rest/v1/player_season_scores?select=player_id,goals_p90,duels_won_pct&limit=1" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Esperado: JSON con las claves `goals_p90` y `duels_won_pct` (valores `null` por ahora).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618120000_pss_player_metrics.sql
git commit -m "feat: columnas de métricas p90 por jugador en player_season_scores"
```

---

### Task 2: Poblar métricas por jugador en `recalc-scores`

**Files:**
- Modify: `supabase/functions/recalc-scores/index.ts:86-107` (bloque que arma `upsertRows`)

**Interfaces:**
- Consumes: las columnas de Task 1.
- Produces: cada fila de `player_season_scores` con las métricas p90 pobladas.

- [ ] **Step 1: Agregar helpers por grupo de jugador y completar el upsert**

Reemplazar el bloque `for (const [key, rows] of groups) { ... }` (líneas 86-107) por:

```ts
        const upsertRows = [];
        for (const [key, rows] of groups) {
          const [playerId, position] = key.split('|');
          const scores = rows.map(r => r.match_score).filter((s: any) => s !== null);
          const ratings = rows.map(r => r.rating).filter((r: any) => r !== null);

          // Métricas /90 y porcentajes del jugador en esta posición (mismas que el radar)
          const mins = rows.filter((r: any) => r.minutes > 0);
          const p90 = (field: string) => {
            const vals = mins.map((r: any) => ((r[field] ?? 0) / r.minutes) * 90);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
          };
          const avg = (field: string) => {
            const vals = rows.map((r: any) => r[field] ?? 0).filter((v: number) => v > 0);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
          };
          const pct = (num: string, den: string) => {
            const totN = rows.reduce((acc: number, r: any) => acc + (r[num] ?? 0), 0);
            const totD = rows.reduce((acc: number, r: any) => acc + (r[den] ?? 0), 0);
            return totD > 0 ? (totN / totD) * 100 : null;
          };
          const rd = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

          upsertRows.push({
            player_id: parseInt(playerId),
            season,
            position,
            league_id: league.id,
            matches_played: scores.length,
            avg_score: scores.length > 0
              ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
              : null,
            avg_rating: ratings.length > 0
              ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10
              : null,
            total_goals: rows.reduce((s: number, r: any) => s + (r.goals ?? 0), 0),
            total_assists: rows.reduce((s: number, r: any) => s + (r.assists ?? 0), 0),
            tackles_p90: rd(p90('tackles')),
            interceptions_p90: rd(p90('interceptions')),
            blocks_p90: rd(p90('blocks')),
            duels_won_pct: rd(pct('duels_won', 'duels_total')),
            passes_accuracy: rd(avg('passes_accuracy')),
            passes_key_p90: rd(p90('passes_key')),
            passes_total_p90: rd(p90('passes_total')),
            dribbles_success_p90: rd(p90('dribbles_success')),
            dribbles_pct: rd(pct('dribbles_success', 'dribbles_attempted')),
            shots_on_p90: rd(p90('shots_on')),
            shots_pct: rd(pct('shots_on', 'shots_total')),
            goals_p90: rd(p90('goals')),
            assists_p90: rd(p90('assists')),
            fouls_drawn_p90: rd(p90('fouls_drawn')),
            saves_p90: rd(p90('saves')),
            goals_conceded_p90: rd(p90('goals_conceded')),
            penalty_saved_avg: rd(avg('penalty_saved')),
            clean_sheet_pct: rd((rows.filter((r: any) => r.goals_conceded === 0).length / rows.length) * 100),
            updated_at: new Date().toISOString(),
          });
        }
```

(El SELECT de `player_match_stats` en línea 63 ya trae todos los campos usados.)

- [ ] **Step 2: Desplegar la función**

```bash
npx supabase functions deploy recalc-scores
```
(Requiere login de supabase. Si no hay, desplegar desde el dashboard.) Esperado: deploy OK.

- [ ] **Step 3: Re-correr el recálculo una vez**

Invocar la función `recalc-scores` (POST sin body) desde el dashboard o:
```bash
curl -s -X POST "$URL/functions/v1/recalc-scores" -H "Authorization: Bearer $KEY"
```
Esperado: `{"success":true,"scores_computed":<n>,...}`.

- [ ] **Step 4: Verificar métricas pobladas (anon)**

```bash
curl -s "$URL/rest/v1/player_season_scores?select=player_id,position,goals_p90,passes_accuracy,duels_won_pct&matches_played=gte.5&limit=5" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Esperado: filas con `goals_p90`/`passes_accuracy`/`duels_won_pct` no nulos.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recalc-scores/index.ts
git commit -m "feat: poblar métricas p90 por jugador en recalc-scores"
```

---

### Task 3: Exponer métricas en el RPC y los tipos

**Files:**
- Modify: `supabase/migrations/20260618085953_players_list_rpc.sql` (no se re-versiona; se crea una nueva migración que reemplaza la función)
- Create: `supabase/migrations/20260618130000_players_list_rpc_metrics.sql`
- Modify: `src/types/scoring.ts:37-49` (`PlayerSeasonScore`)

**Interfaces:**
- Consumes: columnas de Task 1.
- Produces: `season_scores[0]` del RPC incluye las 18 métricas; `PlayerSeasonScore` las declara.

- [ ] **Step 1: Nueva migración del RPC con métricas en el `season_scores`**

Crear `supabase/migrations/20260618130000_players_list_rpc_metrics.sql` con el cuerpo COMPLETO de `fetch_players_list` igual al actual, pero:
1. En el CTE `filtered`, sumar al SELECT: `pss.tackles_p90, pss.interceptions_p90, pss.blocks_p90, pss.duels_won_pct, pss.passes_accuracy, pss.passes_key_p90, pss.passes_total_p90, pss.dribbles_success_p90, pss.dribbles_pct, pss.shots_on_p90, pss.shots_pct, pss.goals_p90, pss.assists_p90, pss.fouls_drawn_p90, pss.saves_p90, pss.goals_conceded_p90, pss.penalty_saved_avg, pss.clean_sheet_pct`.
2. En el `jsonb_build_object` de `season_scores`, agregar esas 18 claves con sus valores.

(Copiar el archivo `20260618085953_players_list_rpc.sql` y agregar esas líneas; es `CREATE OR REPLACE`, así que reemplaza la función viva.)

- [ ] **Step 2: Aplicar la migración** (SQL Editor / `db push`). Esperado: Success.

- [ ] **Step 3: Verificar el RPC devuelve métricas (anon)**

```bash
curl -s "$URL/rest/v1/rpc/fetch_players_list" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"p_seasons":[2025,2026],"p_page_size":1}' \
  | python -c "import sys,json;p=json.load(sys.stdin)['players'][0];print(p['season_scores'][0].keys())"
```
Esperado: las claves incluyen `goals_p90`, `passes_accuracy`, `duels_won_pct`, etc.

- [ ] **Step 4: Actualizar el tipo `PlayerSeasonScore`**

En `src/types/scoring.ts`, dentro de `PlayerSeasonScore` (después de `global_percentile`):

```ts
  // Métricas p90 por jugador (pobladas por recalc-scores)
  tackles_p90: number | null;
  interceptions_p90: number | null;
  blocks_p90: number | null;
  duels_won_pct: number | null;
  passes_accuracy: number | null;
  passes_key_p90: number | null;
  passes_total_p90: number | null;
  dribbles_success_p90: number | null;
  dribbles_pct: number | null;
  shots_on_p90: number | null;
  shots_pct: number | null;
  goals_p90: number | null;
  assists_p90: number | null;
  fouls_drawn_p90: number | null;
  saves_p90: number | null;
  goals_conceded_p90: number | null;
  penalty_saved_avg: number | null;
  clean_sheet_pct: number | null;
```

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit -p tsconfig.json   # Esperado: sin errores
git add supabase/migrations/20260618130000_players_list_rpc_metrics.sql src/types/scoring.ts
git commit -m "feat: exponer métricas p90 por jugador en fetch_players_list + tipos"
```

---

### Task 4: Catálogo de métricas de la API

**Files:**
- Create: `src/constants/apiMetrics.ts`
- Test: `src/constants/apiMetrics.test.ts`

**Interfaces:**
- Produces:
  - `type ApiMetricKey` = unión de las claves de métrica.
  - `API_METRICS: ApiMetricInfo[]` con `{ key: ApiMetricKey; label: string; short: string; unit: '%' | '/90' | ''; higherIsBetter: boolean }`.
  - `METRICS_BY_POSITION: Record<Position, ApiMetricKey[]>` (las relevantes por posición, ver radar spec).
  - `getMetricValue(score: PlayerSeasonScore, key: ApiMetricKey): number | null`.

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { API_METRICS, METRICS_BY_POSITION, getMetricValue } from './apiMetrics'
import type { PlayerSeasonScore } from '@/types/scoring'

describe('apiMetrics', () => {
  it('cada métrica tiene label y unidad', () => {
    for (const m of API_METRICS) {
      expect(m.label.length).toBeGreaterThan(0)
      expect(['%', '/90', '']).toContain(m.unit)
    }
  })
  it('cada posición tiene métricas y son claves válidas', () => {
    const valid = new Set(API_METRICS.map(m => m.key))
    for (const pos of Object.keys(METRICS_BY_POSITION) as (keyof typeof METRICS_BY_POSITION)[]) {
      expect(METRICS_BY_POSITION[pos].length).toBeGreaterThan(0)
      for (const k of METRICS_BY_POSITION[pos]) expect(valid.has(k)).toBe(true)
    }
  })
  it('getMetricValue lee el campo correcto', () => {
    const s = { goals_p90: 0.7, duels_won_pct: 55 } as unknown as PlayerSeasonScore
    expect(getMetricValue(s, 'goals_p90')).toBe(0.7)
    expect(getMetricValue(s, 'duels_won_pct')).toBe(55)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/constants/apiMetrics.test.ts`
Esperado: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el catálogo**

```ts
import type { PlayerSeasonScore, Position } from '@/types/scoring'

export type ApiMetricKey =
  | 'goals_p90' | 'assists_p90' | 'shots_on_p90' | 'shots_pct'
  | 'passes_accuracy' | 'passes_key_p90' | 'passes_total_p90'
  | 'dribbles_success_p90' | 'dribbles_pct' | 'duels_won_pct'
  | 'tackles_p90' | 'interceptions_p90' | 'blocks_p90'
  | 'fouls_drawn_p90' | 'avg_rating'
  | 'saves_p90' | 'goals_conceded_p90' | 'penalty_saved_avg' | 'clean_sheet_pct'

export interface ApiMetricInfo {
  key: ApiMetricKey
  label: string
  short: string
  unit: '%' | '/90' | ''
  higherIsBetter: boolean
}

export const API_METRICS: ApiMetricInfo[] = [
  { key: 'goals_p90', label: 'Goles /90', short: 'Gol/90', unit: '/90', higherIsBetter: true },
  { key: 'assists_p90', label: 'Asistencias /90', short: 'Ast/90', unit: '/90', higherIsBetter: true },
  { key: 'shots_on_p90', label: 'Tiros al arco /90', short: 'TA/90', unit: '/90', higherIsBetter: true },
  { key: 'shots_pct', label: 'Precisión de tiro', short: 'Tiro%', unit: '%', higherIsBetter: true },
  { key: 'passes_accuracy', label: 'Precisión de pase', short: 'Pase%', unit: '%', higherIsBetter: true },
  { key: 'passes_key_p90', label: 'Pases clave /90', short: 'PC/90', unit: '/90', higherIsBetter: true },
  { key: 'passes_total_p90', label: 'Pases /90', short: 'Pas/90', unit: '/90', higherIsBetter: true },
  { key: 'dribbles_success_p90', label: 'Regates exitosos /90', short: 'Reg/90', unit: '/90', higherIsBetter: true },
  { key: 'dribbles_pct', label: 'Éxito en regates', short: 'Reg%', unit: '%', higherIsBetter: true },
  { key: 'duels_won_pct', label: 'Duelos ganados', short: 'Duel%', unit: '%', higherIsBetter: true },
  { key: 'tackles_p90', label: 'Entradas /90', short: 'Ent/90', unit: '/90', higherIsBetter: true },
  { key: 'interceptions_p90', label: 'Intercepciones /90', short: 'Int/90', unit: '/90', higherIsBetter: true },
  { key: 'blocks_p90', label: 'Bloqueos /90', short: 'Blq/90', unit: '/90', higherIsBetter: true },
  { key: 'fouls_drawn_p90', label: 'Faltas recibidas /90', short: 'FR/90', unit: '/90', higherIsBetter: true },
  { key: 'avg_rating', label: 'Rating promedio', short: 'Rating', unit: '', higherIsBetter: true },
  { key: 'saves_p90', label: 'Atajadas /90', short: 'Ataj/90', unit: '/90', higherIsBetter: true },
  { key: 'goals_conceded_p90', label: 'Goles recibidos /90', short: 'GR/90', unit: '/90', higherIsBetter: false },
  { key: 'penalty_saved_avg', label: 'Penales atajados', short: 'PenAt', unit: '', higherIsBetter: true },
  { key: 'clean_sheet_pct', label: 'Vallas invictas', short: 'VI%', unit: '%', higherIsBetter: true },
]

// Métricas relevantes por posición (del scoring/radar — ver
// docs/superpowers/specs/2026-05-25-radar-chart-metrics-design.md líneas 21-27)
export const METRICS_BY_POSITION: Record<Position, ApiMetricKey[]> = {
  ARQ: ['saves_p90', 'goals_conceded_p90', 'avg_rating', 'penalty_saved_avg', 'clean_sheet_pct'],
  CB:  ['duels_won_pct', 'tackles_p90', 'interceptions_p90', 'blocks_p90', 'passes_accuracy', 'avg_rating', 'passes_total_p90'],
  LD:  ['duels_won_pct', 'passes_key_p90', 'dribbles_success_p90', 'assists_p90', 'tackles_p90', 'passes_accuracy', 'interceptions_p90', 'avg_rating', 'dribbles_pct'],
  LI:  ['duels_won_pct', 'passes_key_p90', 'dribbles_success_p90', 'assists_p90', 'tackles_p90', 'passes_accuracy', 'interceptions_p90', 'avg_rating', 'dribbles_pct'],
  VC:  ['tackles_p90', 'duels_won_pct', 'interceptions_p90', 'passes_accuracy', 'passes_total_p90', 'blocks_p90', 'avg_rating', 'passes_key_p90'],
  VI:  ['duels_won_pct', 'passes_key_p90', 'dribbles_success_p90', 'assists_p90', 'goals_p90', 'passes_accuracy', 'shots_on_p90', 'avg_rating', 'tackles_p90', 'dribbles_pct'],
  EXT: ['dribbles_success_p90', 'goals_p90', 'assists_p90', 'passes_key_p90', 'shots_on_p90', 'duels_won_pct', 'dribbles_pct', 'avg_rating', 'fouls_drawn_p90'],
  DEL: ['goals_p90', 'shots_on_p90', 'assists_p90', 'shots_pct', 'passes_key_p90', 'duels_won_pct', 'avg_rating', 'dribbles_success_p90', 'fouls_drawn_p90'],
}

export function getMetricValue(score: PlayerSeasonScore, key: ApiMetricKey): number | null {
  const v = (score as unknown as Record<string, number | null>)[key]
  return v ?? null
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/constants/apiMetrics.test.ts`
Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/constants/apiMetrics.ts src/constants/apiMetrics.test.ts
git commit -m "feat: catálogo de métricas de la API por posición"
```

---

## FASE 1 — Páginas fáciles

### Task 5: ScoutingWorksPage → API

**Files:**
- Modify: `src/pages/ScoutingWorksPage.tsx`

**Interfaces:**
- Consumes: `usePlayersList` (hook existente, `src/hooks/usePlayerStats.ts:33`).

- [ ] **Step 1:** Leer `ScoutingWorksPage.tsx` completo e identificar dónde toma jugadores del `DataContext` (`useData()` → `external`/`internal`).
- [ ] **Step 2:** Reemplazar la fuente: para cada proyecto que liste jugadores por nombre/posición, resolverlos con `usePlayersList({ search })` o búsqueda por nombre vía la API; usar `player.name`, `player.team?.name`, `player.nationality`, `displayPosition(player.primary_position)`, `player.photo`. Quitar el `import`/uso de `useData`.
- [ ] **Step 3:** `npx tsc --noEmit` → sin errores. Levantar `npm run dev`, abrir `/trabajos-scouting`, verificar que las cards y listas muestran jugadores desde la API (identidad correcta, sin datos del CSV).
- [ ] **Step 4: Commit**

```bash
git add src/pages/ScoutingWorksPage.tsx
git commit -m "feat: ScoutingWorksPage lee jugadores desde la API"
```

---

### Task 6: FormationPage → API

**Files:**
- Modify: `src/pages/FormationPage.tsx`

**Interfaces:**
- Consumes: `usePlayersList`, `getScoreColorClass(score, '10')` (de `src/utils/scoring` o donde esté), `displayPosition`.

- [ ] **Step 1:** Leer `FormationPage.tsx`. Identificar: (a) búsqueda de jugadores por posición/liga desde `DataContext`, (b) el badge/color que hoy usa `ggScore`.
- [ ] **Step 2:** Reemplazar la búsqueda por `usePlayersList({ positions, league_id })`. El mapeo posición→casilla se mantiene, pero ahora la posición viene de `primary_position` (tipo `Position`) — usar el mapeo existente o `FILTER_POSITION_MAP` adaptado a `Position`.
- [ ] **Step 3:** Cambiar el badge a `primary_score` (1-10) con `getScoreColorClass(primary_score, '10')`. `formationService` (guardar/cargar formación) sin cambios.
- [ ] **Step 4:** `npx tsc --noEmit`. `npm run dev` → `/formacion`: buscar jugador por posición, ver badge 1-10, guardar y recargar la formación.
- [ ] **Step 5: Commit**

```bash
git add src/pages/FormationPage.tsx
git commit -m "feat: FormationPage usa jugadores y Score GG desde la API"
```

---

## FASE 2 — Lógica media

### Task 7: SimilarPlayersPage → similitud sobre métricas API

**Files:**
- Modify: `src/pages/SimilarPlayersPage.tsx`
- Create: `src/utils/similarity.ts`
- Test: `src/utils/similarity.test.ts`

**Interfaces:**
- Produces: `computeSimilarity(base: PlayerSeasonScore, others: {player: PlayerWithScore; score: PlayerSeasonScore}[], position: Position): {player: PlayerWithScore; distance: number}[]` — distancia euclidiana normalizada sobre `METRICS_BY_POSITION[position]`, ordenada ascendente.

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { computeSimilarity } from './similarity'
import type { PlayerSeasonScore, PlayerWithScore } from '@/types/scoring'

const mk = (id: number, goals: number, duels: number): {player: PlayerWithScore; score: PlayerSeasonScore} => ({
  player: { id, name: `P${id}` } as PlayerWithScore,
  score: { goals_p90: goals, duels_won_pct: duels, shots_on_p90: 1, assists_p90: 0.2, shots_pct: 40, passes_key_p90: 1, dribbles_success_p90: 1, avg_rating: 7, fouls_drawn_p90: 1 } as unknown as PlayerSeasonScore,
})

describe('computeSimilarity', () => {
  it('ordena por cercanía al jugador base', () => {
    const base = mk(0, 0.5, 50).score
    const others = [mk(1, 0.5, 50), mk(2, 0.1, 20), mk(3, 0.48, 49)]
    const res = computeSimilarity(base, others, 'DEL')
    expect(res[0].player.id).toBe(1)      // idéntico → distancia 0
    expect(res[res.length - 1].player.id).toBe(2) // el más lejano
  })
})
```

- [ ] **Step 2:** Run `npx vitest run src/utils/similarity.test.ts` → FAIL.
- [ ] **Step 3: Implementar `similarity.ts`**

```ts
import type { PlayerSeasonScore, PlayerWithScore, Position } from '@/types/scoring'
import { METRICS_BY_POSITION, getMetricValue, type ApiMetricKey } from '@/constants/apiMetrics'

export function computeSimilarity(
  base: PlayerSeasonScore,
  others: { player: PlayerWithScore; score: PlayerSeasonScore }[],
  position: Position,
): { player: PlayerWithScore; distance: number }[] {
  const keys: ApiMetricKey[] = METRICS_BY_POSITION[position]
  // rango por métrica para normalizar (min-max sobre base + others)
  const all = [base, ...others.map(o => o.score)]
  const ranges = keys.map(k => {
    const vals = all.map(s => getMetricValue(s, k)).filter((v): v is number => v !== null)
    const min = Math.min(...vals), max = Math.max(...vals)
    return { k, min, span: max - min || 1 }
  })
  const vec = (s: PlayerSeasonScore) => ranges.map(r => ((getMetricValue(s, r.k) ?? r.min) - r.min) / r.span)
  const b = vec(base)
  return others
    .map(o => {
      const v = vec(o.score)
      const distance = Math.sqrt(v.reduce((acc, x, i) => acc + (x - b[i]) ** 2, 0))
      return { player: o.player, distance }
    })
    .sort((a, z) => a.distance - z.distance)
}
```

- [ ] **Step 4:** Run `npx vitest run src/utils/similarity.test.ts` → PASS.
- [ ] **Step 5:** En `SimilarPlayersPage.tsx`: reemplazar `useData()` por el pool de la API (`usePlayersList` con `pageSize` grande, filtrando por la posición del jugador base). El selector de jugador base y el render de resultados se mantienen; cambiar la fuente de métricas a `season_scores[0]` y usar `computeSimilarity`.
- [ ] **Step 6:** `npx tsc --noEmit`. `npm run dev` → `/similares`: elegir un jugador, ver lista de similares razonable (misma posición), sin datos CSV.
- [ ] **Step 7: Commit**

```bash
git add src/pages/SimilarPlayersPage.tsx src/utils/similarity.ts src/utils/similarity.test.ts
git commit -m "feat: SimilarPlayersPage usa similitud sobre métricas de la API"
```

---

### Task 8: OpportunitiesPage → umbrales 1-10

**Files:**
- Modify: `src/pages/OpportunitiesPage.tsx`
- Create: `src/utils/opportunities.ts`
- Test: `src/utils/opportunities.test.ts`

**Interfaces:**
- Produces: `detectOpportunities(players: PlayerWithScore[]): { undervalued: PlayerWithScore[]; youngTalent: PlayerWithScore[]; expiringContract: PlayerWithScore[]; valueForMoney: PlayerWithScore[] }`. Helpers: `ageFromBirthDate(birth_date: string | null): number | null`, `monthsToContractEnd(date: string | null): number | null`.

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { detectOpportunities, ageFromBirthDate } from './opportunities'
import type { PlayerWithScore } from '@/types/scoring'

const p = (over: Partial<PlayerWithScore>): PlayerWithScore => ({
  id: 1, name: 'X', primary_score: 6.8, market_value_eur: 500000,
  birth_date: '2006-01-01', contract_end_date: null, season_scores: [],
  primary_percentile: null, position_distribution: {}, ...
  } as unknown as PlayerWithScore)

describe('opportunities', () => {
  it('joven talento: edad <= 21 y score >= 6.0', () => {
    const young = p({ birth_date: '2006-01-01', primary_score: 6.5 })
    const old = p({ birth_date: '1990-01-01', primary_score: 6.5 })
    const res = detectOpportunities([young, old])
    expect(res.youngTalent.map(x => x.id)).toContain(young.id)
    expect(res.youngTalent).not.toContain(old)
  })
  it('subvalorado: score >= 6.5', () => {
    const res = detectOpportunities([p({ primary_score: 6.8, market_value_eur: 200000 })])
    expect(res.undervalued.length).toBe(1)
  })
})
```

(Completar el objeto `p()` con los campos mínimos que use la implementación.)

- [ ] **Step 2:** Run `npx vitest run src/utils/opportunities.test.ts` → FAIL.
- [ ] **Step 3: Implementar `opportunities.ts`** con los umbrales del spec:

```ts
import type { PlayerWithScore } from '@/types/scoring'

export function ageFromBirthDate(birth_date: string | null): number | null {
  if (!birth_date) return null
  const b = new Date(birth_date)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

export function monthsToContractEnd(date: string | null): number | null {
  if (!date) return null
  const end = new Date(date)
  const now = new Date()
  return (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
}

export function detectOpportunities(players: PlayerWithScore[]) {
  const withScore = players.filter(p => p.primary_score != null)
  const undervalued = withScore.filter(p =>
    (p.primary_score as number) >= 6.5 && (p.market_value_eur ?? 0) > 0)
    .sort((a, b) => (a.market_value_eur ?? 0) - (b.market_value_eur ?? 0))
  const youngTalent = withScore.filter(p => {
    const age = ageFromBirthDate(p.birth_date)
    return age != null && age <= 21 && (p.primary_score as number) >= 6.0
  })
  const expiringContract = players.filter(p => {
    const m = monthsToContractEnd(p.contract_end_date)
    return m != null && m >= 0 && m <= 12
  })
  const valueForMoney = withScore
    .filter(p => (p.market_value_eur ?? 0) > 0)
    .map(p => ({ p, ratio: (p.primary_score as number) / ((p.market_value_eur as number) / 1_000_000) }))
    .sort((a, b) => b.ratio - a.ratio)
    .map(x => x.p)
  return { undervalued, youngTalent, expiringContract, valueForMoney }
}
```

- [ ] **Step 4:** Run `npx vitest run src/utils/opportunities.test.ts` → PASS.
- [ ] **Step 5:** En `OpportunitiesPage.tsx`: reemplazar `useData()` por `usePlayersList({ pageSize: <grande> })` y usar `detectOpportunities`. Mostrar `primary_score` (1-10) en las cards.
- [ ] **Step 6:** `npx tsc --noEmit`. `npm run dev` → `/oportunidades`: ver categorías con jugadores y score 1-10.
- [ ] **Step 7: Commit**

```bash
git add src/pages/OpportunitiesPage.tsx src/utils/opportunities.ts src/utils/opportunities.test.ts
git commit -m "feat: OpportunitiesPage con umbrales recalibrados a escala 1-10 (API)"
```

---

## FASE 3 — Páginas con gráficos

### Task 9: BusquedaPage (Análisis Completo) → API

**Files:**
- Modify: `src/pages/BusquedaPage.tsx`

**Interfaces:**
- Consumes: `usePlayersList`, `usePositionAverages`, `API_METRICS`, `METRICS_BY_POSITION`, `getMetricValue`, `getScoreColorClass`.

- [ ] **Step 1:** Leer `BusquedaPage.tsx`. Listar todos los usos de `ggScore`, `useData`, y métricas CSV (`SCORING_CONFIG`/`METRIC_GROUPS`).
- [ ] **Step 2:** Reemplazar fuente de datos: pool desde `usePlayersList`. El jugador seleccionado y su `season_scores[0]` dan las métricas.
- [ ] **Step 3:** Score: cambiar TODOS los `selectedPlayer.ggScore` / `p.ggScore` por `primary_score` (1-10); contexto de liga y "conclusiones" recalculados sobre 1-10 (pool de la misma posición).
- [ ] **Step 4:** Rankings top-N por métrica: iterar `API_METRICS` (o `METRICS_BY_POSITION[pos]`) y ordenar con `getMetricValue`.
- [ ] **Step 5:** Radar: métricas del jugador (`METRICS_BY_POSITION[pos]`) vs promedio posición-liga de `usePositionAverages`/`position_metric_averages`. Scatter interno: ejes desde `API_METRICS`.
- [ ] **Step 6:** Quitar imports de CSV (`useData`, `SCORING_CONFIG`). `npx tsc --noEmit`.
- [ ] **Step 7:** `npm run dev` → `/analisis-completo`: elegir jugador, ver Score GG 1-10, rankings, radar y scatter con métricas de la API; sin referencias a métricas Wyscout.
- [ ] **Step 8: Commit**

```bash
git add src/pages/BusquedaPage.tsx
git commit -m "feat: Análisis Completo (BusquedaPage) sobre Score GG y métricas de la API"
```

---

### Task 10: ComparisonPage → API

**Files:**
- Modify: `src/pages/ComparisonPage.tsx`
- Posible modify: componentes en `src/components/pdf/` usados por el export (solo el contenido de datos)

**Interfaces:**
- Consumes: `usePlayersList`, `API_METRICS`, `METRICS_BY_POSITION`, `getMetricValue`, `getScoreColorClass`.

- [ ] **Step 1:** Leer `ComparisonPage.tsx`. Identificar selección de 2-3 jugadores, gráficos (bar/radar/heatmap), stats side-by-side y export PDF.
- [ ] **Step 2:** Cambiar la selección de jugadores a `usePlayersList` (búsqueda por nombre). Datos de cada jugador desde `season_scores[0]`.
- [ ] **Step 3:** Bar/radar/heatmap y tabla side-by-side: usar `METRICS_BY_POSITION[pos]` + `getMetricValue`; Score GG (1-10) con `getScoreColorClass(_, '10')`.
- [ ] **Step 4:** Export PDF: pasar los nuevos datos a los componentes de `src/components/pdf/` (mismo mecanismo, datos de la API). Ajustar labels a `API_METRICS`.
- [ ] **Step 5:** Quitar imports CSV. `npx tsc --noEmit`.
- [ ] **Step 6:** `npm run dev` → `/comparacion`: comparar 2-3 jugadores, ver gráficos con métricas API y Score GG; exportar PDF y revisar el contenido.
- [ ] **Step 7: Commit**

```bash
git add src/pages/ComparisonPage.tsx src/components/pdf/
git commit -m "feat: ComparisonPage compara con métricas de la API y Score GG"
```

---

### Task 11: ScatterChartPage → API

**Files:**
- Modify: `src/pages/ScatterChartPage.tsx`

**Interfaces:**
- Consumes: `usePlayersList`, `API_METRICS`, `getMetricValue`, `getScoreColorClass`.

- [ ] **Step 1:** Leer `ScatterChartPage.tsx`. Identificar el selector de ejes X/Y (hoy `METRIC_GROUPS` Wyscout) y el pool desde `useData`.
- [ ] **Step 2:** Selector de ejes: poblar desde `API_METRICS` (label/short). Pool desde `usePlayersList` (filtrado actual mantenido).
- [ ] **Step 3:** Puntos: `x = getMetricValue(score, xKey)`, `y = getMetricValue(score, yKey)`; excluir puntos con `null`. Color gradient por `primary_score` (1-10).
- [ ] **Step 4:** Export PNG/PDF: mismo mecanismo. Quitar imports CSV. `npx tsc --noEmit`.
- [ ] **Step 5:** `npm run dev` → `/dispersion`: elegir 2 métricas de la API en X/Y, ver puntos y color por Score GG; exportar PNG.
- [ ] **Step 6: Commit**

```bash
git add src/pages/ScatterChartPage.tsx
git commit -m "feat: ScatterChartPage con ejes de métricas de la API y color por Score GG"
```

---

## Cierre

- [ ] **Verificación final:** `npx tsc --noEmit` y `npx vitest run` sin errores. Recorrer las 7 páginas en `npm run dev`: ninguna referencia visible a métricas Wyscout/`ggScore`; score 1-10 en todas; gráficos con métricas de la API.
- [ ] **Deploy:** mergear la rama a `main` (Netlify rebuildea). Las migraciones SQL (Tasks 1 y 3) y el deploy de `recalc-scores` (Task 2) deben estar aplicados en Supabase ANTES del deploy del frontend.
- [ ] **Nota:** revisar con el usuario los umbrales reales de Oportunidades (Task 8) con datos en producción y ajustarlos si hace falta.
