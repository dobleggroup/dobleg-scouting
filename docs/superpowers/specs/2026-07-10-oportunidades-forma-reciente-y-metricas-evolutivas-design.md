# Oportunidades por forma reciente + Métricas evolutivas Wyscout — Diseño

**Fecha:** 2026-07-10
**Rama:** feat/doble-g-membership
**Estado:** Aprobado por el usuario — pendiente de plan de implementación

## Contexto

Siete mejoras relacionadas, agrupadas porque comparten dos piezas base (el motor de
forma reciente y el módulo de datos evolutivos Wyscout):

1. **Motor de forma reciente** (RPC Supabase) — base de #2 y #3.
2. **Oportunidades** (Búsqueda de Talento) rankeadas por forma reciente + condición de mercado.
3. **Adelanto de Oportunidades en Inicio** (hero rotativo).
4. **Reorden de pestañas** en la ficha interna.
5. **Gráfico evolutivo Wyscout + insights** en la ficha interna (pestaña Rendimiento).
6. **Columna "Video Cargado"** en el listado de scouting interno.
7. **Pestaña "Métricas evolutivas"** en Informes (solo jugadores internos).

Principio transversal: nada de esto consume la API-Football (7500 req/día, es del cron de
sync) ni las functions de Netlify (plan $9/mes). Todo pega directo a Supabase o a la
planilla publicada como CSV.

---

## 1. Motor de forma reciente — RPC `fetch_recent_form`

### Fuente de datos
`player_match_stats.match_score` (Score GG por partido) + `fixtures.date`. Ya existe para
todos los jugadores (externos e internos).

### Señal
**Promedio de `match_score`** dentro de una ventana temporal.

### Reglas
- Ventanas seleccionables: **1, 3, 6, 12 meses**.
- **Mínimo 3 partidos** dentro de la ventana para que el promedio cuente.
- **Fallback:** si la ventana elegida no llega a 3 partidos, usar los **últimos partidos
  dentro de 6 meses** (hasta un tope, ej. últimos 5). Si ni con el fallback hay ≥3
  partidos, el jugador no califica.
- **"En alza":** flag booleano = promedio reciente supera el `primary_score` de temporada.

### Firma (SQL)
Nueva migración con función `fetch_recent_form`:

```
fetch_recent_form(
  p_window_months int,        -- 1 | 3 | 6 | 12
  p_min_matches int,          -- default 3
  p_fallback_months int,      -- default 6
  p_fallback_limit int,       -- default 5 (últimos N partidos)
  p_positions text[],         -- opcional
  p_page int, p_page_size int
) returns jsonb
```

Devuelve, por jugador que califica:
`player_id, name, photo, team{...}, league{...}, primary_position, birth_date,
market_value_eur, contract_end_date, primary_score, recent_avg, recent_matches,
on_the_rise (bool), window_used ('window' | 'fallback')`.

La agregación (join a `fixtures`, filtro por fecha, conteo, promedio, fallback) se hace
server-side. El cliente solo filtra por condición de mercado y ordena por `recent_avg`.

### Servicio cliente
`src/services/playerStatsService.ts` → nueva función `fetchRecentForm(opts)` que llama al
RPC. Nuevo tipo `RecentFormPlayer` en `src/types/scoring.ts`.

---

## 2. Página Oportunidades

Archivo: `src/pages/OpportunitiesPage.tsx` + `src/utils/opportunities.ts`.

### Modelo de oportunidad (nuevo)
Una oportunidad = **buena forma reciente (obligatoria) + al menos una condición de
mercado**. Se etiqueta con la condición que cumple:

- **`Fin de contrato`** — `contract_end_date` ≤ 6 o 12 meses.
- **`Precio bajo`** — `market_value_eur` por debajo de un umbral configurable (mantener la
  lógica de "undervalued/bargain" actual: valor accesible relativo al score).

Si no cumple ninguna condición de mercado, **no** es oportunidad. Ranking por `recent_avg`.

### UI
- **Selector de ventana** arriba: `1 mes · 3 · 6 · 12 meses`.
- Cada card suma respecto de hoy: **mini-curva de forma reciente** (sparkline de los últimos
  match_scores), **Score GG reciente**, flecha **▲ "en alza"** si corresponde, y el **tag de
  mercado**. Se conservan los filtros actuales (posición, edad, valor, contrato).
- `buildOpportunities` se reescribe para consumir `fetchRecentForm` en vez de detectar sobre
  `primary_score`. Los "type" pasan de 4 a 2 tags de mercado (contrato / precio bajo).

---

## 3. Adelanto de Oportunidades en Inicio

Archivo: `src/pages/HomePage.tsx`.

- **Reemplaza** el bloque "Actividad de la semana" (Juegan esta semana / Sin partidos esta
  semana), líneas ~625–663, y su lógica asociada (`weekActivity`, `activePlayers`,
  `inactivePlayers`).
- Nuevo componente **hero rotativo**: una card grande que **auto-rota** entre el top N de
  oportunidades externas (mismo `fetchRecentForm` + condición de mercado), con foto, Score GG,
  ▲ en alza, tag de mercado y mini-curva. Debajo, **miniaturas** de las siguientes; click en
  cualquiera → ficha del jugador (`/jugador/...?source=externo&apiId=...`).
- Indicadores de paginación (puntitos) y pausa al hover. Auto-rota cada ~5s.
- Ventana por defecto: 3 meses. Se carga una sola vez al montar Inicio.
- El resto de Inicio (Partidos de hoy, calendario, resultados, contratos) queda igual.

---

## 4. Reorden de pestañas — ficha interna

Archivo: `src/pages/PlayerDetailPage.tsx`, array `tabsConfig` (~línea 910).

Nuevo orden: **General → Rendimiento → Métricas → Valor → Físico → Salud → …** (resto igual).
Solo se mueve la entrada `'Rendimiento evolutivo'` (label "Rendimiento") al 2º lugar. No cambia
la lógica de filtrado `internal`.

---

## 5. Gráfico evolutivo Wyscout + insights — ficha interna (Rendimiento)

Archivo: `src/pages/PlayerDetailPage.tsx`, tab `Rendimiento evolutivo` (~línea 2161), debajo
del `ScoreEvolutionChart` existente.

### Datos
Planilla Wyscout publicada como CSV:
`https://docs.google.com/spreadsheets/d/1gXhmqIc_joFkiQ1brie4-xHX43W8fqn2f6tqV04rx9s/export?format=csv&gid=284673441`

Data **por partido**: `Jugador, Partido, Competition, Date, Minutos jugados`, y ~30 métricas.
Muchas son pares "intentados / logrados" (label `"X / Y"` ocupa 2 columnas: intentos y
logrados/precisos). Actualmente solo hay filas de **Matías Palacios** y **José Paradela**
(temporadas 2023/2024).

### Módulo compartido `wyscoutEvolution`
Nuevo: `src/features/wyscout/` (o `src/services/wyscoutEvolutionService.ts` + utils).
Responsabilidades:
- Bajar + parsear el CSV (vía el mismo proxy `/sheets-proxy` en dev / proxy deployado en prod
  que ya usa `csvService`).
- Detectar el esquema de columnas: métricas simples vs pares. Para cada par, exponer valor
  crudo (logrados) y **% de eficacia** = logrados / intentos.
- Match por nombre **normalizado** (NFD, case/acento-insensitive; nombre completo, apellido,
  o "Inicial. Apellido").
- API:
  - `listMetrics()` → `{ key, label, type: 'simple' | 'ratio', unit }[]`.
  - `getPlayerSeries(playerName, metricKey)` → `{ date, matchLabel, competition, value }[]`
    ordenado por fecha (para pares, `value` = %).
- Caché en memoria (fetch único por sesión).

### Gráfico
Debajo de "Evolución del Score":
- **Dropdown con todas las métricas** (`listMetrics`).
- Componente de línea reutilizable (estilo idéntico a `ScoreEvolutionChart`): línea por
  partido + línea punteada = promedio del jugador. Para pares grafica **%**; para simples,
  valor crudo.
- Estado vacío elegante si el jugador no está en la planilla (hoy, todos menos Palacios/Paradela).

### Insights (motor de reglas)
Debajo del gráfico, 1–2 insights cortos y accionables según la métrica + serie elegida.
Nuevo módulo `wyscoutInsights.ts` con reglas puras (fáciles de testear):
- **Tendencia:** compara promedio de últimos N vs previos → "▼ Su % de duelos ganados bajó de
  61% a 48% en los últimos 4 partidos".
- **Racha** (solo métricas de conteo, ej. Goles): partidos consecutivos en 0 → "Hace 7
  partidos que no marca".
- **Récord del semestre:** máx/mín de la serie en el último partido → "▲ Mejor % de pases del
  semestre (91%) el último partido".
- **vs promedio personal:** últimos K por encima/debajo del promedio.
Se elige el/los insight(s) más relevante(s) por prioridad; se recalculan al cambiar la métrica.

---

## 6. Columna "Video Cargado" — listado scouting interno

Archivo: `src/components/players/PlayerTable.tsx`.

Problema: el puntito de video (verde/ámbar/rojo/gris) hoy vive pegado al nombre, junto al
`ContractBadge` (naranja/rojo) → se confunden.

Cambios:
- Agregar columna **`Video Cargado`** en `BASE_COLUMNS_INTERNAL`, **antes de `Equipo`**
  (Club). No sortable (o sortable por freshness, opcional).
- Mover el puntito de video del cell "Jugador" a esa columna nueva (desktop).
- El `ContractBadge` **se queda junto al nombre**.
- **Mobile:** el layout compacto (líneas ~217–229) oculta columnas; ahí el puntito de video
  se separa visualmente del badge de contrato (etiqueta o fila propia) para que no se confundan.
- Mantener la leyenda de "Videos" existente (línea ~426).

---

## 7. Pestaña "Métricas evolutivas" — Informes

Archivos: `src/features/informes/*`.

### Alcance
- **Solo para jugadores internos** linkeados (`Informe.dbPlayerId` seteado) **y** presentes en
  la planilla Wyscout. Si no, la sección no se ofrece.
- El usuario agrega **hasta 8 gráficos evolutivos**, cada uno eligiendo su métrica (mismo
  dropdown / `listMetrics` del módulo compartido).
- Si **no agrega ninguno → la pestaña no aparece** en el informe.
- En Informes van **solo los gráficos** (los insights son exclusivos de la ficha).

### Modelo
`src/features/informes/types.ts` → `Informe` suma campo:
`evolutionCharts?: string[]` (array de metric keys, máx 8, orden = orden de aparición).

### UI del wizard
`Step2Metricas.tsx` → nueva sección "Métricas evolutivas" (visible solo si el protagonista es
interno + está en la planilla). Botón "Agregar gráfico" (hasta 8), cada uno con selector de
métrica y botón de quitar. Preview en vivo con el componente de línea.

### Render + export
- **Preview** (`Step4Preview.tsx`): nueva pestaña "Métricas evolutivas" con los gráficos
  (reusa el componente de línea de la ficha).
- **Export PDF/HTML** (`chartSvg.ts`, `exportInformeHTML.ts`, `exportInformePDF.ts`): agregar
  un generador **`lineSvg`** a `chartSvg.ts` (hoy hay `radarSvg`, `barsSvg`, `gaugeSvg`, no
  línea) siguiendo el mismo patrón, y renderizar los gráficos evolutivos como sección propia
  del informe exportado.

---

## Orden de implementación sugerido

1. **Módulo `wyscoutEvolution`** (parseo + match + series + % eficacia) — lo reusan #5 y #7.
2. **RPC `fetch_recent_form`** + servicio cliente — lo reusan #2 y #3.
3. **#4 Reorden de pestañas** (trivial, desbloquea foco en #5).
4. **#5 Gráfico Wyscout + insights** en la ficha.
5. **#2 Oportunidades** reescrita sobre el RPC.
6. **#3 Adelanto de Inicio** (hero rotativo).
7. **#6 Columna Video Cargado**.
8. **#7 Pestaña Métricas evolutivas** en Informes (incluye `lineSvg` para export).

## Fuera de alcance / notas

- No se cargan más jugadores a la planilla Wyscout (lo hace el usuario manualmente). El
  sistema debe degradar con gracia cuando un jugador no tiene datos.
- Umbrales concretos (valor "bajo", N de tendencia, tope de fallback) se afinan en el plan;
  acá quedan como parámetros con defaults razonables.
- Tests unitarios para: parseo/pares del CSV, cálculo de series y %, motor de insights, y la
  lógica de calificación de oportunidades (reglas puras, sin red).
