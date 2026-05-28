CREATE TABLE IF NOT EXISTS market_value_history (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  value_eur INTEGER NOT NULL,
  club_name TEXT,
  UNIQUE(player_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_mvh_player ON market_value_history(player_id);
CREATE INDEX IF NOT EXISTS idx_mvh_date ON market_value_history(recorded_at);
