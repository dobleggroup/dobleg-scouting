-- Videos de YouTube por jugador interno (cargados desde la app). Read-side de la
-- ficha y de la lista de internos. Identidad = player_key (= agencyKey del nombre).
CREATE TABLE IF NOT EXISTS player_videos (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_key    TEXT NOT NULL,
  youtube_url   TEXT NOT NULL,
  video_id      TEXT,
  title         TEXT,
  upload_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  material_date DATE,
  added_by      UUID,
  added_by_name TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_videos_player_key ON player_videos(player_key);

-- RLS: lectura pública + escritura para authenticated (igual que agency_players)
ALTER TABLE public.player_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_player_videos" ON public.player_videos;
CREATE POLICY "read_player_videos" ON public.player_videos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "write_player_videos" ON public.player_videos;
CREATE POLICY "write_player_videos" ON public.player_videos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
