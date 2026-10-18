# Rendimiento individual (Wyscout por partido) — diseño

Fecha: 2026-10-15 · Pedido por Marcos (aprobado en chat: carga con dropdown, métricas + conclusiones; "dale" para el resto).

## Objetivo
Los Excel "Player stats <Jugador>.xlsx" de Wyscout (uno por temporada, ~60 columnas por partido) de cada
jugador de la agencia se cargan a principio de mes y alimentan: una página "Rendimiento individual",
una pestaña nueva en la ficha de Scouting Interno y una sección en Inicio. Todo pensado para que los
jefes lo entiendan sin explicación: gráficos simples + frases en castellano rioplatense.
Reemplaza la planilla de Google Sheets `wyscoutEvolucion` (ya no se usa).

## Datos
- `wyscout_uploads`: una fila por archivo cargado (jugador, archivo, nuevos/actualizados, rango de fechas, quién, cuándo). Club-scoped.
- `wyscout_player_matches`: una fila por jugador+partido. Clave única (club_id, player_key, match_date, match_label).
  Columnas fijas (fecha, partido, competencia, posición, minutos) + `stats jsonb` con TODAS las columnas
  (`"Pases / logrados": 47`, `"Pases / logrados|ok": 39`). Re-subir actualiza, nunca duplica. `upload_id` = última carga que lo tocó.
- RPC `wyscout_monthly(p_player_key)` → sumas por jugador y mes (jsonb), para que Inicio y la página
  no bajen miles de partidos. RLS por club como gps_entries.
- `player_key` = `agencyKey(fullName)` (misma clave que GPS).

## Carga (página /carga-wyscout, menú Scout Interno)
1. Dropdown de jugadores: primero los sin carga este mes ("Faltan N de M"), después los ya cargados.
2. Arrastrar uno o varios .xlsx. Si el nombre del archivo no coincide con el jugador elegido → aviso (no bloquea).
3. Resumen (partidos nuevos / actualizados / rango) → "Cargar". El dropdown salta al siguiente pendiente.
4. Historial con borrar carga. Aviso días 1–10 del mes si faltan jugadores (en la página y chico en Inicio).

## Métricas
Catálogo en TS (`wyscoutMetrics.ts`): métricas crudas + derivadas, todas por 90' o %:
regates completados/90, % regates, duelos ganados %, duelos def. ganados/90, recuperaciones campo rival/90,
pérdidas/90, pérdidas campo propio/90, pases logrados %, pases último tercio logrados/90, pases al área logrados/90,
pases en profundidad logrados/90, pases adelante logrados/90, xG/90, xA/90, goles+asist/90, tiros al arco/90,
toques en área/90, duelos aéreos %, intercepciones/90, regates por pérdida, etc.
Cada métrica: dirección (más/menos es mejor) y posiciones donde importa. Grupo de posición por códigos Wyscout
(GK / DEF / LAT / MED / EXT-ENG / DEL), el de más minutos en los últimos 12 meses.

## Conclusiones (`wyscoutConclusions.ts`)
- Contra sí mismo: temporada actual vs anterior; últimos 3 meses vs su historia.
- Contra la agencia: ranking en su grupo de posición (últimos 12 meses).
- Solo con ≥450' en cada período y diferencia ≥15%. Tono verde/rojo/gris. Máx. 5 por jugador, ordenadas por magnitud.
Temporadas: calendario anual para Argentina/Uruguay/etc.; jul–jun para México/Europa/MLS no (MLS anual).

## Pantallas
- **Rendimiento individual** (`/rendimiento-individual`, ex Tablero; `/tablero` redirige). Menú Scout Interno debajo de
  Scouting Interno. Mantiene los paneles del Tablero y suma sección Wyscout: elegir jugador → conclusiones,
  evolución (por temporada / año / mes) de la métrica elegida, barras comparando jugadores de la agencia
  (filtro posición), dispersión de 2 métricas (agencia), y "en alza / en baja".
- **Ficha** (Scouting Interno): pestaña nueva "Rendimiento individual" con lo mismo para ese jugador
  (conclusiones, evolución por temporada/mes, tabla por temporada). La sección "Métricas evolutivas" del tab
  Rendimiento y el paso de Informes pasan a leer de la base en vez de la planilla.
- **Inicio**: sección "Rendimiento individual" (como "Scout Externo"): destacados del mes (frases), top por métrica
  con pestañas (estilo Duelos), en alza / en baja, aviso de carga pendiente.

## Fuera de alcance
Ligas/jugadores fuera de la agencia; PDFs de Wyscout; publicación (se revisa local antes).
