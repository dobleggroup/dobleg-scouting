# Transfermarkt Enrichment: Ficha + Historial + Auto-enrich

## Resumen

Tres features para completar el flujo de datos de Transfermarkt en la plataforma:

1. Mostrar datos TM en la ficha individual del jugador
2. Historial de valor de mercado para jugadores Doble G
3. Auto-enrichment al insertar jugadores nuevos + refresh semanal

## Feature 1 — Datos TM en la ficha del jugador

### Qué

Agregar sección "Perfil de mercado" en el sidebar izquierdo de `SupabasePlayerDetail.tsx`, después de los pills de info básica.

### Datos a mostrar

- **Valor de mercado**: formateado ("€1.5M"), con link al perfil TM si existe `transfermarkt_url`
- **Contrato hasta**: fecha formateada + badge de color:
  - Verde: >18 meses restantes
  - Amarillo: 6-18 meses
  - Rojo: <6 meses o vencido
- **Agente**: nombre del agente/agencia

### Origen de datos

Los campos `market_value_eur`, `contract_end_date`, `agent`, `transfermarkt_url` ya existen en `PlayerProfile` y llegan desde `fetchPlayerDetail()`. No se necesitan cambios en queries ni tipos.

### Archivos a modificar

- `src/components/players/SupabasePlayerDetail.tsx` — agregar sección UI

### Notas

- La sección solo se renderiza si al menos uno de los campos TM tiene valor (no mostrar sección vacía)
- Reusar el componente `ContractBadge` que ya existe en el proyecto

## Feature 2 — Historial de valor de mercado (solo DG)

### Qué

Tabla en Supabase para trackear la evolución del valor de mercado + gráfico en la ficha del jugador. Solo se trackean jugadores de la agencia Doble G.

### Schema

```sql
CREATE TABLE market_value_history (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE,
  value_eur INTEGER NOT NULL,
  club_name TEXT,
  UNIQUE(player_id, recorded_at)
);

CREATE INDEX idx_mvh_player ON market_value_history(player_id);
```

### Frontend

- Nuevo hook: `useMarketValueHistory(playerId)` en `src/hooks/usePlayerStats.ts`
- Nuevo service: `fetchMarketValueHistory(playerId)` en `src/services/playerStatsService.ts`
- UI: Gráfico de línea temporal con Recharts dentro de la ficha del jugador. Solo se renderiza si hay registros (implícitamente, solo jugadores DG tendrán datos).

### Carga de datos inicial

Migrar `scrape-market-values.mjs` para que escriba a Supabase en vez de generar CSV. Los TM IDs ya están hardcodeados en ese script para los jugadores DG.

### Actualización continua

El cron semanal (Feature 3) inserta un nuevo registro en `market_value_history` para cada jugador DG que tenga `transfermarkt_id`.

## Feature 3 — Auto-enrichment

### Arquitectura

```
Nuevo player INSERT
  → DB trigger (pg_net.http_post)
  → Supabase Edge Function "enrich-player" (mode=single, player_id=X)
  → Busca en TM → PATCH players

Domingo 3am UTC (pg_cron)
  → Supabase Edge Function "enrich-player" (mode=refresh)
  → Para cada player con transfermarkt_id:
    → Fetch TM API → actualiza market_value_eur, contract_end_date, agent
    → Si es DG: INSERT market_value_history
```

### Edge Function: `enrich-player`

Ubicación: `supabase/functions/enrich-player/index.ts`

Lógica portada de `scripts/enrich-transfermarkt/enrich.py`:
1. Busca jugador en TM por nombre (`schnellsuche`)
2. Fetch perfil TM API (`/player/{tmId}`)
3. Extrae: `market_value_eur`, `contract_end_date`, `agent`, `birth_date`, `transfermarkt_url`, `transfermarkt_id`
4. PATCH en Supabase

Modos:
- `single`: recibe `player_id`, enriquece ese jugador
- `refresh`: busca todos con `transfermarkt_id IS NOT NULL`, actualiza valores + historial DG

### Database trigger

```sql
CREATE OR REPLACE FUNCTION notify_new_player() RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/enrich-player',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('mode', 'single', 'player_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enrich_new_player
  AFTER INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_player();
```

### pg_cron job

```sql
SELECT cron.schedule(
  'refresh-transfermarkt',
  '0 3 * * 0',  -- Domingos 3am UTC
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/enrich-player',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"mode": "refresh"}'
  )$$
);
```

### Identificación de jugadores DG

La lista de jugadores DG con sus TM IDs ya está en `scrape-market-values.mjs`. La Edge Function mantiene esa lista internamente para saber a quiénes trackear historial de valor.

## Dependencias

- `pg_net` extension (para HTTP desde triggers) — verificar que esté habilitada en Supabase
- `pg_cron` — ya configurado (migración `20260521204103_setup_pg_cron.sql`)
- Recharts — ya instalado

## Orden de implementación

1. Feature 1 (UI en ficha) — independiente, se puede hacer ya
2. Feature 2 (tabla + migración + gráfico) — requiere schema
3. Feature 3 (Edge Function + trigger + cron) — requiere Feature 2 para el historial
4. Migrar `scrape-market-values.mjs` para carga inicial de historial
