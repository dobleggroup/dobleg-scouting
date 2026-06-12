-- Altas y bajas de jugadores Doble G hechas desde la app (overlay sobre BASE_AGENCY_PLAYERS).
CREATE TABLE IF NOT EXISTS agency_players (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('add', 'remove')),
  -- identidad (player_key = nombre normalizado NFD lower, sin acentos ni puntos)
  player_key    TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  short_name    TEXT,
  api_player_id INTEGER,
  supabase_player_id INTEGER REFERENCES players(id),
  -- datos de portfolio (para kind='add')
  image         TEXT,
  contract_end  TEXT,
  market_value  TEXT,
  team          TEXT,
  api_team_id   INTEGER,
  is_reserve    BOOLEAN NOT NULL DEFAULT false,
  -- auditoría
  added_by      UUID,
  added_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agency_players_kind ON agency_players(kind);
