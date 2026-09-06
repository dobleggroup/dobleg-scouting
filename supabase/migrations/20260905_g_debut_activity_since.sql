create or replace function public.debut_activity_since(target_player_ids integer[])
returns table(player_id integer, minutes_since integer, matches_since integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    da.player_id,
    coalesce(sum(pms.minutes) filter (where f.id <> da.fixture_id), 0)::int as minutes_since,
    count(*) filter (where f.id <> da.fixture_id and pms.minutes > 0)::int as matches_since
  from public.debut_alerts da
  join public.player_match_stats pms on pms.player_id = da.player_id
  join public.fixtures f on f.id = pms.fixture_id
  where da.player_id = any(target_player_ids)
  group by da.player_id
$$;

grant execute on function public.debut_activity_since(integer[]) to authenticated;
