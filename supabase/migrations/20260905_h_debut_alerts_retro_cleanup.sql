delete from public.debut_alerts da
using public.fixtures f, public.players p
where f.id = da.fixture_id
  and p.id = da.player_id
  and (
    exists (
      select 1
      from public.player_match_stats pms2
      join public.fixtures f2 on f2.id = pms2.fixture_id
      join public.players p3 on p3.id = pms2.player_id
      where lower(trim(p3.name)) = lower(trim(p.name))
        and pms2.minutes > 0
        and f2.date < f.date
    )
    or not exists (
      select 1 from public.fixtures f4
      where f4.league_id = da.league_id
        and f4.stats_synced = true
        and f4.date < f.date - interval '365 days'
    )
  );
