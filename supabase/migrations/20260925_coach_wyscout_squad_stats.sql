-- supabase/migrations/20260925_coach_wyscout_squad_stats.sql
-- Archivo de jugadores de Wyscout ("Search results") que se carga en el Resumen del DT.
-- El ultimo subido por coach_key es el vigente; los anteriores quedan de historial.

CREATE TABLE IF NOT EXISTS public.coach_wyscout_squad_stats (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_key   TEXT NOT NULL,
  data        JSONB NOT NULL,
  source_file TEXT,
  uploaded_by UUID DEFAULT auth.uid(),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cwss_coach ON public.coach_wyscout_squad_stats(coach_key, uploaded_at DESC);

ALTER TABLE public.coach_wyscout_squad_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_cwss" ON public.coach_wyscout_squad_stats;
CREATE POLICY "read_cwss" ON public.coach_wyscout_squad_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "write_cwss" ON public.coach_wyscout_squad_stats;
CREATE POLICY "write_cwss" ON public.coach_wyscout_squad_stats FOR INSERT TO authenticated WITH CHECK (true);
