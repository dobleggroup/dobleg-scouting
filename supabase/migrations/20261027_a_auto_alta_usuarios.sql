-- Toda cuenta nueva entra con acceso completo (2026-10-27). Hasta ahora el alta era
-- a mano: sin fila en user_profiles la app decía "Tu cuenta todavía no tiene acceso",
-- y sin fila en market_team_members la persona no aparecía en "Asignado a" ni recibía
-- avisos. Manuel Taborda quedó afuera del equipo por eso.
-- Los mails de blocked_emails siguen sin poder entrar (ver 20261015_a_bloquear_usuarios).

create or replace function public.grant_new_user_access(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_name text;
begin
  select lower(u.email),
         coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
                  nullif(trim(u.raw_user_meta_data->>'name'), ''),
                  split_part(u.email, '@', 1))
    into v_email, v_name
  from auth.users u where u.id = p_user_id;

  if v_email is null or exists (select 1 from public.blocked_emails b where b.email = v_email) then
    return;
  end if;

  -- "MANUEL TABORDA" -> "Manuel Taborda"
  if v_name = upper(v_name) then v_name := initcap(lower(v_name)); end if;

  insert into public.user_profiles (user_id, club_id)
  values (p_user_id, 'dobleg')
  on conflict (user_id) do nothing;

  if not exists (
    select 1 from public.market_team_members m
    where m.user_id = p_user_id or p_user_id = any(m.alt_user_ids)
  ) then
    insert into public.market_team_members (name, user_id, club_id, active)
    values (v_name, p_user_id, 'dobleg', true);
  end if;
end $$;

revoke all on function public.grant_new_user_access(uuid) from public, anon, authenticated;

create or replace function public.on_auth_user_created_grant_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.grant_new_user_access(new.id);
  exception when others then
    -- Nunca bloquear el registro por esto; queda el alta manual como respaldo.
    raise warning 'grant_new_user_access(%) falló: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists grant_access_on_signup on auth.users;
create trigger grant_access_on_signup
  after insert on auth.users
  for each row execute function public.on_auth_user_created_grant_access();

-- Cuentas existentes que quedaron a medio dar de alta: sólo Manuel Taborda.
-- Mariano Hombre queda afuera del equipo a pedido de la agencia (sin bloquearlo).
select public.grant_new_user_access('66d47438-2e15-49a9-bdee-33305e9c7e07');
