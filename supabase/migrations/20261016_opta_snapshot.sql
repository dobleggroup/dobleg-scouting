-- Test Opta (Scout Externo): foto de la Liga Profesional 2026 bajada de la API de
-- Opta (Stats Perform) durante la prueba gratuita (16-30/10/2026). La escribe
-- scripts/opta/sync-opta.mjs con la service key; la app solo la lee. Guardarla acá
-- (y no pedirla en vivo) hace que la página cargue rápido y siga funcionando
-- cuando termine la prueba.
--
-- Una fila por bloque de datos: 'meta', 'teams', 'players', 'matches', 'shots',
-- 'heatmaps', 'matchlog'. Los datos de Opta son confidenciales por contrato: solo
-- usuarios logueados.

create table if not exists public.opta_snapshot (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.opta_snapshot enable row level security;

drop policy if exists "read_opta_snapshot" on public.opta_snapshot;
create policy "read_opta_snapshot" on public.opta_snapshot for select to authenticated
  using (true);
