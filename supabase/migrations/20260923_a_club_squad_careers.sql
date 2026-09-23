-- Surgidos del club (spec 2026-09-23): inicio del ciclo del DT + carrera enriquecida del plantel.

ALTER TABLE public.agency_coaches ADD COLUMN IF NOT EXISTS tenure_start DATE;
-- API-Football dice 2026-07-01, pero Domingo dirigió todos los partidos de 2026 (confirmado por el usuario).
UPDATE public.agency_coaches SET tenure_start = '2026-01-01' WHERE key = 'domingo' AND tenure_start IS NULL;

CREATE TABLE IF NOT EXISTS public.club_squad_careers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id TEXT NOT NULL DEFAULT public.current_club_id(),
  team_api_id INT NOT NULL,
  squad TEXT NOT NULL CHECK (squad = ANY (ARRAY['primera', 'reserva'])),
  tm_player_id INT NOT NULL,
  api_player_id INT,
  full_name TEXT NOT NULL,
  short_name TEXT,
  position TEXT,
  birth_date DATE,
  nationality TEXT,
  height_cm INT,
  foot TEXT,
  photo_url TEXT,
  market_value_eur INT,
  contract_until DATE,
  joined_at DATE,
  joined_from TEXT,
  youth_clubs TEXT[] NOT NULL DEFAULT '{}',
  first_pro_club_tm_id INT,
  first_pro_club_name TEXT,
  pro_debut_date DATE,
  pro_debut_club TEXT,
  pro_debut_club_tm_id INT,
  pro_debut_competition TEXT,
  pro_debut_opponent TEXT,
  pro_debut_coach TEXT,
  transfer_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  homegrown_auto BOOLEAN NOT NULL DEFAULT false,
  homegrown_reason TEXT,
  homegrown_override BOOLEAN,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, tm_player_id)
);

CREATE INDEX IF NOT EXISTS club_squad_careers_team_idx ON public.club_squad_careers(club_id, team_api_id);

ALTER TABLE public.club_squad_careers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_club_squad_careers" ON public.club_squad_careers;
CREATE POLICY "read_club_squad_careers" ON public.club_squad_careers
  FOR SELECT TO authenticated USING (club_id = public.current_club_id());
DROP POLICY IF EXISTS "write_club_squad_careers" ON public.club_squad_careers;
CREATE POLICY "write_club_squad_careers" ON public.club_squad_careers
  FOR ALL TO authenticated USING (club_id = public.current_club_id()) WITH CHECK (club_id = public.current_club_id());
