-- Bucket público de Storage para informes compartibles (HTML autocontenido e
-- interactivo). Al ser público, el link se abre sin login. La ruta de cada objeto
-- incluye el id del informe (no adivinable), así el bucket no es listable pero el
-- que tiene el link entra.

insert into storage.buckets (id, name, public)
values ('informes-compartidos', 'informes-compartidos', true)
on conflict (id) do update set public = true;

-- La lectura pública la habilita `public = true` (endpoint /object/public/...).
-- Estas políticas permiten SUBIR/ACTUALIZAR desde el cliente (anon + authenticated),
-- igual que el resto de los flujos de la app.

drop policy if exists "informes_compartidos_insert" on storage.objects;
create policy "informes_compartidos_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'informes-compartidos');

drop policy if exists "informes_compartidos_update" on storage.objects;
create policy "informes_compartidos_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'informes-compartidos')
  with check (bucket_id = 'informes-compartidos');

drop policy if exists "informes_compartidos_read" on storage.objects;
create policy "informes_compartidos_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'informes-compartidos');
