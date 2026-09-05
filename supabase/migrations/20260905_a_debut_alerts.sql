-- Alertas de debutantes U20 en LATAM. Reusa el sync de fixtures/player_match_stats
-- ya existente (pg_cron cada hora/10min) -- esto solo suma 2 ligas nuevas, activa
-- estadisticas en 2 competencias continentales, y agrega la deteccion (pura SQL,
-- sin llamar a ninguna API). Ver docs/superpowers/specs/2026-09-05-alertas-debutantes-latam-design.md.

alter table public.leagues add column if not exists track_debuts boolean not null default false;

-- Ligas locales de LATAM ya trackeadas: se marcan para que cuenten como debut.
update public.leagues set track_debuts = true
where id in (128, 131, 344, 71, 265, 239, 242, 262, 252, 268);

-- Copa Libertadores / Sudamericana: ya existen en `leagues` pero sin estadisticas
-- de jugador activas -- se activan para que el sync de siempre empiece a traer
-- minutos jugados ahi tambien.
update public.leagues set has_player_stats = true, track_debuts = true
where id in (13, 11);

-- Peru y Venezuela: nuevas, confirmadas en API-Football con historial completo
-- desde 2023 (lineups + estadisticas de jugador).
insert into public.leagues (id, name, country, season, has_player_stats, track_debuts)
values
  (281, 'Primera Division', 'Peru', 2026, true, true),
  (299, 'Primera Division', 'Venezuela', 2026, true, true)
on conflict (id) do update set has_player_stats = true, track_debuts = true;

-- Sin este indice, detect_debut_alerts() hace un seq scan de player_match_stats
-- por cada fila candidata (el NOT EXISTS de "aparicion anterior") -- con el
-- historial completo cargado (14 competencias, varios anios) eso da timeout.
create index if not exists idx_pms_player_id_minutes
  on public.player_match_stats(player_id)
  where minutes > 0;

create table public.debut_alerts (
  player_id     integer primary key references public.players(id),
  fixture_id    integer not null references public.fixtures(id),
  league_id     integer not null references public.leagues(id),
  age_at_debut  integer not null,
  minutes       integer not null,
  debut_date    date not null,
  created_at    timestamptz not null default now()
);

alter table public.debut_alerts enable row level security;

create policy "read_debut_alerts" on public.debut_alerts
  for select to authenticated using (true);

create or replace function public.detect_debut_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.debut_alerts (player_id, fixture_id, league_id, age_at_debut, minutes, debut_date)
  select distinct on (pms.player_id)
    pms.player_id,
    pms.fixture_id,
    f.league_id,
    extract(year from age(f.date, p.birth_date))::int,
    pms.minutes,
    f.date::date
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
      select 1
      from public.player_match_stats pms2
      join public.fixtures f2 on f2.id = pms2.fixture_id
      join public.leagues l2 on l2.id = f2.league_id and l2.track_debuts
      where pms2.player_id = pms.player_id
        and pms2.minutes > 0
        and f2.date < f.date
    )
  order by pms.player_id, f.date asc
  on conflict (player_id) do nothing;
end;
$$;
