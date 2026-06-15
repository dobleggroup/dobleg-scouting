-- RLS para las tablas de overlay de la agencia (altas/bajas y partidos manuales).
-- Se escriben desde la app por usuarios autenticados: lectura pública + escritura
-- para `authenticated`. (El 403 venía de tener RLS sin política de escritura.)

-- ── agency_players ────────────────────────────────────────────────────────────
ALTER TABLE public.agency_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_agency_players" ON public.agency_players;
CREATE POLICY "read_agency_players" ON public.agency_players
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "write_agency_players" ON public.agency_players;
CREATE POLICY "write_agency_players" ON public.agency_players
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── agency_manual_fixtures ────────────────────────────────────────────────────
ALTER TABLE public.agency_manual_fixtures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_agency_manual_fixtures" ON public.agency_manual_fixtures;
CREATE POLICY "read_agency_manual_fixtures" ON public.agency_manual_fixtures
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "write_agency_manual_fixtures" ON public.agency_manual_fixtures;
CREATE POLICY "write_agency_manual_fixtures" ON public.agency_manual_fixtures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
