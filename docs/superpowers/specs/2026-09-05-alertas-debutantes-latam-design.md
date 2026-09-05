# Alertas de Debutantes U20 en LATAM — Design Spec

## Contexto y objetivo

En una reunión le mencionaron a Marcos que Rosario Central tiene, en su plataforma interna de scouting, una alerta automática por cada juvenil de 20 años o menos que debuta en cualquier primera división de Latinoamérica. Se pidió lo mismo para Doble G, y también para la plataforma de Independiente.

El spec técnico original (co-armado con otra sesión de Claude, sin visibilidad del código real de este repo) asumía que había que construir todo desde cero: tabla de apariciones históricas, bootstrap manual, job diario que llama a la API de partidos todos los días. **Investigar el repo mostró que eso ya existe y ya corre** — ver "Infraestructura reusada" abajo. El diseño de acá es deliberadamente mucho más chico que el spec original porque reusa esa infraestructura en vez de duplicarla.

## Objetivo

Una lista (una pantalla nueva, en las dos plataformas) que va sumando, apenas se detecta, a cada jugador de 20 años o menos que jugó por primera vez en su vida en una de las competencias trackeadas de LATAM — sin repetir a nadie, sin confundir "vuelve de una lesión" con "debut", y sin llamar de nuevo a la API de partidos para esto (se arma sobre datos que el sync de siempre ya trae).

## Fuera de alcance

- Notificaciones (campanita, mail, WhatsApp) — el usuario pidió explícitamente que por ahora sea sólo la lista en la pantalla nueva, nada de avisos.
- Ligas fuera de LATAM.
- Cualquier dato de "club formador" o "agente/contrato" para jugadores que no sean parte de la cartera de Doble G (`agency_players`) — para el resto de los debutantes esos campos no existen en la base y no se van a mostrar (salvo lo que traiga el enriquecimiento de Transfermarkt genérico, ver abajo).

## Infraestructura reusada (no se construye de nuevo)

Confirmado leyendo el código (`supabase/functions/`, `supabase/migrations/001_scoring_schema.sql`, `supabase/migrations/20260521204103_setup_pg_cron.sql`):

- **`public.players`**: ya tiene `birth_date`, `nationality`, `primary_position`, `photo`, `current_team_id`. Se llena solo vía sync.
- **`public.fixtures`**: partidos terminados por liga/temporada, ya sincronizados.
- **`public.player_match_stats`**: minutos jugados por jugador por partido (`minutes` — exactamente el "registro de apariciones" que pedía el spec original). `UNIQUE(player_id, fixture_id)`.
- **Sync automático ya corriendo** (pg_cron, `supabase/migrations/20260521204103_setup_pg_cron.sql`): `sync-fixtures-hourly` (cada hora) y `sync-player-stats-10min` (cada 10 min) mantienen las tres tablas de arriba al día para toda liga con `leagues.has_player_stats = true`.
- **`supabase/functions/backfill-season`**: ya permite cargar una temporada histórica completa de una liga con un solo llamado (bootstrap ya construido).
- **Enriquecimiento automático con Transfermarkt** (`supabase/functions/enrich-player`, trigger `trg_enrich_new_player` en `supabase/migrations/20260528_enrich_trigger_and_cron.sql`): se dispara solo ante CUALQUIER `INSERT` nuevo en `players`, sin filtro de liga/país. Completa `market_value_eur`, `contract_end_date`, `agent`, `transfermarkt_url`, y `birth_date` si faltaba. Confirmado contra API-Football en vivo: Perú (liga 281) y Venezuela (liga 299) tienen cobertura completa de alineaciones/estadísticas desde 2023.

Conclusión: **no hace falta ninguna tabla de apariciones nueva, ningún bootstrap manual, ningún job diario que llame a la API.** Sólo hace falta sumar 2 ligas a la lista de trackeadas y construir la capa de detección de debut + la pantalla.

## Ligas/competencias que cuentan para "debut"

| País/competencia | League ID (API-Football) | Estado hoy |
|---|---|---|
| Argentina — Liga Profesional | 128 | Ya trackeada |
| Argentina — Primera Nacional (2ª división) | 131 | Ya trackeada — se incluye a pedido explícito del usuario, pese a ser 2ª división, por su valor de scouting de ascenso |
| Bolivia — Primera División | 344 | Ya trackeada |
| Brasil — Serie A | 71 | Ya trackeada |
| Chile — Primera División | 265 | Ya trackeada |
| Colombia — Liga BetPlay | 239 | Ya trackeada |
| Ecuador — Liga Pro | 242 | Ya trackeada |
| México — Liga MX | 262 | Ya trackeada |
| Paraguay — División Profesional | 252 | Ya trackeada |
| Uruguay — Primera División | 268 | Ya trackeada |
| Perú — Primera División | 281 | **Nueva** — confirmado en API-Football, historial completo desde 2023 |
| Venezuela — Primera División | 299 | **Nueva** — confirmado en API-Football, historial completo desde 2023 |
| Copa Libertadores | 13 | Ya trackeada como liga, pero con `has_player_stats = false` — hay que activarlo |
| Copa Sudamericana | 11 | Ídem — activar `has_player_stats` |

Un debut en Libertadores/Sudamericana sólo genera alerta si es la primera aparición del jugador contando TODAS las competencias de esta lista juntas (no sólo esa competencia) — evita el falso positivo de "ya jugaba en su liga local y ahora debuta en Libertadores".

## Modelo de datos

### Cambios a `leagues`

```sql
alter table public.leagues add column if not exists track_debuts boolean not null default false;
```

- Se marca `track_debuts = true` en las 14 filas de la tabla de arriba (las 12 ya existentes + Perú/Venezuela nuevas).
- Se activa `has_player_stats = true` en Libertadores (13) y Sudamericana (11) — hoy están en `false`, así que el sync de estadísticas de jugador no las toca todavía.
- Perú (281) y Venezuela (299) se insertan como filas nuevas en `leagues` con `has_player_stats = true` y `track_debuts = true` — a partir de ahí el sync horario/10-min existente las toma solas.
- Después de sumarlas, se ejecuta `backfill-season` (ya existente, sin cambios) para las temporadas 2023-2026 de Perú y Venezuela, y para Libertadores/Sudamericana 2026 — carga el histórico de una vez, así el chequeo de "primera aparición" no arranca en blanco.

### Tabla nueva `debut_alerts`

```sql
create table public.debut_alerts (
  player_id     integer primary key references public.players(id),
  fixture_id    integer not null references public.fixtures(id),
  league_id     integer not null references public.leagues(id),
  age_at_debut  integer not null,
  minutes       integer not null,
  debut_date    date not null,
  created_at    timestamptz not null default now()
);

alter table public.debut_alerts enable row level security;

-- Lectura pública (mismo criterio que `players`/`fixtures`: dato de scouting
-- compartido, no confidencial de un club). Escritura solo via la funcion de
-- abajo (SECURITY DEFINER) -- ninguna policy de insert/update/delete para
-- `authenticated`.
create policy "read_debut_alerts" on public.debut_alerts
  for select to authenticated using (true);
```

Una fila por jugador, para siempre — la PK en `player_id` hace que sea imposible que alguien aparezca dos veces, incluso si la función de detección se corre de nuevo por error.

### Función de detección (sin llamar a ninguna API — pura consulta SQL)

```sql
create or replace function public.detect_debut_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.debut_alerts (player_id, fixture_id, league_id, age_at_debut, minutes, debut_date)
  select distinct on (pms.player_id)
    pms.player_id,
    pms.fixture_id,
    f.league_id,
    extract(year from age(f.date, p.birth_date))::int,
    pms.minutes,
    f.date::date
  from public.player_match_stats pms
  join public.fixtures f on f.id = pms.fixture_id
  join public.leagues l on l.id = f.league_id and l.track_debuts
  join public.players p on p.id = pms.player_id and p.birth_date is not null
  where pms.minutes > 0
    and extract(year from age(f.date, p.birth_date)) <= 20
    and not exists (
      select 1 from public.debut_alerts da where da.player_id = pms.player_id
    )
    and not exists (
      -- Si hay OTRA aparicion con minutos > 0 en una fecha anterior (en
      -- cualquier competencia trackeada), esta no es su debut.
      select 1
      from public.player_match_stats pms2
      join public.fixtures f2 on f2.id = pms2.fixture_id
      join public.leagues l2 on l2.id = f2.league_id and l2.track_debuts
      where pms2.player_id = pms.player_id
        and pms2.minutes > 0
        and f2.date < f.date
    )
  order by pms.player_id, f.date asc
  on conflict (player_id) do nothing;
end;
$$;
```

Idempotente: correrla de nuevo nunca duplica ni corrige mal un dato (los ya alertados quedan afuera por el primer `not exists`).

### Cron (mismo patrón que los jobs existentes, `supabase/migrations/20260521204103_setup_pg_cron.sql`)

```sql
select cron.schedule(
  'detect-debut-alerts-daily',
  '0 10 * * *',  -- 10:00 UTC = 7:00 Argentina -- despues de que el sync de la madrugada ya proceso los partidos del dia anterior
  $$ select public.detect_debut_alerts(); $$
);
```

Más simple que los cron existentes: no necesita `net.http_post` ni invocar una Edge Function — es una llamada SQL directa, porque toda la data que necesita ya está en Postgres.

## Frontend (ambos repos: `primer-appcloud` e `independiente-platform`)

### Servicio

```ts
// src/services/debutAlertsService.ts
export interface DebutAlert {
  playerId: number
  playerName: string
  photo: string | null
  position: string | null
  teamName: string | null
  teamLogo: string | null
  leagueName: string | null
  ageAtDebut: number
  minutes: number
  debutDate: string
}

export async function fetchDebutAlerts(): Promise<DebutAlert[]>
```

Un único `select` con joins a `players`, `teams` (via `player.current_team_id`), `leagues` — sin paginado en v1 (volumen bajo: un puñado de debuts por semana en toda LATAM).

### Página nueva

`src/pages/DebutantesPage.tsx` — lista de tarjetas (foto, nombre, edad al debut, posición, club, liga, fecha, minutos jugados), ordenada por fecha de debut descendente. Click en una tarjeta → `navigate('/jugador/:id')` (la ficha de jugador que ya existe, sin cambios).

Ruta nueva `/debutantes` + entrada de menú en `Navbar.tsx` de ambos repos (sección "Búsqueda de Talento" en la agencia, o donde el usuario prefiera en Independiente — a definir en el plan con una captura del menú actual).

## Testing

- `detect_debut_alerts()`: no hay framework de test SQL en el repo — se verifica manualmente con casos armados a mano en el SQL Editor (jugador con una sola aparición joven → genera alerta; jugador con dos apariciones, la segunda en Libertadores → no genera una segunda alerta; jugador de 21 años → no genera alerta) antes de habilitar el cron.
- `debutAlertsService.ts`: test unitario con el mock de `@/lib/supabase` (patrón ya usado en el repo), verificando el mapeo de columnas snake_case → camelCase.
- `DebutantesPage.tsx`: sin test de componente (no es el patrón actual del repo para páginas de listado — ver `ScoutTrackingGGPage.tsx`, sin test propio).

## Rollout

1. Migración: agregar `leagues.track_debuts`, marcar las 14 filas, insertar Perú/Venezuela, activar `has_player_stats` en Libertadores/Sudamericana, crear `debut_alerts` + `detect_debut_alerts()`.
2. Llamar `backfill-season` para Perú, Venezuela (2023-2026) y Libertadores/Sudamericana (2026) — deja que el sync existente (10 min) procese los partidos en batches.
3. Esperar a que `stats_synced` esté en `true` para todos los fixtures nuevos antes de activar el cron de detección (si se activa antes, con el histórico a medio cargar, puede generar algún falso positivo puntual — se verifica con una consulta de conteo antes de armar el cron).
4. Activar el cron `detect-debut-alerts-daily`.
5. Deploy de `debutAlertsService.ts` + `DebutantesPage.tsx` + ruta + nav en los dos repos.
