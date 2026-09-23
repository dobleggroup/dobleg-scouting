-- Debutantes: el debut es la PRIMERA aparición del jugador, y los filtros de cobertura se
-- aplican sobre esa aparición.
--
-- Bug (visto 2026-09-23 con Dómina, Cavadia, M. Caballero, I. Fernández): los filtros de
-- cobertura (liga con historia >= 180/365 días, < 2% de partidos sin stats) se evaluaban
-- partido por partido ANTES de elegir el primero. Los primeros partidos de un jugador en
-- una liga recién cargada quedaban descartados y el "debut" pasaba a ser el primer partido
-- que sí pasaba el filtro, meses después (Dómina: Unión ene-2025 -> alerta en Tigre
-- sep-2026). Además el control de mellizos solo miraba la misma fecha de nacimiento del
-- jugador más temprano de TODA la base, y no la fila canónica.
--
-- Regla nueva:
--   1. Identidad = players.canonical_id (mellizos API-Football/Sofascore) y, como red de
--      seguridad, misma fecha de nacimiento + mismo apellido (sin tildes).
--   2. Primera aparición = el primer partido con minutos de esa identidad, en cualquier
--      liga (seguida o no).
--   3. Solo hay alerta si ESA primera aparición es en una liga seguida, con <= 20 años, y
--      la liga tiene cobertura suficiente a esa fecha. Si no la pasa, nunca hay alerta.
--   4. Una sola alerta por identidad.
--   5. Dos filas que debutan el mismo día con la misma inicial y apellido son el mismo
--      jugador cargado por dos fuentes (ej. "B. Trey" / "Bruno Trey" con fechas de
--      nacimiento distintas en cada fuente): una sola alerta.
--   6. Cada alerta nueva queda 'pending' hasta que la edge function verify-debuts la
--      contrasta con la página de debuts de Transfermarkt (ver _shared/tm-debuts.ts).
--      La app solo muestra 'confirmed', 'adjusted' y 'no_tm'.

alter table public.debut_alerts
  add column if not exists verification text not null default 'pending'
    check (verification in ('pending', 'confirmed', 'adjusted', 'rejected', 'no_tm')),
  add column if not exists tm_debut_date date,
  add column if not exists our_debut_date date,
  add column if not exists verified_at timestamptz;

create index if not exists idx_debut_alerts_pending on public.debut_alerts (debut_date desc) where verification = 'pending';

create or replace function public.debut_surname_key(p_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(trim(p_name)), 'áàâäãéèêëíìîïóòôöõúùûüñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '^.*[ .]', '')
$$;

create or replace function public.debut_initial_key(p_name text)
returns text
language sql
immutable
as $$
  select left(translate(lower(trim(p_name)), 'áàâäãéèêëíìîïóòôöõúùûüñç', 'aaaaaeeeeiiiiooooouuuunc'), 1)
         || ' ' || public.debut_surname_key(p_name)
$$;

create or replace function public.detect_debut_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  inserted_count integer;
begin
  with ident as (
    select p.id, coalesce(p.canonical_id, p.id) as gid, p.birth_date, public.debut_surname_key(p.name) as surname
    from public.players p
  ),
  app as materialized (
    select i.gid, i.birth_date, i.surname, pms.player_id, pms.fixture_id, pms.team_id, pms.minutes,
           f.date, f.league_id
    from public.player_match_stats pms
    join public.fixtures f on f.id = pms.fixture_id
    join ident i on i.id = pms.player_id
    where pms.minutes > 0
  ),
  first_by_gid as (
    select distinct on (gid) *
    from app
    order by gid, date asc, fixture_id asc
  ),
  first_by_birth_surname as (
    select birth_date, surname, min(date) as first_date
    from app
    where birth_date is not null and surname <> ''
    group by birth_date, surname
  ),
  alerted_gid as (
    select distinct i.gid
    from public.debut_alerts da
    join ident i on i.id = da.player_id
  ),
  candidates as (
  select
    fa.player_id,
    fa.fixture_id,
    fa.league_id,
    coalesce(
      (
        select f3.league_id
        from public.fixtures f3
        where (f3.home_team_id = fa.team_id or f3.away_team_id = fa.team_id)
          and f3.league_id not in (11, 13)
        group by f3.league_id
        order by count(*) desc
        limit 1
      ),
      fa.league_id
    ) as display_league_id,
    fa.team_id,
    extract(year from age(fa.date, p.birth_date))::int as age_at_debut,
    fa.minutes,
    (fa.date at time zone 'America/Argentina/Buenos_Aires')::date as debut_date,
    public.debut_initial_key(p.name) as initial_key,
    (select count(*) from app a2 where a2.gid = fa.gid) as apps
  from first_by_gid fa
  join public.players p on p.id = fa.player_id and p.birth_date is not null
  join public.leagues l on l.id = fa.league_id and l.track_debuts
  left join first_by_birth_surname fbs on fbs.birth_date = p.birth_date and fbs.surname = fa.surname
  where extract(year from age(fa.date, p.birth_date)) <= 20
    -- nadie con la misma fecha de nacimiento y apellido jugó antes (mellizo sin canonizar)
    and (fbs.first_date is null or fbs.first_date >= fa.date)
    and not exists (select 1 from alerted_gid ag where ag.gid = fa.gid)
    -- cobertura de la liga en la fecha de la PRIMERA aparición
    and coalesce((
      select count(*) filter (where f3.stats_synced = false)::numeric / nullif(count(*), 0)
      from public.fixtures f3
      where f3.league_id = fa.league_id
        and f3.date < fa.date
    ), 0) < 0.02
    and exists (
      select 1 from public.fixtures f4
      where f4.league_id = fa.league_id
        and f4.stats_synced = true
        and f4.date < fa.date - (
          case when fa.league_id in (131, 268, 344, 252) then interval '180 days' else interval '365 days' end
        )
    )
  )
  insert into public.debut_alerts (player_id, fixture_id, league_id, display_league_id, team_id, age_at_debut, minutes, debut_date)
  select distinct on (c.initial_key, c.debut_date)
    c.player_id, c.fixture_id, c.league_id, c.display_league_id, c.team_id, c.age_at_debut, c.minutes, c.debut_date
  from candidates c
  where not exists (
    select 1 from public.debut_alerts da
    join public.players p2 on p2.id = da.player_id
    where public.debut_initial_key(p2.name) = c.initial_key
      and abs(da.debut_date - c.debut_date) <= 1
  )
  order by c.initial_key, c.debut_date, c.apps desc, c.player_id
  on conflict (player_id) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.sync_log (function_name, status, fixtures_processed)
  values ('detect_debut_alerts', 'success', inserted_count);

  return inserted_count;
end;
$fn$;

-- Limpieza: alertas cuya identidad ya había jugado antes de la fecha de "debut", o
-- duplicadas dentro de la misma identidad (se queda la más temprana).
with ident as (
  select p.id, coalesce(p.canonical_id, p.id) as gid, p.birth_date, public.debut_surname_key(p.name) as surname
  from public.players p
),
app as materialized (
  select i.gid, i.birth_date, i.surname, f.date
  from public.player_match_stats pms
  join public.fixtures f on f.id = pms.fixture_id
  join ident i on i.id = pms.player_id
  where pms.minutes > 0
),
a as (
  select da.player_id, f.date as debut_ts, i.gid, i.birth_date, i.surname,
         row_number() over (partition by i.gid order by f.date, da.player_id) as rn,
         row_number() over (partition by public.debut_initial_key(p.name), da.debut_date
                            order by (select count(*) from app where app.gid = i.gid) desc, da.player_id) as rn_key
  from public.debut_alerts da
  join public.fixtures f on f.id = da.fixture_id
  join ident i on i.id = da.player_id
  join public.players p on p.id = da.player_id
)
delete from public.debut_alerts da
using a
where a.player_id = da.player_id
  and (
    a.rn > 1
    or a.rn_key > 1
    or exists (select 1 from app where app.gid = a.gid and app.date < a.debut_ts)
    or exists (select 1 from app where app.birth_date = a.birth_date and app.surname = a.surname
               and a.surname <> '' and app.date < a.debut_ts)
  );
