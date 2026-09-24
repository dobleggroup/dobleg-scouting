import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { getSupabaseAdmin } from '../_shared/supabase-client.ts';
import { fetchCurrentSeason, fetchFinishedFixtures } from '../_shared/api-football.ts';

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  const results = { processed: 0, inserted: 0, errors: [] as string[], seasonChanges: [] as string[] };

  let leagueIds: number[] | undefined;
  let fromDateOverride: string | undefined;
  let checkSeasons = new Date().getUTCHours() === 6; // una vez por día alcanza
  try {
    const body = await req.json().catch(() => ({}));
    if (body.league_ids && Array.isArray(body.league_ids)) {
      leagueIds = body.league_ids;
    }
    if (body.from_date && typeof body.from_date === 'string') {
      fromDateOverride = body.from_date;
    }
    if (body.check_seasons === true) checkSeasons = true;
  } catch { /* empty body is fine */ }

  try {
    let query = supabase
      .from('leagues')
      .select('id, season, last_synced_at, has_player_stats')
      .neq('source', 'sofascore')
      .order('id');

    if (leagueIds) {
      query = query.in('id', leagueIds);
    }

    const { data: leagues } = await query;

    if (!leagues || leagues.length === 0) {
      return new Response(JSON.stringify({ message: 'No leagues configured' }), { status: 200 });
    }

    const today = new Date().toISOString().split('T')[0];

    for (const league of leagues) {
      try {
        const fromDate = fromDateOverride
          ?? (league.last_synced_at
            ? new Date(league.last_synced_at).toISOString().split('T')[0]
            : new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]);

        // La temporada de cada liga se cargaba a mano y las europeas quedaron en 2025
        // cuando arrancó la 2026/27 (sin partidos nuevos desde julio). Si API-Football
        // marca una temporada más nueva, se pasa a esa y se trae desde su inicio.
        let season = league.season;
        let seasonFrom = fromDate;
        if (checkSeasons) {
          const current = await fetchCurrentSeason(league.id);
          if (current && current.year > league.season) {
            season = current.year;
            seasonFrom = fromDateOverride ?? current.start;
            await supabase.from('leagues').update({ season }).eq('id', league.id);
            results.seasonChanges.push(`${league.id}: ${league.season} -> ${season}`);
          }
        }

        const fixtures = await fetchFinishedFixtures(league.id, season, seasonFrom, today);

        for (const f of fixtures) {
          const { error } = await supabase.from('fixtures').upsert({
            id: f.fixture.id,
            league_id: league.id,
            season,
            date: f.fixture.date,
            home_team_id: f.teams.home.id,
            away_team_id: f.teams.away.id,
            score_home: f.goals.home,
            score_away: f.goals.away,
            stats_synced: false,
          }, { onConflict: 'id', ignoreDuplicates: false });

          if (!error) results.inserted++;

          if (league.has_player_stats) {
            await supabase.from('teams').upsert([
              { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo, league_id: league.id },
              { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo, league_id: league.id },
            ], { onConflict: 'id' });
          } else {
            await supabase.from('teams').upsert([
              { id: f.teams.home.id, name: f.teams.home.name, logo: f.teams.home.logo },
              { id: f.teams.away.id, name: f.teams.away.name, logo: f.teams.away.logo },
            ], { onConflict: 'id', ignoreDuplicates: true });
          }
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
