-- Rendimiento individual tardaba ~12 s en aparecer: `wyscout_monthly` sumaba
-- todos los partidos de todos los jugadores en cada pedido. Ahora las sumas por
-- jugador y mes quedan guardadas en `wyscout_monthly_sums` y se recalculan solas
-- (sólo las del jugador tocado) cada vez que se carga, cambia o borra un partido.

create table if not exists public.wyscout_monthly_sums (
  club_id text not null,
  player_key text not null,
  player_name text not null,
  month date not null,
  matches int not null,
  minutes int not null,
  positions text[],
  competitions text[],
  sums jsonb not null default '{}'::jsonb,
  primary key (club_id, player_key, month)
);

alter table public.wyscout_monthly_sums enable row level security;
drop policy if exists "read_wyscout_monthly_sums" on public.wyscout_monthly_sums;
create policy "read_wyscout_monthly_sums" on public.wyscout_monthly_sums for select to authenticated
  using (club_id = public.current_club_id());

-- Recalcula las sumas de un jugador (todas sus filas de meses).
create or replace function public.wyscout_refresh_monthly(p_club_id text, p_player_key text)
returns void
language sql security definer set search_path = public as $$
  delete from wyscout_monthly_sums where club_id = p_club_id and player_key = p_player_key;
  with m as (
    select * from wyscout_player_matches w
    where w.club_id = p_club_id and w.player_key = p_player_key
  ), base as (
    select max(m.player_name) player_name, date_trunc('month', m.match_date)::date as month,
      count(*)::int matches, sum(m.minutes)::int minutes,
      array_agg(m.position order by m.match_date) filter (where m.position is not null) positions,
      array_agg(distinct m.competition) filter (where m.competition is not null) competitions
    from m group by 2
  ), kv as (
    select date_trunc('month', m.match_date)::date as month, e.key, sum(e.value::numeric) as total
    from m, jsonb_each_text(m.stats) e
    where e.value ~ '^-?[0-9]+(\.[0-9]+)?$'
    group by 1, 2
  ), agg as (
    select month, jsonb_object_agg(key, total) sums from kv group by month
  )
  insert into wyscout_monthly_sums (club_id, player_key, player_name, month, matches, minutes, positions, competitions, sums)
  select p_club_id, p_player_key, b.player_name, b.month, b.matches, b.minutes, b.positions, b.competitions,
    coalesce(a.sums, '{}'::jsonb)
  from base b left join agg a on a.month = b.month;
$$;

revoke all on function public.wyscout_refresh_monthly(text, text) from public, anon, authenticated;

create or replace function public.wyscout_matches_changed()
returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    for r in select distinct club_id, player_key from new_rows loop
      perform wyscout_refresh_monthly(r.club_id, r.player_key);
    end loop;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    for r in select distinct o.club_id, o.player_key from old_rows o
             where tg_op = 'DELETE' or not exists (select 1 from new_rows n where n.club_id = o.club_id and n.player_key = o.player_key) loop
      perform wyscout_refresh_monthly(r.club_id, r.player_key);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists wyscout_matches_ins on public.wyscout_player_matches;
drop trigger if exists wyscout_matches_upd on public.wyscout_player_matches;
drop trigger if exists wyscout_matches_del on public.wyscout_player_matches;
create trigger wyscout_matches_ins after insert on public.wyscout_player_matches
  referencing new table as new_rows for each statement execute function public.wyscout_matches_changed();
create trigger wyscout_matches_upd after update on public.wyscout_player_matches
  referencing old table as old_rows new table as new_rows for each statement execute function public.wyscout_matches_changed();
create trigger wyscout_matches_del after delete on public.wyscout_player_matches
  referencing old table as old_rows for each statement execute function public.wyscout_matches_changed();

-- Misma firma y mismas columnas que antes: la app no cambia de contrato.
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
  select s.player_key, s.player_name, s.month, s.matches, s.minutes, s.positions, s.competitions, s.sums
  from wyscout_monthly_sums s
  where s.club_id = current_club_id()
    and (p_player_key is null or s.player_key = p_player_key)
  order by s.player_key, s.month;
$$;

grant execute on function public.wyscout_monthly(text) to authenticated;

-- Carga inicial con lo que ya está subido.
do $$
declare r record;
begin
  for r in select distinct club_id, player_key from public.wyscout_player_matches loop
    perform public.wyscout_refresh_monthly(r.club_id, r.player_key);
  end loop;
end $$;
