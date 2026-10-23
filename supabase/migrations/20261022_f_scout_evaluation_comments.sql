-- Reporte: un comentario por cada valoración (partido, táctica, mental, física).
-- El puntaje físico ya existía (physical_score); el comentario general (notes)
-- queda para los reportes viejos.
ALTER TABLE public.scout_evaluations
  ADD COLUMN IF NOT EXISTS match_comment text,
  ADD COLUMN IF NOT EXISTS tactical_comment text,
  ADD COLUMN IF NOT EXISTS mental_comment text,
  ADD COLUMN IF NOT EXISTS physical_comment text;

NOTIFY pgrst, 'reload schema';
