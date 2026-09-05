-- Fixes de la revision final de "Alertas de Debutantes U20 LATAM":
--
-- 1) Seguridad (Critical): detect_debut_alerts() es SECURITY DEFINER y quedo
--    con EXECUTE publico -- cualquiera con la anon key podia dispararla sin
--    login, incluida la query que ya sabemos que puede dar timeout con el
--    historial completo. Se revoca.
--
-- 2) "Primera vez en su vida" (Important): el chequeo de aparicion anterior
--    filtraba SOLO por las 14 competencias trackeadas -- un jugador que ya
--    jugo en una liga no trackeada (ej. Europa) y despues debuta en una
--    trackeada quedaba marcado como "debutante". Se saca ese filtro: CUALQUIER
--    aparicion anterior conocida descalifica, sin importar la competencia.
--
-- 3) Guarda contra backfill a medio terminar (Important): si la liga del
--    candidato todavia tiene fixtures mas viejos sin sincronizar, no se
--    declara debut todavia (podria aparecer una aparicion anterior real
--    cuando termine de sincronizarse) -- exactamente el riesgo que se manejo
--    a mano con Peru/Venezuela durante este mismo plan.
--
-- 4) Zona horaria (Important): `f.date::date` truncaba partidos nocturnos de
--    LATAM al dia siguiente (UTC). Se ajusta a hora de Argentina como ancla
--    razonable para toda la region (no es perfecto para Mexico/Brasil, pero
--    corrige la gran mayoria de los casos frente a usar UTC crudo).
--
-- 5) Club al momento del debut (Important): se guarda team_id del partido de
--    debut, en vez de resolver el club ACTUAL del jugador en el frontend
--    (que puede ya haber cambiado de club).
--
-- 6) Observabilidad (Minor): la funcion no devolvia nada, asi que el cron
--    diario mostraba "succeeded" sin importar cuantas filas inserto. Ahora
--    devuelve la cantidad y la deja en sync_log (tabla ya existente).

alter table public.debut_alerts add column if not exists team_id integer references public.teams(id);

create or replace function public.detect_debut_alerts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.debut_alerts (player_id, fixture_id, league_id, team_id, age_at_debut, minutes, debut_date)
  select distinct on (pms.player_id)
    pms.player_id,
    pms.fixture_id,
    f.league_id,
    pms.team_id,
    extract(year from age(f.date, p.birth_date))::int,
    pms.minutes,
    (f.date at time zone 'America/Argentina/Buenos_Aires')::date
  from public.player_match_stats pms
  join public.fixtures f on f.id = pms.fixture_id
  join public.leagues l on l.id = f.league_id and l.track_debuts
  join public.players p on p.id = pms.player_id and p.birth_date is not null
  where pms.minutes > 0
    and extract(year from age(f.date, p.birth_date)) <= 20
    and not exists (
      select 1 from public.debut_alerts da where da.player_id = pms.player_id
    )
    and not exists (
      -- Cualquier aparicion anterior CONOCIDA descalifica, sin importar si
      -- esa competencia esta en track_debuts -- el objetivo es "primera vez
      -- en su vida", no "primera vez en las 14 que miramos nosotros".
      select 1
      from public.player_match_stats pms2
      join public.fixtures f2 on f2.id = pms2.fixture_id
      where pms2.player_id = pms.player_id
        and pms2.minutes > 0
        and f2.date < f.date
    )
    and not exists (
      -- Si la MISMA liga del candidato todavia tiene fixtures mas viejos sin
      -- sincronizar, esperamos -- podrian revelar una aparicion anterior real.
      select 1
      from public.fixtures f3
      where f3.league_id = f.league_id
        and f3.stats_synced = false
        and f3.date < f.date
    )
  order by pms.player_id, f.date asc, f.id asc
  on conflict (player_id) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.sync_log (function_name, status, fixtures_processed)
  values ('detect_debut_alerts', 'success', inserted_count);

  return inserted_count;
end;
$$;

revoke execute on function public.detect_debut_alerts() from public, anon, authenticated;
