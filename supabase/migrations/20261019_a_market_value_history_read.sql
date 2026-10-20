-- Historial de valores de Transfermarkt (2026-10-19).
--
-- La tabla tenía RLS activado sin ninguna política: los usuarios de la app no
-- podían leerla (el gráfico de valor de la ficha y el Resumen del mes de
-- Rendimiento individual quedaban vacíos). Son valores públicos de
-- Transfermarkt: cualquier usuario logueado puede leerlos; escribir, sólo los
-- procesos con la service key.

ALTER TABLE public.market_value_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_value_history_read ON public.market_value_history;
CREATE POLICY market_value_history_read ON public.market_value_history
  FOR SELECT TO authenticated USING (true);
