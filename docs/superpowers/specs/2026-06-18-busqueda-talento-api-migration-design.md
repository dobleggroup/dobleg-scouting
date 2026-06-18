# Migración de "Búsqueda de Talento" a la API (Supabase / Score GG)

Fecha: 2026-06-18
Estado: aprobado el diseño, pendiente revisión del spec

## Objetivo

Migrar las 7 páginas de la sección "Búsqueda de Talento" del scoring viejo (CSV de
Google Sheets, `ggScore` 0-100, ~40 métricas Wyscout) al scoring y datos de la API
(Supabase: "Score GG" `avg_score` 1-10 + métricas p90 de API-Football/Sofascore).
Tras la migración, estas páginas dejan de depender del CSV.

Páginas (en `src/pages/`):
1. `ScoutingWorksPage.tsx` — Trabajos de scouting
2. `FormationPage.tsx` — Formaciones
3. `SimilarPlayersPage.tsx` — Similares
4. `OpportunitiesPage.tsx` — Oportunidades
5. `BusquedaPage.tsx` — Análisis Completo
6. `ComparisonPage.tsx` — Comparación
7. `ScatterChartPage.tsx` — Dispersión

## Decisiones tomadas

- **Todo a la API.** Las páginas pesadas usan el set de métricas de la API (~15-19),
  no las ~40 Wyscout. Las métricas Wyscout desaparecen de estas vistas.
- **Las 7 en esta tanda**, en orden fácil → difícil.
- **Score = Score GG (1-10)** en todas, con la escala de color `'10'` (igual que
  ExternalScoutingPage). No se muestra más el `ggScore` 0-100.
- **Sin consumo de API-Football.** Todo sale de datos ya sincronizados en Supabase;
  el recálculo agrega columnas a partir de `player_match_stats` existentes.

## Arquitectura: base común (Fase 0)

Habilita las páginas pesadas. Sin esto, no hay vector de métricas por jugador para
radar/scatter/similares sobre el pool.

### 0.1 Métricas por jugador en `player_season_scores`

Hoy `player_season_scores` tiene: `matches_played, avg_score, avg_rating,
total_goals, total_assists, percentile, global_percentile`. Las métricas p90 por
jugador solo se calculan on-demand en la ficha individual (desde `player_match_stats`).

**Cambio:** agregar columnas de métricas p90 por jugador (mismas que el radar):

`tackles_p90, interceptions_p90, blocks_p90, duels_won_pct, passes_accuracy,
passes_key_p90, passes_p90, dribbles_p90, dribbles_pct, shots_on_p90, shots_pct,
goals_p90, assists_p90, fouls_drawn_p90` y para arqueros `saves_p90, gc_p90,
pen_saved_avg, clean_sheet_pct`.

- Migración SQL: `ALTER TABLE player_season_scores ADD COLUMN ... NUMERIC` (nullable).
- Poblado en la función `recalc-scores` (`supabase/functions/recalc-scores/index.ts`):
  para cada (player_id, season, position, league_id), promediar las métricas /90 de
  sus `player_match_stats` con ≥10 min. Es la misma fórmula que ya usa para
  `position_metric_averages`, sin agrupar por liga/posición global.
- Re-correr `recalc-scores` una vez tras desplegar (operación interna, sin API-Football).

### 0.2 Exponer las métricas en el RPC y la ficha

- Extender el SELECT del RPC `fetch_players_list` para incluir las columnas nuevas en
  el objeto `season_scores[0]` que devuelve.
- `PlayerWithScore` / `PlayerSeasonScore` (en `src/types/scoring.ts`) suman los campos.

### 0.3 Catálogo de métricas de la API

Nuevo módulo `src/constants/apiMetrics.ts`:
- Lista de las métricas con `{ key, label, shortLabel, unit, higherIsBetter }`.
- Mapa de métricas relevantes por posición (las del scoring/radar — ver
  `docs/.../2026-05-25-radar-chart-metrics-design.md` líneas 21-27).
- Reemplaza el uso de `SCORING_CONFIG` / `METRIC_GROUPS` (CSV) en estas páginas.

### 0.4 Hook de pool con métricas

- Reusar `usePlayersList` (ya trae score + season_scores con métricas tras 0.2) para
  las páginas que listan/grafican sobre el pool.
- Donde haga falta el pool completo filtrado (scatter, similares), `fetchPlayersList`
  con `pageSize` grande o un parámetro para traer todo el conjunto filtrado.

## Migración por página

### Grupo fácil

**ScoutingWorksPage** — Solo identidad (nombre, equipo, país, posición). Los proyectos
están hardcoded. Cambiar la búsqueda/lookup de jugadores a `usePlayersList`/búsqueda
por nombre en la API. Sin score ni métricas.

**FormationPage** — Buscar jugador por posición/liga vía API; badge de color desde
`primary_score` (1-10) con `getScoreColorClass(score, '10')`. Mantener mapeo de
posición → casilla de formación. `formationService` (guardado) sin cambios.

### Grupo medio

**SimilarPlayersPage** — Algoritmo de similitud (distancia euclidiana ponderada) sobre
el **vector de métricas de la API** por posición (catálogo 0.3) en vez de las métricas
CSV de `SCORING_CONFIG`. Fuente: `season_scores[0]` de cada jugador del pool. Pesos por
posición = los del catálogo. El selector de jugador base y el render no cambian.

**OpportunitiesPage** — Recalibrar umbrales de 0-100 a 1-10. Detecciones:
- *Contrato por vencer*: `monthsRemaining <= 12` (sin cambio; no usa score).
- *Subvalorado*: `primary_score >= 6.5` y `market_value_eur` bajo para ese score.
- *Joven talento*: `age <= 21` y `primary_score >= 6.0`.
- *Relación calidad/precio*: ranking de `primary_score` vs `market_value_eur`.
Los cortes 6.0/6.5 son punto de partida; se ajustan tras ver resultados reales.
Edad/valor/contrato salen de la API (`birth_date`, `market_value_eur`,
`contract_end_date`).

### Grupo pesado (gráficos)

**BusquedaPage (Análisis Completo)** — Reescribir la fuente de datos a la API:
- Score: `primary_score` (1-10) en todos los rankings, contexto de liga y conclusiones
  (hoy usan `selectedPlayer.ggScore` directo — se reemplaza).
- Rankings top-N por métrica: sobre las métricas del catálogo API.
- Radar: métricas API del jugador vs promedio posición-liga (`position_metric_averages`,
  ya existe).
- Scatter (2 ejes): ejes elegidos del catálogo API.
- Conclusiones/recomendación: recalculadas sobre Score GG y métricas API.

**ComparisonPage** — Comparar 2-3 jugadores: bar/radar/heatmap y stats side-by-side
sobre métricas del catálogo API + Score GG. Export PDF se mantiene (cambia el contenido
de datos, no el mecanismo).

**ScatterChartPage** — Ejes X/Y desde el catálogo de métricas API (reemplaza
`METRIC_GROUPS` Wyscout). Color gradient por Score GG. Export PNG/PDF sin cambios de
mecanismo.

## Flujo de datos (después)

`Supabase (player_season_scores + position_metric_averages)` → `fetch_players_list` RPC
/ hooks (`usePlayersList`, `usePositionAverages`) → páginas. Sin paso por `DataContext`
/ CSV para estas 7 páginas.

## Manejo de errores

- Jugadores sin métricas suficientes (pocos partidos): métrica = `null`, se muestra "—"
  y se excluye de rankings/scatter de esa métrica (no rompe el gráfico).
- Score `null`: badge gris con razón (igual que hoy en PlayerTable / ExternalScouting).
- Fallo de red del RPC: estado de error de la página (patrón de ExternalScoutingPage).

## Testing

- Unit: catálogo de métricas (mapa posición→métricas), recalibración de umbrales de
  Oportunidades, función de similitud sobre vectores API (caso conocido).
- Datos: verificar vía anon que el RPC devuelve las métricas nuevas pobladas para
  jugadores con partidos (post recalc).
- Manual: cada página carga, score 1-10, gráficos con métricas API, sin referencias a
  `ggScore`/CSV. Comparar contra ExternalScoutingPage como patrón.

## Fuera de alcance

- Ingerir las métricas Wyscout a Supabase (se descartan en estas vistas).
- Retirar el CSV/`DataContext` de OTRAS partes de la app (Scouting Interno, etc.) —
  solo se desacoplan estas 7 páginas.
- Rediseño visual de los gráficos (se mantiene el diseño actual, cambia la fuente).

## Riesgos / decisiones abiertas

- Los umbrales de Oportunidades en 1-10 son tentativos; ajustar con datos reales.
- El recálculo agrega columnas a una tabla grande; correr `recalc-scores` una vez y
  verificar tiempos. No afecta cuota de API-Football.
- El set de métricas API es más chico que Wyscout: confirmar con el usuario que las
  ~15-19 métricas elegidas cubren lo que necesita para evaluar jugadores.
