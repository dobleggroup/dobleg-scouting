-- Segunda vuelta de la revision final de "Alertas de Debutantes U20 LATAM":
--
-- 1) La guarda de sync incompleto (20260905_c) exige CERO fixtures sin
--    sincronizar antes de la fecha del candidato, en la misma liga. Peru
--    tiene 7 partidos con datos de alineacion rotos en la API que nunca van
--    a poder sincronizarse (permanentes) -- eso bloqueaba la deteccion en
--    esa liga PARA SIEMPRE, no solo mientras dura un backfill. Se cambia a
--    un umbral de tolerancia (menos del 2% de los partidos anteriores sin
--    sincronizar), que sigue protegiendo contra un backfill a medio terminar
--    mientras no se bloquea por unos pocos casos permanentemente rotos.
--
-- 2) Las filas ya insertadas en debut_alerts (con la logica vieja) quedan
--    con team_id vacio y la fecha calculada en UTC -- se actualizan con los
--    datos correctos ahora que existen.

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
  insert into public.debut_alerts (player_id, fixture_id, league_id, team_id, age_at_debut, minutes, debut_date)
  select distinct on (pms.player_id)
    pms.player_id,
    pms.fixture_id,
    f.league_id,
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

update public.debut_alerts da
set
  team_id = pms.team_id,
  debut_date = (f.date at time zone 'America/Argentina/Buenos_Aires')::date
from public.player_match_stats pms
join public.fixtures f on f.id = pms.fixture_id
where pms.player_id = da.player_id
  and pms.fixture_id = da.fixture_id
  and (da.team_id is null or da.team_id != pms.team_id or da.debut_date != (f.date at time zone 'America/Argentina/Buenos_Aires')::date);
