-- Vuelve a dejar pendientes (stats_synced=false) los partidos de Sofascore que se
-- cerraron incompletos: un equipo con menos de 11 jugadores, jugadores con 15+ minutos
-- sin puntaje, o partidos de Primera Nacional sin ningun jugador. No borra nada: la
-- proxima sincronizacion los vuelve a pedir y completa las filas (upsert).
-- Uso: npx supabase db query --linked --file scripts/sync-sofascore/reabrir_incompletos.sql
with c as (
  select f.id, f.league_id,
    (select count(*) from player_match_stats x where x.fixture_id = f.id and x.team_id = f.home_team_id) nh,
    (select count(*) from player_match_stats x where x.fixture_id = f.id and x.team_id = f.away_team_id) na,
    (select count(*) filter (where rating is null and minutes >= 15) from player_match_stats x where x.fixture_id = f.id) unrated
  from fixtures f
  where f.id >= 20000000 and f.stats_synced and f.season >= 2025 and f.date < now()
), target as (
  select id from c
  where (nh between 1 and 10) or (na between 1 and 10) or unrated > 0 or (nh = 0 and na = 0 and league_id = 131)
)
update fixtures set stats_synced = false where id in (select id from target) returning id, league_id;
