import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  let seasons: number[];
  try {
    const body = await req.json();
    if (body?.season) {
      seasons = [body.season];
    } else {
      const euroSeason = now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
      seasons = euroSeason === now.getFullYear() ? [now.getFullYear()] : [euroSeason, now.getFullYear()];
    }
  } catch {
    const euroSeason = now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
    seasons = euroSeason === now.getFullYear() ? [now.getFullYear()] : [euroSeason, now.getFullYear()];
  }

  try {
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, season')
      .eq('has_player_stats', true);

    if (!leagues || leagues.length === 0) {
      return new Response(JSON.stringify({ message: 'No leagues found' }), { status: 200 });
    }

    let totalUpserted = 0;

    for (const season of seasons) {
      const leaguesForSeason = leagues.filter(l => l.season === season);

      for (const league of leaguesForSeason) {
        let allStats: any[] = [];
        let page = 0;
        const PAGE_SIZE = 1000;

        while (true) {
          const { data: batch } = await supabase
            .from('player_match_stats')
            .select('player_id, detected_position, team_id, match_score, rating, goals, assists, fixture_id')
            .not('match_score', 'is', null)
            .not('detected_position', 'is', null)
            .in('fixture_id',
              (await supabase.from('fixtures').select('id').eq('league_id', league.id).eq('season', season)).data?.map((f: any) => f.id) ?? []
            )
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

          if (!batch || batch.length === 0) break;
          allStats = allStats.concat(batch);
          if (batch.length < PAGE_SIZE) break;
          page++;
        }

        if (allStats.length === 0) continue;

        const groups = new Map<string, typeof allStats>();
        for (const s of allStats) {
          const key = `${s.player_id}|${s.detected_position}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(s);
        }

        const upsertRows = [];
        for (const [key, rows] of groups) {
          const [playerId, position] = key.split('|');
          const scores = rows.map(r => r.match_score).filter((s: any) => s !== null);
          const ratings = rows.map(r => r.rating).filter((r: any) => r !== null);

          upsertRows.push({
            player_id: parseInt(playerId),
            season,
            position,
            league_id: league.id,
            matches_played: scores.length,
            avg_score: scores.length > 0
              ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
              : null,
            avg_rating: ratings.length > 0
              ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10
              : null,
            total_goals: rows.reduce((s: number, r: any) => s + (r.goals ?? 0), 0),
            total_assists: rows.reduce((s: number, r: any) => s + (r.assists ?? 0), 0),
            updated_at: new Date().toISOString(),
          });
        }

        if (upsertRows.length > 0) {
          const CHUNK = 500;
          for (let i = 0; i < upsertRows.length; i += CHUNK) {
            await supabase.from('player_season_scores').upsert(
              upsertRows.slice(i, i + CHUNK),
              { onConflict: 'player_id,season,position,league_id' }
            );
          }
          totalUpserted += upsertRows.length;
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
