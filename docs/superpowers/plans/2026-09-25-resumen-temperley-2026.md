# Resumen Temperley 2026 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pestaña Resumen del DT `domingo` pasa a ser un tablero "Temperley 2026" con widgets del equipo, widgets de jugadores alimentados por el export de jugadores de Wyscout (cargado en la página) y un PDF profesional con selección de widgets.

**Architecture:** El .xlsx se parsea en el navegador (`xlsx`) a un modelo tipado por clave estable, se guarda en Supabase (`coach_wyscout_squad_stats`, el último por `coach_key` es el vigente). Métricas derivadas, filtro y rankings son funciones puras testeadas. Cada widget es un componente chico que recibe datos ya calculados; un registro de widgets (id, título, sección) lo usan la página y el exportador PDF (jsPDF vectorial, mismo enfoque que `exportHomegrownPdf.ts`).

**Tech Stack:** React 18 + TypeScript, Tailwind, Supabase JS, `xlsx` 0.18, `jspdf` 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-resumen-temperley-2026-design.md`

## Global Constraints

- Copy en castellano rioplatense, frases llanas para usuarios mayores no técnicos; nada de jerga ("canteranos", "KPI").
- Estilo de widgets de Inicio (`components/dashboard/Section.tsx`, tokens `apple-gray-*`, `brand-green`), claro/oscuro, celular sin scroll horizontal de página.
- Filtro "Mínimo de minutos jugados": default 450, rango 0..máximo del plantel, aplica a rankings /90 y %; totales muestran a todos.
- Regates y centros en widgets separados.
- Archivo inválido / de otro equipo / sin columnas obligatorias → no se guarda nada.
- No publicar (merge/push a main) hasta que el usuario lo diga; se prueba en local.

## Review Focus

- Archivo con coma decimal o celdas vacías ("-", "") → números en null, no NaN ni 0 inventado. Test en Task 2.
- Jugador con 0 minutos o % null → no aparece en rankings /90 ni rompe la división. Test en Task 3.
- Archivo exportado de otro club (o mezcla) → error "El archivo es de X, no de Temperley". Test en Task 2.
- Nombres con acentos (Brandán, Echeverría) → se muestran y se exportan al PDF bien (fuente con Latin-1). Chequeo en Task 7.
- Widget de API caído (tabla/fixture) → muestra "No se pudo cargar" y el resto sigue. Cubierto en Task 6.

---

### Task 1: Tabla Supabase + servicio

**Files:**
- Create: `supabase/migrations/20260925_coach_wyscout_squad_stats.sql`
- Create: `src/services/wyscoutSquadService.ts`

**Interfaces:**
- Produces: `getLatestSquadStats(coachKey): Promise<SquadStatsRecord | null>`, `saveSquadStats(coachKey, data: WyscoutSquadData, fileName): Promise<{ success: boolean; error?: string }>`; `SquadStatsRecord = { id: number; data: WyscoutSquadData; source_file: string | null; uploaded_at: string }`.

- [ ] Migración (mismo modelo RLS que `coach_wyscout_reports`):

```sql
CREATE TABLE IF NOT EXISTS public.coach_wyscout_squad_stats (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_key   TEXT NOT NULL,
  data        JSONB NOT NULL,
  source_file TEXT,
  uploaded_by UUID DEFAULT auth.uid(),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cwss_coach ON public.coach_wyscout_squad_stats(coach_key, uploaded_at DESC);
ALTER TABLE public.coach_wyscout_squad_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_cwss" ON public.coach_wyscout_squad_stats;
CREATE POLICY "read_cwss" ON public.coach_wyscout_squad_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "write_cwss" ON public.coach_wyscout_squad_stats;
CREATE POLICY "write_cwss" ON public.coach_wyscout_squad_stats FOR INSERT TO authenticated WITH CHECK (true);
```

- [ ] Aplicar: `npx supabase db query --linked --file supabase/migrations/20260925_coach_wyscout_squad_stats.sql` (db push está desincronizado).
- [ ] Servicio con `supabase` de `@/lib/supabase`, `.order('uploaded_at', { ascending: false }).limit(1).maybeSingle()`; errores → `console.error` + null / `{ success:false, error:'No se pudo guardar. Probá de nuevo.' }`.
- [ ] Commit `feat(resumen): tabla y servicio para el archivo de jugadores de Wyscout`.

### Task 2: Parser del .xlsx de Wyscout

**Files:**
- Create: `src/features/coaches/wyscoutSquad/wyscoutSquadTypes.ts`, `parseWyscoutSquadXlsx.ts`, `parseWyscoutSquadXlsx.test.ts`
- Create: `src/features/coaches/wyscoutSquad/__fixtures__/temperley-2026-09-25.xlsx` (copia de `C:\Users\marcos\Downloads\Search results - 2026-09-25T103218.119.xlsx`)

**Interfaces:**
- Produces:
```ts
export type SquadMetricKey = 'matches'|'minutes'|'goals'|'xg'|'assists'|'xa'|'duels_p90'|'duels_won_pct'|'def_actions_p90'|'def_duels_p90'|'def_duels_won_pct'|'aerial_p90'|'aerial_won_pct'|'tackles_p90'|'interceptions_p90'|'fouls_p90'|'att_actions_p90'|'goals_p90'|'npgoals_p90'|'xg_p90'|'head_goals'|'shots'|'shots_p90'|'shots_on_pct'|'goal_conv_pct'|'assists_p90'|'crosses_p90'|'crosses_acc_pct'|'dribbles_p90'|'dribbles_won_pct'|'off_duels_p90'|'off_duels_won_pct'|'box_touches_p90'|'prog_runs_p90'|'accelerations_p90'|'received_p90'|'long_received_p90'|'fouls_suffered_p90'|'passes_p90'|'passes_acc_pct'|'fwd_passes_p90'|'fwd_passes_acc_pct'|'long_passes_p90'|'long_passes_acc_pct'|'pass_length_m'|'xa_p90'|'key_passes_p90'|'final_third_passes_p90'|'final_third_acc_pct'|'through_passes_p90'|'through_acc_pct'|'deep_runs_p90'|'final_third_crosses_p90'|'prog_passes_p90'|'prog_passes_acc_pct'
export interface SquadPlayer { name: string; team: string; positions: string[]; age: number|null; birthCountry: string|null; passports: string[]; foot: string|null; heightCm: number|null; stats: Partial<Record<SquadMetricKey, number|null>> }
export interface WyscoutSquadData { team: string; players: SquadPlayer[]; columnsFound: SquadMetricKey[]; sourceFileName: string }
export type ParseResult = { ok: true; data: WyscoutSquadData } | { ok: false; error: string }
export function parseWyscoutSquadRows(rows: unknown[][], fileName: string, expectedTeam: string): ParseResult
export async function parseWyscoutSquadFile(file: File, expectedTeam: string): Promise<ParseResult>
```
- Mapa de encabezados exactos del archivo (64): `'Jugador'`, `'Equipo'`, `'Posición específica'` (split ", "), `'Edad'`, `'Partidos jugados'`→matches, `'Minutos jugados'`→minutes, `'Goles'`, `'xG'`, `'Asistencias'`, `'xA'`, `'Duelos/90'`, `'Duelos ganados, %'`, `'País de nacimiento'`, `'Pasaporte'` (split ", "), `'Pie'`, `'Altura'`, … hasta `'Precisión pases progresivos, %'` (uno por clave del tipo, en el orden del archivo). Match de encabezado normalizado (trim, NFD sin acentos, lower, espacios colapsados) para tolerar `'Pases recibidos /90'`.
- Obligatorias: Jugador, Equipo, Minutos jugados, Partidos jugados, Goles, Asistencias → si falta: `{ok:false, error:'Al archivo le falta la columna "X". Exportalo de nuevo desde Wyscout con todas las columnas.'}`.
- Equipo: el más frecuente; si `normalize(team) !== normalize(expectedTeam)` → `'Este archivo es de {team}, no de {expectedTeam}.'`. Sin filas → `'El archivo no tiene jugadores.'`.
- Números: number tal cual; string con coma → `parseFloat(s.replace(',', '.'))`; `''`, `'-'`, null, NaN → null.

- [ ] Tests (fallan primero): archivo real → 29 jugadores, `players[0]` = P. Souto, `stats.goals === 7`, `stats.matches === 19`, `passports` de F. Brandán = `['Argentina','Romania']`; filas sintéticas: coma decimal `'1,5'`→1.5, `'-'`→null; sin columna Goles → error; equipo "Quilmes" con expected "Temperley" → error con ambos nombres.
- [ ] Implementar, `npx vitest run src/features/coaches/wyscoutSquad` pasa.
- [ ] Commit `feat(resumen): lectura del archivo de jugadores de Wyscout`.

### Task 3: Métricas derivadas, filtro y rankings

**Files:**
- Create: `src/features/coaches/wyscoutSquad/squadMetrics.ts`, `squadMetrics.test.ts`

**Interfaces:**
- Consumes: `SquadPlayer`, `SquadMetricKey` (Task 2).
- Produces:
```ts
export type DerivedKey = 'duels_won_p90'|'off_duels_won_p90'|'def_duels_won_p90'|'aerial_won_p90'|'dribbles_won_p90'|'crosses_acc_p90'|'prog_passes_acc_p90'|'goal_involvement_p90'|'goals_minus_xg'|'assists_minus_xa'|'minutes_share_pct'
export type AnyMetric = SquadMetricKey | DerivedKey
export function metricValue(p: SquadPlayer, key: AnyMetric, teamMatches: number): number | null
export function wonPer90(per90: number|null|undefined, pct: number|null|undefined): number | null // per90*pct/100, null si falta alguno
export function filterByMinutes(players: SquadPlayer[], minMinutes: number): SquadPlayer[]
export interface RankingRow { name: string; value: number; minutes: number }
export function rankBy(players: SquadPlayer[], key: AnyMetric, opts: { teamMatches: number; minMinutes: number; perMinuteMetric: boolean; limit?: number }): RankingRow[] // desc, sin nulls; minMinutes solo si perMinuteMetric
export function squadProfile(players: SquadPlayer[]): { avgAge: number|null; avgHeight: number|null; foot: Record<string, number>; dualPassport: { name: string; passports: string[] }[] }
```
- `minutes_share_pct = minutes / (teamMatches*90) * 100` (null si teamMatches 0).

- [ ] Tests: `wonPer90(13.77, 40.65)` ≈ 5.60; null si falta; `rankBy` con jugador de 20' excluido en /90 con minMinutes 450 e incluido en `goals` totales; empate ordena por nombre; `squadProfile` detecta Brandán con doble pasaporte; minutes_share con teamMatches 31.
- [ ] Implementar, tests pasan, commit `feat(resumen): estadisticas derivadas y rankings del plantel`.

### Task 4: Carga del archivo (dropzone) + barra superior + filtro

**Files:**
- Create: `src/features/coaches/components/summary/WyscoutSquadDropzone.tsx`, `SummaryToolbar.tsx`, `MinutesFilter.tsx`

**Interfaces:**
- Consumes: `parseWyscoutSquadFile`, `saveSquadStats`, `getLatestSquadStats`.
- Produces: `<WyscoutSquadDropzone coachKey expectedTeam onSaved={(rec: SquadStatsRecord)=>void} compact? />`, `<SummaryToolbar title dataDateLabel onUpload onExportPdf />`, `<MinutesFilter value max onChange included total />`.

- [ ] Dropzone: drag&drop + click (input `accept=".xlsx"`), estados: idle / leyendo / vista previa ("29 jugadores de Temperley · 64 datos" + botones "Guardar" / "Cancelar") / error (texto del parser, rojo suave) / guardado. Sin archivo cargado aún: versión grande con explicación "Exportá desde Wyscout la lista de jugadores del equipo y arrastrala acá".
- [ ] Toolbar: "Temperley 2026" (club del coach + año actual), subtítulo "Datos de Wyscout del 25/09/2026" (o "Todavía no se cargó el archivo de Wyscout"), botones "Actualizar datos de Wyscout" (abre dropzone en modal/despliegue) y "Exportar PDF".
- [ ] Filtro: `<input type="range">` estilizado con `accent-brand-green`, texto "Mínimo de minutos jugados: 450 · entran 21 de 29".
- [ ] `npm run build` sin errores; commit.

### Task 5: Widgets de jugadores

**Files:**
- Create: `src/features/coaches/components/summary/RankingWidget.tsx` (genérico: título, explicación corta, top 5 con barra, "Ver todos"), `SquadTableWidget.tsx` (tabla completa ordenable, scroll horizontal dentro del widget), `SquadProfileWidget.tsx`, `playerWidgets.ts` (definiciones)

**Interfaces:**
- Consumes: `rankBy`, `metricValue`, `squadProfile`.
- Produces: `PLAYER_WIDGETS: WidgetDef[]` con `WidgetDef = { id: string; section: 'equipo'|'jugadores'|'existentes'; title: string; description: string; columns: { key: AnyMetric; label: string; format: 'int'|'dec1'|'dec2'|'pct'; perMinute: boolean }[]; primary: AnyMetric }`.
- Widgets: goleadores (goals, goals_p90, goals_minus_xg) · asistidores (assists, xa, key_passes_p90) · participación en gol (goal_involvement_p90) · duelos (duels_won_p90, off_duels_won_p90, def_duels_won_p90, aerial_won_p90) · recuperación (def_actions_p90, interceptions_p90) · creación (prog_passes_p90, final_third_passes_p90, passes_acc_pct) · regates (dribbles_p90, dribbles_won_pct, dribbles_won_p90) · centros (crosses_p90, crosses_acc_pct, crosses_acc_p90) · uso del plantel (minutes, minutes_share_pct) · perfil · tabla completa.
- Widgets cuya columna primaria no está en `columnsFound` no se renderizan.
- [ ] Build + revisión visual; commit.

### Task 6: Widgets del equipo y nueva `CoachSummaryTab`

**Files:**
- Create: `src/features/coaches/components/summary/StandingsWidget.tsx`, `LastMatchesWidget.tsx`, `UpcomingWidget.tsx`, `SeasonNumbersWidget.tsx`, `teamWidgets.ts`
- Modify: `src/features/coaches/components/CoachSummaryTab.tsx` (orquesta toolbar, secciones A/B/C, estado de filtro y del registro de squad stats)

- [ ] Tabla: `fetchLeagueStandings(coach.leagueApiId, coach.leagueSeason)`, grupo que contiene `coach.apiTeamId`, fila resaltada, columnas Pos/Equipo/PJ/G/E/P/DG/Pts.
- [ ] Últimos 5 (resultado G/E/P con color, rival, marcador) y próximos 5 de `fetchTeamFixtures`.
- [ ] Cada widget con su loading y "No se pudo cargar" propio.
- [ ] Sección C: reusar `CoachSeasonStatsCard` y próximo partido existentes sin cambiar su lógica.
- [ ] Build; revisar claro/oscuro/celular en `npm run dev`; commit.

### Task 7: Exportar PDF

**Files:**
- Create: `src/features/coaches/components/summary/PdfExportPanel.tsx`, `src/features/coaches/wyscoutSquad/exportTeamSummaryPdf.ts`, `src/features/coaches/wyscoutSquad/pdfLayout.ts` + `pdfLayout.test.ts`

**Interfaces:**
- Produces: `exportTeamSummaryPdf(input: { coachName: string; club: string; season: number; dataDate: string|null; minMinutes: number; standings: StandingRow[]|null; last: AgencyFixture[]; next: AgencyFixture[]; seasonStats: SeasonStats|null; squad: WyscoutSquadData|null; teamMatches: number; widgetIds: string[] }): Promise<void>`; `planPages(blockHeights: number[], pageContentHeight: number): number[][]` (bloques por página, nunca parte un bloque salvo que sea más alto que la página).
- [ ] Test `planPages([100,200,300], 450)` → `[[0,1],[2]]`; bloque de 600 en página de 450 queda solo.
- [ ] Panel: lista de casillas agrupadas por sección (todas marcadas), "Marcar todos / ninguno", botón "Generar PDF" con spinner.
- [ ] PDF A4 vertical: tapa (escudo vía `club logo` cargado como dataURL, título, DT, fecha, "Datos de Wyscout del …", "Mínimo de minutos: 450"), bloques con título + tabla/barras vectoriales, pie "Página n de N · Doble G Sports Group · Fuentes: API-Football, Wyscout". Acentos: helvetica de jsPDF soporta Latin-1 (á é í ó ú ñ); verificar con Brandán/Echeverría.
- [ ] Generar con el archivo real, abrir el PDF y revisar página por página; commit.

### Task 8: Verificación final

- [ ] `npm test` y `npm run build` sin errores.
- [ ] En `npm run dev`: subir el archivo real, subir uno de otro equipo (error), mover el filtro, ordenar la tabla, exportar PDF con todo y con 3 widgets.
- [ ] Claro/oscuro, ancho 375px.
- [ ] Avisar al usuario para probar en local; no hacer merge/push.
