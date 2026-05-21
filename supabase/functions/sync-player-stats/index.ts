import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchLineups, fetchFixturePlayers } from '../_shared/api-football.ts';
import { mapGridToPosition, fallbackPosition } from '../_shared/position-mapper.ts';
import { calculateMatchScore } from '../_shared/scoring.ts';
import type { PlayerMatchRow } from '../_shared/types.ts';

const BATCH_SIZE = 15;

serve(async () => {
  const supabase = getSupabaseAdmin();
  const results = { fixtures_processed: 0, players_inserted: 0, errors: [] as string[] };

  try {
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('id, league_id, season')
      .eq('stats_synced', false)
      .order('date', { ascending: true })
      .limit(BATCH_SIZE);

    if (!fixtures || fixtures.length === 0) {
      return new Response(JSON.stringify({ message: 'No fixtures to sync' }), { status: 200 });
    }

    for (const fixture of fixtures) {
      try {
        const [lineups, playerStats] = await Promise.all([
          fetchLineups(fixture.id),
          fetchFixturePlayers(fixture.id),
        ]);

        const gridMap = new Map<number, { grid: string | null; formation: string | null; teamId: number; isSub: boolean }>();

        for (const lineup of lineups) {
          const formation = lineup.formation;
          for (const entry of lineup.startXI) {
            gridMap.set(entry.player.id, {
              grid: entry.player.grid,
              formation,
              teamId: lineup.team.id,
              isSub: false,
            });
          }
          for (const entry of lineup.substitutes) {
            gridMap.set(entry.player.id, {
              grid: entry.player.grid,
              formation,
              teamId: lineup.team.id,
              isSub: true,
            });
          }
        }

        const allRows: PlayerMatchRow[] = [];

        for (const teamData of playerStats) {
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
              current_team_id: teamData.team.id,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            const row: PlayerMatchRow = {
              player_id: p.player.id,
              fixture_id: fixture.id,
              team_id: teamData.team.id,
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
              passes_accuracy: stats.passes.accuracy ? parseFloat(stats.passes.accuracy) : 0,
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

        for (const row of allRows) {
          const peers = allRows.filter(r => r.player_id !== row.player_id);
          row.match_score = calculateMatchScore(row, peers);
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
        const msg = `Fixture ${fixture.id}: ${(err as Error).message}`;
        results.errors.push(msg);

        await supabase.from('sync_log').insert({
          function_name: 'sync-player-stats',
          fixture_id: fixture.id,
          league_id: fixture.league_id,
          status: 'error',
          error_message: (err as Error).message,
        });

        if ((err as Error).message === 'RATE_LIMITED') break;
      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'sync-player-stats',
      status: results.errors.length > 0 ? 'error' : 'success',
      fixtures_processed: results.fixtures_processed,
      error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
    });

    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
