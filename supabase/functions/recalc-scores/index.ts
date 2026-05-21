import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

serve(async () => {
  const supabase = getSupabaseAdmin();

  try {
    const { error: recalcError } = await supabase.rpc('recalc_season_scores');

    if (recalcError) {
      const season = new Date().getFullYear();

      const { data: stats } = await supabase
        .from('player_match_stats')
        .select(`
          player_id,
          detected_position,
          team_id,
          match_score,
          rating,
          goals,
          assists,
          fixtures!inner(league_id, season)
        `)
        .not('match_score', 'is', null)
        .eq('fixtures.season', season);

      if (!stats || stats.length === 0) {
        return new Response(JSON.stringify({ message: 'No stats to recalculate' }), { status: 200 });
      }

      const groups = new Map<string, typeof stats>();
      for (const s of stats) {
        const leagueId = (s as any).fixtures?.league_id;
        const key = `${s.player_id}|${s.detected_position}|${leagueId}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(s);
      }

      const upsertRows = [];
      for (const [key, rows] of groups) {
        const [playerId, position, leagueId] = key.split('|');
        const scores = rows.map(r => r.match_score!).filter(s => s !== null);
        const ratings = rows.map(r => r.rating).filter(r => r !== null);

        upsertRows.push({
          player_id: parseInt(playerId),
          season,
          position,
          league_id: parseInt(leagueId),
          matches_played: scores.length,
          avg_score: scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
            : null,
          avg_rating: ratings.length > 0
            ? Math.round(((ratings as number[]).reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
            : null,
          total_goals: rows.reduce((s, r) => s + (r.goals ?? 0), 0),
          total_assists: rows.reduce((s, r) => s + (r.assists ?? 0), 0),
          updated_at: new Date().toISOString(),
        });
      }

      if (upsertRows.length > 0) {
        await supabase.from('player_season_scores').upsert(upsertRows, {
          onConflict: 'player_id,season,position,league_id',
        });
      }

      for (const position of ['ARQ','LD','CB','LI','VC','VI','EXT','DEL']) {
        const { data: posScores } = await supabase
          .from('player_season_scores')
          .select('player_id, league_id, avg_score')
          .eq('position', position)
          .eq('season', season)
          .not('avg_score', 'is', null)
          .order('avg_score', { ascending: true });

        if (!posScores || posScores.length === 0) continue;

        const byLeague = new Map<number, typeof posScores>();
        for (const s of posScores) {
          if (!byLeague.has(s.league_id)) byLeague.set(s.league_id, []);
          byLeague.get(s.league_id)!.push(s);
        }

        for (const [leagueId, leagueScores] of byLeague) {
          const sorted = leagueScores.sort((a, b) => (a.avg_score ?? 0) - (b.avg_score ?? 0));
          const n = sorted.length;
          for (let i = 0; i < n; i++) {
            const pct = n > 1 ? Math.round((i / (n - 1)) * 10000) / 100 : 50;
            await supabase.from('player_season_scores')
              .update({ percentile: pct })
              .eq('player_id', sorted[i].player_id)
              .eq('season', season)
              .eq('position', position)
              .eq('league_id', leagueId);
          }
        }

        const allSorted = posScores.sort((a, b) => (a.avg_score ?? 0) - (b.avg_score ?? 0));
        const total = allSorted.length;
        for (let i = 0; i < total; i++) {
          const pct = total > 1 ? Math.round((i / (total - 1)) * 10000) / 100 : 50;
          await supabase.from('player_season_scores')
            .update({ global_percentile: pct })
            .eq('player_id', allSorted[i].player_id)
            .eq('season', season)
            .eq('position', position)
            .eq('league_id', allSorted[i].league_id);
        }
      }

      const { data: allMatches } = await supabase
        .from('player_match_stats')
        .select('player_id, detected_position')
        .not('detected_position', 'is', null);

      if (allMatches) {
        const playerPositions = new Map<number, Map<string, number>>();
        for (const m of allMatches) {
          if (!playerPositions.has(m.player_id)) playerPositions.set(m.player_id, new Map());
          const posMap = playerPositions.get(m.player_id)!;
          posMap.set(m.detected_position!, (posMap.get(m.detected_position!) ?? 0) + 1);
        }

        for (const [playerId, posMap] of playerPositions) {
          const total = Array.from(posMap.values()).reduce((a, b) => a + b, 0);
          const distribution: Record<string, number> = {};
          let maxPos = '';
          let maxCount = 0;

          for (const [pos, count] of posMap) {
            distribution[pos] = Math.round((count / total) * 100);
            if (count > maxCount) {
              maxCount = count;
              maxPos = pos;
            }
          }

          await supabase.from('players').update({
            position_distribution: distribution,
            primary_position: maxPos,
            updated_at: new Date().toISOString(),
          }).eq('id', playerId);
        }
      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'recalc-scores',
      status: 'success',
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    await supabase.from('sync_log').insert({
      function_name: 'recalc-scores',
      status: 'error',
      error_message: (err as Error).message,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
