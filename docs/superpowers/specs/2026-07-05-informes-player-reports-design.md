# Informes — Armador de informes de jugador desde archivo

**Fecha:** 2026-07-05
**Rama:** `feat/doble-g-membership`
**Estado:** Diseño aprobado, pendiente de plan de implementación

## Objetivo

Nueva página **Informes** dentro de *Búsqueda de Talento*. Permite arrastrar/subir un
archivo de métricas (Wyscout/Excel `.xlsx`, `.csv` o `.xml`) y armar, mediante un wizard
de 4 pasos, un informe profesional de **un** jugador para venderlo: gráficos, semáforo
vs. el promedio de los jugadores del propio archivo, contenido editorial, video de YouTube
y export a PDF de alta calidad.

El objetivo de negocio: comparar a nuestros jugadores contra el promedio de jugadores en su
posición en otras ligas, para venderlos bien a jefes y clubes.

### Fuera de alcance (explícito)

- Todo el flujo "PRO / enviar por email" que aparece en los mockups de referencia
  (esos son de otra plataforma, FutbolScan). Los informes se guardan **para el usuario**.
- Persistencia en Supabase (v1 usa `localStorage`; el modelo queda listo por si se migra).
- Link de Google Sheet como fuente (solo archivos subidos).

## Contexto del código existente

La página `BusquedaPage.tsx` ("Análisis Completo", ruta `/analisis-completo`) ya resuelve
mucho de esto **pero contra la API de Supabase**: busca jugador, arma radar/barras/scatter
vs. promedio de un pool, rankings, conclusiones con semáforo verde/ámbar/rojo, y exporta
PDF (`@react-pdf/renderer` → `AnalisisCompletoPDF`) y tarjeta Canva (`html-to-image` + `jsPDF`).

**Informes reutiliza la lógica y los componentes de charts/semáforo/export, pero el pool de
comparación sale del archivo subido, no de la API.** Es un análisis autocontenido por archivo.

Piezas a reutilizar:
- `src/lib/search.ts` → `normalizeForSearch` (NFD, accent/case-insensitive) para matchear headers y nombres.
- `src/constants/apiMetrics.ts` → catálogo `API_METRICS` (`label`, `short`, `higherIsBetter`) como base del registry de métricas.
- Componentes de charts (Recharts) de `BusquedaPage` (radar, barras comparativas, scatter) — se extraen a componentes compartidos donde convenga.
- Patrón de export Canva (`html-to-image` + `jsPDF`) como base del motor de PDF.
- `getScoreColorClass` / `getScoreBgClass` de `src/components/ui/ScoreBar.tsx` para colores.

## Integración (routing y nav)

- **Ruta:** `/informes` en `src/App.tsx`, dentro de `<Route element={<Layout />}>`, lazy-loaded
  igual que las demás (`const InformesPage = lazy(() => import('@/pages/InformesPage'))`).
- **Nav:** agregar `{ to: '/informes', label: 'Informes', icon: 'clipboard' }` al grupo
  "Búsqueda de Talento" en `src/components/layout/Navbar.tsx` (junto a "Análisis Completo").

## Arquitectura

Módulos nuevos, cada uno con una responsabilidad clara y testeable en aislamiento:

```
src/pages/InformesPage.tsx            # orquesta el wizard + estado del informe
src/features/informes/
  types.ts                            # tipos del modelo de datos (Informe, ParsedFile, MetricStat, ...)
  parseFile.ts                        # archivo -> { headers, rows }  (xlsx | csv | xml)
  metricRegistry.ts                   # header -> métrica canónica (alias + NFD)
  derivedMetrics.ts                   # motor de reglas "si existen X e Y -> creo Z"
  computeStats.ts                     # percentil/color/ranking del protagonista vs pool
  informesStore.ts                    # persistencia localStorage (save/list/load/delete + autosave)
  components/
    Step1Archivo.tsx                  # dropzone + selección de jugador + contexto + foto
    Step2Metricas.tsx                 # lista de métricas con semáforo + asignación a gráficos
    Step3Contenido.tsx                # edición de contenido editorial
    Step4Preview.tsx                  # preview con tabs + acciones
    charts/ (Radar, Barras, Scatter, NumberCard)   # compartidos con BusquedaPage donde aplique
  exportInformePDF.ts                 # captura por sección + paginado jsPDF
```

### Flujo de datos

1. **Subir archivo** → `parseFile` normaliza a `{ headers: string[], rows: Row[] }`
   (`Row = Record<string, string | number>`).
2. **Detectar jugadores**: columna de nombre por matching difuso de header
   (`Jugador`/`Player`/`Nombre`). Cada fila = un jugador candidato.
3. **Elegir protagonista** (o buscarlo en la DB de Supabase como alternativa). Las demás
   filas del archivo = **pool** de comparación.
4. **Mapear métricas**: `metricRegistry` matchea cada header numérico a una métrica canónica
   (`key`, `label`, `short`, `unit`, `higherIsBetter`, `format`). Los headers sin match quedan
   como métrica cruda (higherIsBetter=true por defecto, editable).
5. **Derivar métricas**: `derivedMetrics` agrega las inteligentes cuando estén los inputs.
6. **Calcular stats**: `computeStats` calcula, por métrica, percentil del protagonista vs pool,
   color de semáforo y ranking `N° de N`.
7. **Asignar a gráficos** (paso 2) y **editar contenido** (paso 3).
8. **Preview** (paso 4) y **guardar / exportar PDF**.

## Wizard de 4 pasos

Replica los mockups de referencia (tabs superiores: 1. Excel · 2. Métricas · 3. Contenido · 4. Preview).

### Paso 1 — Archivo
- Dropzone `.xlsx / .csv / .xml` (drag & drop + click). Muestra estado de parseo/errores.
- Panel derecho: jugador seleccionado (nombre · club · posición · edad). Buscador para elegir
  otra fila del archivo, o **buscar jugador en la base de datos** (reutiliza `usePlayersList`).
- Campo *contexto de comparación* (texto libre, ej. "Laterales izquierdos - Liga de Uruguay").
- Uploader de foto (drag o "Cambiar foto"); se guarda como data URL.

### Paso 2 — Métricas
- Lista de todas las métricas detectadas + derivadas, cada una con:
  - Punto de semáforo 🟢 (sobre prom) / 🟡 (similar) / 🔴 (debajo) y valor del protagonista.
  - Buscador de métricas.
- Asignación a: **Radar** (recomendado 5–9), **Barras comparativas**, **Scatter plots**
  (cada uno con eje X, eje Y y texto descriptivo), y **cards "solo número + ranking"**.

### Paso 3 — Contenido
- Datos del jugador: nombre, club, posición, rol, edad, nacionalidad, liga, contrato,
  valor de mercado. (Autocompletados desde el archivo/DB cuando se pueda; editables.)
- Estadísticas principales (rating, PJ, minutos, goles, asistencias) con toggle "ocultar".
- **Lectura táctica**: autor + textarea con markdown liviano (`**negrita**`, `[texto](url)`).
- Links: video (URL de YouTube o archivo), Transfermarkt, representante.
- **Últimos 5 partidos**: rival, resultado, rating, minutos.
- **Comparables** (jugador, club, rating, delta) con toggle "ocultar".
- Comparaciones (sección libre).

### Paso 4 — Preview
- Columna izquierda: ficha del jugador (foto, club, liga, edad, país, contrato, representante,
  botón Transfermarkt).
- Tabs: **Radar · Barras · Scatter · Video · Opinión · Carrera · Comparaciones**, renderizados
  tal como quedarán.
- Acciones: **Editar** (volver), **Guardar** (localStorage), **Exportar PDF**.

## Métricas inteligentes (motor de reglas)

`derivedMetrics.ts` expone un catálogo de reglas. Cada regla:

```ts
interface DerivedRule {
  key: string
  label: string
  short: string
  higherIsBetter: boolean
  diverging?: boolean            // true = puede ser +/- (ej. Goles - xG)
  requires: string[]             // keys canónicas que deben existir
  compute: (m: Record<string, number>) => number
}
```

Set inicial (extensible):
- **Gambetas completadas/90** = `dribbles_p90 * dribbles_pct / 100`
- **Goles − xG** = `goals - xg` (diverging; **+** verde sobre-rendimiento, **−** rojo)
- **Asistencias − xA** = `assists - xa` (diverging)
- **Remates al arco/90** = `shots_p90 * shots_on_pct / 100` (si viene total + %)
- **Duelos ganados/90** = `duels_p90 * duels_won_pct / 100` (si viene total + %)

Regla: se aplican solo si TODAS las `requires` matchearon en el archivo. El matching de headers
es accent/case-insensitive vía `normalizeForSearch`, con lista de alias por métrica.

## Semáforo (computeStats)

Por cada métrica del protagonista vs el pool del archivo:
- Se calcula el **percentil** (respeta `higherIsBetter`; en divergentes, el signo define el color).
- Color: 🟢 percentil ≥ 66 (sobre promedio) · 🟡 33–66 (similar) · 🔴 < 33 (debajo).
- **Ranking**: posición `N°` del protagonista entre `N` jugadores del pool.
- Se muestra aviso de "muestra pequeña" si el pool tiene < 5 jugadores (como en `BusquedaPage`).

## PDF (máxima fidelidad + cortes perfectos)

`exportInformePDF.ts`:
- Captura **cada sección del preview por separado** (radar, cada grupo de barras, cada scatter,
  opinión, carrera, comparaciones) con `html-to-image` a alta resolución (`pixelRatio` 2–3).
- Pagina con `jsPDF` (A4) colocando secciones enteras: **nunca parte un bloque** a la mitad;
  si una sección no entra en la página, salta a la siguiente.
- Header con **logo de la agencia** (`/brand/logo-*.png`, como el export Canva actual).
- Respeta el tema **claro/oscuro** activo (fondo y estilos vía el `onclone`/tema, como `CopyBtn`).
- Nombre de archivo: `Informe_<Jugador>.pdf`.

## Persistencia (informesStore)

`localStorage`, clave por informe:
- `saveInforme(informe)`, `listInformes()`, `loadInforme(id)`, `deleteInforme(id)`.
- Autosave del borrador en curso (para no perder trabajo al recargar).
- El modelo `Informe` es JSON serializable (incluye datos parseados, asignaciones de gráficos,
  contenido editorial y foto como data URL), pensado para poder migrar a Supabase sin rediseño.

## Testing

Unit tests con **vitest** (ya instalado):
- `parseFile`: xlsx, csv y xml → mismo `{ headers, rows }` normalizado; manejo de errores.
- `metricRegistry`: alias/acentos → métrica canónica correcta; headers desconocidos → métrica cruda.
- `derivedMetrics`: cada regla produce el valor esperado y solo cuando están los inputs.
- `computeStats`: percentil, color y ranking correctos (incluye divergentes y "menos es mejor").

Wizard, preview y PDF se verifican manualmente (`npm run dev` + generar un PDF de prueba).

## Dependencias nuevas

- `xlsx` (SheetJS) para `.xlsx`, con import dinámico (no cargar en el bundle inicial).
- `.csv` con **PapaParse** (ya instalado) y `.xml` con `DOMParser` del navegador (sin dependencia).

## Riesgos / decisiones abiertas

- Variabilidad de headers de Wyscout: se mitiga con el registry de alias + fallback a métrica cruda.
- Fidelidad del PDF en dark mode: verificar que `html-to-image` capture bien el tema (el export
  Canva ya lo hace; reutilizar ese patrón).
- Tamaño de `localStorage` si se suben muchas fotos: guardar foto comprimida/redimensionada.
