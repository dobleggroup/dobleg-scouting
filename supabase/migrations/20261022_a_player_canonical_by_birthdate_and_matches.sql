-- Fila oficial por futbolista: agrupar gemelos aunque falte el transfermarkt_id (2026-10-22).
--
-- Problema 1 (duplicados): 20260923_d sólo agrupaba filas con transfermarkt_id. Las filas
-- nuevas (sobre todo de Sofascore) llegan sin él hasta que corre el enriquecimiento, y en
-- ese rato el mismo jugador salía dos veces en Scouting Externo (caso real: Mateo Peresutti,
-- Unión). Medido hoy: ~20 personas repetidas en la lista (Lucas Acosta y Gaitán en Aldosivi,
-- Renato Marques en Coritiba, Pacha en Racing, Rick en Talleres, ...).
--
-- Problema 2 (fusiones falsas): con fecha de nacimiento vacía en ambas filas, el mismo
-- transfermarkt_id alcanzaba para fusionar — pero el enriquecimiento de Transfermarkt asigna
-- por nombre y a veces le pone el mismo id a homónimos: 5 "Lucas Rodríguez" de 5 clubes
-- distintos eran "uno solo", "Mater Salem Alhosani" = "Abdulla Najy Alhosani", etc.
-- (11 grupos, 29 filas). fetch_players_list además re-agrupaba por transfermarkt_id.
--
-- Regla nueva — dos filas son el mismo futbolista si NO se contradicen (dos transfermarkt_id
-- distintos o dos fechas de nacimiento distintas = personas distintas; así siguen separados
-- los mellizos Funes Mori) y además:
--   a. mismo transfermarkt_id y misma fecha de nacimiento (lo de antes, pero con fecha), o
--   b. mismo nombre (o misma "Inicial. Apellido") y misma fecha de nacimiento, salvo que esa
--      combinación tenga 2+ transfermarkt_id distintos (ambiguo: no se adivina), o
--   c. mismo nombre y jugaron los mismos partidos: misma hora de inicio (±30 min) y mismo
--      resultado en 2+ partidos y en al menos el 75% de los partidos del período que tienen
--      en común. Cubre gemelos sin fecha de nacimiento ni transfermarkt (Rick, Ricardinho,
--      Pacha). Con sólo "mismo día" había coincidencias entre ligas (un E. Fernández del
--      Leverkusen con uno de Gimnasia de Mendoza).
--   d. mismo nombre completo, mismo club (club_name_key + mismo país) y nunca jugaron a la
--      vez. Para gemelos sin partidos en común (una fila sólo con copas y otra sólo con liga,
--      o una que dejó de sincronizarse antes de que empezara la otra).
-- Los grupos son componentes conexas de esos pares. El orden de preferencia dentro del grupo
-- no cambia (ver 20260923_d).

CREATE OR REPLACE FUNCTION public.player_name_key(n text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(trim(regexp_replace(
    translate(lower(coalesce(n, '')),
      U&'\00E1\00E0\00E2\00E4\00E3\00E5\00E9\00E8\00EA\00EB\00ED\00EC\00EE\00EF\00F3\00F2\00F4\00F6\00F5\00F8\00FA\00F9\00FB\00FC\00F1\00E7\00FD\00FF',
      'aaaaaaeeeeiiiioooooouuuuncyy'),
    '[^a-z ]', ' ', 'g')), '\s+', ' ', 'g')
$$;

-- Nombre de club comparable entre proveedores: sin acentos, sin "Club"/"CA"/"FC"..., sin
-- artículos ni letras sueltas ("San Martin S.J." -> "san martin"). Dos clubes son el mismo si
-- las claves son iguales o una es la otra más palabras al final (misma regla que sameClub en
-- playerStatsService.ts: "juventud" = "juventud piedras", "talleres" = "talleres cordoba").
CREATE OR REPLACE FUNCTION public.club_name_key(n text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(trim(regexp_replace(player_name_key(n),
    '\m(club|ca|cd|cf|ac|sd|csd|cs|fc|sc|de|del|la|las|los|el|[a-z])\M', ' ', 'g')), '\s+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.recompute_player_canonical_ids()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed integer;
  latest_season integer;
BEGIN
  SELECT max(season) INTO latest_season FROM player_season_scores WHERE avg_rating IS NOT NULL;

  CREATE TEMP TABLE _pk ON COMMIT DROP AS
    SELECT id, transfermarkt_id AS tm, birth_date AS bd, player_name_key(name) AS nk
    FROM players;
  DELETE FROM _pk WHERE nk = '';
  ALTER TABLE _pk ADD COLUMN ik text;
  UPDATE _pk SET ik = left(nk, 1) || ' ' || split_part(nk, ' ', array_length(string_to_array(nk, ' '), 1));
  CREATE INDEX ON _pk (nk);
  CREATE INDEX ON _pk (ik, bd);
  CREATE INDEX ON _pk (tm, bd);
  ANALYZE _pk;

  -- (ik, bd) con 2+ transfermarkt_id distintos: homónimos nacidos el mismo día, no se unen por (b).
  CREATE TEMP TABLE _ambiguous ON COMMIT DROP AS
    SELECT ik, bd FROM _pk WHERE bd IS NOT NULL AND tm IS NOT NULL
    GROUP BY ik, bd HAVING count(DISTINCT tm) > 1;

  CREATE TEMP TABLE _edges (a integer, b integer) ON COMMIT DROP;

  -- (a) mismo transfermarkt_id + misma fecha de nacimiento
  INSERT INTO _edges
    SELECT x.id, y.id FROM _pk x JOIN _pk y ON y.tm = x.tm AND y.bd = x.bd AND y.id > x.id;

  -- (b) mismo nombre o "Inicial. Apellido" + misma fecha de nacimiento, sin contradicción
  INSERT INTO _edges
    SELECT x.id, y.id FROM _pk x JOIN _pk y ON y.ik = x.ik AND y.bd = x.bd AND y.id > x.id
    WHERE (x.tm IS NULL OR y.tm IS NULL OR x.tm = y.tm)
      AND (x.nk = y.nk OR x.nk ~ '^[a-z] ' OR y.nk ~ '^[a-z] ' OR left(x.nk, 3) = left(y.nk, 3))
      AND NOT EXISTS (SELECT 1 FROM _ambiguous am WHERE am.ik = x.ik AND am.bd = x.bd);

  -- (c) mismo nombre + mismos partidos, sin contradicción
  CREATE TEMP TABLE _cand ON COMMIT DROP AS
    SELECT x.id AS a, y.id AS b FROM _pk x JOIN _pk y ON y.nk = x.nk AND y.id > x.id
    WHERE (x.tm IS NULL OR y.tm IS NULL OR x.tm = y.tm)
      AND (x.bd IS NULL OR y.bd IS NULL OR x.bd = y.bd);
  DELETE FROM _cand c USING _edges e WHERE e.a = c.a AND e.b = c.b;

  CREATE TEMP TABLE _m ON COMMIT DROP AS
    SELECT pm.player_id, f.date AS ts,
           CASE WHEN pm.team_id = f.home_team_id THEN f.score_home ELSE f.score_away END AS gf,
           CASE WHEN pm.team_id = f.home_team_id THEN f.score_away ELSE f.score_home END AS ga
    FROM player_match_stats pm
    JOIN fixtures f ON f.id = pm.fixture_id
    WHERE pm.player_id IN (SELECT a FROM _cand UNION SELECT b FROM _cand);
  CREATE INDEX ON _m (player_id, ts);
  ANALYZE _m;

  INSERT INTO _edges
    SELECT c.a, c.b
    FROM _cand c
    JOIN LATERAL (
      SELECT greatest(min(ts) FILTER (WHERE player_id = c.a), min(ts) FILTER (WHERE player_id = c.b)) AS lo,
             least(max(ts) FILTER (WHERE player_id = c.a), max(ts) FILTER (WHERE player_id = c.b)) AS hi
      FROM _m WHERE player_id IN (c.a, c.b)
    ) span ON span.lo <= span.hi
    JOIN LATERAL (
      SELECT count(*) AS n FROM _m ma
      JOIN _m mb ON mb.player_id = c.b AND mb.gf = ma.gf AND mb.ga = ma.ga
        AND mb.ts BETWEEN ma.ts - interval '30 minutes' AND ma.ts + interval '30 minutes'
      WHERE ma.player_id = c.a
    ) shared ON shared.n >= 2
    JOIN LATERAL (
      SELECT count(*) FILTER (WHERE player_id = c.a) AS na, count(*) FILTER (WHERE player_id = c.b) AS nb
      FROM _m WHERE player_id IN (c.a, c.b) AND ts BETWEEN span.lo AND span.hi
    ) ov ON shared.n >= 0.75 * least(ov.na, ov.nb);

  -- (d) mismo nombre completo + mismo club + nunca jugaron "a la vez" (dos partidos distintos
  -- con menos de 36 h entre sí = dos personas). Cubre gemelos sin partidos en común: una fila
  -- con sólo copas y la otra con sólo liga (Juventud / Juventud de Las Piedras), una que dejó
  -- de sincronizarse antes de que empezara la otra (Juan Morán, Godoy Cruz), o dos filas del
  -- mismo proveedor (Aponza Mina, Deportivo Cali).
  CREATE TEMP TABLE _pt ON COMMIT DROP AS
    SELECT DISTINCT x.id, club_name_key(t.name) AS ck,
           -- País del club (como sameClub: "Nacional" UY no es "Nacional Asunción" PY). Las
           -- ligas continentales no dicen el país: valen como comodín.
           CASE WHEN lg.country IN ('World', 'Europe', 'South America', 'North America', 'Asia', 'Africa', 'Oceania')
                THEN NULL ELSE lg.country END AS country
    FROM (SELECT a AS id FROM _cand UNION SELECT b FROM _cand) x
    JOIN players p ON p.id = x.id
    JOIN LATERAL (
      SELECT p.current_team_id AS tid
      UNION SELECT DISTINCT team_id FROM player_match_stats WHERE player_id = x.id
    ) tt ON true
    JOIN teams t ON t.id = tt.tid
    LEFT JOIN leagues lg ON lg.id = t.league_id;
  DELETE FROM _pt WHERE ck = '';
  CREATE INDEX ON _pt (id);

  INSERT INTO _edges
    SELECT c.a, c.b
    FROM _cand c
    JOIN _pk x ON x.id = c.a
    JOIN players pa ON pa.id = c.a
    JOIN players pb ON pb.id = c.b
    -- Nombre con inicial ("D. Meza Montiel"): sólo dentro del mismo proveedor y mismo club.
    WHERE (x.nk ~ '^[a-z]{2,} [a-z]'
           OR ((c.a < 20000000) = (c.b < 20000000) AND pa.current_team_id = pb.current_team_id))
      AND EXISTS (
        SELECT 1 FROM _pt ta JOIN _pt tb ON tb.id = c.b
          AND (ta.ck = tb.ck OR ta.ck LIKE tb.ck || ' %' OR tb.ck LIKE ta.ck || ' %')
          AND (ta.country IS NULL OR tb.country IS NULL OR ta.country = tb.country)
        WHERE ta.id = c.a)
      AND NOT EXISTS (
        SELECT 1 FROM _m ma
        JOIN _m mb ON mb.player_id = c.b
          AND mb.ts BETWEEN ma.ts - interval '36 hours' AND ma.ts + interval '36 hours'
        WHERE ma.player_id = c.a
          AND ((c.a < 20000000) = (c.b < 20000000)
               OR NOT (abs(extract(epoch FROM mb.ts - ma.ts)) <= 1800 AND mb.gf = ma.gf AND mb.ga = ma.ga)));

  -- Componentes conexas: cada fila toma la menor etiqueta de sus vecinos hasta estabilizar.
  CREATE TEMP TABLE _adj ON COMMIT DROP AS
    SELECT a AS id, b AS nb FROM _edges UNION SELECT b, a FROM _edges;
  CREATE INDEX ON _adj (id);
  CREATE TEMP TABLE _lbl ON COMMIT DROP AS SELECT DISTINCT id, id AS lbl FROM _adj;
  CREATE UNIQUE INDEX ON _lbl (id);
  LOOP
    UPDATE _lbl l SET lbl = s.m
    FROM (SELECT j.id, min(n.lbl) AS m FROM _adj j JOIN _lbl n ON n.id = j.nb GROUP BY j.id) s
    WHERE s.id = l.id AND s.m < l.lbl;
    EXIT WHEN NOT FOUND;
  END LOOP;

  WITH grp AS (
    SELECT p.id AS player_id,
           COALESCE('g' || l.lbl, 'p' || p.id) AS gkey,
           p.current_team_id
    FROM players p
    LEFT JOIN _lbl l ON l.id = p.id
  ),
  last_match AS (
    SELECT DISTINCT ON (m.player_id) m.player_id, f.date AS last_date, m.team_id AS last_team
    FROM player_match_stats m
    JOIN fixtures f ON f.id = m.fixture_id
    WHERE m.player_id IN (SELECT id FROM _lbl)
    ORDER BY m.player_id, f.date DESC
  ),
  season_mp AS (
    SELECT player_id, sum(matches_played) AS mp, bool_or(avg_rating IS NOT NULL) AS has_rating
    FROM player_season_scores
    WHERE season = latest_season
    GROUP BY player_id
  ),
  ranked AS (
    SELECT g.player_id,
           CASE WHEN g.gkey LIKE 'g%' THEN
             first_value(g.player_id) OVER (
               PARTITION BY g.gkey
               ORDER BY COALESCE(sm.has_rating, false) DESC,
                        lm.last_date DESC NULLS LAST,
                        (g.current_team_id IS NOT DISTINCT FROM lm.last_team) DESC,
                        COALESCE(sm.mp, 0) DESC,
                        (g.player_id < 20000000) DESC,
                        g.player_id
             )
           ELSE g.player_id END AS canonical
    FROM grp g
    LEFT JOIN last_match lm ON lm.player_id = g.player_id
    LEFT JOIN season_mp sm ON sm.player_id = g.player_id
  )
  UPDATE players p
  SET canonical_id = r.canonical
  FROM ranked r
  WHERE r.player_id = p.id
    AND p.canonical_id IS DISTINCT FROM r.canonical;

  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;
