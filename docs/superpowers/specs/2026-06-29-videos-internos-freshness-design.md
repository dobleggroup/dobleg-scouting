# Videos de jugadores internos + indicador de frescura

**Fecha:** 2026-06-29
**Relacionado:** [Rediseño del layout de la ficha individual](./2026-06-29-ficha-individual-layout-redesign-design.md)
**Estado:** Aprobado, listo para plan de implementación

## Problema / objetivo

Empezar a cargar videos de YouTube de los jugadores **internos** (de la agencia) dentro de su ficha, y poder saber de un vistazo **de quién hay que actualizar el video**. Para eso:

- Una **pestaña "Videos"** nueva, **solo para jugadores internos**.
- Un **indicador de frescura** por jugador: 🟢 actualizado, 🟡 necesita atención, 🔴 desactualizado, ⚪ sin video.
- Un **filtro de frescura** en la lista de internos para encontrar rápido a quién actualizar.

## Contexto del codebase

- Los jugadores internos vienen de **Google Sheets (CSV), read-only** (`src/constants/scoring.ts` `interno`, parseados en `DataContext.tsx` → `EnrichedPlayer`). No se pueden escribir.
- La app **ya escribe en Supabase** para otras features con un patrón establecido: `src/services/agencyPlayersService.ts`, `scoutPlayersService.ts` (este último ya tiene un campo `video_url`), `scoutEvaluationService.ts`. Migraciones en `src/supabase/migrations/`.
- Identificación de jugador: se usa `player_key` (igual que `agency_players`).
- Utilidades de fecha existentes a reutilizar: `monthsBetween()` y el patrón de `contractStatus` en `src/utils/scoring.ts` / `DataContext.tsx`.
- Lista de internos: `src/pages/InternalScoutingPage.tsx` (`applyFilters()`), filtros en `src/components/filters/FilterSidebar.tsx` (estado en `FilterState`, persistido en sessionStorage), tabla en `src/components/players/PlayerTable.tsx`.

## Diseño

### 1. Almacenamiento — tabla Supabase `player_videos`

Una fila por video; varios videos por jugador.

```sql
CREATE TABLE player_videos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_key   TEXT NOT NULL,        -- mismo esquema que agency_players
  youtube_url  TEXT NOT NULL,
  video_id     TEXT,                 -- id de YouTube parseado (para thumbnail/embed)
  title        TEXT,                 -- opcional
  upload_date  TIMESTAMPTZ DEFAULT now(),  -- automática al cargar
  material_date DATE,               -- opcional: fecha del último partido/material del video
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_player_videos_player_key ON player_videos(player_key);
```

Servicio nuevo `src/services/playerVideosService.ts`, calcado de `agencyPlayersService.ts`:
- `fetchPlayerVideos()` → carga todos (para mapear por `player_key` en la lista).
- `getVideosForPlayer(playerKey)`.
- `addPlayerVideo(...)`, `updatePlayerVideo(...)`, `deletePlayerVideo(id)`.
- Parseo de URL de YouTube → `video_id` (soportar formatos `watch?v=`, `youtu.be/`, `shorts/`, `embed/`).

### 2. Cálculo de frescura

```
fechaEfectiva(video) = material_date ?? upload_date
monthsOld = monthsBetween(fechaEfectiva, hoy)
freshness(video) = monthsOld < 4 ? 'green' : monthsOld <= 7 ? 'amber' : 'red'
```

Frescura **a nivel jugador** (para badge y filtro de la lista) = la del **video más reciente** (mayor `fechaEfectiva`). Si el jugador **no tiene videos** → `'none'` (⚪ "Sin video").

Umbrales: 🟢 < 4 meses · 🟡 4–7 meses · 🔴 > 7 meses · ⚪ sin video.

### 3. Pestaña "Videos" (solo internos)

- Nueva entrada en `tabsConfig` de `PlayerDetailPage.tsx` con `internal: true` (aparece dentro del rail del layout rediseñado; los jugadores normales no la ven).
- **Galería** de tarjetas de video: thumbnail de YouTube (`img.youtube.com/vi/<id>/hqdefault.jpg`), título, fecha del material + fecha de carga, y badge de frescura. Clic → reproduce embebido (iframe).
- Botón **"Agregar video"** → modal (patrón de `AddPlayerModal`/`DobleGWidget`):
  - Input de URL de YouTube (al pegar, extrae `video_id` y muestra preview del thumbnail).
  - Campo opcional **fecha del material**.
  - Campo opcional **título**.
  - Guarda en Supabase vía `playerVideosService.addPlayerVideo`.
- Editar / borrar cada video.
- Estado de carga/errores siguiendo el patrón de los widgets existentes.

### 4. Lista de internos

- **Badge de frescura** en `PlayerTable.tsx`: pill/punto de color (🟢🟡🔴⚪) por jugador, calculado desde el mapa de videos por `player_key`.
- **Filtro nuevo** en `FilterSidebar.tsx`: sección "Frescura de video" con checkboxes **Verde / Amarillo / Rojo / Sin video**.
  - Agregar `videoFreshness: VideoFreshness[]` a `FilterState`.
  - Integrar en `applyFilters()` de `InternalScoutingPage.tsx`.
  - Persistir en sessionStorage como el resto de filtros.
- **Solo aplica al scouting interno** (los videos son solo de internos).

### 5. Carga de datos

- `DataContext.tsx` (o un hook dedicado) carga `fetchPlayerVideos()` una vez y expone un mapa `playerKey → videos[]` (y/o `playerKey → freshness`) para que la lista calcule badges/filtros sin pedir por jugador.
- La pestaña Videos puede usar ese mapa o pedir `getVideosForPlayer` al abrirse.

## Alcance técnico / archivos

- **Nuevos:** `src/supabase/migrations/<fecha>_player_videos.sql`, `src/services/playerVideosService.ts`, componente de la pestaña Videos (p. ej. `src/components/videos/VideosTab.tsx`), modal de alta (`AddVideoModal.tsx`).
- **Modificados:** `src/pages/PlayerDetailPage.tsx` (tab nueva + render), `src/types/index.ts` (`PlayerVideo`, `VideoFreshness`), `src/context/DataContext.tsx` (carga del mapa), `src/pages/InternalScoutingPage.tsx` (`applyFilters`), `src/components/filters/FilterSidebar.tsx` (sección filtro), `src/components/players/PlayerTable.tsx` (badge).

## Riesgos / precauciones

- **Depende del rediseño de layout**: la pestaña Videos vive en el rail nuevo. Implementar después (o junto con) el rediseño.
- **Migración Supabase**: crear la tabla y políticas RLS consistentes con las tablas existentes (`agency_players`, `scout_players`).
- **Solo internos**: asegurar que la tab y el filtro no aparezcan en externo/seguimiento.
- **Parseo de URL de YouTube**: cubrir los formatos comunes; manejar URLs inválidas con mensaje claro.

## Criterios de éxito

- Los internos tienen una pestaña "Videos" donde se cargan/ven/editan links de YouTube.
- Cada jugador muestra un estado de frescura correcto (🟢🟡🔴⚪) según el video más reciente.
- La lista de internos permite filtrar por frescura y muestra el badge.
- Los videos persisten en Supabase y se pueden agregar/editar/borrar desde la app.
- Sin errores de TypeScript ni de build (`npm run build`).
