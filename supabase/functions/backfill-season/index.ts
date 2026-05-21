import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchFinishedFixtures } from '../_shared/api-football.ts';

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  const { league_id, season } = await req.json().catch(() => ({ league_id: null, season: 2025 }));

  try {
    const leagues = league_id
      ? [{ id: league_id, season }]
      : (await supabase.from('leagues').select('id, season').eq('has_player_stats', true)).data ?? [];

    let totalInserted = 0;

    for (const league of leagues) {
      const fromDate = `${league.season}-01-01`;
      const toDate = new Date().toISOString().split('T')[0];

      const fixtures = await fetchFinishedFixtures(league.id, league.season, fromDate, toDate);

      for (const f of fixtures) {
        await supabase.from('teams').upsert([
          { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo, league_id: league.id },
          { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo, league_id: league.id },
        ], { onConflict: 'id' });

        const { error } = await supabase.from('fixtures').upsert({
          id: f.fixture.id,
          league_id: league.id,
          season: league.season,
          date: f.fixture.date,
          home_team_id: f.teams.home.id,
          away_team_id: f.teams.away.id,
          score_home: f.goals.home,
          score_away: f.goals.away,
          stats_synced: false,
        }, { onConflict: 'id', ignoreDuplicates: true });

        if (!error) totalInserted++;
      }
    }

    return new Response(JSON.stringify({
      message: `Backfilled ${totalInserted} fixtures. sync-player-stats will process them in batches.`,
      total: totalInserted,
    }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
