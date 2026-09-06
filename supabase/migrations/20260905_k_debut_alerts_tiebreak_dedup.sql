create or replace function public.detect_debut_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  inserted_count integer;
begin
  with earliest_by_birthdate as (
    select distinct on (p.birth_date)
      p.birth_date, f.date as first_date, pms.player_id as first_player_id
    from public.player_match_stats pms
    join public.fixtures f on f.id = pms.fixture_id
    join public.players p on p.id = pms.player_id
    where pms.minutes > 0 and p.birth_date is not null
    order by p.birth_date, f.date asc, pms.player_id asc
  ),
  earliest_by_name as (
    select distinct on (norm_name)
      norm_name, first_date, first_player_id
    from (
      select lower(trim(p.name)) as norm_name, f.date as first_date, pms.player_id as first_player_id
      from public.player_match_stats pms
      join public.fixtures f on f.id = pms.fixture_id
      join public.players p on p.id = pms.player_id
      where pms.minutes > 0
    ) x
    order by norm_name, first_date asc, first_player_id asc
  )
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
  left join earliest_by_birthdate fab on fab.birth_date = p.birth_date
  left join earliest_by_name fan on fan.norm_name = lower(trim(p.name))
  where pms.minutes > 0
    and extract(year from age(f.date, p.birth_date)) <= 20
    and not exists (
      select 1 from public.debut_alerts da where da.player_id = pms.player_id
    )
    and (fab.first_player_id is null or fab.first_player_id = pms.player_id)
    and (fan.first_player_id is null or fan.first_player_id = pms.player_id)
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
        and f4.date < f.date - (
          case when f.league_id in (131, 268, 344, 252) then interval '180 days' else interval '365 days' end
        )
    )
  order by pms.player_id, f.date asc, f.id asc
  on conflict (player_id) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.sync_log (function_name, status, fixtures_processed)
  values ('detect_debut_alerts', 'success', inserted_count);

  return inserted_count;
end;
$fn$;

delete from public.debut_alerts
where player_id in (
  21597275, 22671506, 22679435, 22658762, 22525691, 22415997, 22411290,
  22668526, 22322664, 22548355, 22445397, 22669316, 22658760, 22658739,
  22651537, 22199217, 22353018, 22543314, 22363529, 22549160
);
