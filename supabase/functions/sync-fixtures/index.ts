import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchFinishedFixtures } from '../_shared/api-football.ts';

serve(async () => {
  const supabase = getSupabaseAdmin();
  const results = { processed: 0, inserted: 0, errors: [] as string[] };

  try {
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, season, last_synced_at')
      .order('id');

    if (!leagues || leagues.length === 0) {
      return new Response(JSON.stringify({ message: 'No leagues configured' }), { status: 200 });
    }

    const today = new Date().toISOString().split('T')[0];

    for (const league of leagues) {
      try {
        const fromDate = league.last_synced_at
          ? new Date(league.last_synced_at).toISOString().split('T')[0]
          : new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

        const fixtures = await fetchFinishedFixtures(league.id, league.season, fromDate, today);

        for (const f of fixtures) {
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
          }, { onConflict: 'id', ignoreDuplicates: false });

          if (!error) results.inserted++;

          await supabase.from('teams').upsert([
            { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo, league_id: league.id },
            { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo, league_id: league.id },
          ], { onConflict: 'id' });
        }

        await supabase.from('leagues').update({ last_synced_at: new Date().toISOString() })
          .eq('id', league.id);

        results.processed++;
      } catch (err) {
        const msg = `League ${league.id}: ${(err as Error).message}`;
        results.errors.push(msg);
        if ((err as Error).message === 'RATE_LIMITED') break;
      }
    }

    await supabase.from('sync_log').insert({
      function_name: 'sync-fixtures',
      status: results.errors.length > 0 ? 'error' : 'success',
      error_message: results.errors.length > 0 ? results.errors.join('; ') : null,
      fixtures_processed: results.inserted,
    });

    return new Response(JSON.stringify(results), { status: 200 });
  } catch (err) {
    await supabase.from('sync_log').insert({
      function_name: 'sync-fixtures',
      status: 'error',
      error_message: (err as Error).message,
    });
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
