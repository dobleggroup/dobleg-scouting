import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';

const API_KEY = Deno.env.get('API_FOOTBALL_KEY')!;
const BASE_URL = Deno.env.get('API_FOOTBALL_BASE_URL') || 'https://v3.football.api-sports.io';

serve(async (req) => {
  const { league_id, mode } = await req.json().catch(() => ({ league_id: 128, mode: 'debug' }));
  const supabase = getSupabaseAdmin();

  // Read the league exactly like sync-fixtures does
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, season, last_synced_at')
    .eq('id', league_id)
    .single();

  if (!league) return new Response(JSON.stringify({ error: 'League not found' }), { status: 404 });

  const today = new Date().toISOString().split('T')[0];
  const fromDate = '2026-01-01';

  // Call API the same way
  const fixturesUrl = `${BASE_URL}/fixtures?league=${league.id}&season=${league.season}&from=${fromDate}&to=${today}&status=FT-AET-PEN`;
  const fixturesRes = await fetch(fixturesUrl, {
    headers: { 'x-apisports-key': API_KEY },
  });
  const fixturesData = await fixturesRes.json();

  const debug = {
    league,
    computed: { fromDate, today, fixturesUrl },
    api_results: fixturesData.results ?? 0,
    api_errors: fixturesData.errors,
    api_paging: fixturesData.paging,
  };

  if (mode === 'sync' && fixturesData.response?.length > 0) {
    let inserted = 0;
    for (const f of fixturesData.response) {
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

      if (!error) {
        inserted++;
        await supabase.from('teams').upsert([
          { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo, league_id: league.id },
          { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo, league_id: league.id },
        ], { onConflict: 'id' });
      }
    }
    await supabase.from('leagues').update({ last_synced_at: new Date().toISOString() }).eq('id', league.id);
    return new Response(JSON.stringify({ ...debug, inserted }), { status: 200 });
  }

  return new Response(JSON.stringify(debug, null, 2), { status: 200 });
});
