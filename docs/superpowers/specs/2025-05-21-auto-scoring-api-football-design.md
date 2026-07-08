# Auto-Scoring con API-Football — Design Spec

**Fecha:** 2025-05-21
**Estado:** Review
**Autor:** Marcos + Claude

## Resumen

Reemplazar el sistema de scoring manual basado en CSVs de Wyscout por un scoring automático partido a partido usando API-Football ($19/mes plan Pro). Los datos se sincronizan a Supabase via Edge Functions cada hora. El scoring se recalcula automáticamente y alimenta toda la plataforma.

## Decisiones clave

- **Reemplazo total**: el scoring de API-Football reemplaza al de Wyscout. No conviven.
- **Todos los jugadores**: se trackean todos los jugadores de todas las ligas, no solo los monitoreados.
- **Score puro**: sin ajuste por tier de liga. La liga se muestra como contexto, no modifica el score.
- **Promedio simple**: el score del perfil = promedio simple de todos los match_scores de la temporada.
- **Backend**: Supabase Edge Functions + pg_cron. Todo centralizado en Supabase.

---

## 1. Ligas

### Confirmadas (statistics_players: true)

**Europa:** Premier League (39), La Liga (140), Serie A (135), Ligue 1 (61), Bundesliga (78), Liga Portugal (94), Eredivisie (88), Champions League (2), Europa League (3)

**America:** Liga Profesional Argentina (128), Serie A Brasil (71), MLS (253), Liga MX (262), Copa Libertadores (13)

### A verificar (probar con fixtures de ultimas 2 semanas)

- Primera Nacional Argentina / 2da (131)
- Primera Division Uruguay (268)
- Primera Division Paraguay (279)
- Primera Division Chile (265)
- Liga BetPlay Colombia (239)
- Liga Pro Ecuador (242)
- Copa Sudamericana (11)
- Copa Argentina (130)
- Copa del Rey (143)
- Otras copas nacionales

Si devuelven player stats, se suman. Si solo devuelven lineups, se registra fixture y posicion pero sin match_score hasta que los datos aparezcan.

---

## 2. Posiciones (8)

| Abreviatura | Posicion |
|---|---|
| ARQ | Arquero |
| LD | Lateral derecho |
| CB | Defensor central |
| LI | Lateral izquierdo |
| VC | Volante central |
| VI | Volante interno |
| EXT | Extremo (sin distinguir banda) |
| DEL | Delantero |

---

## 3. Mapeo inteligente de posiciones

### Fuente

Endpoint `/fixtures/lineups` devuelve `formation` (ej: "4-3-3") y `grid` (ej: "2:4") por jugador.

### Algoritmo

**Paso 1:** Parsear formacion en lineas. "4-2-3-1" -> [4, 2, 3, 1]

**Paso 2:** Asignar rol a cada linea:

| Formacion | Linea 1 | Linea 2 | Linea 3 | Linea 4 |
|---|---|---|---|---|
| 4-3-3 | DEF (4) | MID (3) | ATK (3) | - |
| 4-2-3-1 | DEF (4) | MID_DEF (2) | MID_ATK (3) | ATK (1) |
| 3-5-2 | DEF (3) | MID (5) | ATK (2) | - |
| 5-3-2 | DEF (5) | MID (3) | ATK (2) | - |
| 4-4-2 | DEF (4) | MID (4) | ATK (2) | - |
| 3-4-3 | DEF (3) | MID (4) | ATK (3) | - |
| 4-1-4-1 | DEF (4) | MID_DEF (1) | MID_ATK (4) | ATK (1) |
| 5-4-1 | DEF (5) | MID (4) | ATK (1) | - |
| 4-3-1-2 | DEF (4) | MID (3) | MID_ATK (1) | ATK (2) |

**Paso 3:** Dentro de cada linea, asignar posicion por columna:

**Linea DEF:**
- 3 jugadores: todos CB
- 4 jugadores: col_min = LI, col_max = LD, resto = CB
- 5 jugadores: col_min = LI, col_max = LD, resto = CB

**Linea MID (mediocampo unico):**
- 2 jugadores: ambos VC
- 3 jugadores: col_medio = VC, costados = VI
- 4 jugadores: 2 centrales = VC, 2 extremos = VI
- 5 jugadores (3-5-2): col_min = LI, col_max = LD, col_medio = VC, restantes = VI

**Linea MID_DEF (pivote):**
- 1 jugador: VC
- 2 jugadores: ambos VC
- 3 jugadores: col_medio = VC, costados = VI

**Linea MID_ATK (enganche/mediapunta):**
- 1 jugador: VI (enganche)
- 2 jugadores: ambos VI
- 3 jugadores: costados = EXT, centro = VI (enganche)
- 4 jugadores (4-1-4-1): extremos = EXT, centrales = VI

**Linea ATK:**
- 1 jugador: DEL
- 2 jugadores: ambos DEL
- 3 jugadores: costados = EXT, centro = DEL

### Convencion de lados

Grilla de API-Football vista desde la perspectiva del equipo mirando al arco rival:
- **col minima (1) = lado IZQUIERDO = LI**
- **col maxima (N) = lado DERECHO = LD**

### Validacion obligatoria pre-produccion

Correr el mapeo contra partidos conocidos:
1. Real Madrid: Carvajal = LD (col max), Mendy = LI (col min)
2. Barcelona: Kounde = LD, Balde = LI
3. Argentina: Molina = LD, Acuna = LI
4. River: Bustos = LD, Enzo Diaz = LI

Si los 4 matchean, la convencion esta confirmada. Si estan invertidos, se flipea col_min <-> col_max globalmente.

### Edge cases

| Caso | Regla |
|---|---|
| 3-5-2 carrileros | Extremos de linea de 5 = LD/LI (linea de atras tiene solo 3 CBs) |
| 4-4-2 mediocampo | Extremos = VI (no EXT, es linea de mediocampo no ataque) |
| Jugador sin grid | Fallback a posicion generica G/D/M/F -> ARQ/CB/VC/DEL |
| Suplente que entra | Usa grid del jugador reemplazado si disponible; sino posicion generica |
| Cambio de formacion mid-game | API-Football reporta formacion inicial; suplentes heredan grid del reemplazado |

### Distribucion de posiciones

Despues de cada partido, se actualiza `players.position_distribution`:
```json
{"CB": 70, "LD": 20, "VI": 10}
```
`primary_position` = la de mayor porcentaje.

---

## 4. Scoring por posicion

Todas las metricas se normalizan a /90 minutos. Score = rank normalization (0-100) ponderada por pesos.

### ARQ (Arquero)

| Metrica | Fuente API-Football | Peso |
|---|---|---|
| Saves/90 | goals.saves | 35% |
| Goals conceded/90 (inverso) | goals.conceded | 25% |
| Rating | games.rating | 20% |
| Penalty saved | penalty.saved | 10% |
| Clean sheet | goals.conceded == 0 | 10% |

### CB (Defensor Central)

| Metrica | Fuente | Peso |
|---|---|---|
| Duels won % | duels.won / duels.total | 28% |
| Tackles/90 | tackles.total | 15% |
| Interceptions/90 | tackles.interceptions | 15% |
| Blocks/90 | tackles.blocks | 12% |
| Passes accuracy % | passes.accuracy | 12% |
| Rating | games.rating | 10% |
| Passes total/90 | passes.total | 8% |

### LD / LI (Lateral)

| Metrica | Fuente | Peso |
|---|---|---|
| Duels won % | duels.won / duels.total | 19% |
| Key passes/90 | passes.key | 14% |
| Dribbles success/90 | dribbles.success | 12% |
| Assists/90 | goals.assists | 12% |
| Tackles/90 | tackles.total | 10% |
| Passes accuracy % | passes.accuracy | 10% |
| Interceptions/90 | tackles.interceptions | 8% |
| Rating | games.rating | 8% |
| Dribbles success % | dribbles.success / dribbles.attempts | 7% |

### VC (Volante Central)

| Metrica | Fuente | Peso |
|---|---|---|
| Tackles/90 | tackles.total | 19% |
| Duels won % | duels.won / duels.total | 16% |
| Interceptions/90 | tackles.interceptions | 14% |
| Passes accuracy % | passes.accuracy | 14% |
| Passes total/90 | passes.total | 10% |
| Blocks/90 | tackles.blocks | 8% |
| Rating | games.rating | 8% |
| Key passes/90 | passes.key | 6% |
| Passes accuracy % (extra) | passes.accuracy | 5% |

### VI (Volante Interno)

| Metrica | Fuente | Peso |
|---|---|---|
| Duels won % | duels.won / duels.total | 16% |
| Key passes/90 | passes.key | 14% |
| Dribbles success/90 | dribbles.success | 12% |
| Assists/90 | goals.assists | 10% |
| Goals/90 | goals.total | 10% |
| Passes accuracy % | passes.accuracy | 10% |
| Shots on target/90 | shots.on | 8% |
| Rating | games.rating | 8% |
| Tackles/90 | tackles.total | 6% |
| Dribbles success % | dribbles.success / dribbles.attempts | 6% |

### EXT (Extremo)

| Metrica | Fuente | Peso |
|---|---|---|
| Dribbles success/90 | dribbles.success | 17% |
| Goals/90 | goals.total | 15% |
| Assists/90 | goals.assists | 14% |
| Key passes/90 | passes.key | 12% |
| Shots on target/90 | shots.on | 10% |
| Duels won % | duels.won / duels.total | 10% |
| Dribbles success % | dribbles.success / dribbles.attempts | 8% |
| Rating | games.rating | 8% |
| Fouls drawn/90 | fouls.drawn | 6% |

### DEL (Delantero)

| Metrica | Fuente | Peso |
|---|---|---|
| Goals/90 | goals.total | 30% |
| Shots on target/90 | shots.on | 12% |
| Assists/90 | goals.assists | 10% |
| Shots on target % | shots.on / shots.total | 8% |
| Key passes/90 | passes.key | 8% |
| Duels won % | duels.won / duels.total | 8% |
| Rating | games.rating | 8% |
| Dribbles success/90 | dribbles.success | 6% |
| Penalty scored | penalty.scored | 5% |
| Fouls drawn/90 | fouls.drawn | 5% |

### Calculo del match_score

1. Para cada metrica del jugador en el partido, normalizar a /90 min
2. Comparar contra la media + desviacion estandar de su posicion en esa liga (acumulado temporada)
3. Rank normalization (0-100) — mismo algoritmo actual (midpoint ranking)
4. Multiplicar por peso
5. Sumar todo = score_raw (0-100)
6. Convertir a escala 1-10: `match_score = 1 + (score_raw * 9 / 100)` → rango 1.0 a 10.0
7. Sin ajuste por tier de liga

**Escala: 1.0 a 10.0** (con 1 decimal). Alineado con el estandar del futbol (SofaScore, WhoScored, API-Football rating). Ejemplos: 5.6, 7.8, 8.0, 9.5.

`avg_score` del perfil = promedio simple de todos los match_score de la temporada (escala 1-10).

**Minutos minimos:** Solo se calculan match_score para partidos donde el jugador jugo 10+ minutos. Partidos con menos de 10 min se guardan en player_match_stats (para registro) pero con match_score = null y no cuentan para el promedio.

**Transferencias mid-season:** Si un jugador cambia de liga, sus scores se calculan por separado en cada liga. En player_season_scores tendra una fila por liga. El perfil muestra ambas.

---

## 5. Schema de Supabase

### Tabla: leagues

| Columna | Tipo | Descripcion |
|---|---|---|
| id | int (PK) | ID de API-Football |
| name | text | Nombre |
| country | text | Pais |
| tier | int | 1-6 (referencia visual, no afecta score) |
| season | int | Temporada activa |
| has_player_stats | boolean | Si tiene stats por jugador |
| last_synced_at | timestamptz | Ultima sincronizacion |

### Tabla: teams

| Columna | Tipo | Descripcion |
|---|---|---|
| id | int (PK) | ID de API-Football |
| name | text | Nombre |
| logo | text | URL logo |
| league_id | int (FK) | Liga actual |

### Tabla: players

| Columna | Tipo | Descripcion |
|---|---|---|
| id | int (PK) | ID de API-Football |
| name | text | Nombre completo |
| photo | text | URL foto |
| birth_date | date | Fecha nacimiento |
| nationality | text | Nacionalidad |
| preferred_foot | text | left/right/both |
| height_cm | int | Altura |
| current_team_id | int (FK) | Equipo actual |
| primary_position | text | Posicion principal (ARQ/LD/CB/LI/VC/VI/EXT/DEL) |
| position_distribution | jsonb | {"CB": 70, "LD": 20, "VI": 10} |

### Tabla: fixtures

| Columna | Tipo | Descripcion |
|---|---|---|
| id | int (PK) | ID de API-Football |
| league_id | int (FK) | Liga |
| season | int | Temporada |
| date | timestamptz | Fecha del partido |
| home_team_id | int (FK) | Local |
| away_team_id | int (FK) | Visitante |
| score_home | int | Goles local |
| score_away | int | Goles visitante |
| stats_synced | boolean | Si se bajaron las stats |

### Tabla: player_match_stats

| Columna | Tipo | Descripcion |
|---|---|---|
| id | bigint (PK) | Auto |
| player_id | int (FK) | Jugador |
| fixture_id | int (FK) | Partido |
| team_id | int (FK) | Equipo en ese partido |
| detected_position | text | ARQ/LD/CB/LI/VC/VI/EXT/DEL |
| formation | text | Formacion (ej: "4-3-3") |
| grid_position | text | Posicion en grilla (ej: "2:4") |
| minutes | int | Minutos jugados |
| rating | decimal | Rating 0-10 |
| is_substitute | boolean | Si entro desde el banco |
| goals | int | |
| assists | int | |
| shots_total | int | |
| shots_on | int | |
| passes_total | int | |
| passes_key | int | |
| passes_accuracy | decimal | % |
| tackles | int | |
| blocks | int | |
| interceptions | int | |
| duels_total | int | |
| duels_won | int | |
| dribbles_attempted | int | |
| dribbles_success | int | |
| fouls_drawn | int | |
| fouls_committed | int | |
| yellow_cards | int | |
| red_cards | int | |
| penalty_won | int | |
| penalty_scored | int | |
| penalty_missed | int | |
| penalty_saved | int | |
| saves | int | (arqueros) |
| goals_conceded | int | (arqueros) |
| match_score | decimal | Score calculado (1.0-10.0) |

### Tabla: player_season_scores

| Columna | Tipo | Descripcion |
|---|---|---|
| player_id | int (FK) | |
| season | int | |
| position | text | ARQ/LD/CB/LI/VC/VI/EXT/DEL |
| league_id | int (FK) | |
| matches_played | int | Partidos en esta posicion |
| avg_score | decimal | Promedio simple |
| avg_rating | decimal | Rating promedio |
| total_goals | int | |
| total_assists | int | |
| percentile | decimal | Percentil en su posicion en la liga |
| global_percentile | decimal | Percentil cross-league |

### Tabla: sync_log

| Columna | Tipo | Descripcion |
|---|---|---|
| id | bigint (PK) | |
| league_id | int | |
| fixture_id | int | |
| status | text | pending/success/error/no_stats |
| error_message | text | |
| created_at | timestamptz | |

### Indices clave

- `player_match_stats`: (player_id, fixture_id) UNIQUE, (fixture_id), (detected_position, team_id)
- `player_season_scores`: (player_id, season, position, league_id) UNIQUE
- `fixtures`: (league_id, season, stats_synced), (date)

---

## 6. Sincronizacion — Edge Functions + pg_cron

### 3 Edge Functions

**sync-fixtures** (cada hora): Descubre partidos terminados.
- 1 request por liga x 20 ligas = ~20 requests/ejecucion
- `GET /fixtures?league={id}&season=2025&status=FT&from={last_sync}&to={today}`
- Inserta fixtures nuevos con stats_synced = false

**sync-player-stats** (cada hora, despues de sync-fixtures): Baja stats y lineups.
- Toma batch de 15 fixtures con stats_synced = false
- Por cada fixture: GET /fixtures/lineups + GET /fixtures/players = 2 requests
- Mapea posiciones, calcula match_score, inserta en player_match_stats
- ~30 requests/ejecucion
- Dia con 50 partidos: se completa en ~4 horas

**recalc-scores** (trigger despues de sync-player-stats): Recalcula promedios.
- AVG(match_score) por jugador/posicion/liga
- PERCENT_RANK por posicion dentro de liga
- PERCENT_RANK por posicion cross-league
- UPSERT en player_season_scores
- Actualiza position_distribution en players

### Backfill inicial

Funcion manual `backfill-season`:
- Trae todos los fixtures terminados de la temporada
- Los procesa en batches de 15 cada 5 minutos
- ~7000 fixtures / 15 por batch = ~467 batches = ~39 horas (~2 dias)

Aceleracion opcional: usar GET /players?league={id}&season=2025 para stats agregadas como score base mientras se cargan los partidos individuales.

### Consumo diario estimado

| Concepto | Requests |
|---|---|
| sync-fixtures (20 ligas x 24h) | ~480 |
| sync-player-stats (50 fixtures x 2) | ~100 |
| Margen retries | ~50 |
| **Total** | **~630** |
| **Limite Pro** | **7,500** |
| **Uso** | **~8%** |

### Manejo de errores

| Caso | Estrategia |
|---|---|
| API caida | sync_log registra error, proximo cron reintenta |
| Fixture sin lineups | Fallback a posicion generica G/D/M/F |
| Fixture sin player stats | Marca no_stats, no reintenta |
| Rate limit 429 | Pausa batch, resto para proxima hora |
| Timeout 60s | Procesa lo que alcanzo, resto queda pendiente |

### Variables de entorno

```
API_FOOTBALL_KEY
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
SUPABASE_URL (auto)
SUPABASE_SERVICE_ROLE_KEY (auto)
```

---

## 7. UI — Cambios en el perfil del jugador

### Layout existente que se mantiene

La ficha individual (PlayerDetailPage.tsx) mantiene su estructura:
- Sidebar izquierdo: header gradiente, avatar, info, GaugeScore, evaluaciones, timeline, links, comentarios
- Contenido principal: tabs verticales (General, Metricas, Valor, Evolutivo, Fisico, Salud, etc.)

### Agrega: Barra de posiciones (sidebar, debajo del GaugeScore)

```
  ┌─────────────────────────┐
  │  Score GG    [7.4]      │
  │  vs 6.8 prom. CB        │
  ├─────────────────────────┤
  │  Posiciones             │
  │  ████████████████░░ CB 70%  <- click
  │  █████░░░░░░░░░░░ LD 20%   <- click
  │  ██░░░░░░░░░░░░░░ VI 10%   <- click
  ├─────────────────────────┤
  │  Evaluacion Scout       │
  └─────────────────────────┘
```

Click en posicion: cambia score, percentil, grafico evolutivo, metricas.

### Agrega: Grafico evolutivo (tab General, debajo de canchita)

- Recharts AreaChart con gradiente
- Toggle semanal/mensual (segmented control)
- Vista semanal: cada punto = match_score, eje X = semanas
- Vista mensual: cada punto = promedio del mes
- Linea punteada = promedio temporada
- Tooltip: fecha, rival, resultado, score, minutos
- Animacion suave al cambiar vista
- Responsive

### Interaccion posicion <-> grafico

Al seleccionar posicion secundaria:
- GaugeScore cambia al avg_score en esa posicion
- Percentil se recalcula para esa posicion/liga
- Grafico solo muestra partidos en esa posicion
- Radar/metricas se actualizan

---

## 8. Impacto en toda la plataforma

El nuevo scoring reemplaza los datos de CSV/Wyscout en TODAS las paginas:

| Pagina | Cambio |
|---|---|
| Scouting Externo | Listado consume player_season_scores. Filtros por score/posicion/liga |
| Scouting Interno | Jugadores DG con scoring automatico |
| Oportunidades | opportunityScore recalculado con scores nuevos |
| Radar | Metricas del radar = las de API-Football por posicion |
| Dispersion | Ejes usan nuevas metricas, promedios de Supabase |
| Similares | Algoritmo de similitud sobre nuevas metricas por posicion |
| Comparacion | Side-by-side con metricas y scores nuevos |
| Analisis completo | Rankings y busqueda sobre Supabase |
| Dashboard interno | Stats agregadas recalculadas |
| Seguimiento | Score evolutivo real automatico |
| Formaciones | Score actualizado por jugador |

---

## 9. Consumo desde React

### Nuevo servicio: playerStatsService.ts

Queries principales:
1. **Lista/ranking**: player_season_scores JOIN players/teams/leagues, paginado, filtros
2. **Ficha individual**: players + player_season_scores + player_match_stats (evolutivo)
3. **Promedios posicion/liga**: agregados para percentiles y comparacion
4. **Ranking por posicion**: ordenado por avg_score, filtrable por liga o cross-league

### Que se elimina

- csvService.ts (o se mantiene temporalmente)
- computeGGScores() del frontend (score viene de Supabase)
- 12 CSVs de Google Sheets para scoring
- Proxy /sheets-proxy (si no se usa para otra cosa)

### Caching

- Listados/rankings: stale time 1 hora
- Ficha individual: stale time 30 minutos
- Promedios posicion/liga: stale time 4 horas

---

## 10. Plan de migracion

### Fase 1: Backend
- Crear tablas en Supabase
- Deploy 3 Edge Functions
- Verificar ligas dudosas (2 semanas de fixtures)
- Validar mapeo de posiciones (test Carvajal/Mendy/Molina/Bustos)
- Backfill temporada completa

### Fase 2: Frontend — servicio de datos
- playerStatsService.ts (lee de Supabase)
- DataContext alternativo
- Feature flag CSV vs Supabase

### Fase 3: Frontend — UI completa
- Barra de posiciones en sidebar
- Grafico evolutivo en tab General
- Actualizar TODAS las paginas: scouting externo/interno, oportunidades, radar, dispersion, similares, comparacion, analisis completo, dashboard, seguimiento, formaciones

### Fase 4: Limpieza
- Remover csvService, CSVs, scoring utils del frontend
- Remover feature flag
- Remover proxy si no se usa
