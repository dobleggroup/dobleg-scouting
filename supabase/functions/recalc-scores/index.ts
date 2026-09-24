import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchAllRows } from '../_shared/fetchAll.ts';
import { mergeSeasonScoreFragments } from '../_shared/mergeSeasonFragments.ts';

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  // Las ligas de calendario europeo (ago-may) numeran la temporada por el año en que
  // arrancó (season=2025 para la 2025/26 en curso), mientras que las de calendario
  // anual (Sudamérica, MLS) usan el año en curso (season=2026). No hay un único "año
  // vigente" que sirva para ambas: colapsar a un solo número (como hacía antes,
  // adivinando por mes) dejaba de recalcular POR COMPLETO la temporada europea en
  // curso apenas cambiaba el año calendario — la fila se congelaba desactualizada
  // para siempre. Sin `body.season` explícito, siempre se procesan los dos últimos
  // años para cubrir ambas convenciones.
  const seasons: number[] = await (async () => {
    try {
      const body = await req.json();
      if (body?.season) return [body.season];
    } catch { /* sin body o no es JSON: usar default */ }
    return [now.getFullYear() - 1, now.getFullYear()];
  })();

  try {
    // Corrige posiciones adivinadas a ciegas en partidos sin dato de grilla
    // (tipico de entradas de banco) ANTES de calcular distribucion y scores de
    // esta misma corrida, para que ya salgan bien en esta pasada.
    const { error: backfillError } = await supabase.rpc('backfill_ungridded_positions');
    if (backfillError) throw new Error(`backfill_ungridded_positions: ${backfillError.message}`);

    const { data: domesticLeagues } = await supabase
      .from('leagues')
      .select('id, season')
      .eq('has_player_stats', true)
      // Las copas no son ligas: sus partidos ya entran por los equipos de cada liga
      // (se toman todos sus partidos, de cualquier competencia).
      .eq('is_cup', false)
      .is('parent_league_id', null); // el Apertura de Paraguay entra por los equipos del Clausura

    if (!domesticLeagues || domesticLeagues.length === 0) {
      return new Response(JSON.stringify({ message: 'No leagues found' }), { status: 200 });
    }

    let totalUpserted = 0;

    // Overrides de puesto: jugadores que la grilla de API detecta mal. Se fuerza
    // su posición real (todos sus partidos se consolidan ahí). Ampliable.
    const POSITION_OVERRIDES: Record<string, string> = {
      'mauricio vera': 'VC',
      'mario sanabria': 'EXT',
      'julian lopez': 'VC',
    };
    const normName = (s: string) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const overrideById = new Map<number, string>();
    {
      // Solo traemos los pocos jugadores con override (no todos, para no cargar
      // miles de filas ni chocar con el límite de 1000).
      const { data: pls } = await supabase
        .from('players')
        .select('id, name')
        .or('name.ilike.mauricio vera,name.ilike.mario sanabria,name.ilike.juli_n l_pez');
      for (const p of pls ?? []) {
        const ov = POSITION_OVERRIDES[normName(p.name)];
        if (ov) overrideById.set(p.id, ov);
      }
    }

    for (const season of seasons) {
      // Process all leagues for each season — Clausura/Apertura leagues may have
      // fixtures tagged with a different season than the league's own season field
      const leaguesForSeason = domesticLeagues;

      // Los partidos de la temporada no se traen como lista de ids: son miles y
      // pasarlos por `.in()` arma una URL enorme (y sin paginar PostgREST corta en
      // 1000 y el resto desaparece en silencio). Se filtra por el join con fixtures.
      const { count: seasonFixtureCount } = await supabase
        .from('fixtures')
        .select('id', { count: 'exact', head: true })
        .eq('season', season);
      if (!seasonFixtureCount) continue;

      // Filas de TODAS las ligas acumuladas: el rating se rankea por posición a
      // nivel GLOBAL (contra todos los de su puesto en la plataforma, sin importar
      // la liga), no liga por liga.
      const allSeasonRows: any[] = [];

      for (const league of leaguesForSeason) {
        // Get teams that belong to this domestic league
        const { data: teams } = await supabase
          .from('teams')
          .select('id')
          .eq('league_id', league.id);
        const teamIds = teams?.map(t => t.id) ?? [];
        if (teamIds.length === 0) continue;

        // Get ALL match stats for players on these teams (any competition)
        const allStats = await fetchAllRows<any>((from, to) =>
          supabase
            .from('player_match_stats')
            .select('player_id, detected_position, team_id, rating, goals, assists, fixture_id, minutes, tackles, interceptions, blocks, duels_total, duels_won, passes_accuracy, passes_key, passes_total, dribbles_success, dribbles_attempted, shots_on, shots_total, fouls_drawn, saves, goals_conceded, penalty_saved, fixtures!inner(season)')
            .not('rating', 'is', null)
            .not('detected_position', 'is', null)
            .in('team_id', teamIds)
            .eq('fixtures.season', season)
            .order('id')
            .range(from, to)
        );

        if (allStats.length === 0) continue;

        const groups = new Map<string, typeof allStats>();
        for (const s of allStats) {
          // Override de puesto: si el jugador tiene puesto real fijado, se lo
          // agrupa ahí (todos sus partidos), corrigiendo la detección de la grilla.
          const pos = overrideById.get(s.player_id) ?? s.detected_position;
          const key = `${s.player_id}|${pos}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(s);
        }

        const upsertRows = [];
        for (const [key, rows] of groups) {
          const [playerId, position] = key.split('|');
          const ratings = rows.map(r => r.rating).filter((r: any) => r !== null);

          // Métricas /90 y porcentajes del jugador en esta posición (mismas que el radar)
          const mins = rows.filter((r: any) => r.minutes > 0);
          const p90 = (field: string) => {
            const vals = mins.map((r: any) => ((r[field] ?? 0) / r.minutes) * 90);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
          };
          const avg = (field: string) => {
            const vals = rows.map((r: any) => r[field] ?? 0).filter((v: number) => v > 0);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
          };
          const pct = (num: string, den: string) => {
            const totN = rows.reduce((acc: number, r: any) => acc + (r[num] ?? 0), 0);
            const totD = rows.reduce((acc: number, r: any) => acc + (r[den] ?? 0), 0);
            return totD > 0 ? (totN / totD) * 100 : null;
          };
          const rd = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

          upsertRows.push({
            player_id: parseInt(playerId),
            season,
            position,
            league_id: league.id,
            // Explícito en vez de asumir que rows ya viene sin ratings nulos
            // (la query los filtra hoy, pero ratings.length es correcto sin
            // depender de ese filtro implícito).
            matches_played: ratings.length,
            avg_rating: ratings.length > 0
              ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10
              : null,
            total_goals: rows.reduce((s: number, r: any) => s + (r.goals ?? 0), 0),
            total_assists: rows.reduce((s: number, r: any) => s + (r.assists ?? 0), 0),
            tackles_p90: rd(p90('tackles')),
            interceptions_p90: rd(p90('interceptions')),
            blocks_p90: rd(p90('blocks')),
            duels_won_pct: rd(pct('duels_won', 'duels_total')),
            passes_accuracy: rd(avg('passes_accuracy')),
            passes_key_p90: rd(p90('passes_key')),
            passes_total_p90: rd(p90('passes_total')),
            dribbles_success_p90: rd(p90('dribbles_success')),
            dribbles_pct: rd(pct('dribbles_success', 'dribbles_attempted')),
            shots_on_p90: rd(p90('shots_on')),
            shots_pct: rd(pct('shots_on', 'shots_total')),
            goals_p90: rd(p90('goals')),
            assists_p90: rd(p90('assists')),
            fouls_drawn_p90: rd(p90('fouls_drawn')),
            saves_p90: rd(p90('saves')),
            goals_conceded_p90: rd(p90('goals_conceded')),
            penalty_saved_avg: rd(avg('penalty_saved')),
            clean_sheet_pct: rd((rows.filter((r: any) => r.goals_conceded === 0).length / rows.length) * 100),
            updated_at: new Date().toISOString(),
          });
        }

        // Se acumulan; los fragmentos por liga se fusionan al cerrar la temporada.
        for (const r of upsertRows) allSeasonRows.push(r);

        // Compute position metric averages for this league
        const leagueStats = allStats.filter((s: any) => s.minutes >= 10);
        const posMetrics = new Map<string, any[]>();
        for (const s of leagueStats) {
          const pos = s.detected_position;
          if (!posMetrics.has(pos)) posMetrics.set(pos, []);
          posMetrics.get(pos)!.push(s);
        }

        const metricRows: any[] = [];
        for (const [pos, mRows] of posMetrics) {
          const n = mRows.length;
          const p90 = (field: string) => {
            const vals = mRows.filter((r: any) => r.minutes > 0).map((r: any) => ((r[field] ?? 0) / r.minutes) * 90);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
          };
          const avg = (field: string) => {
            const vals = mRows.map((r: any) => r[field] ?? 0).filter((v: number) => v > 0);
            return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : 0;
          };
          const pct = (num: string, den: string) => {
            const totN = mRows.reduce((acc: number, r: any) => acc + (r[num] ?? 0), 0);
            const totD = mRows.reduce((acc: number, r: any) => acc + (r[den] ?? 0), 0);
            return totD > 0 ? (totN / totD) * 100 : 0;
          };
          const rd = (v: number) => Math.round(v * 100) / 100;

          metricRows.push({
            position: pos, league_id: league.id, season,
            tackles_p90: rd(p90('tackles')), interceptions_p90: rd(p90('interceptions')),
            blocks_p90: rd(p90('blocks')), duels_won_pct: rd(pct('duels_won', 'duels_total')),
            passes_accuracy: rd(avg('passes_accuracy')), passes_key_p90: rd(p90('passes_key')),
            passes_total_p90: rd(p90('passes_total')), dribbles_success_p90: rd(p90('dribbles_success')),
            dribbles_pct: rd(pct('dribbles_success', 'dribbles_attempted')),
            shots_on_p90: rd(p90('shots_on')), shots_pct: rd(pct('shots_on', 'shots_total')),
            goals_p90: rd(p90('goals')), assists_p90: rd(p90('assists')),
            rating_avg: rd(avg('rating')), fouls_drawn_p90: rd(p90('fouls_drawn')),
            saves_p90: rd(p90('saves')), goals_conceded_p90: rd(p90('goals_conceded')),
            penalty_saved_avg: rd(avg('penalty_saved')),
            clean_sheet_pct: rd((mRows.filter((r: any) => r.goals_conceded === 0).length / n) * 100),
            player_count: n, updated_at: new Date().toISOString(),
          });
        }

        if (metricRows.length > 0) {
          await supabase.from('position_metric_averages').upsert(
            metricRows, { onConflict: 'position,league_id,season' }
          );
        }
      }

      // Fusionar fragmentos ANTES de elegir la posicion primaria: si no se hace aca,
      // un jugador con partidos repartidos en mas de una liga para la MISMA posicion
      // puede perder su posicion primaria real frente a una posicion distinta con un
      // solo fragmento mas grande (bestPos comparaba fragmentos individuales, no el
      // total sumado por posicion).
      const mergedSeasonRows = mergeSeasonScoreFragments(allSeasonRows);

      // ── Consolidar a cada jugador en su posición PRIMARIA (la de más partidos) ──
      // Evita fragmentarlo entre puestos por detección ruidosa. Los overrides ya
      // vienen consolidados desde el agrupamiento (todos sus partidos en un puesto).
      const bestPos = new Map<number, { position: string; mp: number }>();
      for (const r of mergedSeasonRows) {
        const cur = bestPos.get(r.player_id);
        if (!cur || (r.matches_played ?? 0) > cur.mp) {
          bestPos.set(r.player_id, { position: r.position, mp: r.matches_played ?? 0 });
        }
      }
      const primaryRows = mergedSeasonRows.filter((r: any) => bestPos.get(r.player_id)?.position === r.position);

      // Reemplazar los datos de la temporada por las filas primarias frescas:
      // borra filas viejas/fragmentadas de posiciones que ya no corresponden.
      // El borrado va DENTRO del if: si el cálculo no produjo filas (una consulta que
      // falló, la API caída), borrar igual dejaría la temporada sin scores y la app
      // en blanco. Mejor conservar los datos viejos que quedarse sin ninguno.
      if (primaryRows.length > 0) {
        const { error: deleteError } = await supabase.from('player_season_scores').delete().eq('season', season);
        if (deleteError) throw new Error(`player_season_scores delete: ${deleteError.message}`);
        const CHUNK = 500;
        for (let i = 0; i < primaryRows.length; i += CHUNK) {
          const { error: upsertError } = await supabase.from('player_season_scores').upsert(
            primaryRows.slice(i, i + CHUNK),
            { onConflict: 'player_id,season,position' }
          );
          if (upsertError) throw new Error(`player_season_scores upsert: ${upsertError.message}`);
        }
        totalUpserted += primaryRows.length;
      }

      // Fix current_team_id: set to team from most recent fixture. La fecha viene
      // del join, así no hace falta traer los miles de fixtures aparte.
      {
        const allTeamStats = await fetchAllRows<{ player_id: number; team_id: number; fixtures: { date: string } }>(
          (from, to) => supabase
            .from('player_match_stats')
            .select('player_id, team_id, fixtures!inner(date, season)')
            .eq('fixtures.season', season)
            .order('id')
            .range(from, to)
        );

        const latestTeam = new Map<number, { team_id: number; date: string }>();
        for (const row of allTeamStats) {
          const fdate = row.fixtures?.date ?? '';
          const existing = latestTeam.get(row.player_id);
          if (!existing || fdate > existing.date) {
            latestTeam.set(row.player_id, { team_id: row.team_id, date: fdate });
          }
        }

        const teamUpdates = Array.from(latestTeam.entries()).map(([pid, v]) => ({
          id: pid,
          current_team_id: v.team_id,
        }));
        for (let i = 0; i < teamUpdates.length; i += 500) {
          await supabase.from('players').upsert(teamUpdates.slice(i, i + 500), { onConflict: 'id' });
        }
      }

      const { error: pctError } = await supabase.rpc('recalc_percentiles', { p_season: season });
      if (pctError) throw new Error(`recalc_percentiles: ${pctError.message}`);
    }

    const { error: distError } = await supabase.rpc('recalc_position_distribution');
    if (distError) throw new Error(`recalc_position_distribution: ${distError.message}`);

    await supabase.from('sync_log').insert({
      function_name: 'recalc-scores',
      status: 'success',
      fixtures_processed: totalUpserted,
    });

    return new Response(JSON.stringify({ success: true, scores_computed: totalUpserted, seasons }), { status: 200 });
  } catch (err) {
    await supabase.from('sync_log').insert({
      function_name: 'recalc-scores',
      status: 'error',
      error_message: (err as Error).message,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
