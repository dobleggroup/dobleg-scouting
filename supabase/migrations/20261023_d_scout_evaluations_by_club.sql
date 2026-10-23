-- Reportes separados por club, igual que scout_players. La tabla no tenía club
-- y la plataforma de Independiente comparte la base: sus 1.440 reportes del
-- "Cuerpo Técnico" aparecían en Doble G (Gestionar evaluaciones, fichas, etc.).
-- No se borra nada: cada club ve solo los suyos (current_club_id()).

ALTER TABLE public.scout_evaluations ADD COLUMN IF NOT EXISTS club_id text;

UPDATE public.scout_evaluations
SET club_id = CASE
  WHEN scout_name = 'Cuerpo Técnico' AND team = 'Independiente' THEN 'independiente'
  ELSE 'dobleg'
END
WHERE club_id IS NULL;

ALTER TABLE public.scout_evaluations ALTER COLUMN club_id SET DEFAULT current_club_id();
ALTER TABLE public.scout_evaluations ALTER COLUMN club_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS scout_evaluations_club_idx ON public.scout_evaluations (club_id);

DROP POLICY IF EXISTS "Anyone can read evaluations" ON public.scout_evaluations;
CREATE POLICY read_club_evaluations ON public.scout_evaluations
  FOR SELECT TO authenticated USING (club_id = current_club_id());

DROP POLICY IF EXISTS "Authenticated can insert evaluations" ON public.scout_evaluations;
CREATE POLICY insert_club_evaluations ON public.scout_evaluations
  FOR INSERT TO authenticated WITH CHECK (club_id = current_club_id());

DROP POLICY IF EXISTS "Users can update own evaluations" ON public.scout_evaluations;
CREATE POLICY update_club_evaluations ON public.scout_evaluations
  FOR UPDATE TO authenticated
  USING (club_id = current_club_id()
         AND (auth.jwt() ->> 'email') = ANY (ARRAY['marcoscucho99@gmail.com', 'matiassebastianroberti@gmail.com']))
  WITH CHECK (club_id = current_club_id()
         AND (auth.jwt() ->> 'email') = ANY (ARRAY['marcoscucho99@gmail.com', 'matiassebastianroberti@gmail.com']));
