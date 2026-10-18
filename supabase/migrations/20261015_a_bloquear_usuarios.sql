-- Usuarios dados de baja por la agencia (2026-10-15): Bruno Ocaña y
-- Juan Manuel Sanchez Miño. Se borra todo lo suyo y se bloquea el mail para
-- que no puedan volver a crear cuenta (ni con Google) ni recibir acceso.

create table if not exists public.blocked_emails (
  email text primary key check (email = lower(email)),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.blocked_emails enable row level security;
-- Sin políticas: sólo la base (service role / funciones) la lee.

insert into public.blocked_emails (email, reason) values
  ('brunooca00@gmail.com', 'Bruno Ocaña - baja 2026-10-15'),
  ('juanmsanchezmino@gmail.com', 'Juan Manuel Sanchez Miño - baja 2026-10-15')
on conflict (email) do nothing;

-- Rechaza el alta (o el cambio de mail) en auth.users de un mail bloqueado.
create or replace function public.reject_blocked_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and exists (select 1 from public.blocked_emails b where b.email = lower(new.email)) then
    raise exception 'Este usuario no tiene acceso a la plataforma.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists reject_blocked_email on auth.users;
create trigger reject_blocked_email
  before insert or update of email on auth.users
  for each row execute function public.reject_blocked_email();

-- Y por las dudas, nunca darles perfil (acceso) aunque exista la cuenta.
create or replace function public.reject_blocked_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from auth.users u join public.blocked_emails b on b.email = lower(u.email)
    where u.id = new.user_id
  ) then
    raise exception 'Este usuario no tiene acceso a la plataforma.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists reject_blocked_profile on public.user_profiles;
create trigger reject_blocked_profile
  before insert or update of user_id on public.user_profiles
  for each row execute function public.reject_blocked_profile();

-- Borrado de lo suyo.
delete from public.formations where created_by = '27432123-607c-4a04-b32f-d896160e0591';
delete from public.market_team_members where id in (12, 15)
  and name in ('Juan Sanchez Miño', 'Bruno Ocaña');
delete from public.user_profiles where user_id in
  ('d80e1d1a-5519-4724-9858-07a79b1f9ffa', '27432123-607c-4a04-b32f-d896160e0591');
delete from auth.users where id in
  ('d80e1d1a-5519-4724-9858-07a79b1f9ffa', '27432123-607c-4a04-b32f-d896160e0591');
