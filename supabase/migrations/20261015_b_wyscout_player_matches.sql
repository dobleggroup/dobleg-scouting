-- Rendimiento individual: estadísticas de Wyscout por partido de los jugadores
-- de la agencia, cargadas desde los Excel "Player stats <Jugador>.xlsx"
-- (página Carga de Wyscout). Reemplaza a la planilla de Google Sheets
-- `wyscoutEvolucion`, que ya no se usa.

create table if not exists public.wyscout_uploads (
  id bigserial primary key,
  club_id text not null default public.current_club_id(),
  player_key text not null,
  player_name text not null,
  file_name text,
  matches_new int not null default 0,
  matches_updated int not null default 0,
  date_from date,
  date_to date,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now()
);
create index if not exists wyscout_uploads_player_idx on public.wyscout_uploads (club_id, player_key, uploaded_at desc);

-- Una fila por jugador y partido. `stats` guarda TODAS las columnas del Excel
-- con su encabezado: "Pases / logrados" = intentos, "Pases / logrados|ok" = logrados.
create table if not exists public.wyscout_player_matches (
  id bigserial primary key,
  club_id text not null default public.current_club_id(),
  player_key text not null,
  player_name text not null,
  match_date date not null,
  match_label text not null,
  competition text,
  position text,
  minutes int not null default 0,
  stats jsonb not null default '{}'::jsonb,
  upload_id bigint references public.wyscout_uploads(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (club_id, player_key, match_date, match_label)
);
create index if not exists wyscout_matches_player_idx on public.wyscout_player_matches (club_id, player_key, match_date);
create index if not exists wyscout_matches_upload_idx on public.wyscout_player_matches (upload_id);

alter table public.wyscout_uploads enable row level security;
alter table public.wyscout_player_matches enable row level security;

drop policy if exists "read_wyscout_uploads" on public.wyscout_uploads;
create policy "read_wyscout_uploads" on public.wyscout_uploads for select to authenticated
  using (club_id = public.current_club_id());
drop policy if exists "write_wyscout_uploads" on public.wyscout_uploads;
create policy "write_wyscout_uploads" on public.wyscout_uploads for all to authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());

drop policy if exists "read_wyscout_player_matches" on public.wyscout_player_matches;
create policy "read_wyscout_player_matches" on public.wyscout_player_matches for select to authenticated
  using (club_id = public.current_club_id());
drop policy if exists "write_wyscout_player_matches" on public.wyscout_player_matches;
create policy "write_wyscout_player_matches" on public.wyscout_player_matches for all to authenticated
  using (club_id = public.current_club_id()) with check (club_id = public.current_club_id());

-- Sumas por jugador y mes (todas las columnas numéricas de `stats`), para que
-- Inicio y Rendimiento individual no tengan que bajar cada partido.
-- `p_player_key` null = todos los jugadores del club.
create or replace function public.wyscout_monthly(p_player_key text default null)
returns table (
  player_key text,
  player_name text,
  month date,
  matches int,
  minutes int,
  positions text[],
  competitions text[],
  sums jsonb
)
language sql stable security invoker set search_path = public as $$
  with m as (
    select * from wyscout_player_matches w
    where w.club_id = current_club_id()
      and (p_player_key is null or w.player_key = p_player_key)
  ), base as (
    select m.player_key, max(m.player_name) player_name, date_trunc('month', m.match_date)::date as month,
      count(*)::int matches, sum(m.minutes)::int minutes,
      array_agg(m.position order by m.match_date) filter (where m.position is not null) positions,
      array_agg(distinct m.competition) filter (where m.competition is not null) competitions
    from m group by 1, 3
  ), kv as (
    select m.player_key, date_trunc('month', m.match_date)::date as month, e.key, sum(e.value::numeric) as total
    from m, jsonb_each_text(m.stats) e
    where e.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    group by 1, 2, 3
  )
  select b.player_key, b.player_name, b.month, b.matches, b.minutes, b.positions, b.competitions,
    coalesce((select jsonb_object_agg(kv.key, kv.total) from kv
              where kv.player_key = b.player_key and kv.month = b.month), '{}'::jsonb)
  from base b
  order by b.player_key, b.month;
$$;

grant execute on function public.wyscout_monthly(text) to authenticated;
