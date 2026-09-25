# Resumen Temperley 2026 (pestaña Resumen de Nicolás Domingo)

Fecha: 2026-09-25 · Pedido por el usuario (agencia) · Se prueba en local antes de publicar.

## Objetivo

Convertir la pestaña **Resumen** del entrenador `domingo` en un tablero "Temperley 2026":
widgets del equipo (datos que ya tiene la plataforma) + widgets de jugadores alimentados por
el archivo de jugadores de Wyscout que se carga en la misma página, y un **PDF profesional**
donde se elige qué widgets entran.

Criterios: simple, prolijo, ordenado, fácil para usuarios mayores no técnicos, estilo de los
widgets de Inicio, claro y oscuro, celular. Copy rioplatense y en frases llanas.

## Qué dijo el usuario / qué asumimos

- Dijo: goleadores, asistidores, duelos y todas las estadísticas; estadísticas derivadas (p. ej.
  duelos atacantes ganados/90); actualizar arrastrando el archivo de Wyscout; tabla de posiciones,
  fixture, últimos partidos; PDF con todo, eligiendo qué sí y qué no; "no mezcles regates y
  centros"; filtrar por minutos jugados; todo ordenado.
- Asumimos: el archivo se guarda en Supabase (lo ven todos), el último subido es el vigente y los
  anteriores quedan de historial. Lo existente en Resumen se mantiene como widgets.

## Archivo de Wyscout

- Formato: export "Search results" de Wyscout (.xlsx), una hoja, una fila por jugador, 64 columnas
  en castellano (Jugador, Equipo, Posición específica, Edad, Partidos jugados, Minutos jugados,
  Goles, xG, Asistencias, xA, Duelos/90, Duelos ganados %, … Pases progresivos/90, Precisión pases
  progresivos %). Ejemplo: `Search results - 2026-09-25T103218.119.xlsx` (29 jugadores).
- Parseo en el navegador con `xlsx` (ya instalado). Mapeo por **nombre de columna** (no por
  posición) a claves estables (`goals`, `xg`, `duels_p90`, …). Columnas obligatorias: Jugador,
  Equipo, Minutos jugados, Partidos jugados, Goles, Asistencias. Las demás opcionales: si faltan, el
  widget que las usa no se muestra.
- Validación antes de guardar: equipo mayoritario debe coincidir con el club del DT (Temperley);
  si no, error claro y no se guarda. Vista previa "29 jugadores de Temperley · 64 datos" + confirmar.
- Guardado: tabla nueva `coach_wyscout_squad_stats` (id, coach_key, players jsonb, columns jsonb,
  source_file, uploaded_at, uploaded_by). Se lee la última por coach_key. RLS igual que
  `coach_wyscout_reports`.

## Estadísticas derivadas (puras, testeadas)

- Ganados/90 = (acciones/90) × (% ganado / 100): duelos, duelos atacantes, defensivos, aéreos,
  regates exitosos/90, centros precisos/90, pases progresivos precisos/90.
- Participación en gol/90 = goles/90 + asistencias/90.
- Goles − xG y Asistencias − xA (definición / aprovechamiento).
- % de minutos posibles = minutos / (partidos del equipo en la temporada × 90).

## Filtro

- Control único arriba de los widgets de jugadores: **"Mínimo de minutos jugados"** (deslizador,
  por defecto 450, de 0 al máximo del plantel). Aplica a todos los rankings /90 y porcentajes; los
  totales (goles, asistencias) muestran a todos. Se ve cuántos jugadores entran ("21 de 29").

## Widgets

A. Equipo: 1 Próximo partido (+ ver rival) · 2 Números de la temporada · 3 Tabla de posiciones
(Temperley resaltado) · 4 Últimos 5 partidos y racha · 5 Próximos partidos.

B. Jugadores (Wyscout): 6 Goleadores (goles, /90, G−xG) · 7 Asistidores (asist., xA, jugadas
clave/90) · 8 Participación en gol/90 · 9 Duelos ganados/90 (total, atacantes, defensivos, aéreos)
· 10 Recuperación (acciones defensivas/90, intercepciones/90) · 11 Creación (pases progresivos,
último tercio, precisión) · 12 Regates (intentados/90, % y exitosos/90) · 13 Centros (/90,
precisión, centros precisos/90) · 14 Uso del plantel (minutos, % de minutos posibles) · 15 Perfil
del plantel (edad promedio, altura, pie, doble pasaporte) · 16 Tabla completa ordenable.

C. Existentes: Surgidos del club, eficiencia del DT, gráficos vs rival, evolución por partido,
historial (sin cambios de lógica).

Cada ranking: top 5 con barra horizontal y valor, "ver todos" despliega el resto.

## PDF

- Botón "Exportar PDF" → panel con casillas por widget (todas marcadas). Genera jsPDF vectorial
  (mismo enfoque que `exportHomegrownPdf.ts`): tapa (escudo, "Temperley 2026 · Nicolás Domingo",
  fecha, fecha de los datos de Wyscout y filtro de minutos usado), un bloque por widget, sin cortar
  tablas entre páginas (salto antes del bloque), pie con página y fuente.
- Widgets de sección C: se exportan los que ya tienen PDF/tabla simple; los gráficos se dibujan
  vectoriales a partir de los mismos datos.

## Estructura de código

- `src/features/coaches/wyscoutSquad/`: `parseWyscoutSquadXlsx.ts` (+test con el archivo de
  ejemplo como fixture), `squadMetrics.ts` (derivadas, filtros, rankings; +test),
  `exportTeamSummaryPdf.ts`.
- `src/services/wyscoutSquadService.ts` (leer último / guardar).
- `src/features/coaches/components/summary/` un componente por widget + `SummaryToolbar`,
  `WyscoutSquadDropzone`, `PdfExportPanel`. `CoachSummaryTab` pasa a orquestarlos.
- Migración Supabase para la tabla nueva.

## Errores

- Archivo inválido / de otro equipo / sin columnas obligatorias → mensaje claro, nada se guarda.
- Sin archivo cargado → los widgets de jugadores muestran el recuadro para cargarlo.
- Falla de API (tabla, fixture) → ese widget muestra "No se pudo cargar" sin romper el resto.

## Pruebas

Tests de parseo (archivo real), métricas derivadas y filtro; `npm run build`; revisión en local
claro/oscuro/celular y PDF generado revisado página por página antes de mostrarlo.
