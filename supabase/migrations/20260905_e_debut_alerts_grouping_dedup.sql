-- Tercera vuelta sobre "Alertas de Debutantes U20 LATAM", a pedido directo del
-- usuario despues de ver la pantalla funcionando:
--
-- 1) Copa Libertadores/Sudamericana no deben aparecer como "liga" propia --
--    un debut ahi se agrupa bajo la liga domestica del equipo (ej. un
--    debutante de un club chileno en Libertadores va bajo "Chile"). Se agrega
--    `display_league_id`, resuelto por mayoria de partidos domesticos del
--    equipo (excluyendo las 2 copas continentales).
--
-- 2) Duplicados reales: el mismo jugador humano quedo sincronizado con DOS
--    player_id distintos -- uno nativo de API-Football, otro con el offset
--    +20_000_000 que usa el sync de Sofascore para no chocar ids (ver
--    scripts/sync-sofascore/sync.py). Ambos ids, por separado, "parecen"
--    debuts genuinos porque cada uno tiene una sola aparicion bajo SU id.
--    Se agrega un chequeo por nombre exacto (case-insensitive) para no
--    duplicar al mismo jugador dos veces, y se limpian los duplicados ya
--    insertados (se conserva el de menor player_id -- el nativo de
--    API-Football, mas confiable: tiene backfill de nacionalidad automatico,
--    el de Sofascore no).

alter table public.debut_alerts add column if not exists display_league_id integer references public.leagues(id);

drop function if exists public.detect_debut_alerts();

create or replace function public.detect_debut_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.debut_alerts (player_id, fixture_id, league_id, display_league_id, team_id, age_at_debut, minutes, debut_date)
  select distinct on (pms.player_id)
    pms.player_id,
    pms.fixture_id,
    f.league_id,
    coalesce(
      (
        select f3.league_id
        from public.fixtures f3
        where (f3.home_team_id = pms.team_id or f3.away_team_id = pms.team_id)
          and f3.league_id not in (11, 13)
        group by f3.league_id
        order by count(*) desc
        limit 1
      ),
      f.league_id
    ),
    pms.team_id,
    extract(year from age(f.date, p.birth_date))::int,
    pms.minutes,
    (f.date at time zone 'America/Argentina/Buenos_Aires')::date
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
      select 1
      from public.debut_alerts da2
      join public.players p2 on p2.id = da2.player_id
      where lower(trim(p2.name)) = lower(trim(p.name))
    )
    and not exists (
      select 1
      from public.player_match_stats pms2
      join public.fixtures f2 on f2.id = pms2.fixture_id
      where pms2.player_id = pms.player_id
        and pms2.minutes > 0
        and f2.date < f.date
    )
    and coalesce((
      select count(*) filter (where f3.stats_synced = false)::numeric / nullif(count(*), 0)
      from public.fixtures f3
      where f3.league_id = f.league_id
        and f3.date < f.date
    ), 0) < 0.02
  order by pms.player_id, f.date asc, f.id asc
  on conflict (player_id) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.sync_log (function_name, status, fixtures_processed)
  values ('detect_debut_alerts', 'success', inserted_count);

  return inserted_count;
end;
$$;

revoke execute on function public.detect_debut_alerts() from public, anon, authenticated;

-- Remediacion de filas existentes: resolver display_league_id (una sola vez,
-- via una tabla temporal en memoria -- mucho mas rapido que un subquery
-- correlacionado por fila sobre `fixtures`, que no tiene indice por equipo).
with team_home_league as (
  select team_id, league_id
  from (
    select team_id, league_id,
           row_number() over (partition by team_id order by count(*) desc) as rn
    from (
      select home_team_id as team_id, league_id from public.fixtures where league_id not in (11, 13)
      union all
      select away_team_id as team_id, league_id from public.fixtures where league_id not in (11, 13)
    ) x
    group by team_id, league_id
  ) ranked
  where rn = 1
)
update public.debut_alerts da
set display_league_id = coalesce(thl.league_id, da.league_id)
from team_home_league thl
where da.display_league_id is null
  and da.team_id = thl.team_id;

update public.debut_alerts
set display_league_id = league_id
where display_league_id is null;

-- Elimina duplicados de la misma persona real bajo distinto player_id: se
-- queda con el de menor player_id (nativo de API-Football).
delete from public.debut_alerts da
where exists (
  select 1
  from public.debut_alerts da2
  join public.players p on p.id = da.player_id
  join public.players p2 on p2.id = da2.player_id
  where da2.player_id < da.player_id
    and lower(trim(p.name)) = lower(trim(p2.name))
);
