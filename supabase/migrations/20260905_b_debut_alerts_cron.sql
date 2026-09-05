-- Se separa del Task 1 a proposito: este cron solo se activa despues de
-- confirmar (Task 7) que el backfill historico de Peru/Venezuela/Libertadores/
-- Sudamericana ya se proceso -- activarlo antes puede generar falsos positivos.

select cron.schedule(
  'detect-debut-alerts-daily',
  '0 10 * * *',
  $$ select public.detect_debut_alerts(); $$
);
