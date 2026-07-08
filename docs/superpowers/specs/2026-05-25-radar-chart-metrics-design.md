# Radar Chart de Metricas - Player Detail

## Objetivo

Agregar radar chart con metricas del jugador vs promedio de su posicion-liga en las fichas individuales de scouting externo. Selector de liga para comparar contra promedios de otras ligas.

## Backend: position_metric_averages

Tabla nueva en Supabase. Una fila por combinacion posicion-liga-season.

Columnas: position, league_id, season, tackles_p90, interceptions_p90, blocks_p90, duels_won_pct, passes_accuracy, passes_key_p90, passes_p90, dribbles_p90, dribbles_pct, shots_on_p90, shots_pct, goals_p90, assists_p90, rating_avg, fouls_drawn_p90, saves_p90, gc_p90, pen_saved_avg, clean_sheet_pct, player_count, updated_at.

Calculado en recalc-scores: para cada posicion-liga, promediar las metricas /90 de todos los player_match_stats con >=10 min jugados.

## Frontend: Metricas del jugador

Calculadas on-demand desde player_match_stats ya cargados. Promediar por posicion activa, /90 donde corresponda.

## Metricas por posicion (mismas del scoring)

- ARQ: saves/90, gc/90, rating, pen_saved, clean_sheet%
- CB: duelos%, tackles/90, int/90, blocks/90, pass_acc, rating, passes/90
- LD/LI: duelos%, kp/90, drib/90, ast/90, tackles/90, pass_acc, int/90, rating, drib%
- VC: tackles/90, duelos%, int/90, pass_acc, passes/90, blocks/90, rating, kp/90
- VI: duelos%, kp/90, drib/90, ast/90, goals/90, pass_acc, shots_on/90, rating, tackles/90, drib%
- EXT: drib/90, goals/90, ast/90, kp/90, shots_on/90, duelos%, drib%, rating, fouls_drawn/90
- DEL: goals/90, shots_on/90, ast/90, shots%, kp/90, duelos%, rating, drib/90, pen_scored, fouls_drawn/90

## Radar Chart Component

- Ubicacion: debajo del grafico de evolucion, arriba del historial
- Area verde: metricas del jugador
- Linea/area gris: promedio posicion-liga
- Dropdown arriba: selector de liga (default = liga del jugador)
- Normalizacion: 0-100 percentil relativo al rango de la liga
- Tooltip: valor exacto jugador vs promedio
- Recharts RadarChart

## Score comparison

GaugeScore existente ya muestra comparacion. Asegurar que se pase comparisonScore de la liga seleccionada.

## Scope

Solo fichas de scouting externo (SupabasePlayerDetail). Internos mantienen su diseño actual, migracion posterior.
