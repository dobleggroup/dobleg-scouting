-- supabase/migrations/20260906_coach_wyscout_reports.sql

CREATE TABLE IF NOT EXISTS public.coach_wyscout_reports (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  coach_key      TEXT NOT NULL,
  match_window   INT NOT NULL,
  data           JSONB NOT NULL,
  warnings       JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file    TEXT,
  storage_path   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cwr_coach ON public.coach_wyscout_reports(coach_key, created_at DESC);

ALTER TABLE public.coach_wyscout_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_cwr" ON public.coach_wyscout_reports;
CREATE POLICY "read_cwr" ON public.coach_wyscout_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS "write_cwr" ON public.coach_wyscout_reports;
CREATE POLICY "write_cwr" ON public.coach_wyscout_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket de Storage para el PDF original, publico (mismo modelo que coach-video-analysis):
-- la ruta de cada objeto incluye coachKey/reportId, no es adivinable ni listable sin
-- conocer esos ids.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('coach-wyscout-reports', 'coach-wyscout-reports', true, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 20971520, allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "coach_wyscout_reports_insert" ON storage.objects;
CREATE POLICY "coach_wyscout_reports_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'coach-wyscout-reports');

DROP POLICY IF EXISTS "coach_wyscout_reports_update" ON storage.objects;
CREATE POLICY "coach_wyscout_reports_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'coach-wyscout-reports')
  WITH CHECK (bucket_id = 'coach-wyscout-reports');

DROP POLICY IF EXISTS "coach_wyscout_reports_read" ON storage.objects;
CREATE POLICY "coach_wyscout_reports_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'coach-wyscout-reports');

DROP POLICY IF EXISTS "coach_wyscout_reports_delete" ON storage.objects;
CREATE POLICY "coach_wyscout_reports_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'coach-wyscout-reports');
