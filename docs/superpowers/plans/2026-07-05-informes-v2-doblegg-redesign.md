# Informes v2 — Rediseño Doble G + comparación + compartir interactivo

**Fecha:** 2026-07-05 (segunda iteración, feedback del usuario tras probar v1)
**Rama:** `feat/doble-g-membership`
**Base:** a2348ff (fin de Informes v1)

## Feedback que motiva esta iteración

El usuario probó v1 y pidió: (1) sacar el rojo de FutbolScan → estilo **Doble G** (verde, oscuro premium, con difuminado verde de fondo, con diseño); (2) el **radar no dibuja** ni en pantalla ni en PDF, y el **logo del PDF sale deforme**; (3) **comparación** = elegir hasta 2 jugadores más del archivo para superponer en el radar con las métricas elegidas; (4) en **scatter** poder fijar un mínimo por eje para recortar; (5) **barras** tienen demasiados colores; (6) sacar la pestaña **Opinión**; (7) poder **compartir el informe interactivo** (no solo PDF): un archivo HTML autocontenido con las pestañas funcionando.

## Decisiones

- **Compartir** = archivo `.html` autocontenido (elegido por el usuario): un solo archivo, tabs funcionando (JS inline), gráficos SVG nítidos, fuentes del sistema (offline), logo embebido en base64. Se descarga y se manda.
- **Gráficos = SVG propio** (no Recharts): funciones puras que devuelven markup SVG, reusadas por (a) los componentes React en pantalla, (b) el PDF, (c) el HTML compartible. Esto arregla el bug del radar (Recharts animaba y no capturaba) y unifica el estilo.
- **PDF**: se mantiene, pero usando los SVG (captura confiable) y con el logo a proporción real.
- Semáforo verde/amarillo/rojo se mantiene pero **sutil** (puntitos), no pintando barras enteras.

## Design tokens Doble G (usar en TODO el surface de Informes)

```
--dg-bg: #08090B            /* fondo casi negro */
--dg-surface: #0F1114       /* cards */
--dg-surface-2: #14171B     /* cards internas */
--dg-border: rgba(255,255,255,0.08)
--dg-green: #22C55E         /* acento principal */
--dg-green-bright: #4ADE80
--dg-green-dim: rgba(34,197,94,0.14)
--dg-text: #F5F7FA
--dg-muted: #8A9099
/* glow de fondo */ radial-gradient(1200px 600px at 15% -10%, rgba(34,197,94,0.16), transparent 60%)
```

- Colores de comparación (radar, hasta 3 jugadores): jugador = `#22C55E`; comparado 1 = `#F5C451` (dorado); comparado 2 = `#38BDF8` (celeste).
- Semáforo (puntitos 8px): verde `#22C55E`, ámbar `#FBBF24`, rojo `#F87171`, neutral `#8A9099`.
- Números/stats con `font-variant-numeric: tabular-nums` y stack mono para dar peso premium; headings sans fuerte con tracking. Sin webfonts externas (el HTML debe andar offline).

## Cambios de tipos (`src/features/informes/types.ts`)

- `ScatterAssignment` gana `xMin?: number; yMin?: number` (recorte por eje).
- `Informe` gana `comparePlayerIndices: number[]` (0–2 índices de fila del archivo para el radar). Default `[]`. `EMPTY`/`buildInforme` lo inicializan.

## Tareas

### Task 1 — Librería de gráficos SVG (fundacional)
`src/features/informes/chartSvg.ts`: funciones puras que devuelven strings SVG. Tests en `chartSvg.test.ts` (geometría: puntos calculados, dominios, recorte por min).
- `radarSvg({ axes: {label:string}[], series: {name:string; color:string; values:number[]}[], size })` — polígono por serie (0–100), grid poligonal, labels completos alrededor, sin animación. Soporta 1–3 series.
- `barsSvg({ rows: {label:string; pct:number; value:string; rank:string; dot:'green'|'amber'|'red'|'neutral'}[] })` — barra por métrica: verde jugador, marca de promedio (50) punteada, valor + ranking a la derecha, puntito de semáforo. Un solo color de barra (verde), sin arcoíris.
- `scatterSvg({ points: {x:number;y:number;me:boolean}[], xLabel, yLabel, xMin?, yMin? })` — pool + protagonista resaltado, líneas de promedio, ejes con dominio recortado por `xMin`/`yMin` cuando estén.
Todas: theme-aware por parámetro (dark/light) o CSS vars; ids únicos para gradientes.

### Task 2 — Componentes React que envuelven el SVG + data helpers
`src/features/informes/chartData.ts`: helpers que transforman `stats`/`matrix`/`informe` en los datos de cada `*Svg`. Incluye armado de series del radar (protagonista + `comparePlayerIndices`), usando percentil por eje para cada jugador (percentil de cada jugador vs pool, por métrica).
Reemplazar `InformeRadar/InformeBars/InformeScatter` para renderizar via `dangerouslySetInnerHTML` del SVG (o React SVG). Sin Recharts. Borrar dependencia de Recharts en estos 3 (queda usada en BusquedaPage, no tocar eso).

### Task 3 — Step 2: selección de comparación + mínimos de scatter
`Step2Metricas.tsx`: en la sección Radar, agregar selector "Comparar con (hasta 2)" que elige jugadores del archivo (por nombre) → `informe.comparePlayerIndices`. En cada scatter, inputs numéricos opcionales "X mín" / "Y mín" → `xMin`/`yMin`. Pasar `rows`/nombres para el selector (nueva prop). Mantener asignación de métricas.

### Task 4 — Step 4 Preview rediseñado Doble G
`Step4Preview.tsx`: aplicar el theme Doble G (fondo con glow verde, cards oscuras, acento verde, cero `brand-red`), tabs verdes. **Quitar la pestaña Opinión y `renderOpinion`.** Radar/Barras/Scatter usan los nuevos componentes SVG. Botón "Exportar PDF" + nuevo botón **"Compartir (HTML)"**. Mantener el contenedor oculto para PDF con los SVG. Ficha izquierda con estilo Doble G. Header con logo Doble G.

### Task 5 — Export HTML interactivo autocontenido
`src/features/informes/exportInformeHTML.ts`: `exportInformeHTML(informe, chartsData): void` arma un string HTML completo (`<!doctype html>` … CSS inline con tokens Doble G + glow, contenido del informe, tabs con `<script>` inline que togglea secciones, gráficos SVG embebidos, video YouTube como iframe, logo base64) y lo descarga como `Informe_<nombre>.html`. Sin dependencias externas, offline salvo el video.

### Task 6 — PDF: logo a proporción + SVG + theme Doble G
`exportInformePDF.ts`: leer dimensiones reales del logo y dibujarlo respetando aspect ratio (no `80×24` fijo); fondo/tema Doble G; capturar las secciones (ahora con SVG, sin animación) confiablemente. Quitar `brand-red`.

### Task 7 — Step 3: sacar Opinión + wiring
`Step3Contenido.tsx`: quitar el bloque "Lectura táctica" (autor + textarea de análisis). `InformesPage.tsx`: cablear `comparePlayerIndices` y `xMin/yMin` en el estado y el guardado; botón Compartir → `exportInformeHTML`. Verificar `npm test` + build.

## Verificación

Cada task: `npx tsc --noEmit` + `npm run build`. Tasks 1–2 con tests unitarios (geometría SVG, data helpers). Al final: correr `npm run dev` y que el usuario valide radar (dibuja + comparación), scatter (mín), barras (limpias), estilo Doble G, PDF (logo ok), y el HTML compartible (tabs funcionando).
