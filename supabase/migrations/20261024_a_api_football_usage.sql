-- Consultas a API-Football por proceso y por día (2026-10-24). El cupo diario
-- (7.500) lo comparten otras plataformas y el 23 y 24/10 pasó el 80 % a media
-- tarde: hasta ahora no se sabía cuánto era nuestro. Cada consulta de las
-- funciones (_shared/api-football.ts) suma acá; el aviso de cupo
-- (check-api-quota) muestra cuánto fue nuestro y cuánto del resto.
-- El día es el de API-Football: el cupo vuelve a cero a las 00:00 UTC.

CREATE TABLE IF NOT EXISTS public.api_football_usage (
  day date NOT NULL,
  source text NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, source)
);
ALTER TABLE public.api_football_usage ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_api_football_usage(p_source text, p_calls integer DEFAULT 1)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO api_football_usage (day, source, calls)
  VALUES ((now() AT TIME ZONE 'UTC')::date, p_source, p_calls)
  ON CONFLICT (day, source) DO UPDATE
    SET calls = api_football_usage.calls + EXCLUDED.calls, updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.bump_api_football_usage(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_api_football_usage(text, integer) TO service_role;
