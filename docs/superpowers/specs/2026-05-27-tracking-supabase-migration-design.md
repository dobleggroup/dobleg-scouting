# Tracking Lists → Supabase Migration

Conectar las listas de seguimiento (Datos y Scouts GG) directamente con la base de datos de rendimiento Supabase, eliminando la dependencia del CSV de Google Sheets.

## Contexto

Hoy las listas de seguimiento se alimentan del CSV de Google Sheets (hoja "seguimiento") y la tabla `scout_players` vincula jugadores por nombre (`player_db_id` string). La base de datos de rendimiento (API-Football/Sofascore) tiene IDs numéricos en la tabla `players` con scores calculados en `player_season_scores`. Los dos sistemas no se hablan directamente.

## Decisiones

- **Enfoque A seleccionado:** campo `supabase_player_id` en `scout_players` (link directo)
- **Listas arrancan de cero**, excepto jugadores con estado "descartado" que se migran
- **4 estados unificados** para ambas listas: En seguimiento, Contactado, En negociación, Descartado (GG pasa de 9 a 4)
- **Sin prioridad** — se elimina el campo de prioridad de las listas
- **GPS del interno sigue desde Excel** — no se toca ese flujo

---

## 1. Modelo de datos

### 1.1 Nueva columna en `scout_players`

```sql
ALTER TABLE scout_players
  ADD COLUMN supabase_player_id INTEGER REFERENCES players(id);

CREATE INDEX idx_scout_players_supabase_id ON scout_players(supabase_player_id);
```

`supabase_player_id` es nullable — permite jugadores trackeados que no están en la DB de rendimiento (edge case manual).

### 1.2 Campos legacy

- `player_db_id` y `player_db_source` se mantienen en la tabla pero dejan de usarse como link primario
- El link autoritativo pasa a ser `supabase_player_id`

### 1.3 Simplificación de estados

Ambas listas (Datos y Scouts GG) usan los mismos 4 estados:

| Estado | Clave | Color |
|--------|-------|-------|
| En Seguimiento | `en_seguimiento` | Azul |
| Contactado | `contactado` | Ámbar |
| En Negociación | `en_negociacion` | Púrpura |
| Descartado | `descartado` | Gris |

Se eliminan: `en_seguimiento_gg`, `pre_seleccionado`, `reunion_pactada`, `oferta_enviada`, `contratado`, `no_disponible`.

Los registros existentes con estados eliminados se mapean:
- `en_seguimiento_gg` → `en_seguimiento`
- `pre_seleccionado` → `en_seguimiento`
- `reunion_pactada` → `contactado`
- `oferta_enviada` → `en_negociacion`
- `contratado` → `descartado` (caso cerrado)
- `no_disponible` → `descartado`

### 1.4 Eliminación de prioridad

Se elimina el campo `prioridad` del flujo de UI. La columna puede quedar en la tabla pero no se muestra ni se pide al agregar.

---

## 2. Flujo de agregar jugadores a seguimiento

### 2.1 Desde la ficha individual (PlayerDetailPage)

- Botón "Agregar a Seguimiento" visible para usuarios logueados
- Modal con:
  - Selector de lista: Datos / Scouts GG / Ambas
  - Comentario opcional (textarea)
- Se crea `scout_player` con:
  - `supabase_player_id` = `player.id` (automático)
  - `full_name` = `player.name`
  - `club` = `team.name`
  - `liga` = `league.name`
  - `posicion` = `primary_position`
  - `nacionalidad` = `nationality`
  - `edad` = calculada desde `birth_date`
  - `added_by_*` = usuario actual
  - Estado inicial: `en_seguimiento`
- Dedup: si el jugador ya existe en `scout_players` (match por `supabase_player_id`), solo se actualiza la membresía de lista

### 2.2 Desde la tabla del Externo (ExternalScoutingPage)

- Checkbox de selección en cada fila de la tabla
- Botón "Agregar seleccionados a seguimiento" (aparece cuando hay selección)
- Mismo modal que 2.1, aplica a todos los seleccionados
- Misma lógica de dedup por `supabase_player_id`

---

## 3. Páginas de seguimiento

### 3.1 Seguimiento Datos (MonitoringPage)

- **Fuente:** `scout_players WHERE in_datos_list = true` (Supabase directo, sin CSV)
- **Score GG:** JOIN con `player_season_scores` via `supabase_player_id` para traer `avg_score` y `percentile`
- **Estados:** Los 4 unificados, guardados en `scout_players_status` con `list_type = 'datos'`
- **Click en jugador:** navega a `/jugador/:supabase_player_id` (ficha individual con stats completas)
- **Info visible por fila:** nombre, club, liga, posición, edad, Score GG, estado, agregado por

### 3.2 Seguimiento Scouts GG (ScoutTrackingGGPage)

- **Fuente:** `scout_players WHERE in_scouts_gg_list = true`
- **Estados:** Simplificados de 9 a 4 (mismos que Datos)
- **Score GG:** Mismo mecanismo que Datos via `supabase_player_id`
- **Funcionalidades existentes que se mantienen:**
  - Archivos adjuntos por jugador
  - Evaluaciones (scout_evaluations)
  - Historial de estados
- **Se elimina:** campo de prioridad del UI

### 3.3 Ambas páginas

- Columna "Agregado por" visible
- Link directo a la ficha individual del jugador
- Filtros: por estado, por posición, búsqueda por nombre
- Contador de jugadores por estado

---

## 4. Migración de datos

### 4.1 Migrar descartados existentes

Script SQL/edge function que:
1. Busca en `scout_players` los que tienen status `descartado` en cualquier lista
2. Para cada uno, intenta matchear contra `players` por:
   - Nombre normalizado (lowercase, sin acentos) exacto
   - Si hay `club`, también matchea contra `teams.name`
3. Si encuentra match, setea `supabase_player_id`
4. Los que no matchean se mantienen sin link (visible en la UI pero sin score)

### 4.2 Limpiar listas

Después de migrar descartados:
- Los jugadores no-descartados se eliminan de las listas (reset `in_datos_list = false`, `in_scouts_gg_list = false`)
- O se borran directamente si no tienen evaluaciones ni archivos asociados

### 4.3 Mapeo de estados existentes

Los registros en `scout_players_status` con estados de GG (9) se remapean a los 4 nuevos:
```sql
UPDATE scout_players_status SET status = 'en_seguimiento' WHERE status IN ('en_seguimiento_gg', 'pre_seleccionado');
UPDATE scout_players_status SET status = 'contactado' WHERE status = 'reunion_pactada';
UPDATE scout_players_status SET status = 'en_negociacion' WHERE status = 'oferta_enviada';
UPDATE scout_players_status SET status = 'descartado' WHERE status IN ('contratado', 'no_disponible');
```

---

## 5. Limpieza de código

### 5.1 Eliminar del DataContext

- Dejar de cargar CSV `seguimiento` y `seguimientoMetricas`
- Eliminar las URLs correspondientes de `scoring.ts`
- Eliminar el tipo `MonitoringPlayer` si ya no se usa

### 5.2 Reemplazar useScoreLookup en tracking pages

- En MonitoringPage y ScoutTrackingGGPage, reemplazar `useScoreLookup` (match por nombre) por query directa a `player_season_scores` usando `supabase_player_id`
- `useScoreLookup` puede seguir existiendo si lo usa otra página, pero las de tracking ya no lo necesitan

### 5.3 Simplificar tipos

- Unificar `ManagementStatus`, `DatosTrackingStatus`, `ScoutsGGStatus` en un solo tipo `TrackingStatus = 'en_seguimiento' | 'contactado' | 'en_negociacion' | 'descartado'`
- Actualizar `STATUS_CONFIG` y `GG_STATUS_CONFIG` → un solo `TRACKING_STATUS_CONFIG`

### 5.4 Actualizar scoutPlayersService

- `addScoutPlayer` acepta `supabase_player_id` como campo
- Dedup primario pasa a ser por `supabase_player_id` (antes era por `player_db_id`)
- `linkScoutPlayerToDb` se adapta o se elimina (ya no se necesita vincular post-hoc si el link viene al agregar)

### 5.5 LinkPlayerModal

- Adaptar para buscar en la tabla `players` de Supabase en vez del DataContext
- Se usa para vincular manualmente un jugador existente sin `supabase_player_id` (ej: descartado migrado que no matcheó automáticamente)

---

## 6. Qué NO se toca

- Flujo GPS del interno (Excel → Google Sheets)
- AGENCY_PLAYERS constante (sigue para portfolio, contratos, etc.)
- ExternalScoutingPage (ya funciona con Supabase)
- PlayerDetailPage base (solo se le agrega el botón de seguimiento)
- Flujo de evaluaciones (scout_evaluations sigue igual)
