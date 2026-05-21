import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchLeagueInfo, fetchFinishedFixtures, fetchFixturePlayers } from '../_shared/api-football.ts';

serve(async () => {
  const supabase = getSupabaseAdmin();
  const results: Array<{ league_id: number; name: string; has_stats: boolean; sample_fixture?: number }> = [];

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, season')
    .eq('has_player_stats', false);

  if (!leagues) {
    return new Response(JSON.stringify({ message: 'No leagues to verify' }), { status: 200 });
  }

  const today = new Date().toISOString().split('T')[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

  for (const league of leagues) {
    try {
      const info = await fetchLeagueInfo(league.id, league.season);
      const seasonInfo = info[0]?.seasons?.find((s: any) => s.year === league.season);
      const apiSaysYes = seasonInfo?.coverage?.fixtures?.statistics_players === true;

      let hasActualStats = false;
      let sampleFixture: number | undefined;

      const fixtures = await fetchFinishedFixtures(league.id, league.season, twoWeeksAgo, today);
      if (fixtures.length > 0) {
        const testFixture = fixtures[0];
        sampleFixture = testFixture.fixture.id;
        try {
          const playerData = await fetchFixturePlayers(testFixture.fixture.id);
          for (const team of playerData) {
            for (const p of team.players) {
              const s = p.statistics[0];
              if (s && s.games.minutes !== null && s.games.minutes > 0) {
                hasActualStats = true;
                break;
              }
            }
            if (hasActualStats) break;
          }
        } catch {
          hasActualStats = false;
        }
      }

      const confirmed = apiSaysYes || hasActualStats;

      await supabase.from('leagues')
        .update({ has_player_stats: confirmed })
        .eq('id', league.id);

      results.push({ league_id: league.id, name: league.name, has_stats: confirmed, sample_fixture: sampleFixture });
    } catch (err) {
      results.push({ league_id: league.id, name: league.name, has_stats: false });
    }
  }

  return new Response(JSON.stringify(results), { status: 200 });
});
