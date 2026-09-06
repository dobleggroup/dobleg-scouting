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
      from public.player_match_stats pms2
      join public.fixtures f2 on f2.id = pms2.fixture_id
      join public.players p3 on p3.id = pms2.player_id
      where lower(trim(p3.name)) = lower(trim(p.name))
        and pms2.minutes > 0
        and f2.date < f.date
    )
    and coalesce((
      select count(*) filter (where f3.stats_synced = false)::numeric / nullif(count(*), 0)
      from public.fixtures f3
      where f3.league_id = f.league_id
        and f3.date < f.date
    ), 0) < 0.02
    and exists (
      select 1 from public.fixtures f4
      where f4.league_id = f.league_id
        and f4.stats_synced = true
        and f4.date < f.date - interval '365 days'
    )
  order by pms.player_id, f.date asc, f.id asc
  on conflict (player_id) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.sync_log (function_name, status, fixtures_processed)
  values ('detect_debut_alerts', 'success', inserted_count);

  return inserted_count;
end;
$$;

revoke execute on function public.detect_debut_alerts() from public, anon, authenticated;
