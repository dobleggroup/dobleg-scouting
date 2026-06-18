-- ============================================================
-- fetch_players_list: lista de jugadores colapsada a 1 fila por jugador
-- ============================================================
-- Problema que resuelve:
--   player_season_scores guarda 1 fila por (player_id, season, position, league_id).
--   Un jugador con varias posiciones/temporadas/ligas tiene varias filas legítimas.
--   La query anterior paginaba sobre FILAS y deduplicaba solo dentro de la página,
--   por lo que el mismo jugador aparecía en páginas distintas (duplicado/triplicado)
--   y el contador total contaba filas, no jugadores.
--
-- Esta función colapsa a la "mejor" fila por jugador (más partidos jugados, luego
-- temporada más reciente, luego mayor score) ANTES de paginar, y devuelve el total
-- de JUGADORES únicos. Replica el doble dedup del frontend:
--   1) por player_id   2) por (nombre, equipo actual)  [API-Football vs Sofascore]
--
-- Devuelve jsonb: { "count": <int>, "players": [ <PlayerWithScore>, ... ] }
-- donde cada player es { ...players, team, season_scores:[<row>], primary_score, primary_percentile }.

CREATE OR REPLACE FUNCTION fetch_players_list(
  p_seasons             int[],
  p_positions           text[]  DEFAULT NULL,
  p_league_id           int     DEFAULT NULL,
  p_team_id             int     DEFAULT NULL,
  p_min_score           numeric DEFAULT NULL,
  p_min_matches         int     DEFAULT NULL,
  p_min_age             int     DEFAULT NULL,
  p_max_age             int     DEFAULT NULL,
  p_min_market_value    bigint  DEFAULT NULL,
  p_max_market_value    bigint  DEFAULT NULL,
  p_max_contract_months int     DEFAULT NULL,
  p_agents              text[]  DEFAULT NULL,
  p_search              text    DEFAULT NULL,
  p_page                int     DEFAULT 0,
  p_page_size           int     DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT
      pss.player_id, pss.season, pss.position, pss.league_id,
      pss.matches_played, pss.avg_score, pss.avg_rating,
      pss.total_goals, pss.total_assists, pss.percentile, pss.global_percentile,
      pl.name, pl.photo, pl.birth_date, pl.nationality, pl.preferred_foot,
      pl.height_cm, pl.primary_position, pl.position_distribution,
      pl.current_team_id, pl.market_value_eur, pl.contract_end_date,
      pl.agent, pl.transfermarkt_url, pl.transfermarkt_id,
      tm.id AS team_id, tm.name AS team_name, tm.logo AS team_logo,
      tm.league_id AS team_league_id
    FROM player_season_scores pss
    JOIN players pl ON pl.id = pss.player_id
    LEFT JOIN teams tm ON tm.id = pl.current_team_id
    WHERE pss.season = ANY(p_seasons)
      AND pss.avg_score IS NOT NULL
      AND (p_positions IS NULL OR pss.position = ANY(p_positions))
      AND (p_league_id IS NULL OR pss.league_id = p_league_id)
      AND (p_team_id  IS NULL OR pl.current_team_id = p_team_id)
      AND (p_min_score   IS NULL OR pss.avg_score >= p_min_score)
      AND (p_min_matches IS NULL OR pss.matches_played >= p_min_matches)
      AND (p_min_age IS NULL OR pl.birth_date <= (now() - make_interval(years => p_min_age))::date)
      AND (p_max_age IS NULL OR pl.birth_date >= (now() - make_interval(years => p_max_age))::date)
      AND (p_min_market_value IS NULL OR pl.market_value_eur >= p_min_market_value)
      AND (p_max_market_value IS NULL OR pl.market_value_eur <= p_max_market_value)
      AND (p_max_contract_months IS NULL
           OR pl.contract_end_date <= (now() + make_interval(months => p_max_contract_months))::date)
      AND (p_agents IS NULL OR pl.agent = ANY(p_agents))
      AND (p_search IS NULL OR pl.name ILIKE '%' || p_search || '%')
  ),
  by_player AS (
    SELECT DISTINCT ON (player_id) *
    FROM filtered
    ORDER BY player_id, matches_played DESC, season DESC, avg_score DESC
  ),
  by_name_team AS (
    SELECT DISTINCT ON (lower(name), current_team_id) *
    FROM by_player
    ORDER BY lower(name), current_team_id, matches_played DESC
  ),
  total AS (SELECT count(*)::int AS c FROM by_name_team),
  paged AS (
    SELECT *
    FROM by_name_team
    -- player_id como desempate hace el orden total y estable entre llamadas
    -- (páginas separadas): sin esto, empates en (avg_score, matches_played)
    -- hacían que un jugador reapareciera en páginas distintas.
    ORDER BY avg_score DESC NULLS LAST, matches_played DESC, player_id ASC
    LIMIT GREATEST(p_page_size, 0)
    OFFSET GREATEST(p_page, 0) * GREATEST(p_page_size, 0)
  )
  SELECT jsonb_build_object(
    'count', (SELECT c FROM total),
    'players', COALESCE(
      (SELECT jsonb_agg(player_obj ORDER BY avg_score DESC NULLS LAST, matches_played DESC, player_id ASC)
       FROM (
         SELECT
           avg_score, matches_played, player_id,
           jsonb_build_object(
             'id', player_id,
             'name', name,
             'photo', photo,
             'birth_date', birth_date,
             'nationality', nationality,
             'preferred_foot', preferred_foot,
             'height_cm', height_cm,
             'primary_position', primary_position,
             'position_distribution', position_distribution,
             'current_team_id', current_team_id,
             'market_value_eur', market_value_eur,
             'contract_end_date', contract_end_date,
             'agent', agent,
             'transfermarkt_url', transfermarkt_url,
             'transfermarkt_id', transfermarkt_id,
             'team', CASE WHEN team_id IS NULL THEN NULL ELSE jsonb_build_object(
               'id', team_id, 'name', team_name, 'logo', team_logo, 'league_id', team_league_id
             ) END,
             'season_scores', jsonb_build_array(jsonb_build_object(
               'player_id', player_id, 'season', season, 'position', position,
               'league_id', league_id, 'matches_played', matches_played,
               'avg_score', avg_score, 'avg_rating', avg_rating,
               'total_goals', total_goals, 'total_assists', total_assists,
               'percentile', percentile, 'global_percentile', global_percentile
             )),
             'primary_score', avg_score,
             'primary_percentile', percentile
           ) AS player_obj
         FROM paged
       ) sub),
      '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION fetch_players_list(
  int[], text[], int, int, numeric, int, int, int, bigint, bigint, int, text[], text, int, int
) TO anon, authenticated, service_role;
