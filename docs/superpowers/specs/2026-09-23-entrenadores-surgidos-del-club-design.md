# Entrenadores — Surgidos del club: uso por partido (Domingo / Temperley)

Fecha: 2026-09-23 · Estado: diseño aprobado en chat, pendiente revisión del spec

## Objetivo

La agencia pidió, en la pestaña **Resumen** del DT Nicolás Domingo, un gráfico con
la cantidad de jugadores **surgidos del club** que usó en cada partido desde que
llegó a Temperley. Para eso se enriquece el plantel de Temperley (primer equipo +
Temperley II) con su carrera completa: dónde debutaron, historial de pases, clubes
juveniles y datos de perfil. "Mientras más info mejor" (pedido explícito).

El mecanismo es genérico por DT (usa `coach.apiTeamId` y el inicio del ciclo), no
hardcodeado a Temperley, aunque la primera carga de datos es solo Temperley.

## Definiciones (decididas por el usuario)

- **Surgido del club** = su **primer club profesional** fue Temperley (debutó
  profesionalmente en Temperley). No importa dónde jugó en juveniles: Morrone
  (juveniles en Don Torcuato, debut en Temperley) **cuenta**. Para la gente es
  "formado en Temperley".
- **Ciclo de Domingo**: dirigió **todos** los partidos oficiales de Temperley de
  2026. La API-Football dice inicio 2026-07-01 — dato incorrecto. Inicio real:
  **2026-01-01**.
- **Partidos que cuentan**: todos los oficiales (Primera Nacional + Copa
  Argentina). Hoy son **31**, del 06/02 (Barracas Central 2-2, Copa Argentina, por
  penales) al 19/09 (Temperley 3-1 Almagro).

## Datos verificados antes de diseñar

- API-Football: Temperley = team **454**; Domingo = coach **28899**. Los 31
  partidos de 2026 tienen `/fixtures/lineups` (titulares + suplentes) y
  `/fixtures/events?type=subst` (cambios con minuto).
- API-Football **no** trae minutos por jugador en Primera Nacional
  (`/fixtures/players` vacío) → los minutos se reconstruyen con alineación + cambios.
- La API rotula con inicial + apellido ("M. Calzon", "D. Trebotic" = León
  Trebotic, "R. E. Quiroga" = Elías Quiroga) → el cruce se hace por **id de
  jugador API**, no por nombre, una vez vinculado cada jugador.
- Transfermarkt es accesible: perfil, página de debuts
  (`/{slug}/debuets/spieler/{id}`) y API interna de pases
  (`tmapi-alpha.transfermarkt.technology/transfer/history/player/{id}`). Ids de
  club: Temperley **14542**, Temperley II **77897**, Temperley Sub-20 **22597**.
- Fuentes de chequeo (no de verdad): Excel Wyscout "Team Stats Temperley (4).xlsx"
  (31 partidos, esquema y duración) y listado de plantel Wyscout (partidos y goles
  por jugador en la temporada).

## 1. Datos

### 1a. `agency_coaches.tenure_start` (columna nueva)

`DATE NULL`. Fecha de asunción del DT en su club actual. Si es null se usa el
`start` de la carrera del coach en API-Football. Migración setea
`domingo → 2026-01-01`. Se expone en `AgencyCoach.tenureStart: string | null`.

### 1b. Tabla `club_squad_careers` (nueva)

Una fila por jugador del plantel de un club (primer equipo o reserva), scoping por
`club_id` como el resto de las tablas (RLS `club_id = current_club_id()`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid pk | |
| `club_id` | text | tenant (`'dobleg'`); default `current_club_id()`, el script lo manda explícito |
| `team_api_id` | int | 454 = Temperley |
| `squad` | text | `'primera'` \| `'reserva'` |
| `tm_player_id` | int unique por club | clave de Transfermarkt |
| `api_player_id` | int null | vinculado vía lineups de API-Football |
| `full_name`, `short_name` | text | |
| `position`, `birth_date`, `nationality`, `height_cm`, `foot` | | perfil TM |
| `photo_url`, `market_value_eur`, `contract_until`, `joined_at`, `joined_from` | | perfil TM |
| `youth_clubs` | text[] | "Clubes juveniles" del perfil TM |
| `first_pro_club_tm_id`, `first_pro_club_name` | | derivado |
| `pro_debut_date`, `pro_debut_club`, `pro_debut_club_tm_id`, `pro_debut_competition`, `pro_debut_opponent`, `pro_debut_coach` | | página de debuts TM (incluye el DT con el que debutó) |
| `transfer_history` | jsonb | pases TM normalizados `[{date, fromClub, toClub, type, fee}]` |
| `homegrown_auto` | bool | calculado (regla abajo) |
| `homegrown_reason` | text | por qué, legible ("Debutó en Temperley 12/03/2024 vs X") |
| `homegrown_override` | bool null | corrección manual del usuario; si no es null, gana |
| `sources` | jsonb | qué vino de TM / API / Wyscout y cuándo |
| `updated_at` | timestamptz | |

Vista/uso: `homegrown = coalesce(homegrown_override, homegrown_auto)`.

### 1c. Regla `homegrown_auto`

1. Si la página de debuts TM tiene debut profesional: `homegrown_auto = club de
   debut ∈ {Temperley 14542}`.
2. Si no hay debut registrado: el **primer club senior** del historial de pases
   (ignorando equipos juveniles/reserva: Sub-X, "II", "Youth", "Juveniles") es
   Temperley **y** no hay club senior anterior → `true`. Temperley II / Sub-20 no
   cuentan como "otro club".
3. Si no hay datos suficientes (ej. juveniles sin debut ni historial) y el jugador
   hoy está en el plantel de Temperley sin haber pasado por otro club senior →
   `true` con `homegrown_reason = 'sin debut registrado — inferido'`, marcado para
   revisión.
4. Verificado: Oswaldo Pacheco debutó en CSD Liniers (Primera B, 09/02/2025) →
   `false`. Morrone (debut Temperley 25/04/2026 con Domingo) y Richarte (Temperley
   21/04/2024) → `true`.
5. Casos a revisar a mano en la tabla de revisión: Pedro Souto, Valentín Aguiñagalde, y todo jugador con veredicto inferido.

### 1d. Script de enriquecimiento

`scripts/enrich-transfermarkt/enrich_squad_careers.py` (mismo estilo que
`enrich.py`: stdlib, `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`, `DELAY_MS`).

Entrada: lista de URLs de Transfermarkt (archivo `input/temperley_squad.txt`) con
el `squad` de cada una — los 24 del primer equipo, 10 de Temperley II y Cristopher
Nova (1384314).

Pasos por jugador:
1. Perfil TM (API interna `tmapi-alpha…/player/{id}`, JSON) → datos de perfil.
   Clubes juveniles = clubes del historial de pases cuyo nombre es juvenil
   ("Youth", "U20", "Sub-", "II", "Reserva"); nombres de club vía
   `tmapi-alpha…/clubs?ids[]=`.
2. Página de debuts TM → debut profesional.
3. API de pases TM → `transfer_history`.
4. API-Football: vincular `api_player_id` recorriendo las alineaciones de los
   partidos 2026 del equipo y matcheando por apellido + inicial (normalización NFD,
   sin acentos) contra el nombre TM; ambiguos → reporte. Completar con
   `/transfers?player=` si TM no tiene historial.
5. Calcular `homegrown_auto` + `homegrown_reason`.

Modo `--dry-run` (default): escribe `output/temperley_careers_review.csv` con
nombre, squad, primer club pro, debut, veredicto, motivo y `api_player_id`, **sin
tocar Supabase**. El usuario revisa; recién con `--apply` hace upsert por
(`club_id`, `tm_player_id`). Jugadores de API sin fila TM (usados en partidos pero
que no están en las listas) se listan en el reporte para agregarlos.

## 2. Uso por partido (cálculo)

Módulo puro `src/features/coaches/homegrown/homegrownMatchUsage.ts` (reemplaza a
`wyscoutReport/homegrownUsage.ts` + `homegrownPlayers.ts`, que se eliminan junto con
su test):

```ts
computeHomegrownUsage(
  matches: { fixture: AgencyFixture; lineup: ApiFixtureLineup; substitutions: ApiFixtureEvent[] }[],
  homegrownApiIds: Set<number>,
): HomegrownMatchUsage[]
// HomegrownMatchUsage = { fixtureId, date, rival, isHome, score, competition,
//   starters: PlayerMinutes[], subsIn: PlayerMinutes[], totalMinutes, teamMinutes }
// PlayerMinutes = { apiPlayerId, name, minutes, inAt?, outAt? }
```

- Minutos: titular = hasta su salida o fin; ingresado = desde su entrada hasta
  salida o fin. Fin del partido = 90 (el alargue de Copa suma 30; penales no
  suman). Expulsiones (evento `Card` rojo) cortan los minutos.
- `teamMinutes` = 11 × duración, para el % de minutos.
- Servicio `src/services/homegrownUsageService.ts`: toma los partidos terminados
  del equipo desde `tenureStart`, trae lineups/eventos con las funciones cacheadas
  existentes (`fetchFixtureLineups`, `fetchFixtureEvents`) y las filas
  `club_squad_careers` del equipo.

## 3. UI — tarjeta en la pestaña Resumen

Componente `src/features/coaches/components/CoachHomegrownUsageCard.tsx`,
renderizado en `CoachSummaryTab` debajo de `CoachSeasonStatsCard`. No se renderiza
si el DT no tiene equipo o si no hay filas en `club_squad_careers` para su equipo.

1. **KPIs**: promedio de canteranos por partido; partidos con ≥1 canterano (x de
   N); minutos de canteranos y % del total del equipo; canteranos que
   **debutaron en Primera con el DT** (`pro_debut_coach` = nombre del DT,
   normalizado, y `pro_debut_date ≥ tenureStart`), con nombres.
2. **Barras por partido** (Recharts), eje X = fecha + rival, orden cronológico:
   barra apilada **titulares / ingresados**.
3. **Barras de minutos** por partido, alineadas con las de arriba (mismo eje X; no
   doble eje).
4. **Tooltip**: resultado, competencia y cada canterano con minutos ("Ávalos 61'
   (ingresó 29')").
5. **Tabla de canteranos**: PJ, titularidades, minutos con el DT; cada fila
   expandible con la carrera (primer club pro, debut, clubes juveniles, pases).

Colores y marcas según la skill `dataviz` (validador, claro/oscuro), ancla en
`brand-green`. Textos con `t()` (es/en/it como el resto de `coachDetail.*`).
Estados: cargando (spinner), sin datos de carrera (no se muestra), fallo de la API
en un partido (el partido se muestra como "sin datos" en gris, no rompe la tarjeta).

## 4. Pruebas

- Unit (vitest) de `computeHomegrownUsage`: titular 90', titular sustituido,
  ingresado, ingresado y luego sustituido, expulsado, alargue de Copa, jugador no
  canterano ignorado. Fixtures reales de un partido (1498827 vs Almagro) en
  `__fixtures__`.
- Unit de la regla `homegrown_auto` en Python (función pura, casos Morrone /
  Pacheco / Richarte / Hauche).
- Verificación contra datos reales: partidos por jugador calculados vs listado
  Wyscout (ej. Ávalos 11, Calzón 9, Richarte 22) — diferencias explicadas o
  corregidas antes de dar por terminado.
- Visual: correr la app y ver la tarjeta en `/entrenadores/domingo?tab=resumen`
  en claro y oscuro, desktop y mobile.

## Fuera de alcance

Exportar la tarjeta a PDF; comparar contra el DT anterior; cargar planteles de
otros clubes (el mecanismo lo soporta, la carga de datos no se hace ahora); edición
del `homegrown_override` desde la UI (se setea por SQL/script por ahora).
