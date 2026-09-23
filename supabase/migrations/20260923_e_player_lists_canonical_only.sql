-- Las dos RPCs que arman listas de jugadores devuelven solo la fila oficial de cada
-- futbolista (players.canonical_id, ver 20260923_d_player_canonical_row.sql). Antes
-- fetch_players_list deduplicaba gemelos API-Football/Sofascore DESPUÉS de aplicar los
-- filtros, así que el gemelo que aparecía dependía del filtro (caso Alan Sosa: con filtro de
-- volante interno ganaba la fila de Sofascore, sin filtro la de API-Football) y la ficha
-- abría otra. Cuerpos copiados de 20260901_*_by_rating.sql con una sola línea agregada.

-- Rating reemplaza a Score GG (ver
-- docs/superpowers/specs/2026-09-01-rating-reemplaza-score-gg-design.md): desde
-- que recalc-scores dejo de escribir `avg_score` (Task 6/8 de ese plan,
-- deployado 2026-09-01), toda fila de player_season_scores recalculada desde
-- entonces tiene avg_score = NULL. Esta funcion nunca fue migrada junto con
-- recalc_percentiles/fetch_recent_form (Task 7 del mismo plan) y su filtro
-- `WHERE pss.avg_score IS NOT NULL` empezo a excluir esas filas -- en la
-- practica, TODO el dataset recalculado -- dejando fetch_players_list
-- devolviendo count=0/players=[] con cualquier combinacion de filtros. Esto
-- rompia en produccion Comparacion (ComparisonPage), Grafico de Dispersion
-- (ScatterChartPage) y LinkPlayerModal, todos consumidores de
-- usePlayersList/fetchPlayersList. Fix: mismo criterio que las otras dos RPCs
-- ya migradas -- filtrar, ordenar y armar `primary_score` sobre `avg_rating`.
-- `p_min_score` mantiene su nombre (no rompe la firma que ya llama el
-- frontend) pero ahora compara contra avg_rating.
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
      pss.tackles_p90, pss.interceptions_p90, pss.blocks_p90, pss.duels_won_pct,
      pss.passes_accuracy, pss.passes_key_p90, pss.passes_total_p90,
      pss.dribbles_success_p90, pss.dribbles_pct, pss.shots_on_p90, pss.shots_pct,
      pss.goals_p90, pss.assists_p90, pss.fouls_drawn_p90, pss.saves_p90,
      pss.goals_conceded_p90, pss.penalty_saved_avg, pss.clean_sheet_pct,
      pl.name, pl.photo, pl.birth_date, pl.nationality, pl.preferred_foot,
      pl.height_cm, pl.primary_position, pl.position_distribution,
      pl.current_team_id, pl.market_value_eur, pl.contract_end_date,
      pl.agent, pl.transfermarkt_url, pl.transfermarkt_id,
      tm.id AS team_id, tm.name AS team_name, tm.logo AS team_logo,
      tm.league_id AS team_league_id,
      lg.id AS league_pk, lg.name AS league_name, lg.country AS league_country,
      lg.tier AS league_tier, lg.season AS league_season
    FROM player_season_scores pss
    JOIN players pl ON pl.id = pss.player_id
    LEFT JOIN teams tm ON tm.id = pl.current_team_id
    LEFT JOIN leagues lg ON lg.id = pss.league_id
    WHERE pss.season = ANY(p_seasons)
      -- Solo la fila oficial de cada futbolista (ver 20260923_d_player_canonical_row.sql):
      -- se elige ANTES de filtrar, así la lista y la ficha muestran siempre la misma fila.
      AND pl.id = COALESCE(pl.canonical_id, pl.id)
      AND pss.avg_rating IS NOT NULL
      AND (p_positions IS NULL OR pss.position = ANY(p_positions))
      AND (p_league_id IS NULL OR tm.league_id = p_league_id)
      AND (p_team_id  IS NULL OR pl.current_team_id = p_team_id)
      AND (p_min_score   IS NULL OR pss.avg_rating >= p_min_score)
      AND (p_min_matches IS NULL OR pss.matches_played >= p_min_matches)
      AND (p_min_age IS NULL OR pl.birth_date <= (now() - make_interval(years => p_min_age))::date)
      AND (p_max_age IS NULL OR pl.birth_date >= (now() - make_interval(years => p_max_age))::date)
      AND (p_min_market_value IS NULL OR pl.market_value_eur >= p_min_market_value)
      AND (p_max_market_value IS NULL OR pl.market_value_eur <= p_max_market_value)
      AND (p_max_contract_months IS NULL
           OR (pl.contract_end_date >= now()::date
               AND pl.contract_end_date <= (now() + make_interval(months => p_max_contract_months))::date))
      AND (p_agents IS NULL OR pl.agent = ANY(p_agents))
      AND (p_search IS NULL OR pl.name ILIKE '%' || p_search || '%')
  ),
  by_player AS (
    SELECT DISTINCT ON (player_id) *
    FROM filtered
    ORDER BY player_id, (position = primary_position) DESC, matches_played DESC, season DESC, avg_rating DESC
  ),
  -- Un mismo futbolista puede tener dos filas en `players`: la de API-Football y la
  -- de Sofascore (misma persona, ids distintos). Se agrupan por transfermarkt_id,
  -- que es la identidad real, y gana la de API-Football (id < 20000000) porque es la
  -- que trae traspasos y lesiones, y es la que abre la ficha. Sin transfermarkt_id
  -- se cae a nombre + club, el criterio anterior.
  by_identity AS (
    SELECT DISTINCT ON (
      COALESCE(transfermarkt_id::text, lower(name) || '|' || COALESCE(current_team_id::text, ''))
    ) *
    FROM by_player
    ORDER BY
      COALESCE(transfermarkt_id::text, lower(name) || '|' || COALESCE(current_team_id::text, '')),
      (player_id < 20000000) DESC,
      matches_played DESC
  ),
  total AS (SELECT count(*)::int AS c FROM by_identity),
  paged AS (
    SELECT *
    FROM by_identity
    ORDER BY avg_rating DESC NULLS LAST, matches_played DESC, player_id ASC
    LIMIT GREATEST(p_page_size, 0)
    OFFSET GREATEST(p_page, 0) * GREATEST(p_page_size, 0)
  )
  SELECT jsonb_build_object(
    'count', (SELECT c FROM total),
    'players', COALESCE(
      (SELECT jsonb_agg(player_obj ORDER BY avg_rating DESC NULLS LAST, matches_played DESC, player_id ASC)
       FROM (
         SELECT
           avg_rating, matches_played, player_id,
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
             'league', CASE WHEN league_pk IS NULL THEN NULL ELSE jsonb_build_object(
               'id', league_pk, 'name', league_name, 'country', league_country,
               'tier', league_tier, 'season', league_season
             ) END,
             'season_scores', jsonb_build_array(jsonb_build_object(
               'player_id', player_id, 'season', season, 'position', position,
               'league_id', league_id, 'matches_played', matches_played,
               'avg_score', avg_score, 'avg_rating', avg_rating,
               'total_goals', total_goals, 'total_assists', total_assists,
               'percentile', percentile, 'global_percentile', global_percentile,
               'tackles_p90', tackles_p90, 'interceptions_p90', interceptions_p90,
               'blocks_p90', blocks_p90, 'duels_won_pct', duels_won_pct,
               'passes_accuracy', passes_accuracy, 'passes_key_p90', passes_key_p90,
               'passes_total_p90', passes_total_p90, 'dribbles_success_p90', dribbles_success_p90,
               'dribbles_pct', dribbles_pct, 'shots_on_p90', shots_on_p90,
               'shots_pct', shots_pct, 'goals_p90', goals_p90, 'assists_p90', assists_p90,
               'fouls_drawn_p90', fouls_drawn_p90, 'saves_p90', saves_p90,
               'goals_conceded_p90', goals_conceded_p90, 'penalty_saved_avg', penalty_saved_avg,
               'clean_sheet_pct', clean_sheet_pct
             )),
             'primary_score', avg_rating,
             'primary_percentile', percentile
           ) AS player_obj
         FROM paged
       ) sub),
      '[]'::jsonb)
  );
$$;


-- Rating reemplaza a Score GG: la forma reciente ahora promedia `rating`
-- crudo por partido en vez de `match_score` (que ya no se calcula), y
-- compara contra `avg_rating` de temporada en vez de `avg_score`.
CREATE OR REPLACE FUNCTION fetch_recent_form(
  p_window_months       int,
  p_min_matches         int    DEFAULT 3,
  p_fallback_months     int    DEFAULT 6,
  p_fallback_limit      int    DEFAULT 5,
  p_cheap_max_value     bigint DEFAULT NULL,
  p_contract_max_months int    DEFAULT NULL,
  p_positions           text[] DEFAULT NULL,
  p_limit               int    DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH scored AS (
    SELECT pms.player_id, pms.rating, f.date::date AS d
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    WHERE pms.rating IS NOT NULL
  ),
  window_agg AS (
    SELECT player_id, count(*) AS n, avg(rating) AS avg_rating,
           jsonb_agg(rating ORDER BY d) AS scores
    FROM scored
    WHERE d >= (now() - make_interval(months => p_window_months))::date
    GROUP BY player_id
  ),
  fb_ranked AS (
    SELECT player_id, rating, d,
           row_number() OVER (PARTITION BY player_id ORDER BY d DESC) AS rn
    FROM scored
    WHERE d >= (now() - make_interval(months => p_fallback_months))::date
  ),
  fb_agg AS (
    SELECT player_id, count(*) AS n, avg(rating) AS avg_rating,
           jsonb_agg(rating ORDER BY d) AS scores
    FROM fb_ranked
    WHERE rn <= p_fallback_limit
    GROUP BY player_id
  ),
  chosen AS (
    SELECT
      COALESCE(w.player_id, fb.player_id) AS player_id,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.n         ELSE fb.n END          AS n,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.avg_rating ELSE fb.avg_rating END AS avg_rating,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN w.scores    ELSE fb.scores END     AS scores,
      CASE WHEN COALESCE(w.n,0) >= p_min_matches THEN 'window'    ELSE 'fallback' END    AS window_used
    FROM window_agg w
    FULL OUTER JOIN fb_agg fb ON fb.player_id = w.player_id
  ),
  qualified AS (
    SELECT
      c.player_id, c.n, c.avg_rating, c.scores, c.window_used,
      pl.name, pl.photo, pl.birth_date, pl.primary_position,
      pl.market_value_eur, pl.contract_end_date, pl.current_team_id,
      tm.id AS team_id, tm.name AS team_name, tm.logo AS team_logo, tm.league_id AS team_league_id,
      lg.name AS league_name,
      pss.avg_rating AS primary_score
    FROM chosen c
    JOIN players pl ON pl.id = c.player_id
    LEFT JOIN teams tm ON tm.id = pl.current_team_id
    LEFT JOIN leagues lg ON lg.id = tm.league_id
    LEFT JOIN LATERAL (
      SELECT s.avg_rating
      FROM player_season_scores s
      WHERE s.player_id = c.player_id AND s.position = pl.primary_position
      ORDER BY s.season DESC, s.matches_played DESC
      LIMIT 1
    ) pss ON true
    WHERE c.n >= p_min_matches
      AND pl.id = COALESCE(pl.canonical_id, pl.id)  -- solo la fila oficial (20260923_d)
      AND (p_positions IS NULL OR pl.primary_position = ANY(p_positions))
      AND (
        (p_cheap_max_value IS NOT NULL AND pl.market_value_eur IS NOT NULL
           AND pl.market_value_eur <= p_cheap_max_value)
        OR
        (p_contract_max_months IS NOT NULL AND pl.contract_end_date IS NOT NULL
           AND pl.contract_end_date >= now()::date
           AND pl.contract_end_date <= (now() + make_interval(months => p_contract_max_months))::date)
      )
  )
  SELECT COALESCE(jsonb_agg(obj ORDER BY avg_rating DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', player_id, 'name', name, 'photo', photo, 'birth_date', birth_date,
      'primary_position', primary_position, 'market_value_eur', market_value_eur,
      'contract_end_date', contract_end_date, 'primary_score', primary_score,
      'recent_avg', round(avg_rating::numeric, 2), 'recent_matches', n,
      'recent_scores', scores, 'window_used', window_used,
      'on_the_rise', (primary_score IS NOT NULL AND avg_rating > primary_score),
      'league_name', league_name,
      'team', CASE WHEN team_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', team_id, 'name', team_name, 'logo', team_logo, 'league_id', team_league_id
      ) END
    ) AS obj, avg_rating
    FROM qualified
    ORDER BY avg_rating DESC
    LIMIT GREATEST(p_limit, 0)
  ) s;
$$;

GRANT EXECUTE ON FUNCTION fetch_recent_form(int, int, int, int, bigint, int, text[], int)
  TO anon, authenticated, service_role;
