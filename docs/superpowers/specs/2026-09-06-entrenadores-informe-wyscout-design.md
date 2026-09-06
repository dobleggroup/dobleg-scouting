# Entrenadores — Informe de equipo Wyscout (PDF)

## Contexto

En Resumen (`CoachSeasonStatsCard.tsx`) ya existe "Cargar Excel de Wyscout" — sube el
export "Team Stats" (.xlsx, una fila por partido con métricas agregadas) y alimenta
`coach_match_team_stats`. Este proyecto agrega, al lado, "Cargar informe PDF de
Wyscout": el reporte "Informe del equipo" (PDF de varias páginas) que trae stats de
temporada por jugador, formaciones usadas con % y comparativa de rendimiento,
alineación + minuto exacto de cada cambio en cada partido, mapas de eventos (duelos,
aéreos, tiros, regates, córners/tiros libres) y grillas de zona con porcentajes
(recuperaciones, pérdidas, faltas, etc.). Es un reporte distinto del .xlsx: mucho más
rico, pero en PDF.

**Referencia real:** `CA Temperley.pdf` (informe de Nicolás Domingo / Temperley,
últimos 10 partidos de Primera Nacional 2026) — usado para construir y testear el
parser contra un archivo real, no contra el esquema documentado de Wyscout a ciegas.
Se guarda como fixture del proyecto (Sección 8).

**Flujo de actualización:** siempre "los últimos 10 partidos" — cada subida nueva
reemplaza a la vigente como "el informe actual" de ese entrenador, pero no se borran
las anteriores (quedan de historial, mismo criterio que otros buckets de la app).

**Alcance:** genérico para cualquier entrenador (hoy: Domingo y Stillitano) — un
mismo componente y una misma tabla, no algo hardcodeado a Temperley.

**Diferido, fuera de esta versión:** el gráfico de "jugadores de inferiores usados
por partido" (cantidad + minutos, 2026) queda con el mecanismo listo pero sin
prender — falta la lista de jugadores surgidos de inferiores de cada club, que el
usuario va a mandar después. Ver Sección 9.

## 1. Ya existe: reutilizar en vez de reconstruir

`pdfjs-dist` ya es dependencia de la app y ya se usa en `src/features/gps/parser/`
para leer PDFs de GPS con la misma técnica que necesito acá (texto + coordenadas
x/y, reconstrucción de tablas por posición). Dos piezas de ahí son genéricas —sin
nada específico de GPS— y se **mueven** a un lugar compartido en vez de duplicarse:

- `extractItems.ts` + `pdfWorker.ts` → `src/lib/pdf/extractPdfItems.ts`. Misma
  firma y misma lógica (`extractPdfItems(data, opts) → PdfTextItem[]` con
  `{ str, x, y, width, page }`), solo cambia el import en `gps/parser/parsePdf.ts`.
  Sin cambios de comportamiento — los tests de GPS existentes son la prueba de que
  el movimiento no rompió nada.
- La función `groupRows` de `gps/parser/buildTable.ts` (agrupa items en filas por
  línea de base con tolerancia, ordena celdas por x) → `src/lib/pdf/groupRows.ts`,
  reutilizada tal cual. `nearestColumn` (columna más cercana por centro-x) igual.

El resto de `gps/parser/` (headers de Catapult/OpenField, matching de jugadores
GPS) es específico de ese dominio y no se toca.

## 2. Reconocimiento de secciones — anclas de encabezado

Cada página del informe repite un encabezado fijo arriba ("INFORME DEL EQUIPO" +
nombre de sección en mayúsculas + escudo/nombre del equipo). Ese nombre de sección
es el ancla: mucho más estable que adivinar la posición de cada fila.

```ts
// src/features/coaches/wyscoutReport/parseWyscoutReportPdf.ts
type SectionLabel =
  | 'jugadores' | 'estadisticas' | 'formaciones' | 'partidos'
  | 'fase_defensiva' | 'construccion_del_juego' | 'ataque' | 'transiciones'
  | 'jugadas_a_balon_parado' | 'glosario' | 'desconocida'

function classifySectionLabel(headerText: string): SectionLabel
// Match case/tilde-insensitive (normalizeForSearch, ya existe en @/lib/search)
// contra los títulos reales de Wyscout. 'glosario' se ignora (texto de ayuda, sin
// datos). 'desconocida' no rompe el parseo: la página se agrega a `warnings` y se
// sigue con el resto — mismo criterio que parseNacsportXml (degradar con aviso,
// no reventar).

export async function parseWyscoutReportPdf(
  data: ArrayBuffer,
): Promise<{ report: WyscoutReportData; warnings: string[] }>
```

Agrupa páginas consecutivas del mismo `SectionLabel` (ej. "PARTIDOS" son 10 páginas
seguidas, una por partido) y le pasa cada grupo al sub-parser correspondiente.

## 3. Jugadores de temporada — páginas "JUGADORES" + "ESTADÍSTICAS"

Tabla clásica: fila = jugador, columnas por posición-x (misma técnica que
`groupRows`/`nearestColumn` de GPS). Las filas de un solo texto sin números
("DEFENSORES", "CENTROCAMPISTAS", "DELANTEROS") son encabezados de grupo, se
detectan porque no tienen celdas numéricas y se descartan como fila de dato (igual
que `isAggregateRow` en GPS) — no hace falta guardar la agrupación por posición,
ya viene en el código de posición de cada jugador (`RCB`, `LDMF`, etc.).

Wyscout escribe varias métricas como "N / M NN%" (ej. `375 / 303 81%`) en 2-3
`items` de texto separados pero muy cerca en x, bajo la misma columna de cabecera.
Regla: antes de asignar por columna más cercana, fusionar celdas contiguas de la
misma fila cuya separación en x sea menor a un umbral chico (`ADJACENT_CELL_GAP`,
calibrado contra el fixture real) — el resultado fusionado se parsea como
`{ total, exitosos, pct }` o se guarda crudo si no matchea ese patrón.

```ts
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
  metrics: Record<string, number | { total: number; exitosos: number; pct: number } | null>
}
```

`metrics` es un diccionario abierto (mismo criterio que `WyscoutRawRow.extra` del
parser de .xlsx existente) — no hace falta declarar una interfaz por cada una de
las ~40 columnas que trae el informe entre las dos tablas de "ESTADÍSTICAS"
(tiros, pases, centros, regates, duelos, balones perdidos/recuperados, toques en
área, duelos defensivos/ofensivos/aéreos, interceptaciones, entradas, faltas,
pases hacia adelante/atrás/laterales, pases progresivos, etc.). El nombre de cada
key sale de la cabecera de columna normalizada (`slugify`, ya existe en el parser
de .xlsx).

## 4. Formaciones — página "FORMACIONES"

Por cada formación (2-3 por informe): nombre (`4-2-3-1`), % de uso, 11 puntos con
número+apellido+posición (ver Sección 6 — se reutiliza), y 6-7 filas de
comparativa propio-vs-rival con etiqueta fija en el medio (GOLES, XG, POSESIÓN DEL
BALÓN %, PRECISIÓN PASES %, INTENSIDAD DE JUEGO, DISTRIBUCIÓN LANZAMIENTOS %,
PPDA). Se ancla por el texto de la etiqueta (conocido, fijo) y se toma el número
más cercano a la izquierda como propio y el más cercano a la derecha como rival.

```ts
export interface WyscoutReportFormation {
  scheme: string
  usagePct: number
  averagePositions: PitchPoint[]  // Sección 6
  teamStats: { label: string; own: number; rival: number }[]
}
```

## 5. Partidos — páginas "PARTIDOS" (una por página)

Encabezado de la página: rival, marcador, fecha, competencia (mismo dato que ya
carga el .xlsx existente, pero acá viene por partido individual, no hace falta
cruzarlo con fixtures de API-Football para este uso). Debajo: dos columnas de XI +
suplentes usados (posición-código + número + nombre), y más abajo bloques
"`<formación>` `<minuto-inicio>' — <minuto-fin>'`" con los 10-11 jugadores en
cancha en ese tramo (número + apellido + x/y).

**Decisión clave: los minutos jugados por jugador se calculan sumando los tramos
de formación donde aparece su número, no parseando las marcas de entra/sale (▽/△ +
minuto) pegadas al nombre en la lista plana.** Esas marcas son ambiguas de
desambiguar solo con texto (¿la flecha entra o sale? ¿cuál de los 2-3 números
pegados es cuál evento?); los tramos de formación en cambio son explícitos y
sin ambigüedad — cada tramo dice desde-hasta y quién está en cancha. La lista
plana solo se usa para dos cosas que sí son confiables ahí: quién arrancó de
titular (columna superior) y el código de posición de cada uno.

```ts
export interface WyscoutReportMatchStint {
  formation: string
  fromMinute: number
  toMinute: number
  players: PitchPoint[]  // número, apellido, x, y
}

export interface WyscoutReportMatch {
  date: string        // ISO, parseado de "DD.MM.YYYY"
  rival: string
  isHome: boolean
  score: string
  competition: string
  lineup: { number: number; name: string; positionCode: string; isStarter: boolean }[]
  stints: WyscoutReportMatchStint[]
}

/** Minutos jugados = suma de (toMinute - fromMinute) de los stints donde aparece `number`. */
export function minutesPlayedInMatch(match: WyscoutReportMatch, number: number): number
```

## 6. Mapas de eventos (duelos, aéreos, tiros, regates, córners/tiros libres) — reutiliza el patrón de la cancha

Páginas "FASE DEFENSIVA" / "ATAQUE" / "TRANSICIONES" / "JUGADAS A BALÓN PARADO"
traen mapas de eventos: cada evento es un número de camiseta (1-2 dígitos) o un
punto, posicionado en su x/y real sobre una cancha (o media cancha) de fondo.
**Es la misma estructura que ya dibuja `VideoAnalysisPitch`** (puntos exactos
sobre una cancha 0-100), así que en vez de un componente nuevo se generaliza:

```ts
// src/features/coaches/components/VideoAnalysisPitch.tsx — sin romper el uso actual
export default function VideoAnalysisPitch({
  exact, zones, half,  // half?: 'completa' | 'propia' | 'rival' — nuevo, opcional, default 'completa'
}: { exact: PitchPoint[]; zones: ZoneRect[]; half?: PitchHalf })
```

`PitchPoint = { x: number; y: number; label?: string }` — `label` (nuevo, opcional)
muestra el número de camiseta sobre el punto en vez del punto pelado; sin `label`
se comporta exactamente como hoy (video-análisis no se ve afectado).

**Recorte de alcance explícito:** Wyscout distingue el *tipo* de evento dentro de
un mismo mapa por la forma del ícono (● duelo, ■ interceptación, ♦ entrada) — eso
es información gráfica (forma del glifo), no texto, y no se puede recuperar de
forma confiable extrayendo solo texto posicionado. V1 grafica todos los eventos
de un mismo mapa como una sola nube de puntos por categoría (ej. "duelos
defensivos propio tercio" completo, sin separar cuántos fueron interceptación vs
entrada) — la tabla de la derecha de cada gráfico en el PDF (que sí trae ese
desglose por jugador en columnas separadas) se parsea aparte como tabla normal
(Sección 3) y ahí sí queda el desglose exacto.

```ts
export interface WyscoutEventMap {
  category: string  // 'duelos_defensivos_propio_tercio' | 'duelos_aereos' | 'tiros' | 'regates_ultimo_tercio' | 'recuperaciones_ultimo_tercio' | ...
  half: PitchHalf
  points: PitchPoint[]
}

export interface WyscoutReportSetPiece {
  type: 'corner' | 'tiro_libre'
  side: 'izquierdo' | 'derecho'
  point: PitchPoint  // label = tomador
  outcome: 'gol' | 'tiro' | 'tiro_cabeza' | null
}
```

## 7. Grillas de zona con porcentaje — "Recuperaciones", "Pérdidas", "Faltas"

Estos tres gráficos (página "TRANSICIONES") son distintos de los mapas de puntos:
en vez de números de camiseta scatter, muestran una grilla fija 3 columnas × 3
filas con un porcentaje grande por celda (ej. `9.8% / 14% / 3.9%` arriba, etc.) más
un número de referencia chico debajo de cada porcentaje. Se distinguen de un mapa
de eventos por patrón: pocos tokens, todos terminados en `%`, dispuestos con
separación x/y regular — vs. un mapa de eventos que tiene muchos tokens numéricos
chicos e irregulares. Se ubica cada celda por su posición relativa dentro del
rectángulo del gráfico: `col = round(x_rel * 3)`, `row = round(y_rel * 3)` (0-2,
0-2), calibrado contra el fixture real.

```ts
export interface WyscoutZoneGrid {
  category: 'recuperaciones' | 'perdidas' | 'faltas'
  cells: { row: number; col: number; pct: number }[]  // 9 celdas
}
```

## 8. Orquestador y tipo final

```ts
// src/features/coaches/wyscoutReport/wyscoutReportTypes.ts
export interface WyscoutReportData {
  sourceFileName: string
  matchCountWindow: number   // partidos que cubre el informe (10)
  players: WyscoutReportPlayerSeason[]
  formations: WyscoutReportFormation[]
  matches: WyscoutReportMatch[]
  eventMaps: WyscoutEventMap[]
  zoneGrids: WyscoutZoneGrid[]
  setPieces: WyscoutReportSetPiece[]
}
```

Módulos, todos en `src/features/coaches/wyscoutReport/`:
`parseWyscoutReportPdf.ts` (orquestador, Sección 2), `parsePlayersSection.ts`
(Sección 3), `parseFormationsSection.ts` (Sección 4), `parseMatchesSection.ts`
(Sección 5), `parseEventMaps.ts` (Sección 6), `parseZoneGrids.ts` (Sección 7),
`wyscoutReportInsights.ts` (Sección 10), `wyscoutReportTypes.ts`. Fixture real en
`__fixtures__/temperley-informe-equipo.pdf`.

## 9. Esquema — 1 tabla + 1 bucket de Storage

```sql
CREATE TABLE IF NOT EXISTS public.coach_wyscout_reports (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_key      TEXT NOT NULL,
  match_window   INT NOT NULL,        -- 10
  data           JSONB NOT NULL,      -- WyscoutReportData completo
  warnings       JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file    TEXT,
  storage_path   TEXT,                -- PDF original, para auditar si algo no cierra
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cwr_coach ON public.coach_wyscout_reports(coach_key, created_at DESC);

ALTER TABLE public.coach_wyscout_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_cwr" ON public.coach_wyscout_reports FOR SELECT USING (true);
CREATE POLICY "write_cwr" ON public.coach_wyscout_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Sin tabla relacional por jugador/partido/evento — un solo JSONB por informe, mismo
criterio que `instances` en video-análisis: los conteos y gráficos se calculan en
el cliente sobre el JSON, sin agregados que mantener sincronizados. "El informe
vigente" = el de `created_at` más reciente para ese `coach_key`; los anteriores
quedan para historial/comparación futura, con botón de borrado (`window.confirm`,
mismo patrón que el resto de la app).

**Storage:** bucket nuevo `coach-wyscout-reports` (mismo modelo de acceso público
que `coach-video-analysis`), ruta `${coachKey}/${reportId}.pdf`.

```ts
// src/services/coachWyscoutReportService.ts
export async function listWyscoutReports(coachKey: string): Promise<WyscoutReportSummary[]>
export async function getLatestWyscoutReport(coachKey: string): Promise<WyscoutReportData | null>
export async function saveWyscoutReport(coachKey: string, report: WyscoutReportData, warnings: string[], file: File): Promise<{ success: boolean; error?: string }>
export async function deleteWyscoutReport(id: number): Promise<{ success: boolean; error?: string }>
```

## 10. UI

**Carga:** en `CoachSeasonStatsCard.tsx`, junto al botón existente
"Cargar Excel de Wyscout", un segundo botón "Cargar informe PDF de Wyscout" que
abre `CoachWyscoutReportUploadPanel.tsx` (mismo patrón que
`CoachWyscoutUploadPanel`: dropzone con `GpsDropzone`, `accept=".pdf"`, parsea
client-side, muestra una vista previa — "10 partidos · 21 jugadores · 3
formaciones detectadas" + lista de warnings si las hubo — y un botón Guardar).

**Panel de resultados:** `CoachWyscoutReportPanel.tsx`, debajo de los gráficos que
ya existen en la tarjeta de temporada, con estas subsecciones:

1. **Plantel** — tabla ordenable de `players` (minutos, goles, asistencias, tiros,
   pases, duelos, pérdidas/recuperadas — columnas iniciales; el resto de
   `metrics` queda disponible pero no todas se muestran por defecto, evitar una
   tabla de 40 columnas ilegible).
2. **Formaciones usadas** — una tarjeta por formación con % de uso, comparativa
   propio/rival (barras enfrentadas, Sección 11), y la cancha de posición media
   (`VideoAnalysisPitch` con `label`).
3. **Mapas** — un selector de categoría (duelos defensivos, aéreos, recuperaciones,
   pérdidas, faltas, regates, tiros) que alterna entre `VideoAnalysisPitch` (mapas
   de puntos) y una grilla de calor 3×3 (mapas de zona-%, Sección 7).
4. **Balón parado** — cancha con los puntos de córners/tiros libres, coloreados
   por resultado (gol/tiro/fuera).
5. **Conclusiones** — lista de insights (Sección 12).
6. **Uso de jugadores de inferiores por partido** — oculta hasta que exista la
   lista (Sección 13); cuando exista, gráfico de barras (Recharts, ya es
   dependencia) con 2 series por fecha: cantidad de jugadores de inferiores
   utilizados y minutos totales jugados por ellos.

## 11. Paleta y mapas de calor — validado, no a ojo

Siguiendo el método de la skill `dataviz` (color al final, nunca primero, y
siempre corrido por el validador, nunca a ojo):

- **Grillas de zona-% (Sección 7)** son magnitud (cuánto), no polaridad → escala
  **secuencial de un solo hue**. Se ancla en `brand-green` (#22C55E, ya el acento
  principal de la app) en vez de sumar un hue nuevo. Ramp validado con
  `contrast()` del script de la skill contra las superficies reales de la app
  (blanco / `apple-gray-900` #0E0E10):

  | Paso | Hex (claro) | Texto | Hex (oscuro) | Texto |
  |---|---|---|---|---|
  | 1 (mínimo) | `#EAFBF1` | oscuro (17.97:1) | `#0F2A1C` | claro (15.35:1) |
  | 2 | `#BEF2D3` | oscuro (15.46:1) | `#134A2C` | claro (10.28:1) |
  | 3 | `#7FE0A8` | oscuro (12.06:1) | `#1B7A43` | claro (5.37:1) |
  | 4 | `#3FBF77` | oscuro (8.20:1) | `#22C55E` | oscuro (8.46:1) |
  | 5 (máximo) | `#16803D` | **claro** (5.01:1) | `#79F2AB` | oscuro (13.87:1) |

  Regla de color de texto por celda: pasos 1-4 (claro) y 1-3 (oscuro) usan texto
  oscuro; el resto usa texto claro — es el único punto donde el contraste cae
  contra `>=4.5:1` si no se hace el flip, así que el flip es parte de la spec, no
  un detalle de implementación.
- **Comparativas propio/rival (formaciones, tabla de jugadores vs. promedio de
  liga)** reutilizan el par que la app ya usa para "domina/no domina"
  (`PossessionBar` en `CoachMatchHistoryTable`, `RESULT_STYLES`): `brand-green`
  para el lado favorable, `apple-gray-400` para el neutro — no se inventa un par
  divergente nuevo.
- **Mapas de puntos (Sección 6)**: un solo color por categoría activa
  (`brand-green` sobre la cancha verde oscuro existente ya usa amarillo para
  distinguirse — se mantiene `bg-yellow-400` tal cual está en `VideoAnalysisPitch`
  hoy, no se toca lo que ya funciona).

## 12. Conclusiones automáticas

`wyscoutReportInsights.ts`, función pura y testeada, sin IA ni modelos —reglas
explícitas y explicables sobre `WyscoutReportData`:

```ts
export function computeWyscoutInsights(report: WyscoutReportData): string[]
```

Reglas v1 (cada una solo agrega una línea si aplica, ninguna es obligatoria):
formación con mejor diferencial de puntos/xG vs. las demás; goleador y asistidor
del tramo; jugador con más pérdidas de balón cada 90'; jugador con más
recuperaciones cada 90'; lado (izquierda/derecha) con más volumen de centros o
regates si hay una asimetría clara (>15 puntos porcentuales entre lados);
cantidad de jugadores distintos utilizados como titulares en los N partidos
(dato "vendible" de rotación, relacionado con la Sección 13).

## 13. Jugadores de inferiores — mecanismo listo, lista pendiente

```ts
// src/features/coaches/wyscoutReport/homegrownPlayers.ts
export const HOMEGROWN_PLAYERS_BY_COACH: Record<string, string[]> = {
  // 'domingo': ['Nicolás Ávalos', 'Franco Silva', ...]  — pendiente, lo manda el usuario
}
```

Cuando `HOMEGROWN_PLAYERS_BY_COACH[coach.key]` tenga nombres, el panel matchea
esos nombres (normalizeForSearch, insensible a acentos/mayúsculas) contra
`match.lineup` de cada `WyscoutReportMatch` y usa `minutesPlayedInMatch` (Sección
5) para la serie de minutos — el mismo dato que ya vamos a tener del PDF, sin
pipeline nuevo. Hasta entonces la subsección 6 del panel (Sección 10) no se
renderiza.

## Fuera de alcance

Diferenciar el tipo de ícono dentro de un mismo mapa de eventos (Sección 6, ya
justificado ahí). Comparar 2 informes lado a lado. Exportar el panel a
PDF/imagen para la reunión con el club (si hace falta más adelante, se suma como
proyecto aparte — la plataforma ya tiene `jsPDF`/`html2canvas` para eso).
Editar manualmente un valor mal extraído desde la UI (si el parser falla en algo
puntual, se corrige el archivo o se pide un informe nuevo, no hay pantalla de
edición). Traducción a los 9 idiomas de estas subsecciones nuevas (se suma al
backlog de i18n en curso, no bloqueante). Generalizar `VideoAnalysisPitch` más
allá de la prop `half`/`label` que pide este proyecto.

## Testing

TDD contra el fixture real (`__fixtures__/temperley-informe-equipo.pdf`), un
`.test.ts` junto a cada parser (mismo patrón que `gps/parser/`):

- `parseWyscoutReportPdf.test.ts`: clasifica las 23 páginas del fixture en las
  secciones correctas; una página con encabezado irreconocible cae en
  `warnings`, no rompe el resto.
- `parsePlayersSection.test.ts`: contra el fixture, extrae los 21 jugadores de
  Temperley con sus minutos/goles/asistencias exactos (verificables a mano
  contra el PDF); fusión de celdas "N / M NN%" en un solo metric; fila de
  encabezado de grupo ("DEFENSORES") no se cuela como jugador.
- `parseFormationsSection.test.ts`: 3 formaciones con % que suman ~100% (con
  margen de redondeo) y las 7 métricas propio/rival cada una.
- `parseMatchesSection.test.ts`: 10 partidos con fecha/rival/marcador correctos;
  `minutesPlayedInMatch` contra 2-3 casos verificados a mano en el PDF
  (titular completo, entra en el entretiempo, entra y sale en el mismo partido).
- `parseEventMaps.test.ts` / `parseZoneGrids.test.ts`: cuenta de puntos
  extraídos por categoría contra un conteo manual de una muestra de páginas del
  fixture; la grilla 3×3 de "Recuperaciones" sobre el fixture da los mismos
  9 porcentajes que muestra el PDF.
- `wyscoutReportInsights.test.ts`: cada regla contra un `WyscoutReportData`
  armado a mano (fixture chico in-memory, no el PDF completo) que la dispara, y
  un caso donde no aplica ninguna (array vacío, no texto genérico).
