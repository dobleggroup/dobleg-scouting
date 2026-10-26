-- Partidos que API-Football todavía no tiene con estadísticas de jugadores:
-- se cuenta cuántas veces se pidieron y cuándo fue la última, para espaciar
-- los reintentos (antes cada pasada volvía a pedir los mismos partidos vacíos
-- y se gastaban ~3.000 llamadas por día).
alter table public.fixtures
  add column if not exists stats_attempts integer not null default 0,
  add column if not exists stats_last_attempt_at timestamptz;

create index if not exists fixtures_stats_pending_idx
  on public.fixtures (date desc) where stats_synced = false;
