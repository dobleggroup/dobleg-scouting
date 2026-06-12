-- Próximos partidos cargados a mano para jugadores Doble G sin datos en API-Football.
CREATE TABLE IF NOT EXISTS agency_manual_fixtures (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_key    TEXT NOT NULL,
  player_name   TEXT NOT NULL,
  match_date    DATE NOT NULL,
  opponent      TEXT NOT NULL,
  is_home       BOOLEAN NOT NULL DEFAULT true,
  competition   TEXT,
  venue         TEXT,
  added_by      UUID,
  added_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_manual_fixtures_key ON agency_manual_fixtures(player_key);
