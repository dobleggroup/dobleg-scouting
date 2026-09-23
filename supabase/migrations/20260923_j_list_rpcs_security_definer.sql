-- fetch_recent_form y fetch_players_list solo leen tablas de lectura pública (políticas
-- `read_* USING (true)` en players, player_match_stats, player_season_scores, fixtures,
-- teams, leagues). Aun así, al correr como anon/authenticated Postgres aplica RLS y trata
-- las consultas como barrera de seguridad, lo que le impide empujar filtros y elegir buenos
-- planes: medido 2026-09-23, fetch_recent_form = 0,4 s como dueño vs 2,0 s como anon (3,5 s
-- por HTTP; 9-13 s en el Inicio con 4 llamadas juntas).
-- SECURITY DEFINER las corre como su dueño: mismos datos visibles (todo era público), plan
-- bueno. search_path fijo para que no se pueda secuestrar la resolución de nombres.
ALTER FUNCTION public.fetch_recent_form(int, int, int, int, bigint, int, text[], int)
  SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.fetch_players_list(int[], text[], int, int, numeric, int, int, int, bigint, bigint, int, text[], text, int, int)
  SECURITY DEFINER SET search_path = public;
