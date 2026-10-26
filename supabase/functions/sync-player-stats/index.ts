import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchLineups, fetchFixturePlayers, isQuotaStop, setApiCaller, QUOTA_PAUSE_MESSAGE } from '../_shared/api-football.ts';
import { mapGridToPosition, fallbackPosition } from '../_shared/position-mapper.ts';
import { pctPasses } from '../_shared/stats-normalize.ts';
import { canCloseWithoutPlayers } from '../_shared/api-response.ts';
import type { PlayerMatchRow } from '../_shared/types.ts';

const BATCH_SIZE = 15;
// Los primeros intentos van en cada pasada (los datos suelen aparecer 1-2 h
// después del partido); después, cada RETRY_SLOW_HOURS.
const FAST_ATTEMPTS = 4;
const RETRY_SLOW_HOURS = 3;


serve(async () => {
  setApiCaller('sync-player-stats', 'essential');
  const supabase = getSupabaseAdmin();
  const results = { fixtures_processed: 0, players_inserted: 0, pending: 0, errors: [] as string[] };
  let paused = false;

  try {
    // Un partido que ya vino vacío varias veces se vuelve a pedir recién cada
    // RETRY_SLOW_HOURS (antes se pedía en cada pasada y se tiraban ~3.000
    // llamadas por día en partidos que API-Football todavía no tenía).
    const slowRetryBefore = new Date(Date.now() - RETRY_SLOW_HOURS * 3600000).toISOString();
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, league_id, season, date, home_team_id, away_team_id, stats_attempts')
      .eq('stats_synced', false)
      .or(`stats_attempts.lt.${FAST_ATTEMPTS},stats_last_attempt_at.lt.${slowRetryBefore}`)
      .order('date', { ascending: false })
      .limit(BATCH_SIZE);

    if (!fixtures || fixtures.length === 0) {
      return new Response(JSON.stringify({ message: 'No fixtures to sync' }), { status: 200 });
    }

    for (const fixture of fixtures) {
      try {
        // Primero las estadísticas: la alineación solo se pide si hay jugadores,
        // así un partido todavía vacío cuesta 1 llamada y no 2.
        const playerStats = await fetchFixturePlayers(fixture.id);

        // Sin datos de jugadores todavía: se reintenta (cada vez más espaciado) y solo
        // se cierra pasados unos días (antes quedaba marcado como sincronizado y vacío).
        if (playerStats.length === 0 && !canCloseWithoutPlayers(fixture.date)) {
          await supabase.from('fixtures')
            .update({ stats_attempts: (fixture.stats_attempts ?? 0) + 1, stats_last_attempt_at: new Date().toISOString() })
            .eq('id', fixture.id);
          results.pending++;
          continue;
        }

        const lineups = playerStats.length > 0 ? await fetchLineups(fixture.id) : [];

        const gridMap = new Map<number, { grid: string | null; formation: string | null; teamId: number; isSub: boolean }>();

        for (const lineup of lineups) {
          const formation = lineup.formation;
          // API-Football a veces devuelve la alineación sin startXI/substitutes (partidos
          // viejos o incompletos). Antes eso tiraba "is not iterable", el partido quedaba sin
          // marcar y se reintentaba para siempre. Sin alineación se sigue con las stats.
          for (const entry of lineup.startXI ?? []) {
            gridMap.set(entry.player.id, {
              grid: entry.player.grid,
              formation,
              teamId: lineup.team.id,
              isSub: false,
            });
          }
          for (const entry of lineup.substitutes ?? []) {
            gridMap.set(entry.player.id, {
              grid: entry.player.grid,
              formation,
              teamId: lineup.team.id,
              isSub: true,
            });
          }
        }

        const allRows: PlayerMatchRow[] = [];

        // A veces API-Football devuelve un equipo con un id que no es ninguno de
        // los dos del partido (Chapecoense vino como 22722, sin nombre): el
        // guardado fallaba y el partido se reintentaba para siempre. Si un id no
        // es de este partido, es el equipo que falta.
        const fixtureTeams = [fixture.home_team_id, fixture.away_team_id].filter((t): t is number => t != null);
        const seenTeams = playerStats.map((t: any) => t.team.id as number);
        const teamIdFor = (apiTeamId: number) => {
          if (fixtureTeams.length < 2 || fixtureTeams.includes(apiTeamId)) return apiTeamId;
          return fixtureTeams.find(t => !seenTeams.includes(t)) ?? apiTeamId;
        };

        for (const teamData of playerStats) {
          const teamId = teamIdFor(teamData.team.id);
          for (const p of teamData.players) {
            const stats = p.statistics[0];
            if (!stats) continue;

            const minutes = stats.games.minutes ?? 0;
            const gridInfo = gridMap.get(p.player.id);
            const formation = gridInfo?.formation ?? null;
            const grid = gridInfo?.grid ?? null;
            const isSub = gridInfo?.isSub ?? stats.games.substitute;

            let position = mapGridToPosition(formation, grid);
            if (!position) {
              position = fallbackPosition(stats.games.position);
            }

            await supabase.from('players').upsert({
              id: p.player.id,
              name: p.player.name,
              photo: p.player.photo,
              current_team_id: teamId,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            const row: PlayerMatchRow = {
              player_id: p.player.id,
              fixture_id: fixture.id,
              team_id: teamId,
              detected_position: position,
              formation,
              grid_position: grid,
              minutes,
              rating: stats.games.rating ? parseFloat(stats.games.rating) : null,
              is_substitute: isSub,
              goals: stats.goals.total ?? 0,
              assists: stats.goals.assists ?? 0,
              shots_total: stats.shots.total ?? 0,
              shots_on: stats.shots.on ?? 0,
              passes_total: stats.passes.total ?? 0,
              passes_key: stats.passes.key ?? 0,
              // OJO: API-Football manda en `passes.accuracy` la CANTIDAD de pases
              // acertados, no el porcentaje (se ven valores de 107 sobre 123 pases).
              // Sofascore, en cambio, guarda porcentaje. Se normaliza a porcentaje
              // acá para que la columna signifique lo mismo venga de donde venga:
              // el scoring la pondera como porcentaje (`isPercentage: true`).
              passes_accuracy: pctPasses(stats.passes.total, stats.passes.accuracy),
              tackles: stats.tackles.total ?? 0,
              blocks: stats.tackles.blocks ?? 0,
              interceptions: stats.tackles.interceptions ?? 0,
              duels_total: stats.duels.total ?? 0,
              duels_won: stats.duels.won ?? 0,
              dribbles_attempted: stats.dribbles.attempts ?? 0,
              dribbles_success: stats.dribbles.success ?? 0,
              fouls_drawn: stats.fouls.drawn ?? 0,
              fouls_committed: stats.fouls.committed ?? 0,
              yellow_cards: stats.cards.yellow ?? 0,
              red_cards: stats.cards.red ?? 0,
              penalty_won: stats.penalty.won ?? 0,
              penalty_scored: stats.penalty.scored ?? 0,
              penalty_missed: stats.penalty.missed ?? 0,
              penalty_saved: stats.penalty.saved ?? 0,
              saves: stats.goals.saves ?? 0,
              goals_conceded: stats.goals.conceded ?? 0,
              match_score: null,
            };

            allRows.push(row);
          }
        }

        if (allRows.length > 0) {
          const dedupedRows = [...new Map(allRows.map(r => [`${r.player_id}_${r.fixture_id}`, r])).values()];
          const { error } = await supabase.from('player_match_stats').upsert(
            dedupedRows.map(r => ({
              player_id: r.player_id,
              fixture_id: r.fixture_id,
              team_id: r.team_id,
              detected_position: r.detected_position,
              formation: r.formation,
              grid_position: r.grid_position,
              minutes: r.minutes,
              rating: r.rating,
              is_substitute: r.is_substitute,
              goals: r.goals,
              assists: r.assists,
              shots_total: r.shots_total,
              shots_on: r.shots_on,
              passes_total: r.passes_total,
              passes_key: r.passes_key,
              passes_accuracy: r.passes_accuracy,
              tackles: r.tackles,
              blocks: r.blocks,
              interceptions: r.interceptions,
              duels_total: r.duels_total,
              duels_won: r.duels_won,
              dribbles_attempted: r.dribbles_attempted,
              dribbles_success: r.dribbles_success,
              fouls_drawn: r.fouls_drawn,
              fouls_committed: r.fouls_committed,
              yellow_cards: r.yellow_cards,
              red_cards: r.red_cards,
              penalty_won: r.penalty_won,
              penalty_scored: r.penalty_scored,
              penalty_missed: r.penalty_missed,
              penalty_saved: r.penalty_saved,
              saves: r.saves,
              goals_conceded: r.goals_conceded,
              match_score: r.match_score,
            })),
            { onConflict: 'player_id,fixture_id' }
          );

          if (error) throw error;
          results.players_inserted += dedupedRows.length;
        }

        await supabase.from('fixtures')
          .update({ stats_synced: true })
          .eq('id', fixture.id);

        results.fixtures_processed++;
      } catch (err) {
        // Sin cupo: se corta acá y se sigue en la próxima pasada (no es una falla del partido).
        if (isQuotaStop(err)) {
          paused = true;
          break;
        }
        const msg = `Fixture ${fixture.id}: ${(err as Error).message}`;
        results.errors.push(msg);

        await supabase.from('sync_log').insert({
          function_name: 'sync-player-stats',
          fixture_id: fixture.id,
          league_id: fixture.league_id,
          status: 'error',
          error_message: (err as Error).message,
        });

      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'sync-player-stats',
      status: results.errors.length > 0 ? 'error' : paused ? 'paused' : 'success',
      fixtures_processed: results.fixtures_processed,
      error_message: [...results.errors, ...(paused ? [QUOTA_PAUSE_MESSAGE] : [])].join('; ') || null,
    });

    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
