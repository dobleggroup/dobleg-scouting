-- Dispara ya el recalculo de la temporada actual (lo mismo que la tarea recalc-scores-6h).
-- Uso: npx supabase db query --linked --file scripts/sync-sofascore/recalcular_ahora.sql
do $$ begin execute (select command from cron.job where jobname = 'recalc-scores-6h'); end $$;
