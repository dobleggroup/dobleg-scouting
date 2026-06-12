# Diseño — Pertenencia dinámica a Doble G (botón "Nueva incorporación / Eliminar")

**Fecha:** 2026-06-12
**Estado:** Aprobado el enfoque, pendiente de revisión final de la spec.

## Problema

La agencia incorporó un jugador nuevo (Santiago Cartagena, Deportivo Maldonado, Uruguay
— actualmente cargado como jugador **externo**, `apiId 21015257`). Como ya no se usan las
Google Sheets, no hay forma de declarar "este jugador es de Doble G" desde la app.

Hoy el plantel de Doble G es la constante hardcodeada `AGENCY_PLAYERS` (41 jugadores) en
`src/constants/agencyPlayers.ts`. Esa lista alimenta **9 consumidores** de toda la app:

| # | Archivo | Uso |
|---|---------|-----|
| 1-3 | `services/footballApiService.ts` | `getUniqueTeamIds()`, `getPlayersByTeamId()`, filtro para transfers |
| 4 | `services/playerStatsService.ts` | alias de nombres para el score lookup |
| 5 | `hooks/usePlayerApiData.ts` | resolver apiTeamId del jugador para buscar su id API-Football |
| 6 | `components/players/PlayerTable.tsx` | razón "sin score / reserva" |
| 7 | `pages/CalendarPage.tsx` | buscador de jugadores + fixtures |
| 8-9 | `pages/HomePage.tsx` | activos/inactivos de la semana + contratos por vencer |
| — | `pages/DashboardPage.tsx` | usa `internal` (no la constante directamente) |

Todos son **read-only** sobre la constante. Por lo tanto, si la lista se vuelve dinámica en
un único lugar, **todas las pantallas reflejan altas/bajas automáticamente**.

## Objetivo

Un botón en la ficha individual de jugador (externo **e** interno), del mismo tamaño y estilo
que "Agregar a seguimiento", con el logo PNG de Doble G (fondo transparente):

- Si el jugador **no** es de Doble G → **"Nueva incorporación de Doble G"** (agregar).
- Si **ya** es de Doble G → un **sello/badge** con el logo + **"Eliminar de Doble G"**.

Al marcar a un jugador como Doble G, debe integrarse "en todo sentido": aparece en el
Dashboard/inicio, en el Calendario (sus próximos partidos), en el scoring, y en Interno.

## Decisiones tomadas (del usuario)

1. **Modelo híbrido** de fuente de verdad (no migrar los 41 a Supabase).
2. Los **41 actuales** muestran sello + "Eliminar" automáticamente (match por apiId/nombre).
3. **Persistencia en Supabase** (tabla nueva).
4. **apiTeamId / próximos partidos:** intentar resolver desde la API lo más posible. Si la API
   no trae sus partidos, mostrar una **alerta en el perfil** con un formulario fácil para
   cargar a mano los próximos partidos.
5. **Alcance:** completo, en una sola entrega.

## Arquitectura

### 1. Fuente de verdad híbrida

- `BASE_AGENCY_PLAYERS` = los 41 actuales (renombrar `AGENCY_PLAYERS`; quedan hardcodeados
  como base y fallback resiliente si Supabase falla).
- Tabla Supabase **`agency_players`** = altas y bajas hechas desde la app.
- Servicio nuevo **`src/services/agencyPlayersService.ts`**:
  - `loadAgencyPlayers()` — fetch de la tabla, guarda en un cache de módulo, devuelve la lista
    **fusionada**: `BASE − bajas + altas`.
  - `getAgencyPlayers()` — devuelve el cache (síncrono) para los consumidores no-React.
  - `isAgencyPlayer(player)` — match por `api_player_id` o nombre normalizado (NFD).
  - `addAgencyPlayer(input)` / `removeAgencyPlayer(key)` — mutan Supabase + refrescan cache.
- Las 5 funciones helper (`getUniqueTeamIds`, `getPlayersByTeamId`, `getTotalPortfolioValue`,
  `getExpiringContracts`, `formatPortfolioValue`) pasan a leer de `getAgencyPlayers()` en vez
  de la constante. **La firma no cambia**, así que los 9 consumidores no tocan su lógica.
- `loadAgencyPlayers()` se llama al iniciar (dentro del flujo de `DataContext`), antes de que
  los servicios necesiten la lista. El cache de módulo garantiza lectura síncrona luego.
- `DataContext` expone `agencyPlayers` + `refreshAgencyPlayers()` para que la UI React
  re-renderice al agregar/quitar.

#### Esquema `agency_players`

```sql
CREATE TABLE IF NOT EXISTS agency_players (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('add', 'remove')),
  -- identidad
  player_key    TEXT NOT NULL,            -- nombre normalizado (NFD, lower) — clave de match
  full_name     TEXT NOT NULL,
  short_name    TEXT,
  api_player_id INTEGER,                  -- id API-Football del jugador (si se conoce)
  supabase_player_id INTEGER REFERENCES players(id),
  -- datos de portfolio (para 'add')
  image         TEXT,
  contract_end  TEXT,                     -- DD/MM/YYYY (igual que la constante)
  market_value  TEXT,                     -- "€500k" / "€2.00m"
  team          TEXT,
  api_team_id   INTEGER,
  is_reserve    BOOLEAN NOT NULL DEFAULT false,
  -- auditoría
  added_by      UUID,
  added_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_key)
);
```

- `kind='add'` → jugador agregado. `kind='remove'` → baja (sirve para sacar a uno de los 41).
- `UNIQUE(player_key)` + upsert `onConflict: 'player_key'` → idempotente. Agregar a un jugador
  removido reescribe la fila a `add`; eliminar reescribe a `remove`.
- Fusión en `loadAgencyPlayers()`: empezar con `BASE`, quitar los `player_key` con `kind='remove'`,
  agregar los `kind='add'` (de-dup por `player_key`).

### 2. Resolución de apiTeamId al agregar (best-effort)

Al tocar "Nueva incorporación", para poder traer sus partidos en el Calendario:

1. Si el jugador ya tiene `apiId` (caso Cartagena, viene en la URL), llamar a API-Football
   `/players?id={apiId}&season={actual}` → obtener `statistics[].team.id` y `team.name`.
   Tomar el equipo del torneo actual como `api_team_id`.
2. Si no hay apiId, intentar resolver por nombre de equipo contra la tabla `teams` de Supabase
   (o `/teams?search=`), reusando el patrón de `usePlayerApiData`.
3. Mostrar al usuario el equipo detectado en un mini-confirm (equipo + valor/contrato editables,
   precargados desde el enriquecimiento Transfermarkt que ya tiene la ficha) antes de guardar.
4. Datos de portfolio que se capturan desde la ficha: `fullName`, `shortName`, `image`,
   `market_value`, `contract_end`, `team` (ya disponibles en el registro enriquecido).

Si no se logra `api_team_id`, el jugador se agrega igual (aparece en sello, interno, dashboard);
solo el Calendario depende del fallback manual (abajo).

### 3. Fallback de partidos manuales

Cuando un jugador Doble G **no** tiene `api_team_id` resoluble, o la API no devuelve fixtures
para su equipo:

- Mostrar en su **perfil** una alerta: "La API no trae los partidos de este jugador. Agregá sus
  próximos partidos a mano." con un formulario fácil (campos: fecha, rival, local/visitante,
  competencia).
- Tabla Supabase **`agency_manual_fixtures`** (keyed por `player_key`): `match_date`, `opponent`,
  `is_home`, `competition`, `venue?`, auditoría.
- `CalendarPage` y `HomePage` **fusionan** estos fixtures manuales con los `AgencyFixture` de la
  API (mismo shape `AgencyFixture`, marcados `source: 'manual'`).

### 4. Integración con Interno

`InternalScoutingPage` lee `internal` (origen CSV/Sheets), distinto de `AGENCY_PLAYERS`. Para que
un jugador agregado aparezca en Interno:

- En `DataContext`, después de cargar `internal`, **agregar** los jugadores Doble G (altas) que
  todavía no estén en `internal`, reusando su ficha enriquecida desde `external` (mismo tipo
  `EnrichedPlayer`). Match por `player_key`.
- Así heredan su score GG de Supabase, datos Transfermarkt, etc., sin re-cargar nada.

### 5. UI — `DobleGWidget`

- Componente nuevo `src/components/agency/DobleGWidget.tsx`, renderizado en `PlayerDetailPage`
  junto al `TrackingWidget` (en la card de acciones, líneas ~1310-1367). Visible tanto para
  `source === 'externo'` como `'interno'`.
- Mismo tamaño/estilo que "Agregar a seguimiento":
  `flex items-center justify-between w-full px-3 py-2.5 rounded-xl ... transition-all`.
- **No-DG:** botón "Nueva incorporación de Doble G" con el logo (`/logo-dark.png` en claro,
  `/logo-light.png` en oscuro, `w-4 h-4 object-contain`). Acento propio de Doble G distinto del
  verde de seguimiento (un dorado/ámbar suave, ej. `amber-500/10` fondo + texto `amber-600`)
  para que lea como una acción "especial".
- **DG:** sello con logo + texto "Incorporación de Doble G" y botón secundario "Eliminar de
  Doble G" (estilo destructivo sutil, mismo tamaño).
- Estados: requiere usuario logueado (igual que TrackingWidget). Loading/disabled durante la
  mutación. Confirmación antes de eliminar.

## Flujo de datos (resumen)

```
agency_players (Supabase)  ──┐
BASE_AGENCY_PLAYERS (41)    ─┼─►  agencyPlayersService (cache módulo)
                             │         │  getAgencyPlayers() / helpers
                             │         ▼
DataContext.loadAgencyPlayers() ─► expone agencyPlayers + refresh
                                       │
   ┌───────────────┬───────────────┬──┴────────────┬─────────────┐
   ▼               ▼               ▼               ▼             ▼
 Dashboard       Home           Calendar        scoring      Interno
 (inicio)     (semana/contr.)  (+manual fix)   (lookup)   (merge en internal)
```

## Manejo de errores

- Falla el fetch de `agency_players` → usar solo `BASE` (los 41) y loguear; la app no se rompe.
- Falla `addAgencyPlayer` → toast de error, no se actualiza el cache.
- Resolución de apiTeamId falla → se agrega igual + se activa el flujo de fixtures manuales.
- Eliminar requiere confirmación; los 41 base se "tapan" con una fila `kind='remove'`.

## Testing

- `agencyPlayersService`: fusión BASE − bajas + altas; idempotencia del upsert; `isAgencyPlayer`
  por apiId y por nombre normalizado.
- Helpers (`getUniqueTeamIds`, etc.) sobre lista fusionada.
- DataContext: jugador agregado aparece en `internal`; quitado desaparece.
- Merge de fixtures manuales en Calendar/Home.

## Fuera de alcance (YAGNI)

- Editar datos de portfolio de los 41 base desde la UI (siguen en código).
- Historial/auditoría visible de altas y bajas.
- Reasignar `is_reserve` desde la UI.
